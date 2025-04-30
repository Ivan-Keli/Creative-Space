const express = require('express');
const router = express.Router();
const { Transaction, User, Artwork } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');
const sequelize = require('../config/database');

// Get Sales Trends
router.get('/sales', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const salesData = await Transaction.findAll({
            where: { status: 'completed' },
            attributes: [
                [sequelize.fn('MONTHNAME', sequelize.col('createdAt')), 'month'],
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']
            ],
            group: ['month'],
            order: [['month', 'ASC']]
        });

        res.json(salesData);
    } catch (error) {
        console.error("Error fetching sales trends:", error);
        res.status(500).json({ error: "Error fetching sales trends" });
    }
});

module.exports = router;
