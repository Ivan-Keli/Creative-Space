// routes/artworkRoutes.js
const express = require('express');
const router = express.Router();
const { 
    Artwork, 
    User, 
    Review, 
    Report, 
    ArtworkTag, 
    ArtworkTagMapping, 
    CategoryArtworkMapping, 
    sequelize 
} = require('../models'); // Updated imports
const { Op } = require('sequelize'); // Import Sequelize operators
const upload = require('../middleware/multer');
const { authMiddleware, authorize } = require('../middleware/authMiddleware'); // Import auth & role middleware

// ✅ Search & Filter Artworks
router.get('/search', async (req, res) => {
    const { category, title, priceMin, priceMax } = req.query;
    try {
        const filter = {};

        if (category) filter.category = category;
        if (title) filter.title = { [Op.iLike]: `%${title}%` };
        if (priceMin && priceMax) filter.price = { [Op.between]: [priceMin, priceMax] };

        const artworks = await Artwork.findAll({ where: filter });
        res.json(artworks);
    } catch (error) {
        console.error("Error filtering artworks:", error);
        res.status(500).json({ error: "Failed to filter artworks" });
    }
});

// Get all artwork categories
router.get('/categories', async (req, res) => {
    try {
        // Example implementation - modify based on your data structure
        // If you have a Category model
        const categories = await sequelize.query(
            "SELECT DISTINCT category FROM Artworks WHERE category IS NOT NULL ORDER BY category",
            { type: sequelize.QueryTypes.SELECT }
        );
        
        res.json(categories);
    } catch (error) {
        console.error('Error fetching artwork categories:', error);
        res.status(500).json({ error: 'Error fetching artwork categories' });
    }
});

// Get all artwork tags
router.get('/tags', async (req, res) => {
    try {
        // Use the ArtworkTag model directly
        const tags = await ArtworkTag.findAll({
            attributes: ['id', 'name', 'useCount'],
            order: [['useCount', 'DESC']]
        });
        
        res.json(tags);
    } catch (error) {
        console.error('Error fetching artwork tags:', error);
        res.status(500).json({ error: 'Error fetching artwork tags' });
    }
});

// ✅ NEW ROUTE: Fetch Featured Artworks
router.get('/featured', async (req, res) => {
    try {
        // Find artworks marked as featured or get the most recent ones
        const featuredArtworks = await Artwork.findAll({ 
            where: { 
                status: 'available',
                // Optionally add a featured flag if you have one
                // featured: true 
            },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
            ],
            order: [['createdAt', 'DESC']], // Sort by newest first
            limit: 8 // Limit to 8 artworks as in the frontend
        });
        
        res.json(featuredArtworks);
    } catch (error) {
        console.error("Error fetching featured artworks:", error);
        res.status(500).json({ error: 'Error fetching featured artworks' });
    }
});

// ✅ ENHANCED: Upload Artwork - Only Creators can upload
router.post('/upload', authMiddleware, authorize(['creator']), upload.single('image'), async (req, res) => {
    // Logging for Debugging
    console.log("User Data from Token:", req.user); // Shows user info from token
    console.log("Received Request Data:", req.body); // Displays incoming request body
    console.log("Received File:", req.file); // Displays uploaded file info

    try {
        const { 
            title, 
            description, 
            price, 
            category, 
            selectedTags, 
            dimensions, 
            medium, 
            creationDate, 
            resolution, 
            copyrightInfo 
        } = req.body;
        
        const creatorId = req.user.id; // Get user ID from token

        // Parse tags if they're sent as JSON string
        const tags = typeof selectedTags === 'string' ? JSON.parse(selectedTags) : selectedTags || [];

        // Basic validation
        if (!title || !description || !price) {
            return res.status(400).json({ error: "Title, description, and price are required." });
        }

        if (!req.file) {
            return res.status(400).json({ error: "No image uploaded." });
        }

        const imageUrl = req.file.path; // Cloudinary URL

        // Create the artwork with enhanced metadata
        const newArtwork = await Artwork.create({ 
            title, 
            description, 
            imageUrl, 
            price, 
            category,
            dimensions,
            medium,
            creationDate: creationDate || null,
            resolution,
            copyrightInfo,
            creatorId,
            status: 'available',
            fileType: req.file.mimetype
        });

        // Handle tags
        if (tags && tags.length > 0) {
            for (const tag of tags) {
                if (typeof tag === 'string' && tag.startsWith('custom:')) {
                    // Handle custom tag - create a new tag
                    const tagName = tag.replace('custom:', '');
                    let [newTag] = await ArtworkTag.findOrCreate({
                        where: { name: tagName }
                    });
                    
                    // Increment use count
                    await newTag.increment('useCount');
                    
                    // Create mapping
                    await ArtworkTagMapping.create({ 
                        artworkId: newArtwork.id, 
                        tagId: newTag.id 
                    });
                } else {
                    // Handle existing tag
                    const existingTag = await ArtworkTag.findByPk(tag);
                    if (existingTag) {
                        // Increment use count
                        await existingTag.increment('useCount');
                        
                        // Create mapping
                        await ArtworkTagMapping.create({ 
                            artworkId: newArtwork.id, 
                            tagId: tag 
                        });
                    }
                }
            }
        }

        // Set legacy tags for backward compatibility
        if (tags && tags.length > 0) {
            const legacyTagNames = [];
            
            // Get names for custom tags
            for (const tag of tags) {
                if (typeof tag === 'string' && tag.startsWith('custom:')) {
                    legacyTagNames.push(tag.replace('custom:', ''));
                } else {
                    // Get name for existing tags
                    try {
                        const existingTag = await ArtworkTag.findByPk(tag);
                        if (existingTag) {
                            legacyTagNames.push(existingTag.name);
                        }
                    } catch (error) {
                        console.warn(`Error getting tag name for ID ${tag}:`, error.message);
                    }
                }
            }
            
            if (legacyTagNames.length > 0) {
                await newArtwork.update({ legacyTags: legacyTagNames });
            }
        }

        // Add to category mapping table if category provided
        if (category) {
            try {
                await CategoryArtworkMapping.create({
                    artworkId: newArtwork.id,
                    categoryId: category
                });
            } catch (error) {
                console.warn("Error creating category mapping:", error.message);
                // Continue even if category mapping fails
            }
        }

        res.status(201).json({
            success: true,
            message: "Artwork uploaded successfully",
            artwork: newArtwork
        });
    } catch (error) {
        console.error("Error uploading artwork:", error);
        res.status(500).json({ 
            success: false,
            error: "Error uploading artwork",
            details: error.message 
        });
    }
});

// ✅ Fetch All Available Artworks (Exclude sold ones)
router.get('/', async (req, res) => {
    try {
        const artworks = await Artwork.findAll({ 
            where: { status: 'available' },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
            ]
        });
        res.json(artworks);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching artworks' });
    }
});

// Get a specific artwork by ID - FIXED VERSION WITH EMPTY THROUGH ATTRIBUTES
router.get('/:id', async (req, res) => {
    try {
        const artwork = await Artwork.findByPk(req.params.id, {
            include: [
                { 
                    model: User, 
                    as: 'creator', 
                    attributes: ['id', 'name', 'profilePicture'] 
                },
                { 
                    model: ArtworkTag, 
                    as: 'tags',
                    through: { 
                        attributes: [] // Empty array means no junction table attributes will be included
                    }
                }
            ]
        });

        if (!artwork) {
            return res.status(404).json({ error: 'Artwork not found' });
        }

        // Increment view count
        await artwork.update({ viewCount: (artwork.viewCount || 0) + 1 });
        
        res.json(artwork);
    } catch (error) {
        console.error('Error fetching artwork:', error);
        res.status(500).json({ error: 'Error fetching artwork' });
    }
});

// ✅ Mark Artwork as Sold - Only Creators can update their own artwork
router.put('/:id/sold', authMiddleware, authorize(['creator']), async (req, res) => {
    try {
        const { id } = req.params;
        const artwork = await Artwork.findByPk(id);

        if (!artwork) return res.status(404).json({ error: 'Artwork not found' });

        if (artwork.creatorId !== req.user.id) {
            return res.status(403).json({ error: "You can only mark your own artwork as sold" });
        }

        await artwork.update({ status: 'sold' });
        res.json({ message: "Artwork marked as sold", artwork });
    } catch (error) {
        console.error("Error marking artwork as sold:", error);
        res.status(500).json({ error: 'Error updating artwork status' });
    }
});

// ✅ ENHANCED: Update Artwork - Only Creators can update their own artwork
router.put('/:id', authMiddleware, authorize(['creator']), upload.single('image'), async (req, res) => {
    try {
        const { 
            title, 
            description, 
            price, 
            category,
            selectedTags,
            dimensions, 
            medium, 
            creationDate, 
            resolution, 
            copyrightInfo
        } = req.body;
        
        const { id } = req.params;
        const updateData = {};

        // Build update data
        if (title) updateData.title = title;
        if (description) updateData.description = description;
        if (price) updateData.price = price;
        if (category) updateData.category = category;
        if (dimensions) updateData.dimensions = dimensions;
        if (medium) updateData.medium = medium;
        if (creationDate) updateData.creationDate = creationDate;
        if (resolution) updateData.resolution = resolution;
        if (copyrightInfo) updateData.copyrightInfo = copyrightInfo;
        if (req.file) {
            updateData.imageUrl = req.file.path; // Cloudinary URL
            updateData.fileType = req.file.mimetype;
        }

        // Find the artwork
        const artwork = await Artwork.findByPk(id);
        if (!artwork) return res.status(404).json({ error: 'Artwork not found' });

        // Check ownership
        if (artwork.creatorId !== req.user.id) {
            return res.status(403).json({ error: "You can only edit your own artwork" });
        }

        // Update artwork
        await artwork.update(updateData);

        // Handle category mapping update if category changed
        if (category) {
            // Remove old category mappings
            await CategoryArtworkMapping.destroy({ where: { artworkId: id } });
            
            // Add new category mapping
            try {
                await CategoryArtworkMapping.create({
                    artworkId: id,
                    categoryId: category
                });
            } catch (error) {
                console.warn("Error updating category mapping:", error.message);
            }
        }

        // Handle tags if provided
        if (selectedTags) {
            const tags = typeof selectedTags === 'string' ? JSON.parse(selectedTags) : selectedTags;
            
            // Remove old tag mappings
            await ArtworkTagMapping.destroy({ where: { artworkId: id } });
            
            // Add new tags
            if (tags && tags.length > 0) {
                const legacyTagNames = [];
                
                for (const tag of tags) {
                    if (typeof tag === 'string' && tag.startsWith('custom:')) {
                        // Handle custom tag
                        const tagName = tag.replace('custom:', '');
                        let [newTag] = await ArtworkTag.findOrCreate({
                            where: { name: tagName }
                        });
                        
                        // Increment use count
                        await newTag.increment('useCount');
                        
                        // Create mapping
                        await ArtworkTagMapping.create({ 
                            artworkId: id, 
                            tagId: newTag.id 
                        });
                        
                        legacyTagNames.push(tagName);
                    } else {
                        // Handle existing tag
                        const existingTag = await ArtworkTag.findByPk(tag);
                        if (existingTag) {
                            // Increment use count
                            await existingTag.increment('useCount');
                            
                            // Create mapping
                            await ArtworkTagMapping.create({ 
                                artworkId: id, 
                                tagId: tag 
                            });
                            
                            legacyTagNames.push(existingTag.name);
                        }
                    }
                }
                
                // Update legacy tags field
                await artwork.update({ legacyTags: legacyTagNames });
            } else {
                // Clear legacy tags if no new tags
                await artwork.update({ legacyTags: [] });
            }
        }

        // Return updated artwork with tags - using the same approach as the getById route
        const updatedArtwork = await Artwork.findByPk(id, {
            include: [
                { 
                    model: ArtworkTag,
                    as: 'tags',
                    through: {
                        attributes: [] // Empty array means no junction table attributes will be included
                    }
                }
            ]
        });

        res.json({
            success: true,
            message: "Artwork updated successfully",
            artwork: updatedArtwork
        });
    } catch (error) {
        console.error("Error updating artwork:", error);
        res.status(500).json({ 
            success: false,
            error: 'Error updating artwork',
            details: error.message
        });
    }
});

// Add a route to check artwork availability
router.get('/:id/availability', async (req, res) => {
    try {
        const artwork = await Artwork.findByPk(req.params.id);
        
        if (!artwork) {
            return res.status(404).json({ 
                available: false, 
                message: 'Artwork not found' 
            });
        }
        
        // Check availability based on status
        const isAvailable = artwork.status === 'available';
        
        res.json({
            available: isAvailable,
            artwork: {
                id: artwork.id,
                title: artwork.title,
                status: artwork.status
            }
        });
    } catch (error) {
        console.error('Error checking artwork availability:', error);
        res.status(500).json({ 
            available: false,
            message: 'Error checking artwork availability'
        });
    }
});

// Add related artworks route
router.get('/related/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // First get the current artwork to find its category
        const artwork = await Artwork.findByPk(id);
        
        if (!artwork) {
            return res.status(404).json({ error: 'Artwork not found' });
        }
        
        // Find related artworks (same category, different id)
        const relatedArtworks = await Artwork.findAll({
            where: {
                id: { [Op.ne]: id },
                category: artwork.category,
                status: 'available'
            },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
            ],
            limit: 4
        });
        
        res.json(relatedArtworks);
    } catch (error) {
        console.error('Error fetching related artworks:', error);
        res.status(500).json({ error: 'Error fetching related artworks' });
    }
});

// Track artwork view
router.post('/:id/view', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        
        const artwork = await Artwork.findByPk(id);
        
        if (!artwork) {
            return res.status(404).json({ error: 'Artwork not found' });
        }
        
        // Increment view count
        await artwork.increment('viewCount');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error tracking view:', error);
        res.status(500).json({ error: 'Error tracking view' });
    }
});

// ✅ Delete Artwork - Only Creators can delete their own artwork
router.delete('/:id', authMiddleware, authorize(['creator']), async (req, res) => {
    try {
        const { id } = req.params;

        const artwork = await Artwork.findByPk(id);
        if (!artwork) return res.status(404).json({ error: 'Artwork not found' });

        if (artwork.creatorId !== req.user.id) {
            return res.status(403).json({ error: "You can only delete your own artwork" });
        }

        // Delete related records
        await ArtworkTagMapping.destroy({ where: { artworkId: id } });
        await CategoryArtworkMapping.destroy({ where: { artworkId: id } });

        await artwork.destroy();
        res.json({ message: 'Artwork deleted' });
    } catch (error) {
        console.error("Error deleting artwork:", error);
        res.status(500).json({ error: 'Error deleting artwork' });
    }
});

// ✅ ENHANCED: Get creator's artworks with auth check
router.get('/creator/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // No need to restrict this endpoint to only the creator's own artworks
        // since it's used in the messaging feature for selecting artworks
        
        const artworks = await Artwork.findAll({
            where: { 
                creatorId: userId,
                // Only return available artworks for messaging purposes
                status: 'available'
            },
            attributes: ['id', 'title', 'price', 'imageUrl', 'category', 'createdAt'],
            order: [['createdAt', 'DESC']]
        });
        
        res.json(artworks);
    } catch (error) {
        console.error('Error fetching creator artworks:', error);
        res.status(500).json({ error: 'Error fetching artworks' });
    }
});

// Get all reviews for an artwork
router.get('/:id/reviews', async (req, res) => {
    try {
        const reviews = await Review.findAll({
            where: { artworkId: req.params.id },
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

// Report artwork
router.post('/:id/report', authMiddleware, async (req, res) => {
    try {
        const { reason } = req.body;
        
        if (!reason) {
            return res.status(400).json({ error: 'Report reason is required' });
        }

        const artwork = await Artwork.findByPk(req.params.id);
        
        if (!artwork) {
            return res.status(404).json({ error: 'Artwork not found' });
        }

        // Create a report record
        const report = await Report.create({
            artworkId: req.params.id,
            reportedBy: req.user.id,
            reason,
            status: 'pending',
            reportType: 'artwork'
        });

        res.status(201).json({ 
            message: 'Artwork reported successfully', 
            report 
        });
    } catch (error) {
        console.error('Error reporting artwork:', error);
        res.status(500).json({ error: 'Error reporting artwork' });
    }
});

module.exports = router;
