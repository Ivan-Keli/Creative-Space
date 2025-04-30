const express = require('express');
const router = express.Router();
const { Transaction, Artwork } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

// ✅ Get All Purchased Artworks for Download (Buyer Only)
router.get('/', authMiddleware, authorize(['buyer']), async (req, res) => {
    try {
        const buyerId = req.user.id;
        const transactions = await Transaction.findAll({
            where: { buyerId, status: 'completed' },
            include: [{ model: Artwork, as: 'artwork' }],
        });

        res.json(transactions);
    } catch (error) {
        console.error("Error fetching downloads:", error);
        res.status(500).json({ error: "Failed to fetch downloads" });
    }
});

// ✅ Download Purchased Artwork by Transaction ID
router.get('/:transactionId/download', authMiddleware, authorize(['buyer']), async (req, res) => {
    try {
        const transaction = await Transaction.findByPk(req.params.transactionId);
        if (!transaction || transaction.buyerId !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized access" });
        }

        const artwork = await Artwork.findByPk(transaction.artworkId);
        if (!artwork || !artwork.downloadUrl) {
            return res.status(404).json({ error: "Downloadable content not found" });
        }

        res.download(artwork.downloadUrl);
    } catch (error) {
        console.error("Error downloading content:", error);
        res.status(500).json({ error: "Failed to download content" });
    }
});

module.exports = router;
