const express = require('express');
const router = express.Router();
const { Ticket, Notification } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');
const events = require('../events');

// Helper function to emit admin notifications
const sendAdminNotification = (message, type = 'general') => {
    events.emit('admin_notification', { message, type });
};

// ✅ Create New Ticket and Notify Admins
router.post('/', authMiddleware, async (req, res) => {
    const { subject, message } = req.body;
    try {
        const ticket = await Ticket.create({
            userId: req.user.id,
            subject,
            message,
            status: 'pending'
        });

        // Store notification in the database
        await Notification.create({
            type: 'ticket',
            message: `New support ticket submitted: "${subject}"`,
            userId: req.user.id,
            relatedEntityId: ticket.id,
            isRead: false
        });

        // Send real-time notification to admins via Event Emitter
        sendAdminNotification({
            message: `New support ticket submitted by User ID ${req.user.id}: "${subject}"`,
        });

        res.json({ message: 'Ticket submitted successfully', ticket });

    } catch (error) {
        console.error("Error creating ticket:", error);
        res.status(500).json({ error: "Failed to create ticket" });
    }
});

// ✅ Get All Tickets (Admin Only)
router.get('/', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const tickets = await Ticket.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.json(tickets);
    } catch (error) {
        console.error("Error fetching tickets:", error);
        res.status(500).json({ error: "Failed to fetch tickets" });
    }
});

// ✅ Mark Ticket as Resolved (Admin Only)
router.put('/:ticketId/resolve', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { resolutionMessage } = req.body;

        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket) return res.status(404).json({ error: "Ticket not found" });

        ticket.status = 'resolved';
        await ticket.save();

        // Notify user that the ticket has been resolved
        await Notification.create({
            type: 'ticket_resolved',
            message: `Your support ticket "${ticket.subject}" has been resolved.`,
            userId: ticket.userId,
            relatedEntityId: ticket.id,
            isRead: false
        });

        sendAdminNotification({
            message: `Ticket ID ${ticketId} has been marked as resolved.`,
        });

        res.json({ message: 'Ticket resolved successfully', ticket });

    } catch (error) {
        console.error("Error resolving ticket:", error);
        res.status(500).json({ error: "Failed to resolve ticket" });
    }
});

// ✅ Delete Ticket (Admin Only)
router.delete('/:ticketId', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { ticketId } = req.params;
        const ticket = await Ticket.findByPk(ticketId);

        if (!ticket) return res.status(404).json({ error: "Ticket not found" });

        await ticket.destroy();

        res.json({ message: "Ticket deleted successfully" });

    } catch (error) {
        console.error("Error deleting ticket:", error);
        res.status(500).json({ error: "Failed to delete ticket" });
    }
});

module.exports = router;
