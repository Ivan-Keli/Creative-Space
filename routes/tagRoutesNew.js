const express = require('express');
const router = express.Router();
const { ArtworkTag, Artwork, ArtworkTagMapping, sequelize } = require('../models');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Get all tags
router.get('/', async (req, res) => {
    try {
        const tags = await ArtworkTag.findAll({
            order: [['name', 'ASC']]
        });
        res.json(tags);
    } catch (error) {
        console.error('Error fetching tags:', error);
        res.status(500).json({ message: 'Error fetching tags', error: error.message });
    }
});

// Get popular tags
router.get('/popular', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        
        const popularTags = await ArtworkTag.findAll({
            order: [['useCount', 'DESC']],
            limit
        });
        
        res.json(popularTags);
    } catch (error) {
        console.error('Error fetching popular tags:', error);
        res.status(500).json({ message: 'Error fetching popular tags', error: error.message });
    }
});

// Get tag statistics
router.get('/stats', async (req, res) => {
    try {
        // Create a response object with statistics for each tag
        const tagStats = {};
        
        // Get artwork counts for each tag
        const tagCounts = await sequelize.query(`
            SELECT tagId, COUNT(DISTINCT artworkId) as artworkCount
            FROM ArtworkTagMappings
            GROUP BY tagId
        `, { type: sequelize.QueryTypes.SELECT });
        
        // Format the response
        tagCounts.forEach(item => {
            tagStats[item.tagId] = {
                artworkCount: item.artworkCount
            };
        });
        
        res.json(tagStats);
    } catch (error) {
        console.error('Error fetching tag statistics:', error);
        res.status(500).json({ message: 'Error fetching tag statistics', error: error.message });
    }
});

// Get a single tag by ID
router.get('/:id', async (req, res) => {
    try {
        const tag = await ArtworkTag.findByPk(req.params.id);
        if (!tag) {
            return res.status(404).json({ message: 'Tag not found' });
        }
        
        // Get the actual usage count for this tag
        const artworkCount = await ArtworkTagMapping.count({
            where: { tagId: req.params.id }
        });
        
        const tagData = tag.get({ plain: true });
        tagData.actualUseCount = artworkCount;
        
        res.json(tagData);
    } catch (error) {
        console.error('Error fetching tag:', error);
        res.status(500).json({ message: 'Error fetching tag', error: error.message });
    }
});

// Get all artworks with a specific tag
router.get('/:id/artworks', async (req, res) => {
    try {
        const artworks = await Artwork.findAll({
            include: [{
                model: ArtworkTag,
                as: 'tags',
                through: {
                    model: ArtworkTagMapping,
                    where: { tagId: req.params.id }
                }
            }]
        });
        
        res.json(artworks);
    } catch (error) {
        console.error('Error fetching artworks with tag:', error);
        res.status(500).json({ message: 'Error fetching artworks', error: error.message });
    }
});

// Admin routes below (require authentication and admin role)

// Create a new tag
router.post('/', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const { name, categoryId } = req.body;
                
                // Validate required fields
                if (!name) {
                    return res.status(400).json({ message: 'Tag name is required' });
                }
                
                // Check if tag with the same name already exists
                const existingTag = await ArtworkTag.findOne({ where: { name } });
                if (existingTag) {
                    return res.status(400).json({ message: 'A tag with this name already exists' });
                }
                
                // Create the new tag
                const newTag = await ArtworkTag.create({
                    name,
                    useCount: 0,
                    isApproved: true,
                    categoryId: categoryId || null
                });
                
                res.status(201).json(newTag);
            } catch (error) {
                console.error('Error creating tag:', error);
                res.status(500).json({ message: 'Error creating tag', error: error.message });
            }
        });
    });
});

// Update a tag
router.put('/:id', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const { name, isApproved, categoryId } = req.body;
                
                // Find the tag to update
                const tag = await ArtworkTag.findByPk(req.params.id);
                if (!tag) {
                    return res.status(404).json({ message: 'Tag not found' });
                }
                
                // Check for name uniqueness if name is being changed
                if (name && name !== tag.name) {
                    const existingTag = await ArtworkTag.findOne({ where: { name } });
                    if (existingTag) {
                        return res.status(400).json({ message: 'A tag with this name already exists' });
                    }
                }
                
                // Update the tag
                await tag.update({
                    name: name || tag.name,
                    isApproved: isApproved !== undefined ? isApproved : tag.isApproved,
                    categoryId: categoryId !== undefined ? categoryId : tag.categoryId
                });
                
                res.json(tag);
            } catch (error) {
                console.error('Error updating tag:', error);
                res.status(500).json({ message: 'Error updating tag', error: error.message });
            }
        });
    });
});

// Delete a tag
router.delete('/:id', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const tag = await ArtworkTag.findByPk(req.params.id);
                if (!tag) {
                    return res.status(404).json({ message: 'Tag not found' });
                }
                
                // Check if the tag is being used by any artworks
                const usageCount = await ArtworkTagMapping.count({
                    where: { tagId: req.params.id }
                });
                
                if (usageCount > 0) {
                    return res.status(400).json({ 
                        message: 'Cannot delete tag that is still in use', 
                        usageCount 
                    });
                }
                
                // Delete the tag
                await tag.destroy();
                
                res.json({ message: 'Tag deleted successfully' });
            } catch (error) {
                console.error('Error deleting tag:', error);
                res.status(500).json({ message: 'Error deleting tag', error: error.message });
            }
        });
    });
});

// Bulk operations for tags
router.post('/bulk-delete', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const { tagIds } = req.body;
                
                if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
                    return res.status(400).json({ message: 'Tag IDs array is required' });
                }
                
                // Check if any of the tags are being used
                const usageCounts = await ArtworkTagMapping.findAll({
                    attributes: ['tagId', [sequelize.fn('COUNT', sequelize.col('artworkId')), 'useCount']],
                    where: { tagId: tagIds },
                    group: ['tagId']
                });
                
                // Filter out tags that are in use
                const inUseTags = usageCounts.filter(tag => tag.get('useCount') > 0).map(tag => tag.tagId);
                const tagsToDelete = tagIds.filter(id => !inUseTags.includes(id));
                
                if (tagsToDelete.length === 0) {
                    return res.status(400).json({ 
                        message: 'All selected tags are in use and cannot be deleted',
                        inUseTags
                    });
                }
                
                // Delete the unused tags
                const deleteCount = await ArtworkTag.destroy({
                    where: { id: tagsToDelete }
                });
                
                res.json({ 
                    message: `${deleteCount} tags deleted successfully`,
                    deletedCount: deleteCount,
                    notDeletedCount: tagIds.length - deleteCount,
                    inUseTags
                });
            } catch (error) {
                console.error('Error bulk deleting tags:', error);
                res.status(500).json({ message: 'Error bulk deleting tags', error: error.message });
            }
        });
    });
});

// Bulk update tags
router.post('/bulk-update', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const { tagIds, categoryId, isApproved } = req.body;
                
                if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
                    return res.status(400).json({ message: 'Tag IDs array is required' });
                }
                
                if (categoryId === undefined && isApproved === undefined) {
                    return res.status(400).json({ message: 'At least one property (categoryId or isApproved) must be provided for update' });
                }
                
                // Build the update object with only the properties that were provided
                const updateObj = {};
                if (categoryId !== undefined) updateObj.categoryId = categoryId;
                if (isApproved !== undefined) updateObj.isApproved = isApproved;
                
                // Update the tags
                const [updateCount] = await ArtworkTag.update(updateObj, {
                    where: { id: tagIds }
                });
                
                res.json({ 
                    message: `${updateCount} tags updated successfully`,
                    updatedCount: updateCount
                });
            } catch (error) {
                console.error('Error bulk updating tags:', error);
                res.status(500).json({ message: 'Error bulk updating tags', error: error.message });
            }
        });
    });
});

module.exports = router;
