const express = require('express');
const router = express.Router();
const { ArtworkCategory, Artwork, CategoryArtworkMapping, sequelize } = require('../models');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { authMiddleware: authMiddlewareFn, authorize } = require('../middleware/authMiddleware');

// Get all categories
router.get('/', async (req, res) => {
    try {
        const categories = await ArtworkCategory.findAll({
            order: [['displayOrder', 'ASC'], ['name', 'ASC']]
        });
        
        // Get artwork counts for each category
        const categoryCounts = await sequelize.query(`
            SELECT categoryId, COUNT(DISTINCT artworkId) as artworkCount
            FROM CategoryArtworkMappings
            GROUP BY categoryId
        `, { type: sequelize.QueryTypes.SELECT });
        
        // Create a lookup map for the counts
        const countsMap = {};
        categoryCounts.forEach(cat => {
            countsMap[cat.categoryId] = cat.artworkCount;
        });
        
        // Add the counts to the response
        const categoriesWithCounts = categories.map(category => {
            const plainCategory = category.get({ plain: true });
            plainCategory.artworkCount = countsMap[plainCategory.id] || 0;
            return plainCategory;
        });
        
        res.json(categoriesWithCounts);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Error fetching categories', error: error.message });
    }
});

// Get a single category by ID
router.get('/:id', async (req, res) => {
    try {
        const category = await ArtworkCategory.findByPk(req.params.id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        
        // Get the artwork count for this category
        const artworkCount = await CategoryArtworkMapping.count({
            where: { categoryId: req.params.id }
        });
        
        const categoryData = category.get({ plain: true });
        categoryData.artworkCount = artworkCount;
        
        res.json(categoryData);
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({ message: 'Error fetching category', error: error.message });
    }
});

// Get all artworks in a category
router.get('/:id/artworks', async (req, res) => {
    try {
        const artworks = await Artwork.findAll({
            include: [{
                model: ArtworkCategory,
                as: 'categories',
                through: {
                    model: CategoryArtworkMapping,
                    where: { categoryId: req.params.id }
                }
            }]
        });
        
        res.json(artworks);
    } catch (error) {
        console.error('Error fetching artworks in category:', error);
        res.status(500).json({ message: 'Error fetching artworks', error: error.message });
    }
});

// Admin routes below (require authentication and admin role)

// Create a new category
router.post('/', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const { name, description, iconUrl, displayOrder, parentCategoryId } = req.body;
                
                // Validate required fields
                if (!name) {
                    return res.status(400).json({ message: 'Category name is required' });
                }
                
                // Check if category with the same name already exists
                const existingCategory = await ArtworkCategory.findOne({ where: { name } });
                if (existingCategory) {
                    return res.status(400).json({ message: 'A category with this name already exists' });
                }
                
                // Create the new category
                const newCategory = await ArtworkCategory.create({
                    name,
                    description,
                    iconUrl,
                    displayOrder: displayOrder || 0,
                    parentCategoryId: parentCategoryId || null,
                    isActive: true
                });
                
                res.status(201).json(newCategory);
            } catch (error) {
                console.error('Error creating category:', error);
                res.status(500).json({ message: 'Error creating category', error: error.message });
            }
        });
    });
});

// Update a category
router.put('/:id', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const { name, description, iconUrl, displayOrder, parentCategoryId, isActive } = req.body;
                
                // Find the category to update
                const category = await ArtworkCategory.findByPk(req.params.id);
                if (!category) {
                    return res.status(404).json({ message: 'Category not found' });
                }

                // Check for name uniqueness if name is being changed
                if (name && name !== category.name) {
                    const existingCategory = await ArtworkCategory.findOne({ where: { name } });
                    if (existingCategory) {
                        return res.status(400).json({ message: 'A category with this name already exists' });
                    }
                }
                
                // Prevent setting parent to self
                if (parentCategoryId && parseInt(parentCategoryId) === parseInt(req.params.id)) {
                    return res.status(400).json({ message: 'A category cannot be its own parent' });
                }
                
                // Update the category
                await category.update({
                    name: name || category.name,
                    description: description !== undefined ? description : category.description,
                    iconUrl: iconUrl !== undefined ? iconUrl : category.iconUrl,
                    displayOrder: displayOrder !== undefined ? displayOrder : category.displayOrder,
                    parentCategoryId: parentCategoryId !== undefined ? parentCategoryId : category.parentCategoryId,
                    isActive: isActive !== undefined ? isActive : category.isActive
                });
                
                res.json(category);
            } catch (error) {
                console.error('Error updating category:', error);
                res.status(500).json({ message: 'Error updating category', error: error.message });
            }
        });
    });
});

// Delete a category
router.delete('/:id', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                const category = await ArtworkCategory.findByPk(req.params.id);
                if (!category) {
                    return res.status(404).json({ message: 'Category not found' });
                }
                
                // Check if the category is being used by any artworks
                const usageCount = await CategoryArtworkMapping.count({
                    where: { categoryId: req.params.id }
                });
                
                if (usageCount > 0) {
                    return res.status(400).json({ 
                        message: 'Cannot delete category that is still in use', 
                        usageCount 
                    });
                }
                
                // Also check if it's a parent to other categories
                const hasChildren = await ArtworkCategory.count({
                    where: { parentCategoryId: req.params.id }
                });
                
                if (hasChildren > 0) {
                    return res.status(400).json({ 
                        message: 'Cannot delete category that has subcategories', 
                        childCategories: hasChildren 
                    });
                }
                
                // Delete the category
                await category.destroy();
                
                res.json({ message: 'Category deleted successfully' });
            } catch (error) {
                console.error('Error deleting category:', error);
                res.status(500).json({ message: 'Error deleting category', error: error.message });
            }
        });
    });
});

// Get category statistics
router.get('/stats', function(req, res, next) {
    authMiddleware(req, res, function() {
        adminMiddleware(req, res, async function() {
            try {
                // Get counts of categories by various metrics
                const totalCategories = await ArtworkCategory.count();
                const activeCategories = await ArtworkCategory.count({ where: { isActive: true } });
                const parentCategories = await ArtworkCategory.count({ where: { parentCategoryId: null } });
                
                // Get categories with the most artworks
                const topCategories = await sequelize.query(`
                    SELECT ac.id, ac.name, COUNT(cam.artworkId) as artworkCount
                    FROM ArtworkCategories ac
                    LEFT JOIN CategoryArtworkMappings cam ON ac.id = cam.categoryId
                    GROUP BY ac.id
                    ORDER BY artworkCount DESC
                    LIMIT 10
                `, { type: sequelize.QueryTypes.SELECT });
                
                res.json({
                    totalCategories,
                    activeCategories,
                    parentCategories,
                    topCategories
                });
            } catch (error) {
                console.error('Error fetching category statistics:', error);
                res.status(500).json({ message: 'Error fetching category statistics', error: error.message });
            }
        });
    });
});

module.exports = router;
