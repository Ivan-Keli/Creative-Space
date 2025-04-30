const express = require('express');
const router = express.Router();
const { User, Artwork, Transaction, AuditLog, Report, sequelize } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');
const events = require('../events');
const { createNotification } = require('../utils/notificationService');
const { Op } = require('sequelize');

// Helper function to emit admin notifications
const sendAdminNotification = (message, type = 'general') => {
    events.emit('admin_notification', { message, type });
};

// ✅ Get all users (Admin Only)
router.get('/users', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'name', 'email', 'role', 'status', 'createdAt', 'profilePicture', 'updatedAt'],
            order: [['createdAt', 'DESC']]
        });
        res.json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Error fetching users" });
    }
});

// ✅ Approve/Suspend User (Admin Only) + Store Notification + Audit Log
router.put('/users/:id/toggle-status', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id; // Admin performing the action
        const user = await User.findByPk(id);

        if (!user) return res.status(404).json({ error: "User not found" });

        user.status = user.status === 'active' ? 'suspended' : 'active';
        await user.save();

        // Store notification
        await createNotification(user.id, "user_status", `Your account has been ${user.status} by an admin.`);

        // Log admin action
        await AuditLog.create({
            adminId,
            actionType: "user_status_update",
            targetId: user.id,
            details: `User ID ${id} status changed to ${user.status}`
        });

        sendAdminNotification({
            message: `Admin updated user status: User ID ${id} is now ${user.status}`,
        });

        res.json({ message: `User status changed to ${user.status}`, user });
    } catch (error) {
        console.error("Error updating user status:", error);
        res.status(500).json({ error: "Error updating user status" });
    }
});

// ✅ Change User Role (Promote to Admin, Downgrade) + Store Notification + Audit Log
router.put('/users/:id/role', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const adminId = req.user.id;

        if (!['buyer', 'creator', 'admin'].includes(role)) {
            return res.status(400).json({ error: "Invalid role specified" });
        }

        const user = await User.findByPk(id);
        if (!user) return res.status(404).json({ error: "User not found" });

        await user.update({ role });

        await createNotification(user.id, "role_change", `Your account role has been updated to ${role}.`);

        await AuditLog.create({
            adminId,
            actionType: "user_role_update",
            targetId: user.id,
            details: `User ID ${id} role changed to ${role}`
        });

        sendAdminNotification({
            message: `Admin updated user role: User ID ${id} is now a ${role}`,
        });

        res.json({ message: `User ${id} updated to role ${role}`, user });
    } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).json({ error: "Error updating user role" });
    }
});

// ✅ Get all artworks (Admin Only)
router.get('/artworks', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const artworks = await Artwork.findAll();
        res.json(artworks);
    } catch (error) {
        console.error("Error fetching artworks:", error);
        res.status(500).json({ error: "Error fetching artworks" });
    }
});

// ✅ Remove Artwork (Admin Only) + Store Notification + Audit Log
router.delete('/artworks/:id', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const artwork = await Artwork.findByPk(id);

        if (!artwork) return res.status(404).json({ error: "Artwork not found" });

        await artwork.destroy();

        await createNotification(artwork.creatorId, "artwork_removed", `Your artwork ID ${id} has been removed by an admin.`);

        await AuditLog.create({
            adminId: req.user.id,
            actionType: "artwork_deleted",
            targetId: artwork.id,
            details: `Artwork ID ${id} deleted`
        });

        sendAdminNotification({
            message: `Admin removed artwork: Artwork ID ${id} has been deleted.`,
        });

        res.json({ message: `Artwork ${id} removed successfully` });
    } catch (error) {
        console.error("Error removing artwork:", error);
        res.status(500).json({ error: "Error removing artwork" });
    }
});

// ✅ Get All Transactions (Admin Only) + Filtering
router.get('/transactions', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { status } = req.query; // Allow filtering by transaction status (pending, completed, disputed)
        const query = status ? { status } : {}; 

        const transactions = await Transaction.findAll({
            where: query,
            include: [
                { model: User, as: 'buyer', attributes: ['id', 'name', 'email'] },
                { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
                { model: Artwork, as: 'purchasedArtwork', attributes: ['id', 'title', 'imageUrl'] } // Changed from 'artwork' to 'purchasedArtwork'
            ],
            order: [['createdAt', 'DESC']]
        });

        res.json(transactions);
    } catch (error) {
        console.error("Error fetching transactions:", error);
        res.status(500).json({ error: "Error fetching transactions" });
    }
});


// ✅ Flag Transaction as "Disputed" (Admin Only) + Notify Admins
router.put('/transactions/:id/dispute', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await Transaction.findByPk(id);

        if (!transaction) return res.status(404).json({ error: "Transaction not found" });

        if (transaction.status === 'disputed') {
            return res.status(400).json({ error: "Transaction is already disputed" });
        }

        transaction.status = 'disputed';
        await transaction.save();

        sendAdminNotification({
            message: `Admin flagged transaction: Transaction ID ${id} is now marked as disputed.`,
        });

        res.json({ message: `Transaction ${id} marked as disputed`, transaction });
    } catch (error) {
        console.error("Error flagging transaction:", error);
        res.status(500).json({ error: "Error flagging transaction" });
    }
});

// ✅ Admin Updates Transaction Status (Completed, Disputed, Refunded) + Notify Admins
router.put('/transactions/:id/status', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { newStatus } = req.body; // Accept new status from request

        const validStatuses = ['completed', 'refunded']; // Allowed statuses
        if (!validStatuses.includes(newStatus)) {
            return res.status(400).json({ error: "Invalid transaction status" });
        }

        const transaction = await Transaction.findByPk(id);
        if (!transaction) return res.status(404).json({ error: "Transaction not found" });

        transaction.status = newStatus;
        await transaction.save();

        // Notify admins
        sendAdminNotification({
            message: `Admin updated transaction status: Transaction ID ${id} is now ${newStatus}`,
        });

        res.json({ message: `Transaction ${id} updated to ${newStatus}`, transaction });
    } catch (error) {
        console.error("Error updating transaction status:", error);
        res.status(500).json({ error: "Error updating transaction status" });
    }
});

// ✅ Generate Basic Sales Report (Top Creators, Total Revenue)
router.get('/reports/sales', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const salesData = await Transaction.findAll({
            where: { status: 'completed' },
            attributes: [
                'creatorId',
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales']
            ],
            group: ['creatorId'],
            include: [{ model: User, as: 'creator', attributes: ['id', 'name', 'email'] }]
        });

        res.json(salesData);
    } catch (error) {
        console.error("Error generating sales report:", error);
        res.status(500).json({ error: "Error generating sales report" });
    }
});

// ✅ Fetch Flagged Content (For Admin Review) + Notify Admins
router.get('/flagged-content', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const flaggedArtworks = await Artwork.findAll({ where: { flagged: true } });

        sendAdminNotification({
            message: `Admin needs to review flagged content: ${flaggedArtworks.length} artworks need review.`,
        });

        res.json(flaggedArtworks);
    } catch (error) {
        console.error("Error fetching flagged content:", error);
        res.status(500).json({ error: "Error fetching flagged content" });
    }
});

// ✅ Admin Response to Flagged Content + Store Notification + Audit Log
router.put('/flagged-content/:id/respond', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { resolution } = req.body;
        const reportedItem = await Artwork.findByPk(id);

        if (!reportedItem) return res.status(404).json({ error: "Reported content not found" });

        reportedItem.flagged = false;
        reportedItem.resolution = resolution;
        await reportedItem.save();

        await createNotification(reportedItem.creatorId, "flagged_content_resolved", `Your artwork ID ${id} has been reviewed: ${resolution}`);

        await AuditLog.create({
            adminId: req.user.id,
            actionType: "flagged_content_reviewed",
            targetId: reportedItem.id,
            details: `Flagged content ID ${id} reviewed with resolution: ${resolution}`
        });

        sendAdminNotification({
            message: `Admin reviewed flagged content: Artwork ID ${id} resolved.`,
        });

        res.json({ message: "Flagged content reviewed", reportedItem });
    } catch (error) {
        console.error("Error resolving flagged content:", error);
        res.status(500).json({ error: "Error resolving content" });
    }
});

// Admin dashboard endpoint
router.get('/dashboard', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const timeRange = req.query.timeRange || 'week'; // Default to week
        
        // Get date range based on timeRange
        const getDateRange = () => {
            const endDate = new Date();
            const startDate = new Date();
            
            switch(timeRange) {
                case 'day':
                    startDate.setDate(startDate.getDate() - 1);
                    break;
                case 'week':
                    startDate.setDate(startDate.getDate() - 7);
                    break;
                case 'month':
                    startDate.setMonth(startDate.getMonth() - 1);
                    break;
                case 'year':
                    startDate.setFullYear(startDate.getFullYear() - 1);
                    break;
                default:
                    startDate.setDate(startDate.getDate() - 7); // Default to week
            }
            
            return { startDate, endDate };
        };
        
        const { startDate, endDate } = getDateRange();
        
        // Get counts
        const totalUsers = await User.count();
        const newUsers = await User.count({
            where: {
                createdAt: { [Op.between]: [startDate, endDate] }
            }
        });
        
        const totalArtworks = await Artwork.count();
        const newArtworks = await Artwork.count({
            where: {
                createdAt: { [Op.between]: [startDate, endDate] }
            }
        });
        
        const totalTransactions = await Transaction.count();
        const newTransactions = await Transaction.count({
            where: {
                createdAt: { [Op.between]: [startDate, endDate] }
            }
        });
        
        const totalRevenue = await Transaction.sum('amount') || 0;
        const newRevenue = await Transaction.sum('amount', {
            where: {
                createdAt: { [Op.between]: [startDate, endDate] }
            }
        }) || 0;
        
        res.json({
            timeRange,
            users: { total: totalUsers, new: newUsers },
            artworks: { total: totalArtworks, new: newArtworks },
            transactions: { total: totalTransactions, new: newTransactions },
            revenue: { total: totalRevenue, new: newRevenue }
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Error fetching dashboard data' });
    }
});

// Get reports endpoint
router.get('/reports', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const reports = await Report.findAll({
            include: [
                { model: User, as: 'reporter', attributes: ['id', 'name', 'profilePicture'] },
                { model: Artwork, as: 'reportedArtwork' }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        res.json(reports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Error fetching reports' });
    }
});

module.exports = router;
