const express = require('express');
const router = express.Router();
const { Notification } = require('../models');
const { authMiddleware } = require('../middleware/authMiddleware');
const events = require('../events');
const socketManager = require('../socket-manager');

// Helper function to emit admin notifications
const sendAdminNotification = (message, type = 'general') => {
    events.emit('admin_notification', { message, type });
};

// ✅ Get All Notifications for a User (Sorted by Newest First)
router.get('/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const notifications = await Notification.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']] // Latest notifications first
        });

        res.json(notifications);
    } catch (error) {
        console.error("❌ Error fetching notifications:", error);
        res.status(500).json({ error: "Error fetching notifications" });
    }
});

// ✅ Mark Notification as Read
router.put('/:notificationId/mark-read', authMiddleware, async (req, res) => {
    try {
        const { notificationId } = req.params;
        const notification = await Notification.findByPk(notificationId);

        if (!notification) return res.status(404).json({ error: "Notification not found" });

        notification.isRead = true;
        await notification.save();

        res.json({ message: "✅ Notification marked as read", notification });
    } catch (error) {
        console.error("❌ Error marking notification as read:", error);
        res.status(500).json({ error: "Error updating notification" });
    }
});

// ✅ Mark All Notifications as Read for a User
router.put('/:userId/mark-all-read', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        await Notification.update({ isRead: true }, { where: { userId } });

        res.json({ message: "✅ All notifications marked as read" });
    } catch (error) {
        console.error("❌ Error marking all notifications as read:", error);
        res.status(500).json({ error: "Error updating notifications" });
    }
});

// ✅ Clear All Notifications for a User
router.delete('/:userId/clear', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        await Notification.destroy({ where: { userId } });

        res.json({ message: "✅ All notifications cleared" });
    } catch (error) {
        console.error("❌ Error clearing notifications:", error);
        res.status(500).json({ error: "Error clearing notifications" });
    }
});

// ✅ Delete a Single Notification
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findByPk(id);
        if (!notification) return res.status(404).json({ error: "Notification not found" });

        await notification.destroy();
        res.json({ message: "✅ Notification deleted successfully" });
    } catch (error) {
        console.error("❌ Error deleting notification:", error);
        res.status(500).json({ error: "Error deleting notification" });
    }
});

module.exports = router;
