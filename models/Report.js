const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Artwork = require('./Artwork');

const Report = sequelize.define('Report', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    reporterId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    artworkId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'Artworks',
            key: 'id'
        }
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: false
    },
    details: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('pending', 'in_review', 'resolved', 'dismissed'),
        defaultValue: 'pending'
    },
    adminNotes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    reviewedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    timestamps: true
});

// Note: Associations are defined in index.js
// These associations are commented out to avoid duplicate alias errors
// Report.belongsTo(User, { foreignKey: 'reporterId', as: 'reporter' });
// Report.belongsTo(User, { foreignKey: 'reviewedBy', as: 'reviewer' });
// Report.belongsTo(Artwork, { foreignKey: 'artworkId', as: 'reportedArtwork' });

module.exports = Report;
