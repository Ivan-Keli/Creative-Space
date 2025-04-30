const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Message = sequelize.define('Message', {
    id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    senderId: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    receiverId: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    content: { 
        type: DataTypes.TEXT, 
        allowNull: false 
    },
    conversationId: { 
        type: DataTypes.INTEGER, 
        allowNull: true 
    },
    status: { 
        type: DataTypes.ENUM('sent', 'delivered', 'read'), 
        allowNull: false, 
        defaultValue: 'sent' 
    },
    // Optional reference to an artwork
    artworkId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'Artworks',
            key: 'id'
        }
    },
    // Additional metadata (can store various data like message type)
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    }
}, { 
    timestamps: true,
    indexes: [
        {
            fields: ['conversationId'],
            name: 'messages_conversation_id_idx'
        },
        {
            fields: ['senderId', 'receiverId'],
            name: 'messages_sender_id_receiver_id'
        },
        {
            fields: ['status'],
            name: 'messages_status_idx'
        },
        {
            fields: ['createdAt'],
            name: 'messages_created_at_idx'
        }
    ]
});

// Associations are defined in index.js
// Don't define them here to avoid duplicate alias errors

module.exports = Message;
