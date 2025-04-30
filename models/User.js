const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    role: {
        type: DataTypes.ENUM('creator', 'buyer', 'admin'),
        allowNull: false,
        defaultValue: 'buyer',
    },
    bio: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    profilePicture: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    socialLinks: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {
            instagram: "",
            twitter: "",
            facebook: "",
            linkedin: "",
            tiktok: "",
            youtube: ""
        }
    },
    // New fields for enhanced user data
    isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    verificationDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Geographic data
    country: {
        type: DataTypes.STRING,
        allowNull: true
    },
    city: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // User preferences - renamed to avoid collision with the association
    userPreferences: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {
            emailNotifications: true,
            marketingEmails: false,
            displayLanguage: "en",
            theme: "light"
        },
        field: 'preferences' // Keep the database column name as 'preferences'
    },
    // Account details
    lastLoginDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    loginCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    // Payment information for creators
    payoutMethod: {
        type: DataTypes.STRING,
        allowNull: true
    },
    accountHolderName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    accountNumber: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // User account status
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'active'
    }
}, {
    timestamps: true,
});

// ✅ Automatically hash password before creating a user
User.beforeCreate(async (user) => {
    if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
    }
});

// ✅ Automatically hash password before updating if it has changed
User.beforeUpdate(async (user) => {
    if (user.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
    }
});

module.exports = User;
