const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Ticket = sequelize.define('Ticket', {
    userId: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    subject: { 
        type: DataTypes.STRING, 
        allowNull: false 
    },
    message: { 
        type: DataTypes.TEXT, 
        allowNull: false 
    },
    category: { 
        type: DataTypes.STRING, 
        defaultValue: "general" 
    },
    status: { 
        type: DataTypes.STRING, 
        defaultValue: "open" 
    }, // open, in_progress, resolved, closed, reopened
}, {
    timestamps: true
});

module.exports = Ticket;
