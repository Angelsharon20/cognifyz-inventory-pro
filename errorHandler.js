/**
 * Handles requests to routes that do not exist by generating a 404 error
 * and forwarding it into the centralized error handler below.
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Centralized, catch-all error-handling middleware. Every thrown error or
 * next(error) call anywhere in the app funnels through here. This is what
 * keeps a single bad request (e.g. a Mongoose validation failure or a
 * momentary DB disconnect) from ever crashing the entire Node process.
 *
 * Must be registered LAST, after all routes, with 4 arguments so Express
 * recognizes it as error-handling middleware.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  console.error(`[ErrorHandler] ${err.name || 'Error'}: ${err.message}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  let statusCode = err.statusCode && err.statusCode !== 200 ? err.statusCode : 500;
  let message = err.message || 'An unexpected server error occurred.';
  let details;

  // --- Mongoose validation errors (e.g. missing required field, min/max) ---
  if (err.name === 'ValidationError') {
    statusCode = 400;
    details = Object.values(err.errors).map((val) => val.message);
    message = 'Validation failed. Please review the highlighted fields.';
  }

  // --- Mongoose bad ObjectId cast (e.g. malformed :id param) ---
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value supplied for '${err.path}': ${err.value}`;
  }

  // --- Mongoose duplicate key error (e.g. duplicate unique username) ---
  if (err.code === 11000) {
    statusCode = 409;
    const duplicateField = Object.keys(err.keyValue || {})[0] || 'field';
    message = `The value provided for '${duplicateField}' is already in use.`;
  }

  // --- MongoDB connection / network-level errors ---
  if (
    err.name === 'MongoNetworkError' ||
    err.name === 'MongooseServerSelectionError' ||
    err.message?.includes('ECONNREFUSED')
  ) {
    statusCode = 503;
    message = 'Database is temporarily unavailable. Please try again shortly.';
  }

  // --- JWT errors that slipped through without being caught elsewhere ---
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token.';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
};

module.exports = { notFound, errorHandler };
