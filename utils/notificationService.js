const { Notification } = require('../models');
const events = require('../events');
const socketManager = require('../socket-manager');

/**
 * Create and store a notification in the database and send real-time notification.
 * 
 * @param {number} userId - The user to notify.
 * @param {string} type - The type of notification (e.g., "user_status", "transaction_update").
 * @param {string} message - The notification message to display.
 * @param {number|null} relatedEntityId - (Optional) ID of related entity (e.g., transaction ID, artwork ID).
 */
const createNotification = async (userId, type, message, relatedEntityId = null) => {
    try {
        await Notification.create({
            userId,
            type,
            message,
            relatedEntityId
        });

        // ✅ Send Real-time Notification if User is Online
        const io = socketManager.getIO();
        if (io) {
            io.to(userId).emit('new_notification', {
                message,
                type,
                relatedEntityId
            });
        }

        console.log(`✅ Notification sent to User ${userId}: ${message}`);
    } catch (error) {
        console.error("❌ Error creating notification:", error);
    }
};

/**
 * Fetch all notifications for a specific user.
 * 
 * @param {number} userId - The ID of the user to fetch notifications for.
 * @returns {Promise<Array>} - A list of notifications.
 */
const getUserNotifications = async (userId) => {
    try {
        return await Notification.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']]
        });
    } catch (error) {
        console.error(`❌ Error fetching notifications for User ${userId}:`, error);
        return [];
    }
};

/**
 * Mark a notification as read.
 * 
 * @param {number} notificationId - The ID of the notification to mark as read.
 */
const markNotificationAsRead = async (notificationId) => {
    try {
        const notification = await Notification.findByPk(notificationId);
        if (!notification) return console.warn(`⚠️ Notification ID ${notificationId} not found.`);

        notification.isRead = true;
        await notification.save();

        console.log(`✅ Notification ID ${notificationId} marked as read.`);
    } catch (error) {
        console.error(`❌ Error marking notification ID ${notificationId} as read:`, error);
    }
};

/**
 * Delete a notification.
 * 
 * @param {number} notificationId - The ID of the notification to delete.
 */
const deleteNotification = async (notificationId) => {
    try {
        const notification = await Notification.findByPk(notificationId);
        if (!notification) return console.warn(`⚠️ Notification ID ${notificationId} not found.`);

        await notification.destroy();
        console.log(`✅ Notification ID ${notificationId} deleted.`);
    } catch (error) {
        console.error(`❌ Error deleting notification ID ${notificationId}:`, error);
    }
};

// Helper function to send admin notifications if needed in this module
const sendAdminNotification = (message, type = 'general') => {
    events.emit('admin_notification', { message, type });
};

module.exports = { createNotification, getUserNotifications, markNotificationAsRead, deleteNotification };
