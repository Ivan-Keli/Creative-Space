const express = require('express');
const router = express.Router();
const { Review, User, Artwork, Transaction } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

// Create Review
router.post('/', authMiddleware, async (req, res) => {
    const { artworkId, rating, comment } = req.body;
    try {
        // Validate required fields
        if (!artworkId || !rating || !comment) {
            return res.status(400).json({ error: 'Artwork ID, rating, and comment are required' });
        }
        
        // Check if the artwork exists
        const artwork = await Artwork.findByPk(artworkId);
        if (!artwork) {
            return res.status(404).json({ error: 'Artwork not found' });
        }
        
        // Check if the user has already reviewed this artwork
        const existingReview = await Review.findOne({
            where: { 
                artworkId,
                reviewerId: req.user.id
            }
        });
        
        if (existingReview) {
            return res.status(400).json({ error: 'You have already reviewed this artwork' });
        }
        
        // Create the review
        const review = await Review.create({ 
            reviewerId: req.user.id, 
            artworkId, 
            rating, 
            comment 
        });
        
        // Update the artwork average rating
        const allReviews = await Review.findAll({
            where: { artworkId }
        });
        
        const totalRating = allReviews.reduce((sum, review) => sum + review.rating, 0);
        const avgRating = totalRating / allReviews.length;
        
        await artwork.update({ 
            avgRating,
            reviewCount: allReviews.length
        });
        
        res.status(201).json({ 
            message: 'Review submitted successfully',
            review
        });
    } catch (error) {
        console.error("Error creating review:", error);
        res.status(500).json({ error: "Failed to submit review" });
    }
});

// Get all reviews for an artwork
router.get('/artwork/:artworkId', async (req, res) => {
    try {
        const reviews = await Review.findAll({
            where: { artworkId: req.params.artworkId },
            include: [
                { model: User, as: 'reviewer', attributes: ['id', 'name', 'profilePicture'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        res.json(reviews);
    } catch (error) {
        console.error('Error fetching artwork reviews:', error);
        res.status(500).json({ error: 'Error fetching reviews' });
    }
});

// Get all reviews by a user
router.get('/user/:userId', async (req, res) => {
    try {
        const reviews = await Review.findAll({
            where: { reviewerId: req.params.userId },
            include: [
                { model: Artwork, as: 'artwork', include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }] }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        res.json(reviews);
    } catch (error) {
        console.error('Error fetching user reviews:', error);
        res.status(500).json({ error: 'Error fetching reviews' });
    }
});

// Get the current user's reviews
router.get('/my-reviews', authMiddleware, async (req, res) => {
    try {
        const reviews = await Review.findAll({
            where: { reviewerId: req.user.id },
            include: [
                { model: Artwork, as: 'artwork', include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }] }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        res.json(reviews);
    } catch (error) {
        console.error('Error fetching user reviews:', error);
        res.status(500).json({ error: 'Error fetching reviews' });
    }
});

// Update a review - only the reviewer can update their review
router.put('/:reviewId', authMiddleware, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        
        if (!rating && !comment) {
            return res.status(400).json({ error: 'Rating or comment is required' });
        }
        
        const review = await Review.findByPk(req.params.reviewId);
        
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
        
        // Check if the user is the reviewer
        if (review.reviewerId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to update this review' });
        }
        
        const updateData = {};
        if (rating) updateData.rating = rating;
        if (comment) updateData.comment = comment;
        
        await review.update(updateData);
        
        // Update the artwork average rating if the rating changed
        if (rating) {
            const artwork = await Artwork.findByPk(review.artworkId);
            const allReviews = await Review.findAll({
                where: { artworkId: review.artworkId }
            });
            
            const totalRating = allReviews.reduce((sum, rev) => sum + rev.rating, 0);
            const avgRating = totalRating / allReviews.length;
            
            await artwork.update({ avgRating });
        }
        
        res.json({ 
            message: 'Review updated successfully',
            review
        });
    } catch (error) {
        console.error('Error updating review:', error);
        res.status(500).json({ error: 'Error updating review' });
    }
});

// Delete a review - only the reviewer can delete their review
router.delete('/:reviewId', authMiddleware, async (req, res) => {
    try {
        const review = await Review.findByPk(req.params.reviewId);
        
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
        
        // Check if the user is the reviewer
        if (review.reviewerId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to delete this review' });
        }
        
        await review.destroy();
        
        // Update the artwork average rating
        const artwork = await Artwork.findByPk(review.artworkId);
        const allReviews = await Review.findAll({
            where: { artworkId: review.artworkId }
        });
        
        if (allReviews.length > 0) {
            const totalRating = allReviews.reduce((sum, rev) => sum + rev.rating, 0);
            const avgRating = totalRating / allReviews.length;
            
            await artwork.update({ 
                avgRating,
                reviewCount: allReviews.length
            });
        } else {
            // No reviews left, reset the rating
            await artwork.update({ 
                avgRating: 0,
                reviewCount: 0
            });
        }
        
        res.json({ message: 'Review deleted successfully' });
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ error: 'Error deleting review' });
    }
});

// Report a review
router.post('/:reviewId/report', authMiddleware, async (req, res) => {
    try {
        const { reason } = req.body;
        
        if (!reason) {
            return res.status(400).json({ error: 'Report reason is required' });
        }
        
        const review = await Review.findByPk(req.params.reviewId);
        
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
        
        // Create a report record
        const report = await Report.create({
            reviewId: req.params.reviewId,
            reportedBy: req.user.id,
            reason,
            status: 'pending',
            reportType: 'review'
        });
        
        res.status(201).json({ 
            message: 'Review reported successfully', 
            report 
        });
    } catch (error) {
        console.error('Error reporting review:', error);
        res.status(500).json({ error: 'Error reporting review' });
    }
});

module.exports = router;
