const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Artwork = sequelize.define('Artwork', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    imageUrl: { type: DataTypes.STRING, allowNull: false },
    thumbnailUrl: { type: DataTypes.STRING, allowNull: true },
    price: { type: DataTypes.FLOAT, allowNull: false },
    originalPrice: { type: DataTypes.FLOAT, allowNull: true },
    creatorId: { type: DataTypes.INTEGER, allowNull: false },
    status: { 
        type: DataTypes.ENUM('available', 'sold', 'hidden', 'pending-approval', 'rejected'), 
        allowNull: false, 
        defaultValue: 'available' 
    },
    // Legacy field - will be replaced by CategoryArtworkMapping
    category: { 
        type: DataTypes.STRING, 
        allowNull: true 
    },
    // Legacy field - will be replaced by ArtworkTagMapping
    legacyTags: { 
        type: DataTypes.JSON, 
        allowNull: true,
        defaultValue: [],
        field: 'tags' // This ensures the database column name stays as 'tags'
    },
    // Artwork metrics
    viewCount: { 
        type: DataTypes.INTEGER, 
        defaultValue: 0 
    },
    likesCount: { 
        type: DataTypes.INTEGER, 
        defaultValue: 0 
    },
    // Artwork metadata
    dimensions: { 
        type: DataTypes.STRING, 
        allowNull: true 
    },
    medium: { 
        type: DataTypes.STRING, 
        allowNull: true 
    },
    creationDate: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
    copyrightInfo: { 
        type: DataTypes.STRING, 
        allowNull: true 
    },
    // Digital artwork specific fields
    fileType: { 
        type: DataTypes.STRING, 
        allowNull: true 
    },
    resolution: { 
        type: DataTypes.STRING, 
        allowNull: true 
    },
    downloadableFile: { 
        type: DataTypes.STRING, 
        allowNull: true 
    },
    // Promotion and visibility settings
    isFeatured: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    onSale: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    // Inventory management
    isLimited: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    editionSize: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    availableEditions: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // Additional metadata as JSON for flexibility
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    },
    // Licensing information
    licenseType: {
        type: DataTypes.STRING,
        allowNull: true
    },
    licenseTerms: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, { timestamps: true });

// Note: This association is already defined in index.js
// It is commented out here to avoid duplicate alias errors
// Artwork.belongsTo(User, { foreignKey: 'creatorId', as: 'creator' });

module.exports = Artwork;
