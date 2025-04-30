const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserPaymentMethod = sequelize.define('UserPaymentMethod', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    type: {
        type: DataTypes.ENUM('bank', 'paypal', 'stripe'),
        allowNull: false
    },
    // For all payment method types
    accountName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isDefault: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    // For bank accounts
    accountNumber: {
        type: DataTypes.STRING,
        allowNull: true
    },
    routingNumber: {
        type: DataTypes.STRING,
        allowNull: true
    },
    bankName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // For PayPal
    email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // For Stripe
    stripeAccountId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // Security - only store last 4 digits
    lastFour: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // Status
    isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    verificationDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Optional metadata
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    }
}, {
    timestamps: true
});

module.exports = UserPaymentMethod;
