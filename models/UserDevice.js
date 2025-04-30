const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserDevice = sequelize.define('UserDevice', {
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
    deviceType: {
        type: DataTypes.STRING,
        allowNull: false
    },
    deviceName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    browser: {
        type: DataTypes.STRING,
        allowNull: true
    },
    operatingSystem: {
        type: DataTypes.STRING,
        allowNull: true
    },
    ipAddress: {
        type: DataTypes.STRING,
        allowNull: true
    },
    lastUsed: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    deviceToken: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    timestamps: true
});

module.exports = UserDevice;
