const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TicketReply = sequelize.define('TicketReply', {
    ticketId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    isAdminReply: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    timestamps: true
});

module.exports = TicketReply;
