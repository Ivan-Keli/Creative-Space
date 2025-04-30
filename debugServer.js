/**
 * Debug server script to verify routes are registered correctly
 * Place this file in your project root and run it with: 
 * node debugServer.js
 */

const express = require('express');
const app = express();

// Create a mock app to track route registrations
const routes = [];

// Mock app methods to track routes
const mockApp = {
  use: (path, handler) => {
    if (typeof path === 'string') {
      routes.push({
        path,
        handler: handler.name || '(anonymous middleware)'
      });
    } else {
      routes.push({
        path: '/',
        handler: path.name || '(root middleware)'
      });
    }
  },
  get: (path, ...handlers) => {
    routes.push({
      method: 'GET',
      path,
      handlers: handlers.map(h => h.name || '(anonymous handler)')
    });
  },
  post: (path, ...handlers) => {
    routes.push({
      method: 'POST',
      path,
      handlers: handlers.map(h => h.name || '(anonymous handler)')
    });
  },
  put: (path, ...handlers) => {
    routes.push({
      method: 'PUT',
      path,
      handlers: handlers.map(h => h.name || '(anonymous handler)')
    });
  },
  delete: (path, ...handlers) => {
    routes.push({
      method: 'DELETE',
      path,
      handlers: handlers.map(h => h.name || '(anonymous handler)')
    });
  }
};

// Import registerAdditionalRoutes
const registerAdditionalRoutes = require('./registerAdditionalRoutes');

console.log('Testing route registration...');

// Register routes on mock app
try {
  registerAdditionalRoutes(mockApp);
  console.log('✅ Successfully registered additional routes');
} catch (error) {
  console.error('❌ Error registering additional routes:', error);
}

// Display registered routes
console.log('\nRegistered middleware and route handlers:');
routes.forEach((route, index) => {
  console.log(`${index + 1}. ${route.method || 'MIDDLEWARE'} ${route.path}`);
});

// Check for specific routes that are failing
console.log('\nChecking for specific problematic routes:');
const checkRoutes = [
  '/api/users/profile/:userId',
  '/api/messages/unread/count',
  '/api/transactions/:userId/purchases',
  '/api/orders/user/:userId',
  '/api/transactions/user/:userId',
  '/api/transactions/:userId/downloads',
  '/api/messages/conversations/:userId',
  '/api/messages/conversation/:conversationId'
];

checkRoutes.forEach(route => {
  const found = routes.some(r => {
    if (r.path === route) return true;
    // For routes with parameters, use approximate matching
    if (r.path && r.path.includes(':') && route.includes(':')) {
      const routeParts = route.split('/');
      const registeredParts = r.path.split('/');
      if (routeParts.length !== registeredParts.length) return false;
      
      for (let i = 0; i < routeParts.length; i++) {
        if (routeParts[i].startsWith(':') || registeredParts[i].startsWith(':')) continue;
        if (routeParts[i] !== registeredParts[i]) return false;
      }
      return true;
    }
    return false;
  });
  
  console.log(`${found ? '✅' : '❌'} ${route}`);
});

// Check module dependencies
console.log('\nChecking module dependencies:');
try {
  const { Transaction, User, Artwork } = require('./models');
  console.log('✅ Models loaded successfully');
} catch (error) {
  console.error('❌ Error loading models:', error.message);
}

try {
  const authMiddleware = require('./middleware/authMiddleware');
  console.log('✅ Auth middleware loaded successfully');
} catch (error) {
  console.error('❌ Error loading auth middleware:', error.message);
}

console.log('\nDebug completed. If you see any "❌" above, those routes are likely missing or not registered correctly.');
