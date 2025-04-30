const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { 
        type: DataTypes.INTEGER, 
        allowNull: false, 
        references: { model: 'Users', key: 'id' } // Ensure it's linked to the Users table
    },
    type: { 
        type: DataTypes.STRING, 
        allowNull: false 
    },
    message: { 
        type: DataTypes.STRING, 
        allowNull: false 
    },
    relatedEntityId: { 
        type: DataTypes.INTEGER, 
        allowNull: true // Can be null if there's no associated entity (e.g., general admin notifications)
    },
    isRead: { 
        type: DataTypes.BOOLEAN, 
        defaultValue: false 
    }
}, { timestamps: true });

module.exports = Notification;
