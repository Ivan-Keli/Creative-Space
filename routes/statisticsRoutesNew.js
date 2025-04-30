const express = require('express');
const router = express.Router();
const { sequelize, User, Artwork, Transaction, Review, SalesStatistic, ArtworkTag, ArtworkCategory, Ticket, ActivityLog } = require('../models');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');
const _ = require('lodash');

// Get sales statistics for a creator
router.get('/creator/:userId/stats', function(req, res, next) {
    authMiddleware(req, res, async function() {
        try {
            const { userId } = req.params;
            const { period = 'all' } = req.query;
            
            // Ensure the requesting user is either the creator or an admin
            if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
                return res.status(403).json({ message: 'Unauthorized to access these statistics' });
            }
            
            // Date range for filtering based on period
            let startDate = null;
            if (period !== 'all') {
                const now = new Date();
                startDate = new Date();
                
                switch (period) {
                    case 'today':
                        startDate.setHours(0, 0, 0, 0);
                        break;
                    case 'week':
                        startDate.setDate(now.getDate() - 7);
                        break;
                    case 'month':
                        startDate.setMonth(now.getMonth() - 1);
                        break;
                    case 'quarter':
                        startDate.setMonth(now.getMonth() - 3);
                        break;
                    case 'year':
                        startDate.setFullYear(now.getFullYear() - 1);
                        break;
                    default:
                        startDate = null;
                }
            }
            
            // Build where clause based on period
            const whereClause = { creatorId: userId };
            if (startDate) {
                whereClause.createdAt = { [Op.gte]: startDate };
            }
            
            // Previous period for comparison (same length of time, just shifted back)
            let previousStartDate = null;
            let previousEndDate = null;
            if (startDate) {
                previousEndDate = new Date(startDate);
                previousStartDate = new Date(startDate);
                
                switch (period) {
                    case 'today':
                        previousStartDate.setDate(previousStartDate.getDate() - 1);
                        break;
                    case 'week':
                        previousStartDate.setDate(previousStartDate.getDate() - 7);
                        break;
                    case 'month':
                        previousStartDate.setMonth(previousStartDate.getMonth() - 1);
                        break;
                    case 'quarter':
                        previousStartDate.setMonth(previousStartDate.getMonth() - 3);
                        break;
                    case 'year':
                        previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);
                        break;
                }
            }
            
            // Get total sales count
            const totalSales = await Transaction.count({
                where: { 
                    ...whereClause,
                    status: 'completed'
                }
            });
            
            // Get total sales for previous period
            let previousSales = 0;
            if (previousStartDate && previousEndDate) {
                previousSales = await Transaction.count({
                    where: {
                        creatorId: userId,
                        status: 'completed',
                        createdAt: {
                            [Op.gte]: previousStartDate,
                            [Op.lt]: previousEndDate
                        }
                    }
                });
            }
            
            // Calculate sales growth
            const salesChange = previousSales > 0 
                ? Math.round(((totalSales - previousSales) / previousSales) * 100) 
                : null;
            
            // Get total revenue
            const revenueResult = await Transaction.findOne({
                where: { 
                    ...whereClause,
                    status: 'completed'
                },
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']
                ],
                raw: true
            });
            
            const totalRevenue = revenueResult && revenueResult.totalRevenue ? revenueResult.totalRevenue : 0;
            
            // Get revenue for previous period
            let previousRevenue = 0;
            if (previousStartDate && previousEndDate) {
                const prevRevenueResult = await Transaction.findOne({
                    where: {
                        creatorId: userId,
                        status: 'completed',
                        createdAt: {
                            [Op.gte]: previousStartDate,
                            [Op.lt]: previousEndDate
                        }
                    },
                    attributes: [
                        [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']
                    ],
                    raw: true
                });
                
                previousRevenue = prevRevenueResult && prevRevenueResult.totalRevenue ? prevRevenueResult.totalRevenue : 0;
            }
            
            // Calculate revenue growth
            const revenueChange = previousRevenue > 0 
                ? Math.round(((totalRevenue - previousRevenue) / previousRevenue) * 100) 
                : null;
            
            // Get platform commission data
            const commissionResult = await Transaction.findOne({
                where: { 
                    ...whereClause,
                    status: 'completed'
                },
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('platformFee')), 'totalCommission']
                ],
                raw: true
            });
            
            const commissionPaid = commissionResult && commissionResult.totalCommission ? commissionResult.totalCommission : 0;
            const netEarnings = totalRevenue - commissionPaid;
            
            // Get average rating
            const ratingResult = await Review.findOne({
                include: [{
                    model: Artwork,
                    as: 'artwork',
                    where: { creatorId: userId },
                    required: true
                }],
                attributes: [
                    [sequelize.fn('AVG', sequelize.col('rating')), 'averageRating'],
                    [sequelize.fn('COUNT', sequelize.col('Review.id')), 'totalReviews']
                ],
                raw: true
            });
            
            const averageRating = ratingResult && ratingResult.averageRating ? ratingResult.averageRating : 0;
            const totalReviews = ratingResult && ratingResult.totalReviews ? ratingResult.totalReviews : 0;
            
            // Get refund data - FIX: Using Op directly instead of sequelize.Op
            const refundResult = await Transaction.findOne({
                where: { 
                    ...whereClause,
                    status: { 
                        [Op.in]: ['refunded', 'partial-refund']
                    }
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('id')), 'totalRefunds'],
                    [sequelize.fn('SUM', sequelize.col('refundAmount')), 'totalRefundAmount']
                ],
                raw: true
            });
            
            const totalRefunds = refundResult && refundResult.totalRefunds ? refundResult.totalRefunds : 0;
            const totalRefundAmount = refundResult && refundResult.totalRefundAmount ? refundResult.totalRefundAmount : 0;
            
            // Calculate returns rate
            const returnsRate = totalSales > 0 ? (totalRefunds / totalSales) * 100 : 0;
            
            // Get best selling artwork
            const bestSellerResult = await Transaction.findOne({
                where: { 
                    ...whereClause,
                    status: 'completed'
                },
                attributes: [
                    'artworkId',
                    [sequelize.fn('COUNT', sequelize.col('artworkId')), 'salesCount']
                ],
                include: [{
                    model: Artwork,
                    as: 'purchasedArtwork',
                    attributes: ['id', 'title', 'imageUrl']
                }],
                group: ['artworkId'],
                order: [[sequelize.fn('COUNT', sequelize.col('artworkId')), 'DESC']],
                limit: 1,
                raw: true,
                nest: true
            });
            
            const bestSeller = bestSellerResult && bestSellerResult.purchasedArtwork ? {
                id: bestSellerResult.purchasedArtwork.id,
                title: bestSellerResult.purchasedArtwork.title,
                imageUrl: bestSellerResult.purchasedArtwork.imageUrl,
                salesCount: bestSellerResult.salesCount
            } : null;
            
            // Get monthly sales breakdown
            const monthlySalesQuery = `
                SELECT 
                    DATE_FORMAT(createdAt, '%Y-%m') as month,
                    COUNT(*) as count
                FROM Transactions
                WHERE creatorId = ? 
                AND status = 'completed'
                ${startDate ? 'AND createdAt >= ?' : ''}
                GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
                ORDER BY month ASC
            `;
            
            const queryParams = [userId];
            if (startDate) {
                queryParams.push(startDate);
            }
            
            const monthlySales = await sequelize.query(
                monthlySalesQuery,
                { 
                    replacements: queryParams,
                    type: sequelize.QueryTypes.SELECT 
                }
            );
            
            // Get monthly revenue breakdown
            const revenueByMonthQuery = `
                SELECT 
                    DATE_FORMAT(createdAt, '%Y-%m') as month,
                    SUM(amount) as amount
                FROM Transactions
                WHERE creatorId = ? 
                AND status = 'completed'
                ${startDate ? 'AND createdAt >= ?' : ''}
                GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
                ORDER BY month ASC
            `;
            
            const revenueByMonth = await sequelize.query(
                revenueByMonthQuery,
                { 
                    replacements: queryParams,
                    type: sequelize.QueryTypes.SELECT 
                }
            );
            
            // Get sales by category - Using safer try/catch for potentially complex query
            let categoryBreakdown = [];
            try {
                const categoryBreakdownQuery = `
                    SELECT 
                        ac.name,
                        COUNT(t.id) as count,
                        (COUNT(t.id) / (
                            SELECT COUNT(*) FROM Transactions 
                            WHERE creatorId = ? AND status = 'completed'
                            ${startDate ? 'AND createdAt >= ?' : ''}
                        )) * 100 as percentage
                    FROM Transactions t
                    JOIN Artworks a ON t.artworkId = a.id
                    JOIN CategoryArtworkMappings cam ON a.id = cam.artworkId
                    JOIN ArtworkCategories ac ON cam.categoryId = ac.id
                    WHERE t.creatorId = ? AND t.status = 'completed'
                    ${startDate ? 'AND t.createdAt >= ?' : ''}
                    GROUP BY ac.name
                    ORDER BY count DESC
                `;
                
                const categoryQueryParams = [userId];
                if (startDate) categoryQueryParams.push(startDate);
                categoryQueryParams.push(userId);
                if (startDate) categoryQueryParams.push(startDate);
                
                categoryBreakdown = await sequelize.query(
                    categoryBreakdownQuery,
                    { 
                        replacements: categoryQueryParams,
                        type: sequelize.QueryTypes.SELECT 
                    }
                );
            } catch (error) {
                console.warn('Error retrieving category breakdown:', error);
                // Continue without category data
            }
            
            // Generate insights based on the data
            const insights = [];
            
            if (salesChange !== null) {
                insights.push({
                    type: salesChange >= 0 ? 'positive' : 'negative',
                    text: `Sales ${salesChange >= 0 ? 'increased' : 'decreased'} by ${Math.abs(salesChange)}% compared to the previous period.`
                });
            }
            
            if (revenueChange !== null) {
                insights.push({
                    type: revenueChange >= 0 ? 'positive' : 'negative',
                    text: `Revenue ${revenueChange >= 0 ? 'increased' : 'decreased'} by ${Math.abs(revenueChange)}% compared to the previous period.`
                });
            }
            
            if (categoryBreakdown && categoryBreakdown.length > 0) {
                insights.push({
                    type: 'info',
                    text: `Your top selling category is "${categoryBreakdown[0].name}" with ${Math.round(categoryBreakdown[0].percentage)}% of sales.`
                });
            }
            
            if (bestSeller) {
                insights.push({
                    type: 'positive',
                    text: `"${bestSeller.title}" is your best selling artwork with ${bestSeller.salesCount} sales.`
                });
            }
            
            if (totalRefunds > 0) {
                insights.push({
                    type: returnsRate < 5 ? 'positive' : 'negative',
                    text: `Your refund rate is ${returnsRate.toFixed(1)}% (industry average is 5%).`
                });
            }
            
            // Assemble the response object
            const response = {
                totalSales,
                totalRevenue,
                averageRating,
                bestSeller,
                monthlySales,
                categoryBreakdown,
                revenueByMonth,
                commissionPaid,
                netEarnings,
                returnsRate,
                totalRefunds,
                totalReviews,
                salesChange,
                revenueChange,
                insights
            };
            
            res.json(response);
        } catch (error) {
            console.error('Error fetching creator statistics:', error);
            res.status(500).json({ message: 'Error fetching statistics', error: error.message });
        }
    });
});

// New sales statistics endpoint for creator by userId
router.get('/creator/:userId', function(req, res, next) {
    authMiddleware(req, res, async function() {
        try {
            const { userId } = req.params;
            const { period = 'all' } = req.query;
            
            // Validate requester has permission (must be the creator or an admin)
            if (req.user.id != userId && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Not authorized to view this data' });
            }
            
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
            
            // Get sales data - Using purchasedArtwork as the alias
            const transactions = await Transaction.findAll({
                include: [{
                    model: Artwork,
                    as: 'purchasedArtwork',
                    where: { creatorId: userId },
                    required: true
                }],
                where: {
                    status: 'completed',
                    createdAt: { [Op.between]: [startDate, endDate] }
                }
            });
            
            // Get total revenue - Adding safety check for empty transactions
            const totalRevenue = transactions.length > 0 
                ? transactions.reduce((sum, t) => sum + (t.amount || 0), 0)
                : 0;
            
            // Group sales by month for chart - Adding safety checks
            const salesByMonth = _(transactions)
                .groupBy(t => {
                    const date = new Date(t.createdAt);
                    return `${date.getFullYear()}-${date.getMonth() + 1}`;
                })
                .mapValues(group => ({
                    count: group.length,
                    revenue: group.reduce((sum, t) => sum + (t.amount || 0), 0)
                }))
                .value();
            
            // Get top selling artworks - With safety checks
            let artworkSales = {};
            let topArtworks = [];
            
            try {
                artworkSales = _(transactions)
                    .groupBy('artworkId')
                    .mapValues(group => ({
                        count: group.length,
                        revenue: group.reduce((sum, t) => sum + (t.amount || 0), 0),
                        artwork: group[0] && group[0].purchasedArtwork ? group[0].purchasedArtwork : null
                    }))
                    .value();
                
                topArtworks = _(artworkSales)
                    .values()
                    .filter(item => item.artwork !== null) // Ensure artwork exists
                    .sortBy('revenue')
                    .reverse()
                    .take(5)
                    .value();
            } catch (error) {
                console.warn('Error calculating top artworks:', error);
                // Continue with empty top artworks if there's an error
            }
            
            res.json({
                period,
                totalSales: transactions.length,
                totalRevenue,
                salesByMonth,
                topArtworks
            });
        } catch (error) {
            console.error('Error fetching sales data:', error);
            res.status(500).json({ error: 'Error fetching sales data' });
        }
    });
});

// Get platform-wide statistics (public)
router.get('/platform', async (req, res) => {
    try {
        // Basic platform statistics for public display
        const artistCount = await User.count({
            where: { role: 'creator' }
        });
        
        const artworkCount = await Artwork.count({
            where: { status: 'available' }
        });
        
        const completedSalesCount = await Transaction.count({
            where: { status: 'completed' }
        });
        
        const categoryCount = await ArtworkCategory.count();
        
        // Assemble public statistics
        const platformStats = {
            artists: artistCount,
            artworks: artworkCount,
            completedSales: completedSalesCount,
            categories: categoryCount,
            lastUpdated: new Date()
        };
        
        res.json(platformStats);
    } catch (error) {
        console.error('Error fetching platform statistics:', error);
        res.status(500).json({ message: 'Error fetching platform statistics', error: error.message });
    }
});

// Admin dashboard statistics
router.get('/admin/dashboard', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const { timeRange = 'week' } = req.query;
                
                // Calculate start date based on time range
                const startDate = new Date();
                switch (timeRange) {
                    case 'day':
                        startDate.setHours(0, 0, 0, 0);
                        break;
                    case 'week':
                        startDate.setDate(startDate.getDate() - 7);
                        break;
                    case 'month':
                        startDate.setMonth(startDate.getMonth() - 1);
                        break;
                    case 'quarter':
                        startDate.setMonth(startDate.getMonth() - 3);
                        break;
                    case 'year':
                        startDate.setFullYear(startDate.getFullYear() - 1);
                        break;
                    case 'all':
                        startDate.setFullYear(1970);
                        break;
                }
                
                // User statistics
                const totalUsers = await User.count();
                const newUsers = await User.count({
                    where: {
                        createdAt: { [Op.gte]: startDate }
                    }
                });
                
                // Active users (users who logged in within the time range)
                const activeUsers = await User.count({
                    where: {
                        lastLoginDate: { [Op.gte]: startDate }
                    }
                });
                
                // User types breakdown
                const creatorCount = await User.count({ where: { role: 'creator' } });
                const buyerCount = await User.count({ where: { role: 'buyer' } });
                const adminCount = await User.count({ where: { role: 'admin' } });
                
                // Sales statistics
                const totalSales = await Transaction.count({
                    where: {
                        status: 'completed',
                        createdAt: { [Op.gte]: startDate }
                    }
                });
                
                const revenueResult = await Transaction.findOne({
                    where: {
                        status: 'completed',
                        createdAt: { [Op.gte]: startDate }
                    },
                    attributes: [
                        [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']
                    ],
                    raw: true
                });
                
                const totalRevenue = revenueResult && revenueResult.totalRevenue ? revenueResult.totalRevenue : 0;
                
                // Content statistics
                const totalArtworks = await Artwork.count();
                const newArtworks = await Artwork.count({
                    where: {
                        createdAt: { [Op.gte]: startDate }
                    }
                });
                
                // Support ticket statistics
                const openTickets = await Ticket.count({
                    where: {
                        status: 'open'
                    }
                });
                
                // Assemble the dashboard data response
                const dashboardData = {
                    timeRange,
                    users: { 
                        total: totalUsers, 
                        new: newUsers,
                        active: activeUsers,
                        creators: creatorCount,
                        buyers: buyerCount,
                        admins: adminCount
                    },
                    sales: {
                        total: totalSales,
                        revenue: totalRevenue
                    },
                    content: {
                        totalArtworks,
                        newArtworks
                    },
                    support: {
                        openTickets
                    }
                };
                
                res.json(dashboardData);
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
                res.status(500).json({ error: 'Error fetching dashboard data' });
            }
        });
    });
});

// Get sales report (Admin route) - From statisticsRoutes.js
router.get('/sales', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                // Get top selling creators by revenue
                const topCreators = await Transaction.findAll({
                    where: { status: 'completed' },
                    attributes: [
                        'sellerId',
                        [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue'],
                        [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales']
                    ],
                    group: ['sellerId'],
                    include: [{ 
                        model: User, 
                        as: 'seller', 
                        attributes: ['id', 'name', 'email', 'profilePicture'] 
                    }],
                    order: [[sequelize.literal('totalRevenue'), 'DESC']],
                    limit: 10
                });

                // Get top selling artworks - Using purchasedArtwork as the alias
                const topArtworks = await Transaction.findAll({
                    where: { status: 'completed' },
                    attributes: [
                        'artworkId',
                        [sequelize.fn('COUNT', sequelize.col('id')), 'salesCount'],
                        [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']
                    ],
                    group: ['artworkId'],
                    include: [{
                        model: Artwork,
                        as: 'purchasedArtwork',
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
                        [sequelize.fn('COUNT', sequelize.col('id')), 'totalTransactions'],
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

                // Assemble the complete report with null checks
                const salesReport = {
                    totalStats: {
                        transactions: totals && totals.totalTransactions ? totals.totalTransactions : 0,
                        revenue: totals && totals.totalRevenue ? totals.totalRevenue : 0,
                        averageOrderValue: totals && totals.averageOrderValue ? totals.averageOrderValue : 0
                    },
                    topCreators: topCreators || [],
                    topArtworks: topArtworks || [],
                    salesByMonth: salesByMonth || [],
                    salesByCategory: salesByCategory || []
                };

                res.json(salesReport);
            } catch (error) {
                console.error("Error generating sales report:", error);
                res.status(500).json({ error: "Error generating sales report" });
            }
        });
    });
});

// Get sales data for a creator
router.get('/sales/creator/:userId', function(req, res, next) {
    authMiddleware(req, res, async function() {
        try {
            const { userId } = req.params;
            const { period = 'all' } = req.query;
            
            // Authorization check
            if (req.user.id != userId && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Not authorized to view this data' });
            }
            
            // Process the request...
            // (Add implementation as needed)
            
            res.json({
                success: true,
                message: "Sales data for creator",
                userId,
                period
            });
        } catch (error) {
            console.error('Error fetching creator sales:', error);
            res.status(500).json({ error: 'Error fetching creator sales' });
        }
    });
});

module.exports = router;
