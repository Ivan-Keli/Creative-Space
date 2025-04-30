const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Conversation = sequelize.define('Conversation', {
    id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    participant1Id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    participant2Id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW
    },
    lastMessageContent: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    // Optional reference to a related artwork
    relatedArtworkId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'Artworks',
            key: 'id'
        }
    },
    // Flag for official admin communications
    isOfficial: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    // Store metadata (can include unread counts per user)
    unreadBy: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    }
}, { 
    timestamps: true,
    indexes: [
        // For quickly finding all conversations for a user
        { fields: ['participant1Id'] },
        { fields: ['participant2Id'] },
        // For quickly finding a specific conversation between two users
        { fields: ['participant1Id', 'participant2Id'] },
        // For sorting conversations by most recent activity
        { fields: ['lastMessageAt'] }
    ]
});

module.exports = Conversation;
