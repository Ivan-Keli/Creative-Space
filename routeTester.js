/**
 * Route testing utility
 * Place this file in your project root and run it with:
 * node routeTester.js [routeToTest] [method]
 * 
 * Example: node routeTester.js /api/users/profile/8 GET
 */

require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { User } = require('./models');

// Configuration
const BASE_URL = 'http://localhost:5000';
const DEFAULT_USER_ID = 8; // User ID to use for testing

// Create a test token for authentication
const createTestToken = async (userId) => {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      console.error(`User with ID ${userId} not found`);
      return null;
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    return token;
  } catch (error) {
    console.error('Error creating test token:', error);
    return null;
  }
};

const testRoute = async (route, method = 'GET') => {
  try {
    // Create test token
    const token = await createTestToken(DEFAULT_USER_ID);
    if (!token) {
      console.error('Failed to create authentication token. Check database connection.');
      return;
    }

    console.log(`Testing ${method} ${route}`);
    console.log('Using auth token for user ID:', DEFAULT_USER_ID);

    // Make request
    const response = await axios({
      method: method.toLowerCase(),
      url: `${BASE_URL}${route}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('\n✅ SUCCESS! Status:', response.status);
    console.log('Response data:');
    console.log(JSON.stringify(response.data, null, 2).slice(0, 500)); // Show first 500 chars
    if (JSON.stringify(response.data).length > 500) {
      console.log('... (response truncated)');
    }
  } catch (error) {
    console.error('\n❌ ERROR!');
    
    if (error.response) {
      // Server responded with an error
      console.error('Status:', error.response.status);
      console.error('Response data:', error.response.data);
      console.error('Headers:', error.response.headers);
    } else if (error.request) {
      // Request was made but no response received
      console.error('No response received. The server might be down or the route might not exist.');
    } else {
      // Error setting up the request
      console.error('Error setting up the request:', error.message);
    }
  }
};

// Main function
const main = async () => {
  const args = process.argv.slice(2);
  const route = args[0] || '/api/users/profile/8';
  const method = args[1] || 'GET';

  await testRoute(route, method);
};

// Run the test
main()
  .then(() => {
    console.log('\nTest completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
