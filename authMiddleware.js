const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protects a route by requiring a valid JWT in the Authorization header,
 * formatted as: "Authorization: Bearer <token>"
 *
 * On success, attaches the authenticated user document (minus password)
 * to req.user and calls next().
 * On failure, responds with 401 Unauthorized and a descriptive message.
 */
const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      token = authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized. No token provided.',
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized. User belonging to this token no longer exists.',
        });
      }

      req.user = user;
      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Not authorized. Your session has expired, please log in again.',
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Not authorized. Token verification failed.',
      });
    }
  }

  return res.status(401).json({
    success: false,
    message: 'Not authorized. No Authorization header with a Bearer token was supplied.',
  });
};

module.exports = { protect };
