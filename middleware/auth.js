/**
 * This file re-exports the authMiddleware from authMiddleware.js
 * to maintain compatibility with existing imports in routes files
 */
const { authMiddleware } = require('./authMiddleware');

module.exports = authMiddleware;
