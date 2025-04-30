const express = require('express');
const router = express.Router();
const { Transaction, Artwork, User, TransactionRefund, Order, OrderItem } = require('../models');
const { authMiddleware, buyerMiddleware } = require('../middleware/authMiddleware');
const paypalClient = require('../config/paypal');
const { Op } = require('sequelize');

// Helper function to get order items
const getOrderItems = async (orderId) => {
  return await OrderItem.findAll({
    where: { orderId },
    include: [
      { model: Order, as: 'parentOrder' }, 
      { model: Artwork, as: 'orderArtwork' } // Changed from 'artworkDetails' to 'orderArtwork'
    ]
  });
};

// Helper function to transform OrderItems to maintain API compatibility
const transformOrderItems = (orderItems) => {
  return orderItems.map(item => ({
    id: item.id,
    artworkId: item.artworkId,
    price: item.price,
    originalPrice: item.originalPrice,
    quantity: item.quantity,
    artwork: item.orderArtwork, // Changed from 'artworkDetails' to 'orderArtwork'
    order: item.parentOrder
  }));
};

// ✅ Check artwork availability (UPDATED LOGIC)
router.get('/artworks/:artworkId/availability', async (req, res) => {
    try {
        const artwork = await Artwork.findByPk(req.params.artworkId);
        
        if (!artwork) {
            return res.status(404).json({ 
                available: false, 
                message: 'Artwork not found' 
            });
        }
        
        // Updated: Availability based on status only
        const isAvailable = artwork.status === 'available';

        res.json({ 
            available: isAvailable,
            artwork: {
                id: artwork.id,
                title: artwork.title,
                price: artwork.price,
                status: artwork.status,
                quantity: artwork.quantity
            }
        });
    } catch (error) {
        console.error('Error checking artwork availability:', error);
        res.status(500).json({ 
            available: false, 
            message: 'Error checking artwork availability' 
        });
    }
});

// --- All other routes remain unchanged below this point ---


// Create a new order
router.post('/orders/create', authMiddleware, buyerMiddleware, async (req, res) => {
    try {
        const { items } = req.body;
        const buyerId = req.user.id;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'No items provided for the order' });
        }
        
        // Fetch all artworks in a single query
        const artworkIds = items.map(item => item.artworkId);
        const artworks = await Artwork.findAll({
            where: { id: { [Op.in]: artworkIds } },
            include: [{ model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }]
        });
        
        // Validate all artworks exist and are available
        const artworksMap = {};
        artworks.forEach(artwork => {
            artworksMap[artwork.id] = artwork;
        });
        
        for (const item of items) {
            const artwork = artworksMap[item.artworkId];
            
            if (!artwork) {
                return res.status(404).json({ error: `Artwork with ID ${item.artworkId} not found` });
            }
            
            if (artwork.status === 'sold' || artwork.status === 'deleted') {
                return res.status(400).json({ error: `Artwork "${artwork.title}" is not available for purchase` });
            }
            
            if (artwork.quantity !== null && artwork.quantity < item.quantity) {
                return res.status(400).json({ error: `Not enough quantity available for "${artwork.title}"` });
            }
            
            // Prevent buying your own artwork
            if (artwork.creatorId === buyerId) {
                return res.status(403).json({ error: 'You cannot purchase your own artwork' });
            }
        }
        
        // Calculate order totals
        let subtotal = 0;
        const orderItems = [];
        
        for (const item of items) {
            const artwork = artworksMap[item.artworkId];
            const itemPrice = artwork.price * (item.quantity || 1);
            subtotal += itemPrice;
            
            orderItems.push({
                artworkId: artwork.id,
                price: itemPrice,
                originalPrice: artwork.originalPrice || artwork.price,
                quantity: item.quantity || 1,
                artwork: artwork
            });
        }
        
        // Apply tax (if applicable)
        const taxRate = 0.07; // 7% tax rate - adjust as needed
        const tax = parseFloat((subtotal * taxRate).toFixed(2));
        const total = subtotal + tax;
        
        // Create the order with a pending status
        const order = {
            items: orderItems,
            buyerId: buyerId,
            subtotal: subtotal,
            tax: tax,
            total: total,
            status: 'pending',
            createdAt: new Date()
        };
        
        // For simplicity, we're returning the order object directly
        // In a production environment, you would save this to a database
        // and return the orderId to the client
        
        // Create a transaction for each item
        const transactions = await Promise.all(orderItems.map(async (item) => {
            return Transaction.create({
                buyerId: buyerId,
                creatorId: item.artwork.creatorId,
                artworkId: item.artworkId,
                amount: item.price,
                status: 'pending',
                tax: item.price * taxRate,
                originalPrice: item.originalPrice,
                paymentDetails: { orderId: order.id }
            });
        }));
        
        // Add the transaction IDs to the order
        const orderId = transactions[0].id; // Use the first transaction ID as the order ID
        
        res.json({ 
            message: 'Order created successfully', 
            orderId: orderId,
            order: {
                ...order,
                id: orderId,
                transactions: transactions
            }
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Error creating order' });
    }
});

// Get order details
router.get('/orders/:orderId', authMiddleware, async (req, res) => {
    try {
        // Find the main transaction that serves as our order
        const mainTransaction = await Transaction.findByPk(req.params.orderId, {
            include: [
                { 
                    model: Artwork, 
                    as: 'purchasedArtwork',
                    include: [
                        { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
                    ]
                },
                { model: User, as: 'buyer', attributes: ['id', 'name', 'email', 'profilePicture'] }
            ]
        });
        
        if (!mainTransaction) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Check authorization - only the buyer, seller, or admin can view the order
        if (mainTransaction.buyerId !== req.user.id && 
            mainTransaction.purchasedArtwork.creatorId !== req.user.id && 
            req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to view this order' });
        }
        
        // Find all transactions in this order (for multi-item orders)
        let orderTransactions = [mainTransaction];
        if (mainTransaction.paymentDetails && mainTransaction.paymentDetails.orderId) {
            const additionalTransactions = await Transaction.findAll({
                where: {
                    id: { [Op.ne]: mainTransaction.id },
                    buyerId: mainTransaction.buyerId,
                    status: mainTransaction.status,
                    paymentDetails: { orderId: mainTransaction.paymentDetails.orderId }
                },
                include: [
                    { 
                        model: Artwork, 
                        as: 'purchasedArtwork',
                        include: [
                            { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
                        ]
                    }
                ]
            });
            
            if (additionalTransactions.length > 0) {
                orderTransactions = [...orderTransactions, ...additionalTransactions];
            }
        }
        
        // Format transactions as order items
        const items = orderTransactions.map(transaction => {
            return {
                id: transaction.id,
                artworkId: transaction.artworkId,
                price: transaction.amount,
                originalPrice: transaction.originalPrice || transaction.amount,
                quantity: 1, // Default to 1 if not specified
                artwork: transaction.purchasedArtwork
            };
        });
        
        // Calculate order totals
        const subtotal = items.reduce((sum, item) => sum + item.price, 0);
        const tax = orderTransactions.reduce((sum, transaction) => sum + (transaction.tax || 0), 0);
        const discount = 0; // Implement discount logic if needed
        const total = subtotal + tax - discount;
        
        // Construct the full order response
        const order = {
            id: mainTransaction.id,
            orderNumber: `ORD-${mainTransaction.id.toString().padStart(6, '0')}`,
            userId: mainTransaction.buyerId,
            items: items,
            subtotal: subtotal,
            tax: tax,
            discount: discount,
            total: total,
            status: mainTransaction.status,
            paymentMethod: mainTransaction.paymentMethod,
            paymentId: mainTransaction.paymentId,
            createdAt: mainTransaction.createdAt,
            updatedAt: mainTransaction.updatedAt,
            completedAt: mainTransaction.status === 'completed' ? mainTransaction.updatedAt : null
        };
        
        res.json(order);
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).json({ error: 'Error fetching order details' });
    }
});

// Create a PayPal order (initial payment setup)
router.post('/paypal/create-order', authMiddleware, buyerMiddleware, async (req, res) => {
    try {
        const { orderId } = req.body;
        
        // Find the order/transaction
        const transaction = await Transaction.findByPk(orderId, {
            include: [
                { model: Artwork, as: 'purchasedArtwork' }
            ]
        });
        
        if (!transaction) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Find related transactions for multi-item orders
        let orderTransactions = [transaction];
        if (transaction.paymentDetails && transaction.paymentDetails.orderId) {
            const additionalTransactions = await Transaction.findAll({
                where: {
                    id: { [Op.ne]: transaction.id },
                    buyerId: transaction.buyerId,
                    status: 'pending',
                    paymentDetails: { orderId: transaction.paymentDetails.orderId }
                },
                include: [
                    { model: Artwork, as: 'purchasedArtwork' }
                ]
            });
            
            if (additionalTransactions.length > 0) {
                orderTransactions = [...orderTransactions, ...additionalTransactions];
            }
        }
        
        // Calculate total amount for PayPal
        const total = orderTransactions.reduce((sum, t) => sum + t.amount + (t.tax || 0), 0).toFixed(2);
        
        // Create PayPal order
        const request = {
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: 'USD',
                    value: total
                },
                description: `Order #${transaction.id} - Creative Space Art Marketplace`
            }],
            application_context: {
                brand_name: 'Creative Space Art Marketplace',
                shipping_preference: 'NO_SHIPPING',
                user_action: 'PAY_NOW',
                return_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/orders/${orderId}/confirmation`,
                cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/artwork/${transaction.artworkId}`
            }
        };
        
        // Create PayPal order
        const order = await paypalClient.createOrder(request);
        
        // Update transaction with PayPal info
        await transaction.update({
            paymentDetails: {
                ...transaction.paymentDetails,
                paypalOrderId: order.id
            }
        });
        
        // Find the approval URL for redirection
        const approvalUrl = order.links.find(link => link.rel === 'approve').href;
        
        // Return the PayPal order ID and approval URL to the client
        res.json({ 
            paypalOrderId: order.id,
            approvalUrl: approvalUrl
        });
    } catch (error) {
        console.error('Error creating PayPal order:', error);
        res.status(500).json({ error: 'Error processing PayPal payment' });
    }
});

// Handle PayPal payment success
router.get('/paypal/success', async (req, res) => {
    try {
        const { token, PayerID } = req.query;
        
        if (!token) {
            return res.status(400).json({ error: 'Missing PayPal token' });
        }
        
        // Find the transaction with this PayPal order ID
        const transaction = await Transaction.findOne({
            where: {
                paymentDetails: {
                    paypalOrderId: token
                }
            }
        });
        
        if (!transaction) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Capture the payment
        const captureResponse = await paypalClient.capturePayment(token);
        
        if (captureResponse.status === 'COMPLETED') {
            // Find all related transactions if this is a multi-item order
            let orderTransactions = [transaction];
            if (transaction.paymentDetails && transaction.paymentDetails.orderId) {
                const additionalTransactions = await Transaction.findAll({
                    where: {
                        id: { [Op.ne]: transaction.id },
                        buyerId: transaction.buyerId,
                        status: 'pending',
                        paymentDetails: { orderId: transaction.paymentDetails.orderId }
                    }
                });
                
                if (additionalTransactions.length > 0) {
                    orderTransactions = [...orderTransactions, ...additionalTransactions];
                }
            }
            
            // Update all transactions in the order
            for (const orderTransaction of orderTransactions) {
                await orderTransaction.update({
                    status: 'completed',
                    paymentMethod: 'paypal',
                    paymentId: captureResponse.id,
                    paymentDetails: {
                        ...orderTransaction.paymentDetails,
                        paypalOrderId: token,
                        PayerID: PayerID,
                        captureId: captureResponse.id,
                        processingDate: new Date()
                    }
                });
                
                // Update artwork status or quantity
                const artwork = await Artwork.findByPk(orderTransaction.artworkId);
                if (artwork) {
                    if (artwork.quantity !== null) {
                        // Decrease quantity for digital products
                        await artwork.update({
                            quantity: Math.max(0, artwork.quantity - 1)
                        });
                    } else {
                        // Mark as sold for unique items
                        await artwork.update({ status: 'sold' });
                    }
                }
            }
            
            // Redirect to the order confirmation page
            res.redirect(`/orders/${transaction.id}/confirmation`);
        } else {
            res.status(400).json({ error: 'PayPal payment was not completed' });
        }
    } catch (error) {
        console.error('Error processing PayPal success:', error);
        res.status(500).json({ error: 'Error processing PayPal payment' });
    }
});

// Handle PayPal payment cancellation
router.get('/paypal/cancel', async (req, res) => {
    const { token } = req.query;
    
    // Redirect user back to the artwork page or some other appropriate page
    if (token) {
        const transaction = await Transaction.findOne({
            where: {
                paymentDetails: {
                    paypalOrderId: token
                }
            }
        });
        
        if (transaction) {
            // Redirect to the artwork page
            return res.redirect(`/artwork/${transaction.artworkId}`);
        }
    }
    
    // Default redirect if no token or transaction found
    res.redirect('/');
});

// Capture a PayPal payment after user approval
router.post('/paypal/capture', authMiddleware, buyerMiddleware, async (req, res) => {
    try {
        const { orderId, paypalOrderId } = req.body;
        
        if (!paypalOrderId) {
            return res.status(400).json({ error: 'PayPal order ID is required' });
        }
        
        // Capture the payment from PayPal
        try {
            // Note: This assumes you're using the PayPal SDK's most recent version
            const captureResponse = await paypalClient.capturePayment(paypalOrderId);
            
            if (captureResponse.status === 'COMPLETED') {
                // Find the transaction
                const transaction = await Transaction.findByPk(orderId);
                
                if (!transaction) {
                    return res.status(404).json({ error: 'Order not found' });
                }
                
                // Find all related transactions if this is a multi-item order
                let orderTransactions = [transaction];
                if (transaction.paymentDetails && transaction.paymentDetails.orderId) {
                    const additionalTransactions = await Transaction.findAll({
                        where: {
                            id: { [Op.ne]: transaction.id },
                            buyerId: transaction.buyerId,
                            status: 'pending',
                            paymentDetails: { orderId: transaction.paymentDetails.orderId }
                        }
                    });
                    
                    if (additionalTransactions.length > 0) {
                        orderTransactions = [...orderTransactions, ...additionalTransactions];
                    }
                }
                
                // Update the status of all transactions in the order
                for (const orderTransaction of orderTransactions) {
                    await orderTransaction.update({
                        status: 'completed',
                        paymentMethod: 'paypal',
                        paymentId: captureResponse.id,
                        paymentDetails: {
                            ...orderTransaction.paymentDetails,
                            paypalOrderId: paypalOrderId,
                            captureId: captureResponse.id,
                            processingDate: new Date()
                        }
                    });
                    
                    // Update artwork status or quantity
                    const artwork = await Artwork.findByPk(orderTransaction.artworkId);
                    if (artwork) {
                        if (artwork.quantity !== null) {
                            // Decrease quantity for digital products
                            await artwork.update({
                                quantity: Math.max(0, artwork.quantity - 1)
                            });
                        } else {
                            // Mark as sold for unique items
                            await artwork.update({ status: 'sold' });
                        }
                    }
                }
                
                // Return success response
                res.json({ 
                    success: true,
                    orderId: orderId,
                    paymentId: captureResponse.id,
                    status: 'completed'
                });
            } else {
                res.status(400).json({ error: 'PayPal payment capture failed' });
            }
        } catch (paypalError) {
            console.error('PayPal capture error:', paypalError);
            res.status(500).json({ error: 'Failed to capture PayPal payment' });
        }
    } catch (error) {
        console.error('Error capturing PayPal payment:', error);
        res.status(500).json({ error: 'Error processing payment' });
    }
});

// Process payment (credit card or other methods)
router.post('/payments/process', authMiddleware, buyerMiddleware, async (req, res) => {
    try {
        const { orderId, paymentMethod, paymentDetails, billingAddress } = req.body;
        
        // Handle PayPal payments through the dedicated endpoints
        if (paymentMethod === 'paypal') {
            return res.status(400).json({ 
                error: 'PayPal payments should use the /paypal/create-order and /paypal/capture endpoints',
                redirectToPaypal: true
            });
        }
        
        // Find all transactions in this order
        const mainTransaction = await Transaction.findByPk(orderId);
        
        if (!mainTransaction) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Ensure the user is authorized to complete this order
        if (mainTransaction.buyerId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to complete this order' });
        }
        
        // Find all related transactions if this is a multi-item order
        let orderTransactions = [mainTransaction];
        if (mainTransaction.paymentDetails && mainTransaction.paymentDetails.orderId) {
            const additionalTransactions = await Transaction.findAll({
                where: {
                    id: { [Op.ne]: mainTransaction.id },
                    buyerId: mainTransaction.buyerId,
                    status: 'pending',
                    paymentDetails: { orderId: mainTransaction.paymentDetails.orderId }
                }
            });
            
            if (additionalTransactions.length > 0) {
                orderTransactions = [...orderTransactions, ...additionalTransactions];
            }
        }
        
        // Implement payment processing logic based on the selected payment method
        let paymentId = null;
        
        if (paymentMethod === 'creditCard') {
            // Mock credit card processing
            paymentId = `CC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            
            // In a real implementation, you would:
            // 1. Validate the credit card details
            // 2. Process the payment through a payment gateway
            // 3. Get a transaction ID from the payment gateway
        } else {
            return res.status(400).json({ error: 'Invalid payment method' });
        }
        
        // Process each transaction in the order
        for (const transaction of orderTransactions) {
            // Update the transaction with payment details
            await transaction.update({
                status: 'completed',
                paymentMethod: paymentMethod,
                paymentId: paymentId,
                paymentDetails: {
                    ...transaction.paymentDetails,
                    billingAddress: billingAddress,
                    processingDate: new Date()
                }
            });
            
            // Update the artwork status to 'sold' or decrease quantity
            const artwork = await Artwork.findByPk(transaction.artworkId);
            if (artwork) {
                if (artwork.quantity !== null) {
                    // Decrease quantity for digital products that can have multiple sales
                    await artwork.update({
                        quantity: Math.max(0, artwork.quantity - 1)
                    });
                } else {
                    // Mark as sold for unique items
                    await artwork.update({ status: 'sold' });
                }
            }
        }
        
        res.json({ 
            message: 'Payment processed successfully', 
            paymentId: paymentId,
            status: 'completed'
        });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({ error: 'Error processing payment' });
    }
});

// Complete order
router.post('/orders/:orderId/complete', authMiddleware, buyerMiddleware, async (req, res) => {
    try {
        const { paymentId } = req.body;
        
        // Find the order/transaction
        const transaction = await Transaction.findByPk(req.params.orderId);
        
        if (!transaction) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Ensure the user is authorized to complete this order
        if (transaction.buyerId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to complete this order' });
        }
        
        // Find all related transactions if this is a multi-item order
        let orderTransactions = [transaction];
        if (transaction.paymentDetails && transaction.paymentDetails.orderId) {
            const additionalTransactions = await Transaction.findAll({
                where: {
                    id: { [Op.ne]: transaction.id },
                    buyerId: transaction.buyerId,
                    status: 'pending',
                    paymentDetails: { orderId: transaction.paymentDetails.orderId }
                }
            });
            
            if (additionalTransactions.length > 0) {
                orderTransactions = [...orderTransactions, ...additionalTransactions];
            }
        }
        
        // Update the status of all transactions in the order
        for (const orderTransaction of orderTransactions) {
            await orderTransaction.update({
                status: 'completed',
                paymentId: paymentId || orderTransaction.paymentId
            });
        }
        
        res.json({ 
            message: 'Order completed successfully',
            orderId: transaction.id
        });
    } catch (error) {
        console.error('Error completing order:', error);
        res.status(500).json({ error: 'Error completing order' });
    }
});

// Download digital assets route
router.get('/orders/:orderId/downloads/:itemId', authMiddleware, async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        
        // Find the transaction (order item)
        const transaction = await Transaction.findOne({
            where: {
                id: itemId,
                status: 'completed'
            },
            include: [
                { model: Artwork, as: 'purchasedArtwork' }
            ]
        });
        
        if (!transaction) {
            return res.status(404).json({ error: 'Order item not found or not completed' });
        }
        
        // Ensure the user is authorized to download this item
        if (transaction.buyerId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to download this item' });
        }
        
        const artwork = transaction.purchasedArtwork;
        
        // Get the digital asset URL
        // In a real implementation, this would be a secured URL to the actual digital asset
        const downloadUrl = artwork.fileUrl || artwork.imageUrl;
        
        if (!downloadUrl) {
            return res.status(404).json({ error: 'Digital asset not found' });
        }
        
        // For security, you might want to generate a signed URL or implement access control
        // Here we're just redirecting to the download URL
        res.redirect(downloadUrl);
    } catch (error) {
        console.error('Error downloading digital asset:', error);
        res.status(500).json({ error: 'Error downloading digital asset' });
    }
});

// Example of how to use the OrderItem model if transitioning from Transaction-based orders
// This is a demonstration endpoint that you can use as a reference
router.get('/order-items/:orderId', authMiddleware, async (req, res) => {
    try {
        // Get all OrderItems for this order
        const orderItems = await OrderItem.findAll({
            where: { orderId: req.params.orderId },
            include: [
                { model: Artwork, as: 'orderArtwork' } // Changed from 'artworkDetails' to 'orderArtwork'
            ]
        });
        
        // Transform to maintain API compatibility
        const formattedItems = orderItems.map(item => ({
            id: item.id,
            artworkId: item.artworkId,
            price: item.price,
            originalPrice: item.originalPrice || item.price,
            quantity: item.quantity || 1,
            // Transform the property name for the API
            artwork: item.orderArtwork // Changed from 'artworkDetails' to 'orderArtwork'
        }));
        
        res.json(formattedItems);
    } catch (error) {
        console.error('Error fetching order items:', error);
        res.status(500).json({ error: 'Error fetching order items' });
    }
});

module.exports = router;
