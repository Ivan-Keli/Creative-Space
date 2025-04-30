const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Artwork = require('./Artwork');
const User = require('./User');

const DigitalAsset = sequelize.define('DigitalAsset', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    artworkId: {
        type: DataTypes.INTEGER,
        allowNull: true, // Changed to allow null for standalone assets
        unique: true,
        references: {
            model: 'Artworks',
            key: 'id'
        }
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    title: {
        type: DataTypes.STRING,
        allowNull: true // For standalone assets
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true // For standalone assets
    },
    price: {
        type: DataTypes.FLOAT,
        allowNull: true // For standalone assets
    },
    status: {
        type: DataTypes.ENUM('available', 'sold', 'hidden', 'pending-approval', 'rejected'),
        defaultValue: 'available'
    },
    assetType: {
        type: DataTypes.ENUM('local', 'cloudinary', 'external', 'photo', 'publication', 'artwork'),
        allowNull: false
    },
    fileUrl: {
        type: DataTypes.STRING,
        allowNull: false
    },
    filePublicId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    mimeType: {
        type: DataTypes.STRING,
        allowNull: true
    },
    fileSize: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    originalFileName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isProtected: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    accessToken: {
        type: DataTypes.STRING,
        allowNull: true
    },
    downloadCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    lastDownloaded: {
        type: DataTypes.DATE,
        allowNull: true
    },
    categoryId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'ArtworkCategories',
            key: 'id'
        }
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    },
    expiryDate: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    timestamps: true
});

// Define associations (these will be properly set up in index.js)
// DigitalAsset.belongsTo(Artwork, { foreignKey: 'artworkId', as: 'artwork' });
// DigitalAsset.belongsTo(User, { foreignKey: 'userId', as: 'creator' });

module.exports = DigitalAsset;
