/**
 * This file re-exports the adminMiddleware from authMiddleware
 * to maintain backward compatibility with existing imports
 */
const { adminMiddleware } = require('./authMiddleware');

module.exports = adminMiddleware;
