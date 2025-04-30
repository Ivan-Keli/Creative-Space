const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SalesStatistic = sequelize.define('SalesStatistic', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    period: {
        type: DataTypes.STRING,
        allowNull: false
    },
    startDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    endDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    totalSales: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    totalRevenue: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    averageRating: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    totalViews: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    conversionRate: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    bestSellingArtworkId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'Artworks',
            key: 'id'
        }
    },
    mostViewedArtworkId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'Artworks',
            key: 'id'
        }
    },
    detailedStats: {
        type: DataTypes.JSON,
        allowNull: true
    }
}, {
    timestamps: true
});

module.exports = SalesStatistic;
