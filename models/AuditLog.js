const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    adminId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users', // Ensure this matches the User model table name
            key: 'id'
        }
    },
    actionType: {
        type: DataTypes.STRING,
        allowNull: false
    },
    targetId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    details: {
        type: DataTypes.TEXT, // Allow more detailed descriptions
        allowNull: false
    },
    ipAddress: {
        type: DataTypes.STRING,
        allowNull: true // Logs the IP address of the admin (if needed)
    },
    userAgent: {
        type: DataTypes.STRING,
        allowNull: true // Captures browser or API client details
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    timestamps: true // Enables createdAt & updatedAt
});

module.exports = AuditLog;
