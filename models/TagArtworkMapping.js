// models/TagArtworkMapping.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TagArtworkMapping = sequelize.define('TagArtworkMapping', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    artworkId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Artworks',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    tagId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'ArtworkTags',
            key: 'id'
        },
        onDelete: 'CASCADE'
    }
}, {
    timestamps: true
    // Removed the indexes section since it already exists in the database
});

module.exports = TagArtworkMapping;
