const express = require('express');
const router = express.Router();
const { Ticket, TicketReply, User } = require('../models');
const { authMiddleware, adminMiddleware, authorize } = require('../middleware/authMiddleware');

// Get all tickets for admin
router.get('/', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { status } = req.query;
        const filter = {};
        
        if (status) {
            filter.status = status;
        }
        
        const tickets = await Ticket.findAll({
            where: filter,
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'email', 'profilePicture'] }
            ],
            order: [
                ['updatedAt', 'DESC']
            ]
        });
        
        res.json(tickets);
    } catch (error) {
        console.error('Error fetching support tickets:', error);
        res.status(500).json({ error: 'Error fetching support tickets' });
    }
});

// Get ticket details by ID
router.get('/:id', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const ticket = await Ticket.findByPk(req.params.id, {
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'email', 'profilePicture'] }
            ]
        });
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        res.json(ticket);
    } catch (error) {
        console.error('Error fetching ticket:', error);
        res.status(500).json({ error: 'Error fetching ticket' });
    }
});

// Update ticket status
router.put('/:id', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { status, adminResponse } = req.body;
        const ticket = await Ticket.findByPk(req.params.id);
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        await ticket.update({
            status,
            adminResponse,
            adminId: req.user.id,
            resolvedAt: status === 'resolved' ? new Date() : null
        });
        
        res.json(ticket);
    } catch (error) {
        console.error('Error updating ticket:', error);
        res.status(500).json({ error: 'Error updating ticket' });
    }
});

// Get all tickets for admin (original implementation)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status } = req.query;
        const filter = {};
        
        if (status) {
            filter.status = status;
        }
        
        const tickets = await Ticket.findAll({
            where: filter,
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'email', 'profilePicture'] }
            ],
            order: [
                ['updatedAt', 'DESC']
            ]
        });
        
        res.json(tickets);
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ error: 'Error fetching tickets' });
    }
});

// Get ticket details by ID (original implementation)
router.get('/:ticketId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const ticket = await Ticket.findByPk(req.params.ticketId, {
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'email', 'profilePicture'] },
                { 
                    model: TicketReply, 
                    as: 'replies',
                    include: [
                        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'profilePicture', 'role'] }
                    ],
                    order: [['createdAt', 'ASC']]
                }
            ]
        });
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        res.json(ticket);
    } catch (error) {
        console.error('Error fetching ticket details:', error);
        res.status(500).json({ error: 'Error fetching ticket details' });
    }
});

// Update ticket status (original implementation)
router.put('/:ticketId/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }
        
        if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        
        const ticket = await Ticket.findByPk(req.params.ticketId);
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        // Update ticket status
        await ticket.update({ 
            status,
            updatedAt: new Date()
        });
        
        // If status is changing to resolved or closed, add a system reply
        if (status === 'resolved' || status === 'closed') {
            await TicketReply.create({
                ticketId: ticket.id,
                userId: req.user.id,
                message: `This ticket has been marked as ${status} by admin.`,
                isAdminReply: true
            });
        }
        
        res.json({ message: 'Ticket status updated successfully', ticket });
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).json({ error: 'Error updating ticket status' });
    }
});

// Add admin reply to ticket
router.post('/:ticketId/reply', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Reply message is required' });
        }
        
        const ticket = await Ticket.findByPk(req.params.ticketId);
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        // Create the reply
        const reply = await TicketReply.create({
            ticketId: ticket.id,
            userId: req.user.id,
            message,
            isAdminReply: true
        });
        
        // Update ticket status to in_progress if it was open
        if (ticket.status === 'open') {
            await ticket.update({ 
                status: 'in_progress',
                updatedAt: new Date()
            });
        }
        
        // Get reply with user details
        const replyWithUser = await TicketReply.findByPk(reply.id, {
            include: [
                { model: User, as: 'user', attributes: ['id', 'name', 'email', 'profilePicture', 'role'] }
            ]
        });
        
        res.status(201).json({ 
            message: 'Reply added successfully', 
            reply: replyWithUser,
            ticketStatus: ticket.status
        });
    } catch (error) {
        console.error('Error adding reply to ticket:', error);
        res.status(500).json({ error: 'Error adding reply to ticket' });
    }
});

// Assign ticket to admin
router.put('/:ticketId/assign', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const ticket = await Ticket.findByPk(req.params.ticketId);
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        // Assign ticket to the admin
        await ticket.update({ 
            assignedToId: req.user.id,
            status: ticket.status === 'open' ? 'in_progress' : ticket.status,
            updatedAt: new Date()
        });
        
        res.json({ 
            message: 'Ticket assigned successfully', 
            ticket
        });
    } catch (error) {
        console.error('Error assigning ticket:', error);
        res.status(500).json({ error: 'Error assigning ticket' });
    }
});

// Get ticket statistics for admin dashboard
router.get('/stats/summary', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const totalTickets = await Ticket.count();
        const openTickets = await Ticket.count({ where: { status: 'open' } });
        const inProgressTickets = await Ticket.count({ where: { status: 'in_progress' } });
        const resolvedTickets = await Ticket.count({ where: { status: 'resolved' } });
        const closedTickets = await Ticket.count({ where: { status: 'closed' } });
        
        res.json({
            totalTickets,
            openTickets,
            inProgressTickets,
            resolvedTickets,
            closedTickets
        });
    } catch (error) {
        console.error('Error fetching ticket statistics:', error);
        res.status(500).json({ error: 'Error fetching ticket statistics' });
    }
});

module.exports = router;
