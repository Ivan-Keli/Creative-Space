const express = require('express');
const router = express.Router();
const { User, Artwork, SocialLink } = require('../models');
const upload = require('../middleware/multer');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

// Get Creator Profile (Public)
router.get('/:id', async (req, res) => {
    try {
        const creator = await User.findByPk(req.params.id, {
            attributes: ['id', 'name', 'email', 'bio', 'profilePicture', 'socialLinks'],
            include: [
                { model: Artwork, as: 'creations' } // Fixed: changed 'artworks' to 'creations'
            ]
        });

        if (!creator || (creator.role !== 'creator' && creator.role !== 'admin' && creator.role !== 'buyer')) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        res.json(creator);
    } catch (error) {
        console.error("Error fetching creator profile:", error);
        res.status(500).json({ error: 'Error retrieving profile' });
    }
});

// Get Current User's Profile
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Error fetching profile' });
    }
});

// Get User Profile by ID
router.get('/profile/:userId', async (req, res) => {
    try {
        // Convert numeric strings to integers to avoid type issues
        const userId = parseInt(req.params.userId, 10);
        
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID format' });
        }
        
        const user = await User.findByPk(userId, {
            attributes: ['id', 'name', 'email', 'bio', 'profilePicture', 'role', 'socialLinks', 'createdAt', 'updatedAt', 'status']
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Create a safe version of the user object to return
        const safeUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            bio: user.bio,
            profilePicture: user.profilePicture,
            role: user.role,
            socialLinks: user.socialLinks,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            status: user.status
        };

        res.json(safeUser);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Error fetching user profile' });
    }
});

// Edit Creator Profile (Only Creator)
router.put('/', authMiddleware, authorize(['creator']), upload.single('profilePicture'), async (req, res) => {
    try {
        const { bio, socialLinks } = req.body;
        const user = await User.findByPk(req.user.id);

        if (!user) return res.status(404).json({ error: 'User not found' });

        if (req.file) {
            user.profilePicture = req.file.path; // Cloudinary URL
        }
        if (bio) {
            user.bio = bio;
        }

        // Update social links if provided
        if (socialLinks) {
            const parsedSocialLinks = typeof socialLinks === 'string' 
                ? JSON.parse(socialLinks) 
                : socialLinks;
            
            user.socialLinks = parsedSocialLinks;
        }

        await user.save();

        // Fetch updated user
        const updatedUser = await User.findByPk(req.user.id);

        res.json({ message: 'Profile updated successfully', user: updatedUser });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ error: 'Error updating profile' });
    }
});

// Update profile picture specifically
router.put('/update-profile-picture', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const profilePicture = req.file.path; // Cloudinary URL
        await user.update({ profilePicture });

        res.json({ 
            message: 'Profile picture updated successfully', 
            profilePicture
        });
    } catch (error) {
        console.error('Error updating profile picture:', error);
        res.status(500).json({ error: 'Error updating profile picture' });
    }
});

module.exports = router;
