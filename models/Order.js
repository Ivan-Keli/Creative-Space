// models/Order.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Order = sequelize.define('Order', {
    id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    orderNumber: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    buyerId: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    subtotal: { 
        type: DataTypes.FLOAT, 
        allowNull: false 
    },
    tax: { 
        type: DataTypes.FLOAT, 
        defaultValue: 0 
    },
    discount: { 
        type: DataTypes.FLOAT, 
        defaultValue: 0 
    },
    total: { 
        type: DataTypes.FLOAT, 
        allowNull: false 
    },
    status: { 
        type: DataTypes.ENUM(
            'pending', 
            'processing', 
            'completed', 
            'cancelled', 
            'refunded', 
            'partially_refunded'
        ),
        defaultValue: 'pending'
    },
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
    billingAddress: {
        type: DataTypes.JSON,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    completedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, { 
    timestamps: true 
});

// Define associations
Order.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' });

// This would be defined in a separate OrderItem model
// Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });

module.exports = Order;
