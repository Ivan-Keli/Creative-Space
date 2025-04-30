const express = require('express');
const router = express.Router();
const { Transaction, User, Artwork, Report, sequelize } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// ✅ Generate Sales Report (Top Sellers, Total Sales, Trending Artworks)
router.get('/sales', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        // Get top selling creators by revenue
        const topCreators = await Transaction.findAll({
            where: { status: 'completed' },
            attributes: [
                'creatorId',
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue'],
                [sequelize.fn('COUNT', sequelize.col('Transaction.id')), 'totalSales'] // FIXED: Specified the table name
            ],
            group: ['creatorId'],
            include: [{ 
                model: User, 
                as: 'creator', 
                attributes: ['id', 'name', 'email', 'profilePicture'] 
            }],
            order: [[sequelize.literal('totalRevenue'), 'DESC']],
            limit: 10
        });

        // Get top selling artworks
        const topArtworks = await Transaction.findAll({
            where: { status: 'completed' },
            attributes: [
                'artworkId',
                [sequelize.fn('COUNT', sequelize.col('Transaction.id')), 'salesCount'], // FIXED: Specified the table name
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']
            ],
            group: ['artworkId'],
            include: [{
                model: Artwork,
                as: 'purchasedArtwork', // Changed from 'artwork' to 'purchasedArtwork'
                attributes: ['id', 'title', 'price', 'imageUrl', 'creatorId'],
                include: [{
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'name']
                }]
            }],
            order: [[sequelize.literal('salesCount'), 'DESC']],
            limit: 10
        });

        // Get sales by time period
        const salesByMonth = await sequelize.query(`
            SELECT 
                DATE_FORMAT(createdAt, '%Y-%m') as month,
                COUNT(*) as count,
                SUM(amount) as revenue
            FROM Transactions
            WHERE status = 'completed'
            GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
            ORDER BY month ASC
        `, { type: sequelize.QueryTypes.SELECT });

        // Get total sales stats
        const totals = await Transaction.findOne({
            where: { status: 'completed' },
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('Transaction.id')), 'totalTransactions'], // FIXED: Specified the table name
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue'],
                [sequelize.fn('AVG', sequelize.col('amount')), 'averageOrderValue']
            ],
            raw: true
        });

        // Get category-wise sales
        const salesByCategory = await sequelize.query(`
            SELECT 
                ac.name as categoryName,
                COUNT(t.id) as salesCount,
                SUM(t.amount) as revenue
            FROM Transactions t
            JOIN Artworks a ON t.artworkId = a.id
            JOIN CategoryArtworkMappings cam ON a.id = cam.artworkId
            JOIN ArtworkCategories ac ON cam.categoryId = ac.id
            WHERE t.status = 'completed'
            GROUP BY ac.id
            ORDER BY revenue DESC
            LIMIT 10
        `, { type: sequelize.QueryTypes.SELECT });

        // Assemble the complete report
        const salesReport = {
            totalStats: {
                transactions: totals.totalTransactions || 0,
                revenue: totals.totalRevenue || 0,
                averageOrderValue: totals.averageOrderValue || 0
            },
            topCreators,
            topArtworks,
            salesByMonth,
            salesByCategory
        };

        res.json(salesReport);
    } catch (error) {
        console.error("Error generating sales report:", error);
        res.status(500).json({ error: "Error generating sales report" });
    }
});

// Create a new content report (user reports inappropriate content)
router.post('/content', authMiddleware, async (req, res) => {
    try {
        const { artworkId, reason, details } = req.body;
        const reporterId = req.user.id;

        // Validate the artwork exists
        const artwork = await Artwork.findByPk(artworkId);
        if (!artwork) {
            return res.status(404).json({ error: 'Artwork not found' });
        }

        // Create the report
        const report = await Report.create({
            reporterId,
            artworkId,
            reason,
            details,
            status: 'pending'
        });

        // Update the artwork's flagged status
        await artwork.update({ flagged: true });

        res.status(201).json({ 
            message: 'Report submitted successfully',
            reportId: report.id
        });
    } catch (error) {
        console.error('Error creating report:', error);
        res.status(500).json({ error: 'Error submitting report' });
    }
});

// Get all reports (admin only)
router.get('/', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const reports = await Report.findAll({
            include: [
                { 
                    model: User, 
                    as: 'reporter', 
                    attributes: ['id', 'name', 'email', 'profilePicture'] 
                },
                { 
                    model: Artwork, 
                    as: 'reportedArtwork',
                    include: [{ 
                        model: User, 
                        as: 'creator', 
                        attributes: ['id', 'name', 'email'] 
                    }]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.json(reports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Error fetching reports' });
    }
});

// Update report status (admin only)
router.put('/:reportId', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { reportId } = req.params;
        const { status, adminNotes } = req.body;

        const report = await Report.findByPk(reportId);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        await report.update({
            status,
            adminNotes,
            reviewedBy: req.user.id,
            reviewedAt: new Date()
        });

        // If report is resolved and action was taken, update the artwork status
        if (status === 'resolved' && req.body.action) {
            const artwork = await Artwork.findByPk(report.artworkId);
            if (artwork) {
                switch (req.body.action) {
                    case 'remove':
                        await artwork.destroy();
                        break;
                    case 'flag':
                        await artwork.update({ flagged: true });
                        break;
                    case 'unflag':
                        await artwork.update({ flagged: false });
                        break;
                    case 'suspend_creator':
                        const creator = await User.findByPk(artwork.creatorId);
                        if (creator) {
                            await creator.update({ status: 'suspended' });
                        }
                        break;
                }
            }
        }

        res.json({ 
            message: 'Report updated successfully',
            report
        });
    } catch (error) {
        console.error('Error updating report:', error);
        res.status(500).json({ error: 'Error updating report' });
    }
});

module.exports = router;
