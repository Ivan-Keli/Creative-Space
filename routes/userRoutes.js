const express = require('express');
const router = express.Router();
const { User, Artwork, SocialLink } = require('../models');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/multer'); // Handles profile pictures
const { Op } = require('sequelize');

const allowedPlatforms = [
    "instagram", "twitter", "facebook", "linkedin", "tiktok", "youtube",
    "pinterest", "reddit", "snapchat", "tumblr", "whatsapp"
];

// ✅ Get User Profile by ID (Including Their Artworks)
router.get('/profile/:id', async (req, res) => {
    try {
        // Convert numeric strings to integers to avoid type issues
        const userId = parseInt(req.params.id, 10);
        
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID format' });
        }
        
        // Fix: Use proper Sequelize query format with explicit associations
        const user = await User.findByPk(userId, {
            attributes: ['id', 'name', 'bio', 'profilePicture', 'socialLinks', 'role', 'createdAt', 'updatedAt'],
            include: [
                { 
                    model: Artwork, 
                    as: 'creations', // Fixed: changed from 'artworks' to 'creations'
                    required: false 
                },
                { 
                    model: SocialLink, 
                    as: 'socialLinks', 
                    required: false 
                }
            ]
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ error: "Error fetching profile" });
    }
});

// ✅ Update User Profile (Available for Both Creators & Buyers)
router.put('/profile/update', authMiddleware, upload.single('profilePicture'), async (req, res) => {
    try {
        const { bio, socialLinks } = req.body;
        const user = await User.findByPk(req.user.id);

        if (!user) return res.status(404).json({ error: "User not found" });

        // ✅ Validate & Update Social Links
        if (socialLinks) {
            try {
                const parsedLinks = JSON.parse(socialLinks);
                const validatedLinks = {};

                for (const platform of allowedPlatforms) {
                    validatedLinks[platform] = parsedLinks[platform] || "";
                }

                user.socialLinks = validatedLinks;
            } catch (error) {
                return res.status(400).json({ error: "Invalid social links format" });
            }
        }

        // ✅ Update Bio
        if (bio) {
            if (bio.length > 500) {
                return res.status(400).json({ error: "Bio must be 500 characters or less" });
            }
            user.bio = bio;
        }

        // ✅ If a Profile Picture is Uploaded, Update It
        if (req.file) {
            user.profilePicture = req.file.path;
        }

        await user.save();
        res.json({ message: "Profile updated successfully", user });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ error: "Error updating profile" });
    }
});

// ✅ ENHANCED ENDPOINT: Search Users with Role Filtering & Messaging Support
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { query, role } = req.query;
        
        // Modified to allow empty queries for getting all users of a role
        let whereConditions = {
            id: { [Op.ne]: req.user.id } // Exclude the current user from results
        };
        
        // If query is provided, add search conditions
        if (query && query.length >= 2) {
            whereConditions[Op.or] = [
                { name: { [Op.like]: `%${query}%` } },
                { email: { [Op.like]: `%${query}%` } }
            ];
        }
        
        // Add role filter if specified
        if (role && role !== 'all') {
            whereConditions.role = role;
        }
        
        // Only admins can search for other admins
        if (req.user.role !== 'admin' && (role === 'admin' || !role)) {
            whereConditions.role = { [Op.ne]: 'admin' };
        }
        
        const users = await User.findAll({
            where: whereConditions,
            attributes: ['id', 'name', 'email', 'profilePicture', 'role', 'bio'],
            limit: query ? 10 : 50 // Increase limit when getting all users of a role
        });
        
        res.json(users);
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Error searching users' });
    }
});

// ✅ Get All Creators (For Users to Discover Creators)
router.get('/creators', async (req, res) => {
    try {
        const creators = await User.findAll({
            where: { role: 'creator' },
            attributes: ['id', 'name', 'profilePicture', 'bio', 'socialLinks'],
            include: [
                {
                    model: SocialLink,
                    as: 'socialLinks',
                    required: false
                }
            ]
        });

        res.json(creators);
    } catch (error) {
        console.error("Error fetching creators:", error);
        res.status(500).json({ error: "Error fetching creators" });
    }
});

// ✅ Get All Buyers (For Admin & Discovery Purposes)
router.get('/buyers', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const buyers = await User.findAll({
            where: { role: 'buyer' },
            attributes: ['id', 'name', 'email', 'profilePicture', 'socialLinks'],
            include: [
                {
                    model: SocialLink,
                    as: 'socialLinks',
                    required: false
                }
            ]
        });

        res.json(buyers);
    } catch (error) {
        console.error("Error fetching buyers:", error);
        res.status(500).json({ error: "Error fetching buyers" });
    }
});

// ✅ Admin Route: Get All Users (For Managing Accounts)
router.get('/admin/users', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'name', 'email', 'role', 'profilePicture']
        });

        res.json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Error fetching users" });
    }
});

// ✅ Admin Route: Delete a User (Manage Accounts)
router.delete('/admin/users/:id', authMiddleware, authorize(['admin']), async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        await user.destroy();
        res.json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ error: "Error deleting user" });
    }
});

module.exports = router;
