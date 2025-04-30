const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * Authentication middleware - verifies the JWT token and sets req.user
 * This middleware must be called before any role-based middleware
 */
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({ error: "Access denied, no token provided" });
    }

    try {
        // Ensure "Bearer " is removed before verifying token
        const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
        req.user = decoded; // Attach user data to request object
        next();
    } catch (error) {
        console.error("JWT Verification Error:", error);
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};

/**
 * Role-based Access Control (RBAC)
 * Checks if the user has one of the allowed roles
 * @param {Array} roles - Array of allowed roles
 */
const authorize = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: "Access denied. You do not have the required permissions." });
        }
        next();
    };
};

/**
 * Admin middleware - checks if the user has admin role
 * Shorthand for authorize(['admin'])
 */
const adminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

/**
 * Creator middleware - checks if the user has creator role
 * Shorthand for authorize(['creator'])
 */
const creatorMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'creator') {
        return res.status(403).json({ error: 'Creator access required' });
    }
    next();
};

/**
 * Buyer middleware - checks if the user has buyer role
 * Shorthand for authorize(['buyer'])
 */
const buyerMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'buyer') {
        return res.status(403).json({ error: 'Buyer access required' });
    }
    next();
};

/**
 * Combined middleware for both creator and buyer roles
 * Shorthand for authorize(['creator', 'buyer'])
 */
const creatorOrBuyerMiddleware = (req, res, next) => {
    if (!req.user || (req.user.role !== 'creator' && req.user.role !== 'buyer')) {
        return res.status(403).json({ error: 'Creator or buyer access required' });
    }
    next();
};

/**
 * Resource ownership middleware - checks if the user owns the resource
 * @param {String} modelName - The model to check ownership against
 */
const ownershipMiddleware = (modelName) => {
    return async (req, res, next) => {
        try {
            const model = require(`../models`)[modelName];
            const resourceId = req.params.id;
            
            if (!resourceId) {
                return res.status(400).json({ error: 'Resource ID is required' });
            }
            
            const resource = await model.findByPk(resourceId);
            
            if (!resource) {
                return res.status(404).json({ error: `${modelName} not found` });
            }
            
            // Check if the requesting user is the owner
            // The field to check depends on the model
            const ownerField = modelName === 'Artwork' ? 'creatorId' : 
                              modelName === 'Review' ? 'reviewerId' : 'userId';
            
            if (resource[ownerField] !== req.user.id) {
                return res.status(403).json({ error: 'Not authorized to access this resource' });
            }
            
            req.resource = resource; // Attach the resource to the request for later use
            next();
        } catch (error) {
            console.error('Ownership middleware error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
};

/**
 * Combine authentication and role checking in one middleware
 * @param {Array} roles - Array of allowed roles
 */
const authAndAuthorize = (roles) => {
    return [
        authMiddleware,
        authorize(roles)
    ];
};

module.exports = { 
    authMiddleware, 
    authorize,
    adminMiddleware,
    creatorMiddleware,
    buyerMiddleware,
    creatorOrBuyerMiddleware,
    ownershipMiddleware,
    authAndAuthorize
};
