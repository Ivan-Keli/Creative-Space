const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TransactionRefund = sequelize.define('TransactionRefund', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    transactionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Transactions',
            key: 'id'
        }
    },
    amount: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('requested', 'approved', 'declined', 'processed'),
        defaultValue: 'requested'
    },
    requestReason: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    processorNotes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    requestedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    processedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    requestDate: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    processedDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    refundReference: {
        type: DataTypes.STRING,
        allowNull: true
    },
    refundMethod: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isPartial: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    timestamps: true
});

module.exports = TransactionRefund;
