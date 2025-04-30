const express = require('express');
const router = express.Router();
const { Transaction, Artwork, User } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

// ✅ Get Orders for Buyer
router.get('/orders', authMiddleware, authorize(['buyer']), async (req, res) => {
    try {
        const buyerId = req.user.id;
        const orders = await Transaction.findAll({
            where: { buyerId },
            include: [{ model: Artwork, as: 'artwork', attributes: ['id', 'title', 'imageUrl'] }],
            order: [['createdAt', 'DESC']]
        });

        res.json(orders);
    } catch (error) {
        console.error("Error fetching buyer orders:", error);
        res.status(500).json({ error: "Error retrieving orders" });
    }
});

module.exports = router;
