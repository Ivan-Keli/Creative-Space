/**
 * This file registers all the additional routes with your Express application.
 * Import and use this in your server.js file
 */

const registerAdditionalRoutes = (app) => {
  // Import route files
  const buyerOrdersRoutes = require('./routes/buyerOrdersRoutes');
  const adminTicketsRoutes = require('./routes/adminTicketsRoutes');
  const transactionDownloadRoute = require('./routes/transactionDownloadRoute');
  const messageRoutesNew = require('./routes/messageRoutesNew');
  const reportRoutes = require('./routes/reportRoutes');
  const supportTicketsRoutes = require('./routes/supportTicketsRoutes');
  const profileRoutes = require('./routes/profileRoutes');
  const eventsRoutes = require('./routes/eventsRoutes'); // Import the events routes
  const photoRoutes = require('./routes/photoRoutes'); // Import photo routes
  const publicationRoutes = require('./routes/publicationRoutes'); // Import publication routes
  const venueRoutes = require('./routes/venueRoutes'); // Import venue routes
  
  // Register routes with the app
  app.use('/api/buyer/orders', buyerOrdersRoutes);
  app.use('/api/orders', buyerOrdersRoutes); // Alias for buyer orders
  
  // Admin routes
  app.use('/api/admin/tickets', adminTicketsRoutes);
  app.use('/api/admin/support-tickets', adminTicketsRoutes); // Alternative path for admin tickets
  
  // User profile routes - already registered in main routes, but we'll ensure it's using updated version
  app.use('/api/users', profileRoutes);
  
  // Messages routes
  app.use('/api/messages', messageRoutesNew);
  
  // Report routes for admin reports access
  app.use('/api/reports', reportRoutes);
  app.use('/api/admin/reports', reportRoutes); // Alternative path for admin access
  
  // Support tickets routes
  app.use('/api/support-tickets', supportTicketsRoutes);
  
  // The download route is registered at the transactions path
  // but the actual handler is in a separate file for better organization
  app.use('/api/transactions', transactionDownloadRoute);
  
  // Register the events routes
  app.use('/api/events', eventsRoutes);
  
  // Register the new content type routes
  app.use('/api/photos', photoRoutes);
  app.use('/api/publications', publicationRoutes);
  
  // Register venue routes
  app.use('/api/venues', venueRoutes);
  
  console.log('✅ Additional routes registered successfully');
};

module.exports = registerAdditionalRoutes;
