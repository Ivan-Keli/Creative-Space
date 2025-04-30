// routes/venueRoutes.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/authMiddleware').authMiddleware; // Updated import path
const { Venue, Event } = require('../models');
const { Op } = require('sequelize'); // Import Sequelize operators

/**
 * @route   GET /api/venues
 * @desc    Get all venues
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const venues = await Venue.findAll({
      attributes: ['id', 'name', 'address', 'city', 'country', 'capacity', 'description', 'website', 'contactEmail', 'image'],
      order: [['name', 'ASC']]
    });
    res.json(venues);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   POST /api/venues
 * @desc    Create a new venue
 * @access  Private
 */
router.post('/', 
  [
    auth,
    body('name', 'Venue name is required').notEmpty(),
    body('address', 'Venue address is required').notEmpty(),
    body('city').optional(),
    body('country').optional(),
    body('capacity').optional().isNumeric().withMessage('Capacity must be a number'),
    body('description').optional(),
    body('website').optional().isURL().withMessage('Website must be a valid URL'),
    body('contactEmail').optional().isEmail().withMessage('Contact email must be valid'),
    body('contactPhone').optional(),
    body('image').optional()
  ], 
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { 
        name, 
        address, 
        city, 
        country, 
        capacity, 
        description, 
        website, 
        contactEmail, 
        contactPhone, 
        image,
        latitude,
        longitude
      } = req.body;

      // Create new venue with required fields and default values for NOT NULL columns
      const venue = await Venue.create({
        name,
        address,
        city: city || "Unknown",       // NOT NULL field
        country: country || "Unknown", // NOT NULL field
        capacity: capacity || 0,
        description: description || "",
        website: website || "",
        contactEmail: contactEmail || "",
        contactPhone: contactPhone || "",
        image: image || "",
        latitude: latitude || 0,
        longitude: longitude || 0,
        creatorId: req.user.id         // Re-enabled since column exists now
      });

      res.status(201).json(venue);
    } catch (err) {
      console.error('Venue creation error:', err.message);
      res.status(500).send('Server Error');
    }
  }
);

/**
 * @route   GET /api/venues/:id
 * @desc    Get venue by ID
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const venue = await Venue.findByPk(req.params.id, {
      include: [
        {
          model: Event,
          as: 'events',
          attributes: ['id', 'name', 'startDate', 'endDate', 'type', 'banner']
        }
      ]
    });
    
    if (!venue) {
      return res.status(404).json({ msg: 'Venue not found' });
    }

    res.json(venue);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   PUT /api/venues/:id
 * @desc    Update a venue
 * @access  Private
 */
router.put('/:id', 
  [
    auth,
    body('name').optional().notEmpty().withMessage('Venue name cannot be empty'),
    body('address').optional().notEmpty().withMessage('Venue address cannot be empty'),
    body('capacity').optional().isNumeric().withMessage('Capacity must be a number'),
    body('website').optional().isURL().withMessage('Website must be a valid URL'),
    body('contactEmail').optional().isEmail().withMessage('Contact email must be valid')
  ], 
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const venue = await Venue.findByPk(req.params.id);
      
      if (!venue) {
        return res.status(404).json({ msg: 'Venue not found' });
      }

      // Check permissions - only creator or admin can update
      if (venue.creatorId && venue.creatorId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Not authorized to update this venue' });
      }

      // Update venue fields
      const updatableFields = [
        'name', 'address', 'city', 'country', 'capacity', 
        'description', 'website', 'contactEmail', 'contactPhone', 
        'image', 'latitude', 'longitude'
      ];
      
      // Update only fields that are provided in the request
      for (const field of updatableFields) {
        if (req.body[field] !== undefined) {
          // Ensure NOT NULL fields don't get set to null
          if (field === 'city' || field === 'country') {
            venue[field] = req.body[field] || venue[field];
          } else {
            venue[field] = req.body[field];
          }
        }
      }

      await venue.save();
      res.json(venue);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

/**
 * @route   DELETE /api/venues/:id
 * @desc    Delete a venue
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const venue = await Venue.findByPk(req.params.id);
    
    if (!venue) {
      return res.status(404).json({ msg: 'Venue not found' });
    }

    // Check permissions - only creator or admin can delete
    if (venue.creatorId && venue.creatorId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to delete this venue' });
    }

    // Check if venue has events
    const eventCount = await Event.count({ where: { venueId: req.params.id } });
    if (eventCount > 0) {
      return res.status(400).json({ 
        msg: 'Cannot delete venue that has events. Please delete or reassign the events first.' 
      });
    }

    await venue.destroy();
    res.json({ msg: 'Venue removed successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   GET /api/venues/search
 * @desc    Search for venues by name or location
 * @access  Private
 */
router.get('/search', auth, async (req, res) => {
  try {
    const { query, city, country } = req.query;
    const whereClause = {};
    
    if (query) {
      whereClause.name = { [Op.like]: `%${query}%` };
    }
    
    if (city) {
      whereClause.city = { [Op.like]: `%${city}%` };
    }
    
    if (country) {
      whereClause.country = { [Op.like]: `%${country}%` };
    }
    
    const venues = await Venue.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'address', 'city', 'country', 'capacity'],
      order: [['name', 'ASC']]
    });
    
    res.json(venues);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
