const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ArtworkTag = sequelize.define('ArtworkTag', {
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
    useCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    isApproved: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    timestamps: true
});

module.exports = ArtworkTag;
