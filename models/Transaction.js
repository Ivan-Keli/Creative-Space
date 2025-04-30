// models/Transaction.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Artwork = require('./Artwork');

const Transaction = sequelize.define('Transaction', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    buyerId: { type: DataTypes.INTEGER, allowNull: false },
    creatorId: { type: DataTypes.INTEGER, allowNull: false },
    artworkId: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.FLOAT, allowNull: false },
    status: { 
        type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded', 'disputed', 'refund-requested', 'partial-refund', 'refund-declined'),
        defaultValue: 'pending'
    },
    transactionDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    // Payment details
    paymentMethod: {
        type: DataTypes.STRING,
        allowNull: true
    },
    paymentId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    paymentDetails: {
        type: DataTypes.JSON,
        allowNull: true
    },
    // Refund information
    refundAmount: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    refundDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    refundReason: {
        type: DataTypes.STRING,
        allowNull: true
    },
    refundRequestDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    refundRequestReason: {
        type: DataTypes.STRING,
        allowNull: true
    },
    refundedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    refundProcessor: {
        type: DataTypes.STRING,
        allowNull: true
    },
    refundNotes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    // Additional tracking information
    paymentProcessorFee: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    platformFee: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    transactionFee: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    creatorPayout: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    tax: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    adminNotes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    receiptUrl: {
        type: DataTypes.STRING,
        allowNull: true
    },
    invoice: {
        type: DataTypes.STRING,
        allowNull: true
    },
    originalPrice: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'Orders',
            key: 'id'
        }
    }
}, { timestamps: true });

// Define associations with explicit aliases
Transaction.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' });
Transaction.belongsTo(User, { foreignKey: 'creatorId', as: 'creator' });
Transaction.belongsTo(Artwork, { foreignKey: 'artworkId', as: 'purchasedArtwork' }); // Changed from 'artwork' to 'purchasedArtwork'

module.exports = Transaction;
