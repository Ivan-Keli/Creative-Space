const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CategoryArtworkMapping = sequelize.define('CategoryArtworkMapping', {
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
    categoryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'ArtworkCategories',
            key: 'id'
        },
        onDelete: 'CASCADE'
    }
}, {
    timestamps: true,
    // Define a unique constraint to prevent duplicate mappings
    indexes: [
        {
            unique: true,
            fields: ['artworkId', 'categoryId']
        }
    ]
});

module.exports = CategoryArtworkMapping;
