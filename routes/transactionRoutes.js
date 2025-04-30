// routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const { Transaction, User, Artwork, sequelize } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');
const { createNotification } = require('../utils/notificationService');

// Create a new transaction
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { artworkId, amount } = req.body;
        const buyerId = req.user.id;

        // Verify artwork exists and is available
        const artwork = await Artwork.findByPk(artworkId);
        if (!artwork) {
            return res.status(404).json({ error: 'Artwork not found' });
        }

        if (artwork.status !== 'available') {
            return res.status(400).json({ error: 'Artwork is not available for purchase' });
        }

        // Create transaction
        const transaction = await Transaction.create({
            buyerId,
            creatorId: artwork.creatorId,
            artworkId,
            amount: amount || artwork.price,
            status: 'pending'
        });

        // Notify creator of new purchase
        await createNotification(
            artwork.creatorId,
            'purchase',
            `Your artwork "${artwork.title}" has a new purchase pending.`
        );

        res.status(201).json({
            message: 'Transaction created successfully',
            transaction
        });
    } catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

// Get transaction by ID
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const transaction = await Transaction.findByPk(req.params.id, {
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'name', 'email'] },
                { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
                { model: Artwork, as: 'purchasedArtwork' } // Changed from 'artwork' to 'purchasedArtwork'
            ]
        });

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Check if user is authorized to view this transaction
        if (req.user.role !== 'admin' && 
            req.user.id !== transaction.buyerId && 
            req.user.id !== transaction.creatorId) {
            return res.status(403).json({ error: 'Unauthorized to view this transaction' });
        }

        res.json(transaction);
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({ error: 'Failed to fetch transaction' });
    }
});

// Update transaction status
router.put('/:id/status', authMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const { id } = req.params;
        
        const transaction = await Transaction.findByPk(id, {
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'name'] },
                { model: User, as: 'creator', attributes: ['id', 'name'] },
                { model: Artwork, as: 'purchasedArtwork', attributes: ['id', 'title'] } // Changed from 'artwork' to 'purchasedArtwork'
            ]
        });
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        // Check authorization based on the status change
        if (req.user.role !== 'admin') {
            if (status === 'completed' && req.user.id !== transaction.buyerId) {
                return res.status(403).json({ error: 'Only the buyer can complete this transaction' });
            }
            
            if (status === 'refund-requested' && req.user.id !== transaction.buyerId) {
                return res.status(403).json({ error: 'Only the buyer can request a refund' });
            }
            
            if ((status === 'refunded' || status === 'refund-declined') && req.user.id !== transaction.creatorId) {
                return res.status(403).json({ error: 'Only the creator can process refund requests' });
            }
        }
        
        await transaction.update({ status });
        
        // Create notifications
        const isBuyerAction = status === 'completed' || status === 'refund-requested';
        const notifyUserId = isBuyerAction ? transaction.creatorId : transaction.buyerId;
        
        let notificationType, notificationMessage;
        
        switch (status) {
            case 'completed':
                notificationType = 'transaction_completed';
                notificationMessage = `Transaction for "${transaction.purchasedArtwork.title}" has been completed by ${transaction.buyer.name}.`; // Changed from artwork to purchasedArtwork
                break;
            case 'refund-requested':
                notificationType = 'refund_requested';
                notificationMessage = `${transaction.buyer.name} has requested a refund for "${transaction.purchasedArtwork.title}".`; // Changed from artwork to purchasedArtwork
                break;
            case 'refunded':
                notificationType = 'refund_approved';
                notificationMessage = `Your refund for "${transaction.purchasedArtwork.title}" has been approved.`; // Changed from artwork to purchasedArtwork
                break;
            case 'refund-declined':
                notificationType = 'refund_declined';
                notificationMessage = `Your refund request for "${transaction.purchasedArtwork.title}" has been declined.`; // Changed from artwork to purchasedArtwork
                break;
            default:
                notificationType = 'transaction_updated';
                notificationMessage = `Transaction status for "${transaction.purchasedArtwork.title}" has been updated to ${status}.`; // Changed from artwork to purchasedArtwork
        }
        
        await createNotification(notifyUserId, notificationType, notificationMessage);
        
        res.json({
            message: `Transaction status updated to ${status}`,
            transaction
        });
    } catch (error) {
        console.error('Error updating transaction status:', error);
        res.status(500).json({ error: 'Failed to update transaction status' });
    }
});

// Request a refund
router.post('/:id/refund-request', authMiddleware, async (req, res) => {
    try {
        const { reason } = req.body;
        const { id } = req.params;
        
        if (!reason) {
            return res.status(400).json({ error: 'Refund reason is required' });
        }
        
        const transaction = await Transaction.findByPk(id, {
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'name'] },
                { model: User, as: 'creator', attributes: ['id', 'name'] },
                { model: Artwork, as: 'purchasedArtwork', attributes: ['id', 'title'] } // Changed from 'artwork' to 'purchasedArtwork'
            ]
        });
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        // Check if user is the buyer
        if (transaction.buyerId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only the buyer can request a refund' });
        }
        
        // Check if transaction is in a valid state for refund
        if (transaction.status !== 'completed' && transaction.status !== 'pending') {
            return res.status(400).json({ 
                error: `Cannot request refund for transaction in ${transaction.status} status` 
            });
        }
        
        // Update transaction
        await transaction.update({
            status: 'refund-requested',
            refundRequestReason: reason,
            refundRequestDate: new Date()
        });
        
        // Notify creator
        await createNotification(
            transaction.creatorId,
            'refund_requested',
            `${transaction.buyer.name} has requested a refund for "${transaction.purchasedArtwork.title}". Reason: ${reason}` // Changed from artwork to purchasedArtwork
        );
        
        res.json({
            message: 'Refund requested successfully',
            transaction
        });
    } catch (error) {
        console.error('Error requesting refund:', error);
        res.status(500).json({ error: 'Failed to request refund' });
    }
});

// Process refund request (approve or decline)
router.put('/:id/process-refund', authMiddleware, async (req, res) => {
    try {
        const { action, reason } = req.body;
        const { id } = req.params;
        
        if (!['approve', 'decline'].includes(action)) {
            return res.status(400).json({ error: 'Action must be either "approve" or "decline"' });
        }
        
        const transaction = await Transaction.findByPk(id, {
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'name'] },
                { model: User, as: 'creator', attributes: ['id', 'name'] },
                { model: Artwork, as: 'purchasedArtwork', attributes: ['id', 'title'] } // Changed from 'artwork' to 'purchasedArtwork'
            ]
        });
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        // Check if user is the creator or admin
        if (transaction.creatorId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized to process this refund' });
        }
        
        // Check if transaction is in refund-requested status
        if (transaction.status !== 'refund-requested') {
            return res.status(400).json({ error: 'Transaction is not in refund-requested status' });
        }
        
        // Update transaction
        if (action === 'approve') {
            await transaction.update({
                status: 'refunded',
                refundDate: new Date(),
                refundReason: reason || transaction.refundRequestReason,
                refundAmount: transaction.amount
            });
            
            // Notify buyer
            await createNotification(
                transaction.buyerId,
                'refund_approved',
                `Your refund request for "${transaction.purchasedArtwork.title}" has been approved.` // Changed from artwork to purchasedArtwork
            );
        } else {
            await transaction.update({
                status: 'refund-declined',
                refundNotes: reason
            });
            
            // Notify buyer
            await createNotification(
                transaction.buyerId,
                'refund_declined',
                `Your refund request for "${transaction.purchasedArtwork.title}" has been declined. Reason: ${reason || 'No reason provided'}` // Changed from artwork to purchasedArtwork
            );
        }
        
        res.json({
            message: `Refund request ${action === 'approve' ? 'approved' : 'declined'}`,
            transaction
        });
    } catch (error) {
        console.error('Error processing refund:', error);
        res.status(500).json({ error: 'Failed to process refund' });
    }
});

// Get transaction history (for the current user or admin)
router.get('/history', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        // Build query based on user role
        let query = {};
        
        // Regular users only see their own transactions
        if (req.user.role !== 'admin') {
            query = {
                [Op.or]: [
                    { buyerId: req.user.id },
                    { creatorId: req.user.id }
                ]
            };
        }
        
        const { count, rows } = await Transaction.findAndCountAll({
            where: query,
            include: [
                { 
                    model: User, 
                    as: 'buyer',
                    attributes: ['id', 'name', 'email', 'profilePicture']
                },
                { 
                    model: User, 
                    as: 'creator',
                    attributes: ['id', 'name', 'profilePicture']
                },
                { 
                    model: Artwork, 
                    as: 'purchasedArtwork', // Changed from 'artwork' to 'purchasedArtwork'
                    attributes: ['id', 'title', 'price', 'imageUrl']
                }
            ],
            limit: parseInt(limit),
            offset,
            order: [['createdAt', 'DESC']]
        });
        
        res.json({
            success: true,
            total: count,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching transaction history:', error);
        res.status(500).json({ error: 'Failed to fetch transaction history' });
    }
});

// Get creator's transaction history - FIXED ENDPOINT
router.get('/creator/history', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = 'all', status, page = 1, limit = 10 } = req.query;
        
        // Determine date range based on period
        const getDateFilter = () => {
            const endDate = new Date();
            let startDate = new Date();
            
            switch(period) {
                case 'week':
                    startDate.setDate(startDate.getDate() - 7);
                    break;
                case 'month':
                    startDate.setMonth(startDate.getMonth() - 1);
                    break;
                case 'year':
                    startDate.setFullYear(startDate.getFullYear() - 1);
                    break;
                case 'all':
                default:
                    startDate = new Date(0); // Beginning of time
                    break;
            }
            
            return { startDate, endDate };
        };
        
        const { startDate, endDate } = getDateFilter();
        
        // Build where clause
        const whereClause = {
            creatorId: userId,
            createdAt: { 
                [Op.between]: [startDate, endDate] 
            }
        };
        
        // Add status filter if provided
        if (status && status !== 'all') {
            whereClause.status = status;
        }
        
        // Calculate pagination
        const offset = (page - 1) * limit;
        
        // Get transaction history with pagination
        const { count, rows: transactions } = await Transaction.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: User,
                    as: 'buyer',
                    attributes: ['id', 'name', 'email', 'profilePicture']
                },
                {
                    model: Artwork,
                    as: 'purchasedArtwork',
                    attributes: ['id', 'title', 'price', 'imageUrl']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: offset
        });
        
        // Format the transactions for the frontend
        const sales = transactions.map(transaction => {
            // Convert Sequelize model instance to plain object
            const plainTransaction = transaction.get ? transaction.get({ plain: true }) : transaction;
            
            return {
                id: plainTransaction.id,
                date: plainTransaction.createdAt,
                buyer: plainTransaction.buyer ? {
                    id: plainTransaction.buyer.id,
                    name: plainTransaction.buyer.name,
                    profilePicture: plainTransaction.buyer.profilePicture
                } : null,
                artwork: plainTransaction.purchasedArtwork ? {
                    id: plainTransaction.purchasedArtwork.id,
                    title: plainTransaction.purchasedArtwork.title,
                    price: plainTransaction.purchasedArtwork.price,
                    imageUrl: plainTransaction.purchasedArtwork.imageUrl
                } : null,
                amount: plainTransaction.amount,
                status: plainTransaction.status,
                platformFee: plainTransaction.platformFee || 0,
                netAmount: plainTransaction.amount - (plainTransaction.platformFee || 0)
            };
        });
        
        // THE KEY FIX: Return 'sales' directly as the array the frontend expects
        res.json(sales);
        
    } catch (error) {
        console.error('Error fetching creator transaction history:', error);
        res.status(500).json({ 
            error: 'Error fetching creator transaction history', 
            message: error.message 
        });
    }
});

// Get user's transactions (buyer or creator)
router.get('/user/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { role, status, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        // Check authorization
        if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized to view these transactions' });
        }
        
        // Build query
        let query = {};
        
        if (role === 'buyer') {
            query.buyerId = userId;
        } else if (role === 'creator') {
            query.creatorId = userId;
        } else {
            query[Op.or] = [{ buyerId: userId }, { creatorId: userId }];
        }
        
        if (status) {
            query.status = status;
        }
        
        const { count, rows } = await Transaction.findAndCountAll({
            where: query,
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'name', 'profilePicture'] },
                { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] },
                { model: Artwork, as: 'purchasedArtwork' } // Changed from 'artwork' to 'purchasedArtwork'
            ],
            limit: parseInt(limit),
            offset,
            order: [['createdAt', 'DESC']]
        });
        
        res.json({
            total: count,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching user transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

module.exports = router;
