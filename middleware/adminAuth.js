/**
 * This file re-exports the adminMiddleware from authMiddleware.js
 * to maintain compatibility with existing imports in routes files
 */
const { adminMiddleware } = require('./authMiddleware');

module.exports = adminMiddleware;
