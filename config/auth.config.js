// config/auth.config.js
require('dotenv').config();

module.exports = {
  // Use the JWT_SECRET from the .env file
  secret: process.env.JWT_SECRET || "your_secret_key_here",
  // JWT token expiration time (in seconds)
  expiresIn: 86400 // 24 hours
};
