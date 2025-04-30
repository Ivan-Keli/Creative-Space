const express = require('express');
const http = require('http');
require('dotenv').config();
const cors = require('cors');
const bodyParser = require('body-parser');
const { sequelize } = require('./models');
const path = require('path');

// ✅ Initialize Express and Server
const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(cors({
  origin: process.env.CLIENT_URL || "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(bodyParser.json());

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Initialize socket manager
const socketManager = require('./socket-manager');
const io = socketManager.initialize(server);

// ✅ Make io available in the request object for routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ✅ Root Route for Health Check
app.get('/', (req, res) => {
    res.send('CreativeSpace Backend Server is Running!');
});

// ✅ Debug Middleware for Request/Response Logging
app.use((req, res, next) => {
  console.log(`\n🔍 ${new Date().toISOString()} - Request: ${req.method} ${req.originalUrl}`);
  console.log(`📑 Headers: ${req.headers.authorization ? 'Auth token present' : 'No auth token'}`);
  
  // Store the original send method
  const originalSend = res.send;
  
  // Override the send method to log responses
  res.send = function(body) {
    const statusCode = res.statusCode;
    if (statusCode >= 400) {
      console.log(`❌ Response: ${statusCode} - ${req.method} ${req.originalUrl}`);
      if (typeof body === 'string' && body.length < 1000) {
        try {
          const parsed = JSON.parse(body);
          console.log('Error response:', parsed);
        } catch (e) {
          console.log('Error response body:', body);
        }
      }
    }
    // Call the original send method
    return originalSend.apply(this, arguments);
  };
  
  next();
});

// ✅ API Root Route
app.get('/api', (req, res) => {
    res.json({
        message: 'Welcome to the CreativeSpace API',
        version: '1.0',
        status: 'Online',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            artworks: '/api/artworks',
            categories: '/api/categories',
            tags: '/api/tags',
            transactions: '/api/transactions',
            messages: '/api/messages',
            notifications: '/api/notifications',
            reports: '/api/reports',
            tickets: '/api/tickets',
            downloads: '/api/downloads',
            reviews: '/api/reviews',
            statistics: '/api/statistics',
            sales: '/api/sales',
            admin: '/api/admin',
            buyer: {
                orders: '/api/buyer/orders'
            },
            supportTickets: '/api/support-tickets',
            checkout: '/api/checkout' // Added checkout endpoint
        }
    });
});

// ✅ Database Connection & Server Start
const startServer = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected successfully!');
        
        // Synchronize models with the database with alter:true to add missing columns
        await sequelize.sync({ alter: true });
        console.log('✅ Database & tables synced with alter mode!');
    } catch (error) {
        console.error('❌ Database connection error:', error);
    }
};

// Start database connection
startServer();

// ✅ Import and Register Routes
const authRoutes = require('./routes/authRoutes');
const messageRoutes = require('./routes/messageRoutesNew');
const transactionRoutes = require('./routes/transactionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reportRoutes = require('./routes/reportRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const downloadsRoutes = require('./routes/downloadsRoutes');
const reviewsRoutes = require('./routes/reviewsRoutes');
const profileRoutes = require('./routes/profileRoutes');
const artworkRoutes = require('./routes/artworkRoutes');
const venueRoutes = require('./routes/venueRoutes');

// Import new routes for categories, tags, and user preferences
// Using updated versions with fixed middleware approach
const categoryRoutes = require('./routes/categoryRoutesNew');
const tagRoutes = require('./routes/tagRoutesNew');
const userPreferenceRoutes = require('./routes/userPreferenceRoutesNew');
const paymentMethodRoutes = require('./routes/paymentMethodRoutesNew');
const refundRoutes = require('./routes/refundRoutesNew');
const statisticsRoutes = require('./routes/statisticsRoutesNew');
const checkoutRoutes = require('./routes/checkoutRoutes'); // Added checkout routes import

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/downloads', downloadsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/users', profileRoutes);
app.use('/api/artworks', artworkRoutes);
app.use('/api/venues', venueRoutes);

// Register new routes
app.use('/api/categories', categoryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/users', userPreferenceRoutes);
app.use('/api/users', paymentMethodRoutes);
app.use('/api/transactions', refundRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/sales', statisticsRoutes);
app.use('/api/checkout', checkoutRoutes); // Register checkout routes with a specific prefix

// Register all additional routes
const registerAdditionalRoutes = require('./registerAdditionalRoutes');
registerAdditionalRoutes(app);

// Enhanced Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌❌❌ Server Error:');
    console.error(err);
    console.error(err.stack);
    
    res.status(500).json({ 
        error: 'Internal server error', 
        message: err.message,
        path: req.originalUrl
    });
});

// Handle 404 errors for routes that don't exist
app.use((req, res) => {
    console.log(`⚠️ 404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Route not found' });
});

// Socket.io Connection Event - For Monitoring
io.on('connection', socket => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    
    socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ API endpoints available at http://localhost:${PORT}/api`);
    console.log(`🔌 Socket.io server initialized`);
});
