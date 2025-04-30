const express = require('express');
const router = express.Router();
const { UserPaymentMethod } = require('../models');
const authMiddleware = require('../middleware/authMiddleware');

// Get all payment methods for a user
router.get('/:userId/payment-methods', authMiddleware, async (req, res) => {
    try {
        // Ensure the user can only access their own payment methods (or admin can access any)
        if (req.user.id !== parseInt(req.params.userId) && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized access to payment methods' });
        }
        
        const paymentMethods = await UserPaymentMethod.findAll({
            where: { userId: req.params.userId },
            order: [['isDefault', 'DESC'], ['createdAt', 'DESC']]
        });
        
        res.json(paymentMethods);
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        res.status(500).json({ message: 'Error fetching payment methods', error: error.message });
    }
});

// Add a new payment method
router.post('/:userId/payment-methods', authMiddleware, async (req, res) => {
    try {
        // Ensure the user can only add their own payment methods (or admin can add for any user)
        if (req.user.id !== parseInt(req.params.userId) && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized to add payment method for this user' });
        }
        
        const { 
            type, 
            accountName, 
            accountNumber, 
            routingNumber, 
            bankName,
            email,
            stripeAccountId,
            isDefault
        } = req.body;
        
        // Validate required fields
        if (!type) {
            return res.status(400).json({ message: 'Payment method type is required' });
        }
        
        // Validate type-specific fields
        if (type === 'bank' && (!accountName || !accountNumber)) {
            return res.status(400).json({ message: 'Bank account requires account name and account number' });
        }
        
        if (type === 'paypal' && !email) {
            return res.status(400).json({ message: 'PayPal requires an email address' });
        }
        
        if (type === 'stripe' && !stripeAccountId) {
            return res.status(400).json({ message: 'Stripe requires a Stripe account ID' });
        }
        
        // If this is set as default, clear default flag on all other payment methods
        if (isDefault) {
            await UserPaymentMethod.update(
                { isDefault: false },
                { where: { userId: req.params.userId } }
            );
        }
        
        // Extract last 4 digits for security
        let lastFour = null;
        if (accountNumber) {
            lastFour = accountNumber.slice(-4);
        }
        
        // Create the new payment method
        const newPaymentMethod = await UserPaymentMethod.create({
            userId: req.params.userId,
            type,
            accountName,
            // Don't store full account numbers
            accountNumber: null,
            routingNumber: null,
            bankName,
            email,
            stripeAccountId,
            lastFour,
            isDefault: isDefault || false,
            isVerified: false
        });
        
        res.status(201).json(newPaymentMethod);
    } catch (error) {
        console.error('Error adding payment method:', error);
        res.status(500).json({ message: 'Error adding payment method', error: error.message });
    }
});

// Delete a payment method
router.delete('/:userId/payment-methods/:methodId', authMiddleware, async (req, res) => {
    try {
        // Ensure the user can only delete their own payment methods (or admin can delete any)
        if (req.user.id !== parseInt(req.params.userId) && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized to delete this payment method' });
        }
        
        const paymentMethod = await UserPaymentMethod.findOne({
            where: { 
                id: req.params.methodId,
                userId: req.params.userId
            }
        });
        
        if (!paymentMethod) {
            return res.status(404).json({ message: 'Payment method not found' });
        }
        
        // Delete the payment method
        await paymentMethod.destroy();
        
        res.json({ message: 'Payment method deleted successfully' });
    } catch (error) {
        console.error('Error deleting payment method:', error);
        res.status(500).json({ message: 'Error deleting payment method', error: error.message });
    }
});

// Set a payment method as default
router.put('/:userId/payment-methods/default', authMiddleware, async (req, res) => {
    try {
        // Ensure the user can only update their own payment methods (or admin can update any)
        if (req.user.id !== parseInt(req.params.userId) && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized to update payment methods for this user' });
        }
        
        const { methodId } = req.body;
        
        if (!methodId) {
            return res.status(400).json({ message: 'Payment method ID is required' });
        }
        
        // Check if the payment method exists and belongs to the user
        const paymentMethod = await UserPaymentMethod.findOne({
            where: { 
                id: methodId,
                userId: req.params.userId
            }
        });
        
        if (!paymentMethod) {
            return res.status(404).json({ message: 'Payment method not found' });
        }
        
        // Set all payment methods for the user to non-default
        await UserPaymentMethod.update(
            { isDefault: false },
            { where: { userId: req.params.userId } }
        );
        
        // Set the selected method as default
        await paymentMethod.update({ isDefault: true });
        
        // Get all updated payment methods
        const updatedMethods = await UserPaymentMethod.findAll({
            where: { userId: req.params.userId },
            order: [['isDefault', 'DESC'], ['createdAt', 'DESC']]
        });
        
        res.json(updatedMethods);
    } catch (error) {
        console.error('Error updating default payment method:', error);
        res.status(500).json({ message: 'Error updating default payment method', error: error.message });
    }
});

// Get details of a specific payment method
router.get('/:userId/payment-methods/:methodId', authMiddleware, async (req, res) => {
    try {
        // Ensure the user can only access their own payment methods (or admin can access any)
        if (req.user.id !== parseInt(req.params.userId) && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized access to payment method' });
        }
        
        const paymentMethod = await UserPaymentMethod.findOne({
            where: { 
                id: req.params.methodId,
                userId: req.params.userId
            }
        });
        
        if (!paymentMethod) {
            return res.status(404).json({ message: 'Payment method not found' });
        }
        
        res.json(paymentMethod);
    } catch (error) {
        console.error('Error fetching payment method:', error);
        res.status(500).json({ message: 'Error fetching payment method', error: error.message });
    }
});

module.exports = router;
