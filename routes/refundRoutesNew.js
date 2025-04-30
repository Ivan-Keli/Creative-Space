const express = require('express');
const router = express.Router();
const { Transaction, TransactionRefund, User, sequelize } = require('../models');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Request a refund (buyer route)
router.post('/:transactionId/refund-request', function(req, res, next) {
    authMiddleware(req, res, async function() {
        try {
            const transaction = await Transaction.findByPk(req.params.transactionId);
            
            if (!transaction) {
                return res.status(404).json({ message: 'Transaction not found' });
            }
            
            // Check if user is the buyer of this transaction
            if (transaction.buyerId !== req.user.id) {
                return res.status(403).json({ message: 'You can only request refunds for your own purchases' });
            }
            
            // Check if transaction is in a state where refunds can be requested
            if (transaction.status !== 'completed') {
                return res.status(400).json({ message: `Cannot request refund for a transaction in ${transaction.status} state` });
            }
            
            // Check if refund has already been requested
            const existingRefund = await TransactionRefund.findOne({
                where: { transactionId: transaction.id }
            });
            
            if (existingRefund) {
                return res.status(400).json({ 
                    message: 'A refund has already been requested for this transaction',
                    refundStatus: existingRefund.status 
                });
            }
            
            const { reason } = req.body;
            
            if (!reason) {
                return res.status(400).json({ message: 'Refund reason is required' });
            }
            
            // Create a refund request
            const refundRequest = await TransactionRefund.create({
                transactionId: transaction.id,
                amount: transaction.amount, // Default to full amount
                status: 'requested',
                requestReason: reason,
                requestedBy: req.user.id,
                requestDate: new Date(),
                isPartial: false
            });
            
            // Update transaction status
            await transaction.update({
                status: 'refund-requested',
                refundRequestDate: new Date(),
                refundRequestReason: reason
            });
            
            res.status(201).json({
                message: 'Refund request submitted successfully',
                refund: refundRequest
            });
        } catch (error) {
            console.error('Error requesting refund:', error);
            res.status(500).json({ message: 'Error requesting refund', error: error.message });
        }
    });
});

// Process a refund (admin route)
router.post('/:transactionId/refund', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const transaction = await Transaction.findByPk(req.params.transactionId);
                
                if (!transaction) {
                    return res.status(404).json({ message: 'Transaction not found' });
                }
                
                // Check if transaction can be refunded
                if (!['completed', 'refund-requested'].includes(transaction.status)) {
                    return res.status(400).json({ message: `Cannot refund a transaction in ${transaction.status} state` });
                }
                
                const { amount, reason, adminNotes } = req.body;
                
                if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                    return res.status(400).json({ message: 'Valid refund amount is required' });
                }
                
                if (parseFloat(amount) > transaction.amount) {
                    return res.status(400).json({ message: 'Refund amount cannot exceed the original transaction amount' });
                }
                
                // Check if there's an existing refund request
                let refund = await TransactionRefund.findOne({
                    where: { transactionId: transaction.id }
                });
                
                // If refund request exists, update it; otherwise create a new one
                if (refund) {
                    await refund.update({
                        amount: parseFloat(amount),
                        status: 'processed',
                        processorNotes: adminNotes,
                        processedBy: req.user.id,
                        processedDate: new Date(),
                        isPartial: parseFloat(amount) < transaction.amount
                    });
                } else {
                    refund = await TransactionRefund.create({
                        transactionId: transaction.id,
                        amount: parseFloat(amount),
                        status: 'processed',
                        requestReason: reason || 'Admin initiated refund',
                        processorNotes: adminNotes,
                        requestedBy: req.user.id, // Admin initiated
                        processedBy: req.user.id,
                        requestDate: new Date(),
                        processedDate: new Date(),
                        isPartial: parseFloat(amount) < transaction.amount
                    });
                }
                
                // Update transaction
                const newStatus = parseFloat(amount) === transaction.amount ? 'refunded' : 'partial-refund';
                
                await transaction.update({
                    status: newStatus,
                    refundAmount: parseFloat(amount),
                    refundDate: new Date(),
                    refundReason: reason || refund.requestReason,
                    refundedAt: new Date(),
                    refundProcessor: req.user.name || 'Admin',
                    refundNotes: adminNotes
                });
                
                res.json({
                    message: 'Refund processed successfully',
                    refund,
                    transaction
                });
            } catch (error) {
                console.error('Error processing refund:', error);
                res.status(500).json({ message: 'Error processing refund', error: error.message });
            }
        });
    });
});

// Decline a refund request (admin route)
router.post('/:transactionId/decline-refund', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const transaction = await Transaction.findByPk(req.params.transactionId);
                
                if (!transaction) {
                    return res.status(404).json({ message: 'Transaction not found' });
                }
                
                // Check if transaction is in refund-requested state
                if (transaction.status !== 'refund-requested') {
                    return res.status(400).json({ message: 'Can only decline refunds that have been requested' });
                }
                
                const { reason } = req.body;
                
                if (!reason) {
                    return res.status(400).json({ message: 'Reason for declining refund is required' });
                }
                
                // Find the refund request
                const refund = await TransactionRefund.findOne({
                    where: { transactionId: transaction.id }
                });
                
                if (!refund) {
                    return res.status(404).json({ message: 'Refund request not found' });
                }
                
                // Update the refund request
                await refund.update({
                    status: 'declined',
                    processorNotes: reason,
                    processedBy: req.user.id,
                    processedDate: new Date()
                });
                
                // Update transaction
                await transaction.update({
                    status: 'refund-declined',
                    refundNotes: reason
                });
                
                res.json({
                    message: 'Refund request declined',
                    refund,
                    transaction
                });
            } catch (error) {
                console.error('Error declining refund:', error);
                res.status(500).json({ message: 'Error declining refund', error: error.message });
            }
        });
    });
});

// Get all refunds (admin route)
router.get('/refunds', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const refunds = await TransactionRefund.findAll({
                    include: [
                        {
                            model: Transaction,
                            as: 'transaction'
                        },
                        {
                            model: User,
                            as: 'requester',
                            attributes: ['id', 'name', 'email']
                        },
                        {
                            model: User,
                            as: 'processor',
                            attributes: ['id', 'name', 'email']
                        }
                    ],
                    order: [['requestDate', 'DESC']]
                });
                
                res.json(refunds);
            } catch (error) {
                console.error('Error fetching refunds:', error);
                res.status(500).json({ message: 'Error fetching refunds', error: error.message });
            }
        });
    });
});

// Get refund details
router.get('/:transactionId/refund', function(req, res, next) {
    authMiddleware(req, res, async function() {
        try {
            const transaction = await Transaction.findByPk(req.params.transactionId);
            
            if (!transaction) {
                return res.status(404).json({ message: 'Transaction not found' });
            }
            
            // Check authorization - only allow buyer, seller, or admin
            if (
                req.user.id !== transaction.buyerId && 
                req.user.id !== transaction.creatorId && 
                req.user.role !== 'admin'
            ) {
                return res.status(403).json({ message: 'Unauthorized to view refund details' });
            }
            
            const refund = await TransactionRefund.findOne({
                where: { transactionId: transaction.id },
                include: [
                    {
                        model: User,
                        as: 'requester',
                        attributes: ['id', 'name', 'email']
                    },
                    {
                        model: User,
                        as: 'processor',
                        attributes: ['id', 'name', 'email']
                    }
                ]
            });
            
            if (!refund) {
                return res.status(404).json({ message: 'No refund found for this transaction' });
            }
            
            res.json(refund);
        } catch (error) {
            console.error('Error fetching refund details:', error);
            res.status(500).json({ message: 'Error fetching refund details', error: error.message });
        }
    });
});

// Get refund statistics (admin route)
router.get('/refund-stats', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                // Total refunds
                const totalRefunds = await TransactionRefund.count();
                
                // Total refund amount
                const totalAmount = await TransactionRefund.sum('amount', {
                    where: { status: 'processed' }
                });
                
                // Count by status
                const requestedCount = await TransactionRefund.count({
                    where: { status: 'requested' }
                });
                
                const processedCount = await TransactionRefund.count({
                    where: { status: 'processed' }
                });
                
                const declinedCount = await TransactionRefund.count({
                    where: { status: 'declined' }
                });
                
                // Partial vs. full refunds
                const partialCount = await TransactionRefund.count({
                    where: { isPartial: true, status: 'processed' }
                });
                
                // Monthly statistics
                const monthlyStats = await sequelize.query(`
                    SELECT 
                        DATE_FORMAT(requestDate, '%Y-%m') as month,
                        COUNT(*) as requestCount,
                        SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as approvedCount,
                        SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declinedCount,
                        SUM(CASE WHEN status = 'processed' THEN amount ELSE 0 END) as refundedAmount
                    FROM TransactionRefunds
                    GROUP BY DATE_FORMAT(requestDate, '%Y-%m')
                    ORDER BY month DESC
                    LIMIT 12
                `, { type: sequelize.QueryTypes.SELECT });
                
                res.json({
                    totalRefunds,
                    totalAmount: totalAmount || 0,
                    byStatus: {
                        requested: requestedCount,
                        processed: processedCount,
                        declined: declinedCount
                    },
                    partialRefunds: partialCount,
                    fullRefunds: processedCount - partialCount,
                    monthlyStats
                });
            } catch (error) {
                console.error('Error fetching refund statistics:', error);
                res.status(500).json({ message: 'Error fetching refund statistics', error: error.message });
            }
        });
    });
});

module.exports = router;
