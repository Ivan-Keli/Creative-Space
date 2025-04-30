// routes/publicationRoutes.js
const express = require('express');
const router = express.Router();
const { DigitalAsset, User, ArtworkTag, TagArtworkMapping, ArtworkCategory, CategoryArtworkMapping, sequelize } = require('../models');
const { Op } = require('sequelize');
const upload = require('../middleware/multer');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

// Get all publications
router.get('/', async (req, res) => {
    try {
        const publications = await DigitalAsset.findAll({
            where: { 
                assetType: 'publication',
                status: 'available' 
            },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] }
            ]
        });
        res.json(publications);
    } catch (error) {
        console.error('Error fetching publications:', error);
        // Return empty array instead of error
        res.json([]);
    }
});

// Search publications by title and/or category
router.get('/search', async (req, res) => {
    try {
        const { title, category } = req.query;
        
        const query = {
            where: { 
                assetType: 'publication',
                status: 'available' 
            },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] },
                {
                    model: ArtworkCategory,
                    as: 'categories',
                    through: { attributes: [] },
                    attributes: ['id', 'name']
                }
            ]
        };

        // Add title search if provided
        if (title) {
            query.where.title = {
                [Op.like]: `%${title}%`
            };
        }

        let publications = await DigitalAsset.findAll(query);

        // Filter by category if specified
        if (category && category !== "") {
            publications = publications.filter(pub => 
                pub.categories && pub.categories.some(cat => cat.id.toString() === category)
            );
        }

        res.json(publications);
    } catch (error) {
        console.error('Error searching publications:', error);
        // Return empty array instead of error
        res.json([]);
    }
});

// Get publication by ID
router.get('/:id', async (req, res) => {
    try {
        const publication = await DigitalAsset.findOne({
            where: { 
                id: req.params.id,
                assetType: 'publication'
            },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'name', 'profilePicture'] },
                {
                    model: ArtworkCategory,
                    as: 'categories',
                    through: { attributes: [] },
                    attributes: ['id', 'name']
                }
            ]
        });

        if (!publication) {
            return res.status(404).json({ error: 'Publication not found' });
        }

        res.json(publication);
    } catch (error) {
        console.error('Error fetching publication:', error);
        res.status(500).json({ error: 'Error fetching publication' });
    }
});

// Upload publication - Only Creators can upload
router.post('/upload', authMiddleware, authorize(['creator']), upload.single('file'), async (req, res) => {
    console.log("User Data from Token:", req.user);
    console.log("Received Request Data:", req.body);
    console.log("Received File:", req.file);

    try {
        const { 
            title, 
            description, 
            price, 
            author,
            isbn,
            publisher,
            publicationDate,
            category, 
            selectedTags, 
            copyrightInfo 
        } = req.body;
        
        const creatorId = req.user.id;

        // Parse tags if they're sent as JSON string
        const tags = typeof selectedTags === 'string' ? JSON.parse(selectedTags) : selectedTags || [];

        // Basic validation
        if (!title || !description || !price || !author) {
            return res.status(400).json({ error: "Title, description, price, and author are required." });
        }

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded." });
        }

        const fileUrl = req.file.path; // Cloudinary URL

        // Create the publication record
        const publication = await DigitalAsset.create({ 
            title,
            description,
            price: parseFloat(price),
            assetType: 'publication',
            fileUrl,
            filePublicId: req.file.filename || '',
            userId: creatorId,
            categoryId: category || null,
            status: 'available',
            metadata: {
                author,
                isbn,
                publisher,
                publicationDate,
                copyrightInfo,
                fileType: req.file.mimetype
            }
        });

        // Handle category mapping if using the new system
        if (category) {
            try {
                await CategoryArtworkMapping.create({
                    digitalAssetId: publication.id,
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
                        digitalAssetId: publication.id, 
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
                            digitalAssetId: publication.id, 
                            tagId: tag 
                        });
                        
                        legacyTagNames.push(existingTag.name);
                    }
                }
            }
            
            // Store legacy tags for backward compatibility
            if (legacyTagNames.length > 0) {
                await publication.update({ 
                    metadata: {
                        ...publication.metadata,
                        tags: legacyTagNames
                    } 
                });
            }
        }

        res.status(201).json({
            success: true,
            message: "Publication uploaded successfully",
            publication
        });
    } catch (error) {
        console.error("Error uploading publication:", error);
        res.status(500).json({ 
            success: false,
            error: "Error uploading publication",
            details: error.message 
        });
    }
});

// Update publication - Only the creator can update their publication
router.put('/:id', authMiddleware, authorize(['creator']), upload.single('file'), async (req, res) => {
    try {
        const { 
            title, 
            description, 
            price, 
            author,
            isbn,
            publisher,
            publicationDate,
            category,
            selectedTags,
            copyrightInfo
        } = req.body;
        
        const { id } = req.params;

        // Find the publication
        const publication = await DigitalAsset.findOne({
            where: { 
                id,
                assetType: 'publication'
            }
        });
        
        if (!publication) return res.status(404).json({ error: 'Publication not found' });

        // Check ownership
        if (publication.userId !== req.user.id) {
            return res.status(403).json({ error: "You can only edit your own publications" });
        }

        // Build update data
        const updateData = {};
        if (title) updateData.title = title;
        if (description) updateData.description = description;
        if (price) updateData.price = parseFloat(price);
        
        // Update metadata
        const updatedMetadata = { ...publication.metadata };
        if (author) updatedMetadata.author = author;
        if (isbn) updatedMetadata.isbn = isbn;
        if (publisher) updatedMetadata.publisher = publisher;
        if (publicationDate) updatedMetadata.publicationDate = publicationDate;
        if (copyrightInfo) updatedMetadata.copyrightInfo = copyrightInfo;
        
        if (req.file) {
            updateData.fileUrl = req.file.path;
            updateData.filePublicId = req.file.filename || '';
            updatedMetadata.fileType = req.file.mimetype;
        }
        
        updateData.metadata = updatedMetadata;

        // Update publication
        await publication.update(updateData);

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
                const updatedMetadata = { ...publication.metadata, tags: legacyTagNames };
                await publication.update({ metadata: updatedMetadata });
            } else {
                // Clear legacy tags
                const updatedMetadata = { ...publication.metadata };
                delete updatedMetadata.tags;
                await publication.update({ metadata: updatedMetadata });
            }
        }

        // Return updated publication
        const updatedPublication = await DigitalAsset.findByPk(id);

        res.json({
            success: true,
            message: "Publication updated successfully",
            publication: updatedPublication
        });
    } catch (error) {
        console.error("Error updating publication:", error);
        res.status(500).json({ 
            success: false,
            error: 'Error updating publication',
            details: error.message
        });
    }
});

// Delete publication - Only the creator can delete their publication
router.delete('/:id', authMiddleware, authorize(['creator']), async (req, res) => {
    try {
        const { id } = req.params;

        const publication = await DigitalAsset.findOne({
            where: { 
                id,
                assetType: 'publication'
            }
        });
        
        if (!publication) return res.status(404).json({ error: 'Publication not found' });

        if (publication.userId !== req.user.id) {
            return res.status(403).json({ error: "You can only delete your own publications" });
        }

        // Delete related records
        await TagArtworkMapping.destroy({ where: { digitalAssetId: id } });
        await CategoryArtworkMapping.destroy({ where: { digitalAssetId: id } });

        await publication.destroy();
        res.json({ 
            success: true,
            message: 'Publication deleted successfully' 
        });
    } catch (error) {
        console.error("Error deleting publication:", error);
        res.status(500).json({ 
            success: false,
            error: 'Error deleting publication',
            details: error.message
        });
    }
});

module.exports = router;
