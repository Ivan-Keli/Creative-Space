// C:\Projects\creativespace\models\EventTicket.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EventTicket = sequelize.define('EventTicket', {
  eventId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  transactionId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  ticketCode: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending_payment',
    validate: {
      isIn: [['pending_payment', 'active', 'used', 'expired', 'cancelled', 'refunded']]
    }
  },
  purchaseDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  usedDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  eventName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  eventDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  eventTime: {
    type: DataTypes.STRING,
    allowNull: true
  },
  venueName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  venueAddress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  venueCity: {
    type: DataTypes.STRING,
    allowNull: true
  },
  venueCountry: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ticketPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true
});

// Define methods for the EventTicket model
EventTicket.prototype.activate = async function() {
  this.status = 'active';
  await this.save();
  return this;
};

EventTicket.prototype.markAsUsed = async function() {
  this.status = 'used';
  this.usedDate = new Date();
  await this.save();
  return this;
};

EventTicket.prototype.cancel = async function() {
  this.status = 'cancelled';
  await this.save();
  return this;
};

EventTicket.prototype.refund = async function() {
  this.status = 'refunded';
  await this.save();
  return this;
};

module.exports = EventTicket;
