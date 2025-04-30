const express = require('express');
const router = express.Router();
const { Ticket, TicketReply, User } = require('../models');
const { authMiddleware, adminMiddleware, authorize } = require('../middleware/authMiddleware');

// Create a new support ticket
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { subject, message, category } = req.body;
        const userId = req.user.id;

        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required' });
        }

        const ticket = await Ticket.create({
            userId,
            subject,
            message,
            category: category || 'general',
            status: 'open'
        });

        res.status(201).json({ 
            message: 'Support ticket created successfully',
            ticketId: ticket.id
        });
    } catch (error) {
        console.error('Error creating support ticket:', error);
        res.status(500).json({ error: 'Error creating support ticket' });
    }
});

// Get all tickets for the current user
router.get('/user/:userId', authMiddleware, async (req, res) => {
    try {
        // Ensure user can only access their own tickets
        if (req.user.id != req.params.userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to view these tickets' });
        }

        const tickets = await Ticket.findAll({
            where: { userId: req.params.userId },
            order: [['updatedAt', 'DESC']]
        });

        res.json(tickets);
    } catch (error) {
        console.error('Error fetching user tickets:', error);
        res.status(500).json({ error: 'Error fetching tickets' });
    }
});

// Get a specific ticket with replies
router.get('/:ticketId', authMiddleware, async (req, res) => {
    try {
        const ticket = await Ticket.findByPk(req.params.ticketId, {
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'email', 'profilePicture'] },
                { 
                    model: TicketReply, 
                    as: 'replies',
                    include: [{ 
                        model: User, 
                        as: 'user',
                        attributes: ['id', 'name', 'email', 'profilePicture', 'role'] 
                    }],
                    order: [['createdAt', 'ASC']]
                }
            ]
        });

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check if user owns this ticket or is an admin
        if (ticket.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to view this ticket' });
        }

        res.json(ticket);
    } catch (error) {
        console.error('Error fetching ticket details:', error);
        res.status(500).json({ error: 'Error fetching ticket details' });
    }
});

// Add a reply to a ticket
router.post('/:ticketId/reply', authMiddleware, async (req, res) => {
    try {
        const { message } = req.body;
        const { ticketId } = req.params;
        const userId = req.user.id;

        if (!message) {
            return res.status(400).json({ error: 'Reply message is required' });
        }

        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check if user owns this ticket or is an admin
        if (ticket.userId !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to reply to this ticket' });
        }

        // Create the reply
        const isAdminReply = req.user.role === 'admin';
        const reply = await TicketReply.create({
            ticketId,
            userId,
            message,
            isAdminReply
        });

        // Update ticket status
        let newStatus = 'open';
        if (isAdminReply) {
            newStatus = 'in_progress';
        } else if (ticket.status === 'resolved') {
            newStatus = 'reopened';
        }

        await ticket.update({ 
            status: newStatus,
            updatedAt: new Date()
        });

        // Load the user info for the reply
        const replyWithUser = await TicketReply.findByPk(reply.id, {
            include: [{ 
                model: User, 
                as: 'user',
                attributes: ['id', 'name', 'email', 'profilePicture', 'role'] 
            }]
        });

        res.status(201).json({ 
            message: 'Reply added successfully',
            reply: replyWithUser 
        });
    } catch (error) {
        console.error('Error adding reply to ticket:', error);
        res.status(500).json({ error: 'Error adding reply' });
    }
});

// Update ticket status
router.put('/:ticketId/status', authMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const { ticketId } = req.params;

        if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check if user owns this ticket or is an admin
        if (ticket.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to update this ticket' });
        }

        // Only admin can set status to closed
        if (status === 'closed' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can close tickets' });
        }

        await ticket.update({ 
            status,
            updatedAt: new Date()
        });

        res.json({ 
            message: 'Ticket status updated successfully',
            ticket
        });
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).json({ error: 'Error updating ticket status' });
    }
});

// Get all tickets (admin only)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        
        const offset = (page - 1) * limit;
        const where = {};
        
        if (status) {
            where.status = status;
        }
        
        const tickets = await Ticket.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset,
            order: [['createdAt', 'DESC']],
            include: [{
                model: User,
                as: 'creator',
                attributes: ['id', 'name', 'email']
            }]
        });
        
        res.json({
            tickets: tickets.rows,
            totalCount: tickets.count,
            page: parseInt(page),
            totalPages: Math.ceil(tickets.count / limit)
        });
    } catch (error) {
        console.error('Error fetching all tickets:', error);
        res.status(500).json({ error: 'Failed to fetch tickets' });
    }
});

module.exports = router;
