const express = require('express');
const router = express.Router();
const { Review } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

// ✅ Create a Review (Buyer Only)
router.post('/', authMiddleware, authorize(['buyer']), async (req, res) => {
    const { artworkId, rating, comment } = req.body;
    try {
        const review = await Review.create({
            userId: req.user.id,
            artworkId,
            rating,
            comment,
        });
        res.status(201).json(review);
    } catch (error) {
        console.error("Error creating review:", error);
        res.status(500).json({ error: "Failed to create review" });
    }
});

// ✅ Fetch All Reviews for an Artwork
router.get('/:artworkId', async (req, res) => {
    try {
        const reviews = await Review.findAll({
            where: { artworkId: req.params.artworkId },
            order: [['createdAt', 'DESC']],
        });
        res.json(reviews);
    } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ error: "Failed to fetch reviews" });
    }
});

module.exports = router;
