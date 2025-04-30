const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ArtworkCategory = sequelize.define('ArtworkCategory', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    iconUrl: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    displayOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    parentCategoryId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'ArtworkCategories',
            key: 'id'
        }
    }
}, {
    timestamps: true
});

// Self-referencing relationship for hierarchical categories
ArtworkCategory.belongsTo(ArtworkCategory, { as: 'parentCategory', foreignKey: 'parentCategoryId' });
ArtworkCategory.hasMany(ArtworkCategory, { as: 'subCategories', foreignKey: 'parentCategoryId' });

module.exports = ArtworkCategory;
