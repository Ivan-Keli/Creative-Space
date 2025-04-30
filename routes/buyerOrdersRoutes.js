const express = require('express');
const router = express.Router();
const { Transaction, Artwork, User } = require('../models');
const { authMiddleware, buyerMiddleware } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Get all orders for the current buyer
router.get('/', authMiddleware, buyerMiddleware, async (req, res) => {
    try {
        const orders = await Transaction.findAll({
            where: { buyerId: req.user.id },
            include: [
                { 
                    model: Artwork, 
                    as: 'purchasedArtwork', // FIXED: Changed from 'artwork' to 'purchasedArtwork'
                    include: [
                        { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Format response to maintain backward compatibility with frontend
        const formattedOrders = orders.map(order => {
            const result = order.toJSON();
            // Add artwork property that points to purchasedArtwork
            result.artwork = result.purchasedArtwork;
            return result;
        });
        
        res.json(formattedOrders);
    } catch (error) {
        console.error('Error fetching buyer orders:', error);
        res.status(500).json({ error: 'Error fetching orders' });
    }
});

// Get orders for a specific user
router.get('/user/:userId', authMiddleware, async (req, res) => {
    try {
        // Ensure user is requesting their own orders
        if (req.user.id != req.params.userId) {
            return res.status(403).json({ error: 'Not authorized to view these orders' });
        }
        
        const orders = await Transaction.findAll({
            where: { 
                buyerId: req.params.userId
            },
            include: [
                { 
                    model: Artwork, as: 'purchasedArtwork', // FIXED: Changed from 'artwork' to 'purchasedArtwork'
                    attributes: [
                        'id', 'title', 'imageUrl', 'thumbnailUrl', 
                        'price', 'creatorId'
                    ],
                    include: [
                        { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
                    ]
                },
                {
                    model: User,
                    as: 'seller',
                    attributes: ['id', 'name', 'profilePicture']
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Format response to maintain backward compatibility with frontend
        const formattedOrders = orders.map(order => {
            const result = order.toJSON();
            // Add artwork property that points to purchasedArtwork
            result.artwork = result.purchasedArtwork;
            return result;
        });
        
        res.json(formattedOrders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Error fetching orders' });
    }
});

// Get a specific order by ID
router.get('/:orderId', authMiddleware, async (req, res) => {
    try {
        const order = await Transaction.findByPk(req.params.orderId, {
            include: [
                { model: Artwork, as: 'purchasedArtwork' }, // FIXED: Changed from 'artwork' to 'purchasedArtwork'
                { model: User, as: 'buyer', attributes: ['id', 'name', 'email', 'profilePicture'] },
                { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'profilePicture'] }
            ]
        });
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Format response to maintain backward compatibility with frontend
        const formattedOrder = order.toJSON();
        formattedOrder.artwork = formattedOrder.purchasedArtwork;
        
        // Ensure user is authorized to view this order
        if (formattedOrder.buyerId !== req.user.id && formattedOrder.artwork.creatorId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to view this order' });
        }
        
        res.json(formattedOrder);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Error fetching order' });
    }
});

// Cancel an order (if it's pending)
router.put('/:orderId/cancel', authMiddleware, buyerMiddleware, async (req, res) => {
    try {
        const order = await Transaction.findOne({
            where: { 
                id: req.params.orderId,
                buyerId: req.user.id
            }
        });
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        if (order.status !== 'pending') {
            return res.status(400).json({ error: 'Only pending orders can be canceled' });
        }
        
        await order.update({ status: 'cancelled' });
        
        res.json({ message: 'Order canceled successfully', order });
    } catch (error) {
        console.error('Error canceling order:', error);
        res.status(500).json({ error: 'Error canceling order' });
    }
});

// Request a refund for an order
router.post('/:orderId/refund-request', authMiddleware, buyerMiddleware, async (req, res) => {
    try {
        const { reason } = req.body;
        
        if (!reason) {
            return res.status(400).json({ error: 'Refund reason is required' });
        }
        
        const order = await Transaction.findOne({
            where: { 
                id: req.params.orderId,
                buyerId: req.user.id
            }
        });
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        if (order.status !== 'completed') {
            return res.status(400).json({ error: 'Only completed orders can request refunds' });
        }
        
        await order.update({ 
            status: 'refund_requested',
            refundReason: reason,
            refundRequestedAt: new Date()
        });
        
        res.json({ message: 'Refund requested successfully', order });
    } catch (error) {
        console.error('Error requesting refund:', error);
        res.status(500).json({ error: 'Error requesting refund' });
    }
});

module.exports = router;
