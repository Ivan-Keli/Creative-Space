const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Artwork = require('./Artwork');
const Message = require('./Message');
const Transaction = require('./Transaction');
const Notification = require('./Notification');
const AuditLog = require('./AuditLog');
const Ticket = require('./Ticket');
const Review = require('./Review');
const TicketReply = require('./TicketReply');

// Existing models
const ActivityLog = require('./ActivityLog');
const ArtworkCategory = require('./ArtworkCategory');
const ArtworkTag = require('./ArtworkTag');
const UserDevice = require('./UserDevice');
const SalesStatistic = require('./SalesStatistic');
const Report = require('./Report');
const DigitalAsset = require('./DigitalAsset');

// New models
const UserPaymentMethod = require('./UserPaymentMethod');
const TransactionRefund = require('./TransactionRefund');
const CategoryArtworkMapping = require('./CategoryArtworkMapping');
const TagArtworkMapping = require('./TagArtworkMapping'); // Import proper TagArtworkMapping
const UserPreferences = require('./UserPreferences');
const Conversation = require('./Conversation');
const Event = require('./Event');                // Import Event model
const Venue = require('./Venue');                // Import Venue model
const EventTicket = require('./EventTicket');    // Import EventTicket model
const Order = require('./Order');                // Import Order model
const OrderItem = require('./OrderItem');        // Import OrderItem model

// ✅ Define Original Model Associations
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Artwork.hasMany(Notification, { foreignKey: 'relatedEntityId', as: 'notifications', constraints: false, onDelete: 'CASCADE' });
Notification.belongsTo(Artwork, { foreignKey: 'relatedEntityId', as: 'relatedArtwork', constraints: false });

Transaction.hasMany(Notification, { foreignKey: 'relatedEntityId', as: 'notifications', constraints: false, onDelete: 'CASCADE' });
Notification.belongsTo(Transaction, { foreignKey: 'relatedEntityId', as: 'relatedTransaction', constraints: false });

User.hasMany(AuditLog, { foreignKey: 'adminId', as: 'auditLogs', onDelete: 'CASCADE' });
AuditLog.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });

// ✅ Event Associations
Event.belongsTo(User, { foreignKey: 'organizerId', as: 'organizer' });
Event.belongsTo(Venue, { foreignKey: 'venueId' });
Event.hasMany(EventTicket, { foreignKey: 'eventId' });

// ✅ Venue Associations
Venue.hasMany(Event, { foreignKey: 'venueId' });

// ✅ EventTicket Associations
EventTicket.belongsTo(Event, { foreignKey: 'eventId' });
EventTicket.belongsTo(User, { foreignKey: 'userId' });
EventTicket.belongsTo(Transaction, { foreignKey: 'transactionId' });

// Add EventTicket association to Transaction
Transaction.hasMany(EventTicket, { foreignKey: 'transactionId' });

// ✅ Ticket Associations 
User.hasMany(Ticket, { foreignKey: 'userId', as: 'tickets', onDelete: 'CASCADE' });
Ticket.belongsTo(User, { foreignKey: 'userId', as: 'creator' });

// ✅ Ticket Reply Associations
Ticket.hasMany(TicketReply, { as: 'replies', foreignKey: 'ticketId', onDelete: 'CASCADE' });
TicketReply.belongsTo(Ticket, { foreignKey: 'ticketId', as: 'ticket' });

User.hasMany(TicketReply, { foreignKey: 'userId', as: 'ticketReplies', onDelete: 'CASCADE' });
TicketReply.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ✅ Conversation Associations
Conversation.hasMany(Message, {
  foreignKey: 'conversationId',
  as: 'messages',
  onDelete: 'CASCADE'
});

Conversation.belongsTo(User, {
  foreignKey: 'participant1Id',
  as: 'participant1'
});

Conversation.belongsTo(User, {
  foreignKey: 'participant2Id',
  as: 'participant2'
});

Conversation.belongsTo(Artwork, {
  foreignKey: 'relatedArtworkId',
  as: 'relatedArtwork'
});

// ✅ Message Associations
Message.belongsTo(Conversation, {
  foreignKey: 'conversationId'
});

User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages' });
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });

User.hasMany(Message, { foreignKey: 'receiverId', as: 'receivedMessages' });
Message.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });

Message.belongsTo(Artwork, {
  foreignKey: 'artworkId',
  as: 'artwork'
});

// ✅ Report Associations
User.hasMany(Report, { foreignKey: 'reporterId', as: 'reports', onDelete: 'CASCADE' });
Report.belongsTo(User, { foreignKey: 'reporterId', as: 'reporter' });

User.hasMany(Report, { foreignKey: 'reviewedBy', as: 'reviewedReports' });
Report.belongsTo(User, { foreignKey: 'reviewedBy', as: 'reviewer' });

Artwork.hasMany(Report, { foreignKey: 'artworkId', as: 'reports', onDelete: 'CASCADE' });
Report.belongsTo(Artwork, { foreignKey: 'artworkId', as: 'reportedArtwork' });

// ✅ DigitalAsset Associations
Artwork.hasOne(DigitalAsset, { foreignKey: 'artworkId', as: 'digitalAsset', onDelete: 'CASCADE' });
DigitalAsset.belongsTo(Artwork, { foreignKey: 'artworkId', as: 'artwork' });

// Add new DigitalAsset to User association
User.hasMany(DigitalAsset, { foreignKey: 'userId', as: 'digitalAssets', onDelete: 'CASCADE' });
DigitalAsset.belongsTo(User, { foreignKey: 'userId', as: 'creator' });

// Add DigitalAsset to category and tag associations
DigitalAsset.belongsToMany(ArtworkCategory, { 
    through: CategoryArtworkMapping, 
    foreignKey: 'digitalAssetId',
    as: 'categories'
});
ArtworkCategory.belongsToMany(DigitalAsset, { 
    through: CategoryArtworkMapping, 
    foreignKey: 'categoryId',
    as: 'digitalAssets'
});

// Tag associations for DigitalAsset
DigitalAsset.belongsToMany(ArtworkTag, { 
    through: TagArtworkMapping, 
    foreignKey: 'digitalAssetId',
    as: 'tags'
});
ArtworkTag.belongsToMany(DigitalAsset, { 
    through: TagArtworkMapping, 
    foreignKey: 'tagId',
    as: 'digitalAssets'
});

// ✅ Define Existing Model Associations

// ActivityLog associations
User.hasMany(ActivityLog, { foreignKey: 'userId', as: 'activityLogs', onDelete: 'CASCADE' });
ActivityLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ArtworkCategory associations (using the new mapping table)
Artwork.belongsToMany(ArtworkCategory, { 
    through: CategoryArtworkMapping, 
    foreignKey: 'artworkId',
    as: 'categories'
});
ArtworkCategory.belongsToMany(Artwork, { 
    through: CategoryArtworkMapping, 
    foreignKey: 'categoryId',
    as: 'artworks'
});

// ArtworkTag associations (using the imported TagArtworkMapping)
Artwork.belongsToMany(ArtworkTag, { 
    through: TagArtworkMapping, 
    foreignKey: 'artworkId',
    as: 'tags'
});

ArtworkTag.belongsToMany(Artwork, { 
    through: TagArtworkMapping, 
    foreignKey: 'tagId',
    as: 'artworks'
});

// UserDevice associations
User.hasMany(UserDevice, { foreignKey: 'userId', as: 'devices', onDelete: 'CASCADE' });
UserDevice.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// SalesStatistic associations
User.hasMany(SalesStatistic, { foreignKey: 'userId', as: 'salesStatistics', onDelete: 'CASCADE' });
SalesStatistic.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Artwork.hasOne(SalesStatistic, { foreignKey: 'bestSellingArtworkId', as: 'bestSellingStat', constraints: false });
Artwork.hasOne(SalesStatistic, { foreignKey: 'mostViewedArtworkId', as: 'mostViewedStat', constraints: false });

// Review associations (enhanced)
User.hasMany(Review, { foreignKey: 'userId', as: 'reviews', onDelete: 'CASCADE' });
Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Artwork.hasMany(Review, { foreignKey: 'artworkId', as: 'reviews', onDelete: 'CASCADE' });
Review.belongsTo(Artwork, { foreignKey: 'artworkId', as: 'artwork' });

// ✅ Define New Model Associations

// UserPaymentMethod associations
User.hasMany(UserPaymentMethod, { foreignKey: 'userId', as: 'paymentMethods', onDelete: 'CASCADE' });
UserPaymentMethod.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// TransactionRefund associations
Transaction.hasMany(TransactionRefund, { foreignKey: 'transactionId', as: 'refunds', onDelete: 'CASCADE' });
TransactionRefund.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });

User.hasMany(TransactionRefund, { foreignKey: 'requestedBy', as: 'refundRequests' });
TransactionRefund.belongsTo(User, { foreignKey: 'requestedBy', as: 'requester' });

User.hasMany(TransactionRefund, { foreignKey: 'processedBy', as: 'processedRefunds' });
TransactionRefund.belongsTo(User, { foreignKey: 'processedBy', as: 'processor' });

// UserPreferences associations
User.hasOne(UserPreferences, { foreignKey: 'userId', as: 'preferences', onDelete: 'CASCADE' });
UserPreferences.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Transaction associations
// Transaction.belongsTo(Artwork, { foreignKey: 'artworkId', as: 'artwork' }); // COMMENTED OUT - now defined in Transaction.js as 'purchasedArtwork'
Artwork.hasMany(Transaction, { foreignKey: 'artworkId', as: 'transactions' });

// User <-> Transaction associations
User.hasMany(Transaction, { foreignKey: 'buyerId', as: 'purchases' });
// Transaction.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' }); // COMMENTED OUT - already defined in Transaction.js

User.hasMany(Transaction, { foreignKey: 'sellerId', as: 'sales' });
Transaction.belongsTo(User, { foreignKey: 'sellerId', as: 'seller' });

// Creator relationship for Artwork
User.hasMany(Artwork, { foreignKey: 'creatorId', as: 'creations' });
Artwork.belongsTo(User, { foreignKey: 'creatorId', as: 'creator' });

// ✅ Order and OrderItem Relationships
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'parentOrder' });
Transaction.belongsTo(Order, { foreignKey: 'orderId', as: 'relatedOrder' });

// User relationship for Orders
User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Link OrderItem to Artwork - changed artworkDetails to orderArtwork to fix alias conflict
OrderItem.belongsTo(Artwork, { foreignKey: 'artworkId', as: 'orderArtwork' });  // UPDATED alias from "artworkDetails" to "orderArtwork"
Artwork.hasMany(OrderItem, { foreignKey: 'artworkId', as: 'orderItems' });

// ✅ Database Synchronization Function
const syncDatabase = async () => {
    try {
        // Explicitly sync new Order and OrderItem models first
        console.log("Starting sync for Order model...");
        await Order.sync({ alter: true });
        console.log("✅ Order table synced!");
        
        console.log("Starting sync for OrderItem model...");
        await OrderItem.sync({ alter: true });
        console.log("✅ OrderItem table synced!");
        
        // Explicitly sync EventTicket model first to avoid foreign key issues
        console.log("Starting sync for EventTicket model...");
        await EventTicket.sync({ alter: true });
        console.log("✅ EventTicket table synced!");
        
        // Explicitly sync Event model
        console.log("Starting sync for Event model...");
        await Event.sync({ alter: true });
        console.log("✅ Event table synced!");
        
        // Explicitly sync Venue model
        console.log("Starting sync for Venue model...");
        await Venue.sync({ alter: true });
        console.log("✅ Venue table synced!");
        
        // Explicitly sync TicketReply model
        console.log("Starting sync for TicketReply model...");
        await TicketReply.sync({ alter: true });
        console.log("✅ TicketReply table synced!");
        
        // Explicitly sync Conversation model
        console.log("Starting sync for Conversation model...");
        await Conversation.sync({ alter: true });
        console.log("✅ Conversation table synced!");
        
        // Then sync all other models, with hooks disabled to prevent index recreation
        console.log("Syncing all database models...");
        await sequelize.sync({ alter: true, hooks: false }); // Prevents recreation of indexes
        console.log("✅ All database & tables synced!");

        // Check if a test user exists, otherwise create one
        const userCount = await User.count();
        if (userCount === 0) {
            await User.create({
                id: 1,
                name: 'Test User',
                email: 'test@example.com',
                password: 'hashedpassword', // Ensure this is hashed
                role: 'creator',
                createdAt: new Date(),
                updatedAt: new Date()
            });
            console.log("✅ Default test user added.");
        }

    } catch (error) {
        console.error("❌ Database sync error:", error);
        console.error(error.stack); // Print stack trace for better debugging
    }
};

// ✅ Sync Database on Startup
syncDatabase();

module.exports = { 
    sequelize, 
    User, 
    Artwork, 
    Message, 
    Transaction, 
    Notification, 
    AuditLog,
    Ticket,
    TicketReply,
    Review,
    ActivityLog,
    ArtworkCategory,
    ArtworkTag,
    UserDevice,
    SalesStatistic,
    TagArtworkMapping, // Export the proper imported model
    Report,
    DigitalAsset,
    // New models
    UserPaymentMethod,
    TransactionRefund,
    CategoryArtworkMapping,
    UserPreferences,
    Conversation,
    // Event system models
    Event,
    Venue,
    EventTicket,
    // Order system models
    Order,
    OrderItem
};
