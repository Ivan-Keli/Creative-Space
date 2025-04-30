const express = require('express');
const router = express.Router();
const { sequelize, Transaction, Artwork, DigitalAsset, User } = require('../models');
const { authMiddleware } = require('../middleware/authMiddleware');
const fs = require('fs');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const { Op } = require('sequelize');

// Get user's downloads
router.get('/:userId/downloads', authMiddleware, async (req, res) => {
    try {
        // Ensure user is requesting their own downloads
        if (req.user.id != req.params.userId) {
            return res.status(403).json({ error: 'Not authorized to view these downloads' });
        }
        
        const downloads = await Transaction.findAll({
            where: { 
                buyerId: req.params.userId,
                status: 'completed'
            },
            include: [
                { 
                    model: Artwork,
                    as: 'purchasedArtwork', // FIXED: Changed from 'artwork' to 'purchasedArtwork'
                    attributes: [
                        'id', 'title', 'imageUrl', 'downloadableFile', 
                        'price', 'creatorId', 'fileType', 'resolution'
                    ]
                },
                {
                    model: User,
                    as: 'seller',
                    attributes: ['id', 'name', 'profilePicture']
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Format response for frontend
        const formattedDownloads = downloads.map(download => {
            return {
                id: download.id,
                purchaseDate: download.createdAt,
                artwork: download.purchasedArtwork, // FIXED: Changed from download.artwork
                seller: download.seller,
                downloadUrl: `/api/downloads/${download.id}`, // Endpoint to actually download the file
                isDownloadable: !!download.purchasedArtwork?.downloadableFile // FIXED: Changed from download.artwork
            };
        });
        
        res.json(formattedDownloads);
    } catch (error) {
        console.error('Error fetching downloads:', error);
        res.status(500).json({ error: 'Error fetching downloads' });
    }
});

// Get user's purchases
router.get('/:userId/purchases', authMiddleware, async (req, res) => {
    try {
        // Ensure user is requesting their own purchases
        if (req.user.id != req.params.userId) {
            return res.status(403).json({ error: 'Not authorized to view these purchases' });
        }
        
        const purchases = await Transaction.findAll({
            where: { 
                buyerId: req.params.userId
            },
            include: [
                { 
                    model: Artwork,
                    as: 'purchasedArtwork', // FIXED: Changed from 'artwork' to 'purchasedArtwork'
                    attributes: [
                        'id', 'title', 'imageUrl', 'thumbnailUrl', 
                        'price', 'creatorId'
                    ]
                },
                {
                    model: User,
                    as: 'seller',
                    attributes: ['id', 'name', 'profilePicture']
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Format the response to maintain compatibility with frontend
        const formattedPurchases = purchases.map(purchase => {
            const result = purchase.toJSON();
            // Add artwork property that points to purchasedArtwork for backward compatibility
            result.artwork = result.purchasedArtwork;
            return result;
        });
        
        res.json(formattedPurchases);
    } catch (error) {
        console.error('Error fetching purchases:', error);
        res.status(500).json({ error: 'Error fetching purchases' });
    }
});

// Get user transactions
router.get('/user/:userId', authMiddleware, async (req, res) => {
    try {
        // Ensure user is requesting their own transactions
        if (req.user.id != req.params.userId) {
            return res.status(403).json({ error: 'Not authorized to view these transactions' });
        }
        
        // Find all transactions where user is either buyer or seller
        const transactions = await Transaction.findAll({
            where: {
                [Op.or]: [
                    { buyerId: req.params.userId },
                    { sellerId: req.params.userId }
                ]
            },
            include: [
                {
                    model: Artwork,
                    as: 'purchasedArtwork', // FIXED: Changed from 'artwork' to 'purchasedArtwork'
                    attributes: ['id', 'title', 'imageUrl', 'price']
                },
                {
                    model: User,
                    as: 'buyer',
                    attributes: ['id', 'name', 'profilePicture']
                },
                {
                    model: User,
                    as: 'seller',
                    attributes: ['id', 'name', 'profilePicture']
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Format the response to maintain compatibility with frontend
        const formattedTransactions = transactions.map(transaction => {
            const result = transaction.toJSON();
            // Add artwork property that points to purchasedArtwork for backward compatibility
            result.artwork = result.purchasedArtwork;
            return result;
        });
        
        res.json(formattedTransactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Error fetching transactions' });
    }
});

// Download purchased content (digital asset)
router.get('/:transactionId/download', authMiddleware, async (req, res) => {
    try {
        // Find the transaction with artwork details
        const transaction = await Transaction.findOne({
            where: { 
                id: req.params.transactionId,
            },
            include: [
                { 
                    model: Artwork, 
                    as: 'purchasedArtwork', // FIXED: Changed from 'artwork' to 'purchasedArtwork' 
                    include: [{ model: DigitalAsset, as: 'digitalAsset' }] 
                }
            ]
        });
        
        // Check if transaction exists
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        // Check if user owns this transaction
        if (transaction.buyerId !== req.user.id) {
            return res.status(403).json({ error: 'You do not have permission to download this content' });
        }
        
        // Check if transaction is completed
        if (transaction.status !== 'completed') {
            return res.status(403).json({ error: 'This purchase is not yet completed' });
        }
        
        // Check if artwork and digital asset exist
        if (!transaction.purchasedArtwork || !transaction.purchasedArtwork.digitalAsset) { // FIXED: Changed from transaction.artwork
            return res.status(404).json({ error: 'Digital content not found for this purchase' });
        }
        
        const digitalAsset = transaction.purchasedArtwork.digitalAsset; // FIXED: Changed from transaction.artwork
        
        // Check if digital asset has a secure URL
        if (digitalAsset.assetType === 'cloudinary') {
            // Generate a signed URL for the Cloudinary asset
            const secureUrl = cloudinary.url(digitalAsset.assetPath, {
                secure: true,
                resource_type: 'raw',
                type: 'authenticated',
                sign_url: true,
                attachment: true,
                expires_at: Math.floor(Date.now() / 1000) + 3600 // URL expires in 1 hour
            });
            
            // Log download for analytics
            await Transaction.update({
                lastDownloadedAt: new Date(),
                downloadCount: (transaction.downloadCount || 0) + 1
            }, {
                where: { id: transaction.id }
            });
            
            // Redirect to the secure URL
            return res.redirect(secureUrl);
        } 
        // Check if digital asset is a local file
        else if (digitalAsset.assetType === 'local') {
            const filePath = path.join(__dirname, '../..', digitalAsset.assetPath);
            
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found' });
            }
            
            // Get file extension and name
            const fileName = path.basename(digitalAsset.assetPath);
            
            // Log download for analytics
            await Transaction.update({
                lastDownloadedAt: new Date(),
                downloadCount: (transaction.downloadCount || 0) + 1
            }, {
                where: { id: transaction.id }
            });
            
            // Set appropriate headers for file download
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Type', digitalAsset.mimeType || 'application/octet-stream');
            
            // Stream the file to the response
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        } 
        // For external URLs
        else if (digitalAsset.assetType === 'external') {
            // Log download for analytics
            await Transaction.update({
                lastDownloadedAt: new Date(),
                downloadCount: (transaction.downloadCount || 0) + 1
            }, {
                where: { id: transaction.id }
            });
            
            // Redirect to the external URL
            return res.redirect(digitalAsset.assetPath);
        }
        else {
            return res.status(400).json({ error: 'Unsupported asset type' });
        }
    } catch (error) {
        console.error('Error downloading content:', error);
        res.status(500).json({ error: 'Error downloading content' });
    }
});

// Add this route to handle the actual file download
router.get('/download/:transactionId', authMiddleware, async (req, res) => {
    try {
        const transaction = await Transaction.findByPk(req.params.transactionId, {
            include: [{ model: Artwork, as: 'purchasedArtwork' }] // FIXED: Changed from 'artwork' to 'purchasedArtwork'
        });
        
        if (!transaction) {
            return res.status(404).json({ error: 'Purchase not found' });
        }
        
        // Verify the user has permission
        if (transaction.buyerId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to download this file' });
        }
        
        // Check if file exists
        const filePath = transaction.purchasedArtwork.downloadableFile; // FIXED: Changed from transaction.artwork
        if (!filePath) {
            return res.status(404).json({ error: 'No downloadable file available' });
        }
        
        // Send the file
        const absolutePath = path.join(__dirname, '..', filePath);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }
        
        res.download(absolutePath);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ error: 'Error downloading file' });
    }
});

// Get download history for a transaction
router.get('/:transactionId/download-history', authMiddleware, async (req, res) => {
    try {
        // Find the transaction
        const transaction = await Transaction.findOne({
            where: { 
                id: req.params.transactionId,
            },
            attributes: ['id', 'artworkId', 'createdAt', 'lastDownloadedAt', 'downloadCount']
        });
        
        // Check if transaction exists
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        // Check if user owns this transaction
        if (transaction.buyerId !== req.user.id) {
            return res.status(403).json({ error: 'You do not have permission to view this information' });
        }
        
        res.json({
            transactionId: transaction.id,
            purchaseDate: transaction.createdAt,
            lastDownloadedAt: transaction.lastDownloadedAt,
            downloadCount: transaction.downloadCount || 0
        });
    } catch (error) {
        console.error('Error fetching download history:', error);
        res.status(500).json({ error: 'Error fetching download history' });
    }
});

module.exports = router;
