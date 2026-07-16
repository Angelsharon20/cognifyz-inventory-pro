// =============================================================================
// Cognifyz Inventory Pro - Level 4 Expert (Task 6, 7 & 8)
// Master server: authentication, protected product CRUD, live currency
// conversion via third-party API, rate limiting, and centralized error
// handling — all wired together in one resilient Express application.
// =============================================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const connectDB = require('./config/db');
const User = require('./models/User');
const Product = require('./models/Product');
const { protect } = require('./middleware/authMiddleware');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// -----------------------------------------------------------------------
// Boot sequence
// -----------------------------------------------------------------------
connectDB();

const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Serve the static Vanilla JS frontend
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------------------------------------------------
// Helper: sign a JWT for a given user id
// -----------------------------------------------------------------------
const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// =========================================================================
// TASK 6: AUTHENTICATION ROUTES  (/api/auth)
// =========================================================================
const authRouter = express.Router();

// POST /api/auth/register
authRouter.post('/register', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are both required.',
      });
    }

    const existingUser = await User.findOne({ username: username.trim() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'That username is already taken. Please choose another.',
      });
    }

    // Password hashing happens automatically via the pre('save') hook
    const user = await User.create({ username: username.trim(), password });

    const token = signToken(user._id);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: { id: user._id, username: user.username, role: user.role },
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are both required.',
      });
    }

    // .select('+password') because the schema excludes it by default
    const user = await User.findOne({ username: username.trim() }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    const token = signToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: { id: user._id, username: user.username, role: user.role },
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/auth/me — verify a token / fetch the current user profile
authRouter.get('/me', protect, async (req, res) => {
  res.status(200).json({
    success: true,
    user: { id: req.user._id, username: req.user.username, role: req.user.role },
  });
});

app.use('/api/auth', authLimiter, authRouter);

// =========================================================================
// TASK 6 continued: PROTECTED PRODUCT CRUD ROUTES  (/api/products)
// =========================================================================
const productRouter = express.Router();

// All product routes require a valid JWT
productRouter.use(protect);

// GET /api/products — list all products (with optional search/category filter)
productRouter.get('/', async (req, res, next) => {
  try {
    const { search, category } = req.query;
    const filter = {};

    if (search) {
      filter.product_name = { $regex: search, $options: 'i' };
    }
    if (category) {
      filter.category = category;
    }

    const products = await Product.find(filter).sort({ createdAt: -1 });

    const metrics = {
      totalProducts: products.length,
      totalUnits: products.reduce((sum, p) => sum + p.stock_quantity, 0),
      totalInventoryValueUSD: Number(
        products.reduce((sum, p) => sum + p.price * p.stock_quantity, 0).toFixed(2)
      ),
    };

    return res.status(200).json({ success: true, count: products.length, metrics, data: products });
  } catch (error) {
    return next(error);
  }
});

// GET /api/products/:id — fetch a single product
productRouter.get('/:id', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return next(error);
  }
});

// POST /api/products — create a new product
productRouter.post('/', async (req, res, next) => {
  try {
    const { product_name, price, category, stock_quantity } = req.body;

    const product = await Product.create({
      product_name,
      price,
      category,
      stock_quantity,
      createdBy: req.user._id,
    });

    return res.status(201).json({ success: true, message: 'Product created.', data: product });
  } catch (error) {
    return next(error);
  }
});

// PUT /api/products/:id — update an existing product
productRouter.put('/:id', async (req, res, next) => {
  try {
    const { product_name, price, category, stock_quantity } = req.body;

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { product_name, price, category, stock_quantity },
      { new: true, runValidators: true, context: 'query' }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    return res.status(200).json({ success: true, message: 'Product updated.', data: product });
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/products/:id — remove a product
productRouter.delete('/:id', async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    return res.status(200).json({ success: true, message: 'Product deleted.', data: { id: req.params.id } });
  } catch (error) {
    return next(error);
  }
});

app.use('/api/products', apiLimiter, productRouter);

// =========================================================================
// TASK 7: THIRD-PARTY CURRENCY CONVERSION INTEGRATION  (/api/currency)
// =========================================================================
const currencyRouter = express.Router();

// Simple in-memory cache so we don't hammer the third-party API on every
// dashboard refresh. Exchange rates don't need to be more real-time than
// this for an inventory dashboard.
let ratesCache = {
  data: null,
  fetchedAt: 0,
};
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// GET /api/currency/rates — live USD-based exchange rates (public endpoint,
// still subject to the standard API rate limiter to prevent abuse)
currencyRouter.get('/rates', async (req, res, next) => {
  try {
    const now = Date.now();

    if (ratesCache.data && now - ratesCache.fetchedAt < CACHE_TTL_MS) {
      return res.status(200).json({
        success: true,
        base: 'USD',
        cached: true,
        fetchedAt: new Date(ratesCache.fetchedAt).toISOString(),
        rates: ratesCache.data,
      });
    }

    const response = await axios.get('https://open.er-api.com/v6/latest/USD', {
      timeout: 8000,
    });

    if (!response.data || response.data.result !== 'success') {
      throw new Error('Third-party currency API returned an unsuccessful result.');
    }

    const allRates = response.data.rates;

    // We only expose the three currencies the dashboard cares about, plus USD
    const trimmedRates = {
      USD: 1,
      EUR: allRates.EUR,
      INR: allRates.INR,
    };

    ratesCache = { data: trimmedRates, fetchedAt: now };

    return res.status(200).json({
      success: true,
      base: 'USD',
      cached: false,
      fetchedAt: new Date(now).toISOString(),
      rates: trimmedRates,
    });
  } catch (error) {
    // If the third-party API is down but we have a stale cache, serve that
    // instead of failing the whole dashboard.
    if (ratesCache.data) {
      return res.status(200).json({
        success: true,
        base: 'USD',
        cached: true,
        stale: true,
        fetchedAt: new Date(ratesCache.fetchedAt).toISOString(),
        rates: ratesCache.data,
      });
    }

    error.statusCode = 502;
    error.message = 'Unable to reach the live currency exchange service. Please try again shortly.';
    return next(error);
  }
});

app.use('/api/currency', apiLimiter, currencyRouter);

// =========================================================================
// HEALTH CHECK — useful for Render/Railway uptime checks
// =========================================================================
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is healthy.', timestamp: new Date().toISOString() });
});

// =========================================================================
// TASK 8: GLOBAL ERROR HANDLING MIDDLEWARE (must be registered LAST)
// =========================================================================
app.use(notFound);
app.use(errorHandler);

// =========================================================================
// PRODUCTION RESILIENCE: catch process-level failures instead of crashing
// =========================================================================
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection] The application encountered an unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UncaughtException] The application encountered an uncaught exception:', err);
});

// -----------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] Cognifyz Inventory Pro running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = app;
