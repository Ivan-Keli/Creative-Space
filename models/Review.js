const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Review = sequelize.define('Review', {
    userId: DataTypes.INTEGER,
    artworkId: DataTypes.INTEGER,
    rating: DataTypes.INTEGER,
    comment: DataTypes.STRING
}, {
    timestamps: true
});

module.exports = Review;
