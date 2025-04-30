// models/OrderItem.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Order = require('./Order');
const Artwork = require('./Artwork');

const OrderItem = sequelize.define('OrderItem', {
    id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    orderId: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: {
            model: 'Orders',
            key: 'id'
        }
    },
    artworkId: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: {
            model: 'Artworks',
            key: 'id'
        }
    },
    price: { 
        type: DataTypes.FLOAT, 
        allowNull: false 
    },
    originalPrice: { 
        type: DataTypes.FLOAT, 
        allowNull: true 
    },
    quantity: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        defaultValue: 1
    },
    discount: { 
        type: DataTypes.FLOAT, 
        defaultValue: 0 
    },
    status: { 
        type: DataTypes.ENUM(
            'pending', 
            'processing', 
            'completed', 
            'cancelled', 
            'refunded'
        ),
        defaultValue: 'pending'
    },
    downloadUrl: {
        type: DataTypes.STRING,
        allowNull: true
    },
    downloadCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    }
}, { 
    timestamps: true 
});

// Define associations with unique aliases
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'orderRef' });
OrderItem.belongsTo(Artwork, { foreignKey: 'artworkId', as: 'artworkDetails' });

module.exports = OrderItem;
