const express = require('express');
const router = express.Router();
const { User, UserPreferences } = require('../models');
const authMiddleware = require('../middleware/authMiddleware');

// Get user settings
router.get('/:userId/settings', function(req, res, next) {
    authMiddleware(req, res, async function() {
        try {
            // Ensure the user can only access their own settings (or admin can access any)
            if (req.user.id !== parseInt(req.params.userId) && req.user.role !== 'admin') {
                return res.status(403).json({ message: 'Unauthorized access to user settings' });
            }
            
            // Fetch user preferences
            let preferences = await UserPreferences.findOne({
                where: { userId: req.params.userId }
            });
            
            // If no preferences exist yet, create default preferences
            if (!preferences) {
                preferences = await UserPreferences.create({
                    userId: req.params.userId,
                    // Default values are set in the model
                });
            }
            
            res.json(preferences);
        } catch (error) {
            console.error('Error fetching user settings:', error);
            res.status(500).json({ message: 'Error fetching user settings', error: error.message });
        }
    });
});

// Update user settings
router.put('/:userId/settings', function(req, res, next) {
    authMiddleware(req, res, async function() {
        try {
            // Ensure the user can only update their own settings (or admin can update any)
            if (req.user.id !== parseInt(req.params.userId) && req.user.role !== 'admin') {
                return res.status(403).json({ message: 'Unauthorized to update user settings' });
            }
            
            const { 
                emailNotifications, 
                privacySettings, 
                displayPreferences, 
                paymentPreferences,
                contentPreferences,
                accessibilitySettings
            } = req.body;
            
            // Find existing preferences or create new ones
            let preferences = await UserPreferences.findOne({
                where: { userId: req.params.userId }
            });
            
            if (!preferences) {
                // Create with provided values
                preferences = await UserPreferences.create({
                    userId: req.params.userId,
                    emailNotifications: emailNotifications || undefined,
                    privacySettings: privacySettings || undefined,
                    displayPreferences: displayPreferences || undefined,
                    paymentPreferences: paymentPreferences || undefined,
                    contentPreferences: contentPreferences || undefined,
                    accessibilitySettings: accessibilitySettings || undefined
                });
            } else {
                // Update existing preferences
                // Only update fields that were provided
                const updates = {};
                if (emailNotifications) updates.emailNotifications = emailNotifications;
                if (privacySettings) updates.privacySettings = privacySettings;
                if (displayPreferences) updates.displayPreferences = displayPreferences;
                if (paymentPreferences) updates.paymentPreferences = paymentPreferences;
                if (contentPreferences) updates.contentPreferences = contentPreferences;
                if (accessibilitySettings) updates.accessibilitySettings = accessibilitySettings;
                
                await preferences.update(updates);
            }
            
            // Fetch the updated preferences
            preferences = await UserPreferences.findOne({
                where: { userId: req.params.userId }
            });
            
            res.json(preferences);
        } catch (error) {
            console.error('Error updating user settings:', error);
            res.status(500).json({ message: 'Error updating user settings', error: error.message });
        }
    });
});

// Get user theme preference (public route for initial app load)
router.get('/:userId/theme', async (req, res) => {
    try {
        const preferences = await UserPreferences.findOne({
            where: { userId: req.params.userId },
            attributes: ['displayPreferences']
        });
        
        if (!preferences) {
            return res.json({ theme: 'light' }); // Default theme
        }
        
        const theme = preferences.displayPreferences.darkMode ? 'dark' : 'light';
        res.json({ theme });
    } catch (error) {
        console.error('Error fetching user theme:', error);
        res.status(500).json({ message: 'Error fetching user theme', error: error.message });
    }
});

// Update a specific preference section
router.patch('/:userId/settings/:section', function(req, res, next) {
    authMiddleware(req, res, async function() {
        try {
            // Ensure the user can only update their own settings (or admin can update any)
            if (req.user.id !== parseInt(req.params.userId) && req.user.role !== 'admin') {
                return res.status(403).json({ message: 'Unauthorized to update user settings' });
            }
            
            const { section } = req.params;
            const validSections = [
                'emailNotifications', 
                'privacySettings', 
                'displayPreferences', 
                'paymentPreferences',
                'contentPreferences',
                'accessibilitySettings'
            ];
            
            if (!validSections.includes(section)) {
                return res.status(400).json({ message: 'Invalid settings section' });
            }
            
            // Find existing preferences
            let preferences = await UserPreferences.findOne({
                where: { userId: req.params.userId }
            });
            
            if (!preferences) {
                // Create with default values, then set the specified section
                preferences = await UserPreferences.create({
                    userId: req.params.userId
                });
            }
            
            // Update just this section
            const update = {};
            update[section] = req.body;
            await preferences.update(update);
            
            // Fetch the updated preferences
            preferences = await UserPreferences.findOne({
                where: { userId: req.params.userId }
            });
            
            res.json(preferences);
        } catch (error) {
            console.error('Error updating user settings section:', error);
            res.status(500).json({ message: 'Error updating user settings section', error: error.message });
        }
    });
});

module.exports = router;
