const rateLimit = require('express-rate-limit');

/**
 * Strict limiter for authentication endpoints (register/login).
 * These endpoints are prime targets for brute-force and credential
 * stuffing attacks, so the ceiling is intentionally low.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 attempts per IP per window
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP. Please try again in 15 minutes.',
  },
});

/**
 * Standard limiter for general data/API channels (products, currency).
 * Generous enough for normal dashboard usage while still blocking
 * scripted spam / scraping.
 */
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 200, // 200 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please slow down and try again shortly.',
  },
});

module.exports = { authLimiter, apiLimiter };
