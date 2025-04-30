const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserPreferences = sequelize.define('UserPreferences', {
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
        },
        unique: true
    },
    // Email Notifications
    emailNotifications: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {
            newMessages: true,
            newSales: true,
            newComments: true,
            marketingUpdates: false,
            newFollowers: true
        }
    },
    // Privacy Settings
    privacySettings: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {
            showEmail: false,
            showLocation: true,
            showActivity: true,
            allowProfileVisits: true,
            allowTagging: true
        }
    },
    // Display Preferences
    displayPreferences: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {
            darkMode: false,
            compactView: false,
            autoPlayVideos: true,
            highContrastMode: false,
            fontSize: "medium"
        }
    },
    // Payment Preferences
    paymentPreferences: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {
            defaultPaymentMethod: "",
            autoRenewSubscription: true,
            savePaymentInfo: true
        }
    },
    // Content Preferences
    contentPreferences: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {
            preferredCategories: [],
            contentLanguage: "en",
            adultContent: false,
            contentFilters: ["violence", "explicit"]
        }
    },
    // Accessibility Settings
    accessibilitySettings: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {
            screenReader: false,
            reduceMotion: false,
            highContrast: false,
            largeText: false
        }
    }
}, {
    timestamps: true
});

module.exports = UserPreferences;
