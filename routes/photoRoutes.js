// routes/photoRoutes.js
const express = require('express');
const router = express.Router();
const { DigitalAsset, User, ArtworkTag, TagArtworkMapping, ArtworkCategory, CategoryArtworkMapping, sequelize } = require('../models');
const { Op } = require('sequelize');
const upload = require('../middleware/multer');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

// Get all photos
router.get('/', async (req, res) => {
    try {
        const photos = await DigitalAsset.findAll({
            where: { 
                assetType: 'photo',
                status: 'available' 
            },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
            ]
        });
        res.json(photos);
    } catch (error) {
        console.error('Error fetching photos:', error);
        // Return empty array instead of error
        res.json([]);
    }
});

// Search photos by title
router.get('/search', async (req, res) => {
    try {
        const { title } = req.query;
        
        const query = {
            where: { 
                assetType: 'photo',
                status: 'available' 
            },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
            ]
        };

        // Add title search if provided
        if (title) {
            query.where.title = {
                [Op.like]: `%${title}%`
            };
        }

        const photos = await DigitalAsset.findAll(query);
        res.json(photos);
    } catch (error) {
        console.error('Error searching photos:', error);
        // Return empty array instead of error
        res.json([]);
    }
});

// Get photo by ID
router.get('/:id', async (req, res) => {
    try {
        const photo = await DigitalAsset.findOne({
            where: { 
                id: req.params.id,
                assetType: 'photo'
            },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
            ]
        });

        if (!photo) {
            return res.status(404).json({ error: 'Photo not found' });
        }

        res.json(photo);
    } catch (error) {
        console.error('Error fetching photo:', error);
        res.status(500).json({ error: 'Error fetching photo' });
    }
});

// Upload photo - Only Creators can upload
router.post('/upload', authMiddleware, authorize(['creator']), upload.single('image'), async (req, res) => {
    console.log("User Data from Token:", req.user);
    console.log("Received Request Data:", req.body);
    console.log("Received File:", req.file);

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
        
        const creatorId = req.user.id;

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

        // Create the photo record
        const photo = await DigitalAsset.create({ 
            title,
            description,
            price: parseFloat(price),
            assetType: 'photo',
            fileUrl: imageUrl,
            filePublicId: req.file.filename || '',
            userId: creatorId,
            categoryId: category || null,
            status: 'available',
            metadata: {
                dimensions,
                captureDevice: medium, // Camera or software
                dateTaken: creationDate || null,
                resolution,
                copyrightInfo,
                fileType: req.file.mimetype
            }
        });

        // Handle category mapping if using the new system
        if (category) {
            try {
                await CategoryArtworkMapping.create({
                    digitalAssetId: photo.id,
                    categoryId: category
                });
            } catch (error) {
                console.warn("Error creating category mapping:", error.message);
                // Continue even if category mapping fails
            }
        }

        // Handle tags
        if (tags && tags.length > 0) {
            const legacyTagNames = [];
            
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
                    await TagArtworkMapping.create({ 
                        digitalAssetId: photo.id, 
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
                        await TagArtworkMapping.create({ 
                            digitalAssetId: photo.id, 
                            tagId: tag 
                        });
                        
                        legacyTagNames.push(existingTag.name);
                    }
                }
            }
            
            // Store legacy tags for backward compatibility
            if (legacyTagNames.length > 0) {
                await photo.update({ 
                    metadata: {
                        ...photo.metadata,
                        tags: legacyTagNames
                    } 
                });
            }
        }

        res.status(201).json({
            success: true,
            message: "Photo uploaded successfully",
            photo
        });
    } catch (error) {
        console.error("Error uploading photo:", error);
        res.status(500).json({ 
            success: false,
            error: "Error uploading photo",
            details: error.message 
        });
    }
});

// Update photo - Only the creator can update their photo
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

        // Find the photo
        const photo = await DigitalAsset.findOne({
            where: { 
                id,
                assetType: 'photo'
            }
        });
        
        if (!photo) return res.status(404).json({ error: 'Photo not found' });

        // Check ownership
        if (photo.userId !== req.user.id) {
            return res.status(403).json({ error: "You can only edit your own photos" });
        }

        // Build update data
        const updateData = {};
        if (title) updateData.title = title;
        if (description) updateData.description = description;
        if (price) updateData.price = parseFloat(price);
        
        // Update metadata
        const updatedMetadata = { ...photo.metadata };
        if (dimensions) updatedMetadata.dimensions = dimensions;
        if (medium) updatedMetadata.captureDevice = medium;
        if (creationDate) updatedMetadata.dateTaken = creationDate;
        if (resolution) updatedMetadata.resolution = resolution;
        if (copyrightInfo) updatedMetadata.copyrightInfo = copyrightInfo;
        
        if (req.file) {
            updateData.fileUrl = req.file.path;
            updateData.filePublicId = req.file.filename || '';
            updatedMetadata.fileType = req.file.mimetype;
        }
        
        updateData.metadata = updatedMetadata;

        // Update photo
        await photo.update(updateData);

        // Handle category update if provided
        if (category) {
            // Update category mappings
            await CategoryArtworkMapping.destroy({ where: { digitalAssetId: id } });
            
            try {
                await CategoryArtworkMapping.create({
                    digitalAssetId: id,
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
            await TagArtworkMapping.destroy({ where: { digitalAssetId: id } });
            
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
                        await TagArtworkMapping.create({ 
                            digitalAssetId: id, 
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
                            await TagArtworkMapping.create({ 
                                digitalAssetId: id, 
                                tagId: tag 
                            });
                            
                            legacyTagNames.push(existingTag.name);
                        }
                    }
                }
                
                // Update legacy tags
                const updatedMetadata = { ...photo.metadata, tags: legacyTagNames };
                await photo.update({ metadata: updatedMetadata });
            } else {
                // Clear legacy tags
                const updatedMetadata = { ...photo.metadata };
                delete updatedMetadata.tags;
                await photo.update({ metadata: updatedMetadata });
            }
        }

        // Return updated photo
        const updatedPhoto = await DigitalAsset.findByPk(id);

        res.json({
            success: true,
            message: "Photo updated successfully",
            photo: updatedPhoto
        });
    } catch (error) {
        console.error("Error updating photo:", error);
        res.status(500).json({ 
            success: false,
            error: 'Error updating photo',
            details: error.message
        });
    }
});

// Delete photo - Only the creator can delete their photo
router.delete('/:id', authMiddleware, authorize(['creator']), async (req, res) => {
    try {
        const { id } = req.params;

        const photo = await DigitalAsset.findOne({
            where: { 
                id,
                assetType: 'photo'
            }
        });
        
        if (!photo) return res.status(404).json({ error: 'Photo not found' });

        if (photo.userId !== req.user.id) {
            return res.status(403).json({ error: "You can only delete your own photos" });
        }

        // Delete related records
        await TagArtworkMapping.destroy({ where: { digitalAssetId: id } });
        await CategoryArtworkMapping.destroy({ where: { digitalAssetId: id } });

        await photo.destroy();
        res.json({ 
            success: true,
            message: 'Photo deleted successfully' 
        });
    } catch (error) {
        console.error("Error deleting photo:", error);
        res.status(500).json({ 
            success: false,
            error: 'Error deleting photo',
            details: error.message
        });
    }
});

module.exports = router;
