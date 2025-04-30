const express = require('express');
const router = express.Router();
const paypalClient = require('../config/paypal');
const { Transaction, Artwork } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

// ✅ Create PayPal Order
router.post('/paypal', authMiddleware, authorize(['buyer']), async (req, res) => {
    try {
        const { artworkId } = req.body;
        const buyerId = req.user.id;

        // Find artwork
        const artwork = await Artwork.findByPk(artworkId);
        if (!artwork) return res.status(404).json({ error: "Artwork not found" });

        if (artwork.status === 'sold') return res.status(400).json({ error: "Artwork is already sold" });

        // Create PayPal order
        const request = new paypal.orders.OrdersCreateRequest();
        request.requestBody({
            intent: "CAPTURE",
            purchase_units: [{
                amount: { currency_code: "USD", value: artwork.price.toFixed(2) },
                description: `Payment for artwork: ${artwork.title}`
            }]
        });

        const order = await paypalClient.execute(request);
        res.json({ orderId: order.result.id });
    } catch (error) {
        console.error("PayPal Order Creation Error:", error);
        res.status(500).json({ error: "Failed to create PayPal order" });
    }
});

// ✅ Capture PayPal Payment
router.post('/paypal/capture', authMiddleware, authorize(['buyer']), async (req, res) => {
    try {
        const { orderId, artworkId } = req.body;

        // Capture payment
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        const capture = await paypalClient.execute(request);

        if (capture.result.status === "COMPLETED") {
            // Mark artwork as sold
            const artwork = await Artwork.findByPk(artworkId);
            await artwork.update({ status: 'sold' });

            // Save transaction
            const transaction = await Transaction.create({
                buyerId: req.user.id,
                creatorId: artwork.creatorId,
                artworkId,
                amount: artwork.price,
                status: 'completed'
            });

            res.json({ message: "Payment successful!", transaction });
        } else {
            res.status(400).json({ error: "Payment not completed" });
        }
    } catch (error) {
        console.error("PayPal Capture Error:", error);
        res.status(500).json({ error: "Failed to capture PayPal payment" });
    }
});

module.exports = router;
