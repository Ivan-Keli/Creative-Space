// C:\Projects\creativespace\routes\eventsRoutes.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const paypal = require('@paypal/checkout-server-sdk');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { sendEmail } = require('../services/emailService');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');
const { uploadEventBanner } = require('../middleware/multer');
const upload = require('../middleware/upload');

// Import Sequelize models
const { User, Event, Venue, Transaction, EventTicket, Notification } = require('../models');
const { Op } = require('sequelize');

// PayPal configuration
let environment;
if (process.env.NODE_ENV === 'production') {
  environment = new paypal.core.LiveEnvironment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET
  );
} else {
  environment = new paypal.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET
  );
}
const paypalClient = new paypal.core.PayPalHttpClient(environment);

/**
 * @route   GET /api/events
 * @desc    Get all events
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const events = await Event.findAll({
      include: [{
        model: Venue,
        attributes: ['name', 'country']
      }],
      order: [['startDate', 'ASC']]
    });

    res.json({ events });
  } catch (err) {
    console.error('Error fetching events:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/events/:id
 * @desc    Get event by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findByPk(req.params.id, {
      include: [
        {
          model: Venue,
          attributes: ['name', 'address', 'country', 'city']
        },
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!event) {
      return res.status(404).json({ msg: 'Event not found' });
    }

    res.json(event);
  } catch (err) {
    console.error('Error fetching event:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   POST /api/events
 * @desc    Create a new event
 * @access  Private (Creators and Admins)
 */
router.post(
  '/',
  [
    auth,
    [
      body('name', 'Event name is required').not().isEmpty(),
      body('type', 'Event type is required').not().isEmpty(),
      body('startDate', 'Start date is required').not().isEmpty(),
      body('endDate', 'End date is required').not().isEmpty(),
      body('venueId', 'Venue information is required').not().isEmpty(),
    ],
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if user is creator or admin
    if (req.user.role !== 'creator' && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to create events' });
    }

    const {
      name,
      type,
      description,
      startDate,
      endDate,
      startTime,
      endTime,
      venueId,
      image,
      ticketPrice,
      isFeatured,
      popularity
    } = req.body;

    try {
      // Create event object
      const newEvent = await Event.create({
        name,
        type,
        description,
        startDate,
        endDate,
        startTime,
        endTime,
        venueId,
        image,
        ticketPrice,
        organizerId: req.user.id,
        isFeatured: req.user.role === 'admin' ? (isFeatured || false) : false,
        popularity: popularity || 0
      });
      
      // Notify admins about new event
      if (req.io) {
        req.io.to('admin_room').emit('admin_notification', {
          type: 'new_event',
          message: `New event "${name}" created by ${req.user.name}`,
          data: {
            eventId: newEvent.id,
            creatorId: req.user.id
          }
        });
      }
      
      // Load the created event with venue
      const event = await Event.findByPk(newEvent.id, {
        include: [{
          model: Venue,
          attributes: ['name', 'country']
        }]
      });
      
      res.json(event);
    } catch (err) {
      console.error('Error creating event:', err.message);
      res.status(500).send('Server error');
    }
  }
);

/**
 * @route   PUT /api/events/:id
 * @desc    Update an event
 * @access  Private (Event creator or Admin)
 */
router.put('/:id', auth, async (req, res) => {
  const {
    name,
    type,
    description,
    startDate,
    endDate,
    startTime,
    endTime,
    venueId,
    image,
    ticketPrice,
    isFeatured,
    popularity
  } = req.body;

  try {
    const event = await Event.findByPk(req.params.id);

    if (!event) {
      return res.status(404).json({ msg: 'Event not found' });
    }

    // Check if user is the event creator or an admin
    if (event.organizerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to update this event' });
    }

    // Build event object
    const eventFields = {};
    if (name) eventFields.name = name;
    if (type) eventFields.type = type;
    if (description) eventFields.description = description;
    if (startDate) eventFields.startDate = startDate;
    if (endDate) eventFields.endDate = endDate;
    if (startTime) eventFields.startTime = startTime;
    if (endTime) eventFields.endTime = endTime;
    if (venueId) eventFields.venueId = venueId;
    if (image) eventFields.image = image;
    if (ticketPrice) eventFields.ticketPrice = ticketPrice;
    
    // Only admins can update isFeatured and popularity
    if (req.user.role === 'admin') {
      if (isFeatured !== undefined) eventFields.isFeatured = isFeatured;
      if (popularity !== undefined) eventFields.popularity = popularity;
    }

    // Update
    await event.update(eventFields);
    
    // Reload the event with venue
    await event.reload({
      include: [{
        model: Venue,
        attributes: ['name', 'country']
      }]
    });

    res.json(event);
  } catch (err) {
    console.error('Error updating event:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   DELETE /api/events/:id
 * @desc    Delete an event
 * @access  Private (Event creator or Admin)
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findByPk(req.params.id);

    if (!event) {
      return res.status(404).json({ msg: 'Event not found' });
    }

    // Check if user is the event creator or an admin
    if (event.organizerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to delete this event' });
    }

    await event.destroy();
    res.json({ msg: 'Event removed' });
  } catch (err) {
    console.error('Error deleting event:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/events/type/:type
 * @desc    Get events by type
 * @access  Public
 */
router.get('/type/:type', async (req, res) => {
  try {
    const events = await Event.findAll({
      where: { type: req.params.type },
      include: [{
        model: Venue,
        attributes: ['name', 'country']
      }],
      order: [['startDate', 'ASC']]
    });

    res.json({ events });
  } catch (err) {
    console.error('Error fetching events by type:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/events/venue/:venueId
 * @desc    Get events by venue
 * @access  Public
 */
router.get('/venue/:venueId', async (req, res) => {
  try {
    const events = await Event.findAll({
      where: { venueId: req.params.venueId },
      include: [{
        model: Venue,
        attributes: ['name', 'country']
      }],
      order: [['startDate', 'ASC']]
    });

    res.json({ events });
  } catch (err) {
    console.error('Error fetching events by venue:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/events/featured
 * @desc    Get featured events
 * @access  Public
 */
router.get('/featured', async (req, res) => {
  try {
    const events = await Event.findAll({
      where: { isFeatured: true },
      include: [{
        model: Venue,
        attributes: ['name', 'country']
      }],
      order: [['startDate', 'ASC']]
    });

    res.json({ events });
  } catch (err) {
    console.error('Error fetching featured events:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/events/creator/:creatorId
 * @desc    Get events by creator ID
 * @access  Public
 */
router.get('/creator/:creatorId', async (req, res) => {
  try {
    const events = await Event.findAll({
      where: { organizerId: req.params.creatorId },
      include: [{
        model: Venue,
        attributes: ['name', 'country']
      }],
      order: [['startDate', 'ASC']]
    });

    res.json({ events });
  } catch (err) {
    console.error('Error fetching creator events:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/events/search/:query
 * @desc    Search events by name or description
 * @access  Public
 */
router.get('/search/:query', async (req, res) => {
  try {
    const searchQuery = req.params.query;
    
    const events = await Event.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `%${searchQuery}%` } },
          { description: { [Op.like]: `%${searchQuery}%` } }
        ]
      },
      include: [{
        model: Venue,
        attributes: ['name', 'country']
      }],
      order: [['startDate', 'ASC']]
    });

    res.json({ events });
  } catch (err) {
    console.error('Error searching events:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/events/date/:startDate/:endDate
 * @desc    Get events within a date range
 * @access  Public
 */
router.get('/date/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    
    const events = await Event.findAll({
      where: {
        [Op.or]: [
          {
            startDate: {
              [Op.between]: [new Date(startDate), new Date(endDate)]
            }
          },
          {
            endDate: {
              [Op.between]: [new Date(startDate), new Date(endDate)]
            }
          }
        ]
      },
      include: [{
        model: Venue,
        attributes: ['name', 'country']
      }],
      order: [['startDate', 'ASC']]
    });

    res.json({ events });
  } catch (err) {
    console.error('Error fetching events by date range:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/events/my-events
 * @desc    Get all events created by the logged-in user
 * @access  Private
 */
router.get('/my-events', auth, async (req, res) => {
  try {
    const events = await Event.findAll({
      where: { organizerId: req.user.id },
      include: [{
        model: Venue,
        attributes: ['name', 'country']
      }],
      order: [['startDate', 'ASC']]
    });

    res.json({ events });
  } catch (err) {
    console.error('Error fetching user events:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   POST /api/events/:id/purchase
 * @desc    Purchase tickets for an event
 * @access  Private (requires authentication)
 */
router.post('/:id/purchase', auth, async (req, res) => {
  try {
    const { quantity, paymentMethodId } = req.body;
    
    if (!quantity || quantity < 1) {
      return res.status(400).json({ msg: 'Please specify a valid ticket quantity' });
    }

    // Get the event
    const event = await Event.findByPk(req.params.id, {
      include: [
        {
          model: Venue,
          attributes: ['name', 'address', 'country', 'city']
        },
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'name', 'email']
        }
      ]
    });
      
    if (!event) {
      return res.status(404).json({ msg: 'Event not found' });
    }

    // Get user details (for email)
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Calculate total price
    const totalPrice = parseFloat(event.ticketPrice) * quantity;

    // 1. Create a transaction record
    const transaction = await Transaction.create({
      userId: req.user.id, // Use userId instead of user
      buyerId: req.user.id,
      sellerId: event.organizerId,
      amount: totalPrice,
      type: 'event_ticket',
      status: 'pending',
      details: JSON.stringify({
        eventId: event.id,
        eventName: event.name,
        ticketQuantity: quantity,
        ticketPrice: event.ticketPrice,
        purchaseDate: new Date()
      })
    });

    // 3. Create PayPal Order
    let paymentResult;
    try {
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD', // You can change this to your preferred currency
            value: totalPrice.toString()
          },
          description: `${quantity} ticket(s) for ${event.name}`
        }],
        application_context: {
          brand_name: 'CreativeSpace',
          landing_page: 'BILLING',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: `${process.env.CLIENT_URL}/events/payment-success`,
          cancel_url: `${process.env.CLIENT_URL}/events/payment-cancel`
        }
      });

      const order = await paypalClient.execute(request);
      
      paymentResult = {
        success: true,
        transactionId: order.result.id,
        paymentStatus: order.result.status,
        paymentDate: new Date(),
        paypalOrderId: order.result.id,
        approveUrl: order.result.links.find(link => link.rel === 'approve').href
      };
      
      // Update transaction with PayPal order ID
      const transactionDetails = JSON.parse(transaction.details);
      transactionDetails.paypalOrderId = order.result.id;
      await transaction.update({
        details: JSON.stringify(transactionDetails)
      });
      
    } catch (paymentError) {
      // Update transaction to failed
      await transaction.update({
        status: 'failed',
        details: JSON.stringify({
          ...JSON.parse(transaction.details),
          failureReason: paymentError.message
        })
      });

      return res.status(400).json({ 
        msg: 'Payment processing failed', 
        error: paymentError.message 
      });
    }

    // 4. Generate tickets (pending payment confirmation)
    const tickets = [];
    for (let i = 0; i < quantity; i++) {
      const ticketCode = generateUniqueTicketCode(event.id, req.user.id);
      
      const ticket = await EventTicket.create({
        eventId: event.id,
        userId: req.user.id,
        transactionId: transaction.id,
        ticketCode,
        status: 'pending_payment', // Will be activated once payment is confirmed
        purchaseDate: new Date(),
        eventName: event.name,
        eventDate: event.startDate,
        eventTime: event.startTime,
        venueName: event.Venue?.name || 'Venue TBA',
        venueAddress: event.Venue?.address,
        venueCity: event.Venue?.city,
        venueCountry: event.Venue?.country,
        ticketPrice: event.ticketPrice
      });

      tickets.push(ticket);
    }

    // 5. Send notification to event organizer
    try {
      // Create notification
      await Notification.create({
        userId: event.organizer.id,
        type: 'ticket_purchase',
        message: `${user.name} purchased ${quantity} ticket(s) for your event: ${event.name}`,
        isRead: false,
        metadata: JSON.stringify({
          eventId: event.id,
          transactionId: transaction.id
        })
      });

      // Send real-time notification via socket.io
      if (req.io) {
        req.io.to(`user_${event.organizer.id}`).emit('new_notification', {
          type: 'ticket_purchase',
          message: `${user.name} purchased ${quantity} ticket(s) for your event: ${event.name}`,
          eventId: event.id,
          transactionId: transaction.id
        });
      }
    } catch (notificationError) {
      console.error('Error sending notification:', notificationError);
      // Continue execution, notification failure shouldn't stop the purchase
    }

    // 6. Send confirmation email to buyer
    try {
      const ticketListHtml = tickets.map(ticket => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticket.ticketCode}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${event.name}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${new Date(event.startDate).toLocaleDateString()} ${event.startTime}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${event.Venue?.name || 'Venue TBA'}</td>
        </tr>
      `).join('');

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3f51b5;">Ticket Purchase Confirmation</h2>
          <p>Hello ${user.name},</p>
          <p>Thank you for purchasing tickets to <strong>${event.name}</strong>.</p>
          <p>Please complete your payment by clicking the PayPal payment link. Your tickets will be activated once the payment is confirmed.</p>
          
          <div style="background-color: #f7f7f7; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <h3 style="margin-top: 0;">Purchase Summary</h3>
            <p><strong>Event:</strong> ${event.name}</p>
            <p><strong>Date:</strong> ${new Date(event.startDate).toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${event.startTime || 'TBA'}</p>
            <p><strong>Venue:</strong> ${event.Venue?.name || 'TBA'}</p>
            <p><strong>Quantity:</strong> ${quantity} tickets</p>
            <p><strong>Total:</strong> $${totalPrice}</p>
            <p><strong>Transaction ID:</strong> ${transaction.id}</p>
          </div>
          
          <a href="${paymentResult.approveUrl}" style="display: inline-block; background-color: #f57c00; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; margin: 20px 0;">Complete Payment on PayPal</a>
          
          <p>Your tickets are pending until payment is confirmed. We'll send you the activated tickets once payment is complete.</p>
          
          <p style="margin-top: 30px; font-size: 0.9em; color: #777;">If you have any questions, please contact us at support@creativespace.com</p>
        </div>
      `;

      await sendEmail({
        to: user.email,
        subject: `Ticket Purchase Confirmation - ${event.name}`,
        html: emailHtml
      });
    } catch (emailError) {
      console.error('Error sending confirmation email:', emailError);
      // Continue execution, email failure shouldn't stop the purchase
    }
    
    // 7. Return response with ticket and payment info
    res.json({ 
      msg: 'Tickets reserved successfully. Please complete payment.',
      paymentUrl: paymentResult.approveUrl,
      paymentId: paymentResult.paypalOrderId,
      tickets: tickets.map(ticket => ({
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        status: ticket.status,
        event: {
          id: event.id,
          name: event.name,
          date: new Date(event.startDate).toLocaleDateString(),
          time: event.startTime,
          venue: event.Venue?.name
        }
      })),
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        status: transaction.status,
        date: transaction.createdAt
      }
    });
    
  } catch (err) {
    console.error('Error purchasing ticket:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   POST /api/events/confirm-payment
 * @desc    Confirm PayPal payment and activate tickets
 * @access  Private
 */
router.post('/confirm-payment', auth, async (req, res) => {
  try {
    const { paypalOrderId } = req.body;
    
    if (!paypalOrderId) {
      return res.status(400).json({ msg: 'PayPal order ID is required' });
    }
    
    // Find transaction
    const transactions = await Transaction.findAll({
      where: {
        userId: req.user.id,
        status: 'pending'
      }
    });
    
    // Find the transaction with the matching PayPal order ID in the details
    let transaction = null;
    for (const t of transactions) {
      try {
        const details = JSON.parse(t.details);
        if (details.paypalOrderId === paypalOrderId) {
          transaction = t;
          break;
        }
      } catch (e) {
        // Skip if transaction details can't be parsed
        continue;
      }
    }
    
    if (!transaction) {
      return res.status(404).json({ msg: 'Transaction not found' });
    }
    
    // Capture the PayPal order
    const request = new paypal.orders.OrdersCaptureRequest(paypalOrderId);
    request.requestBody({});
    
    const capture = await paypalClient.execute(request);
    
    if (capture.result.status !== 'COMPLETED') {
      return res.status(400).json({ msg: 'Payment not completed' });
    }
    
    // Update transaction
    const details = JSON.parse(transaction.details);
    details.paymentInfo = {
      captureId: capture.result.purchase_units[0].payments.captures[0].id,
      captureStatus: capture.result.purchase_units[0].payments.captures[0].status,
      captureDate: new Date()
    };
    
    await transaction.update({
      status: 'completed',
      details: JSON.stringify(details)
    });
    
    // Activate tickets
    const tickets = await EventTicket.findAll({
      where: {
        transactionId: transaction.id,
        status: 'pending_payment'
      }
    });
    
    for (const ticket of tickets) {
      await ticket.update({ status: 'active' });
    }
    
    // Get event details for email
    const event = await Event.findByPk(details.eventId, {
      include: [{
        model: Venue,
        attributes: ['name', 'address', 'country', 'city']
      }]
    });
    
    // Get user details
    const user = await User.findByPk(req.user.id);
    
    // Send confirmation email with activated tickets
    try {
      const ticketListHtml = tickets.map(ticket => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticket.ticketCode}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${event.name}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${new Date(event.startDate).toLocaleDateString()} ${event.startTime}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${event.Venue?.name || 'Venue TBA'}</td>
        </tr>
      `).join('');

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3f51b5;">Your Tickets Are Ready!</h2>
          <p>Hello ${user.name},</p>
          <p>Your payment has been confirmed and your tickets for <strong>${event.name}</strong> are now active.</p>
          
          <div style="background-color: #f7f7f7; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <h3 style="margin-top: 0;">Event Details</h3>
            <p><strong>Event:</strong> ${event.name}</p>
            <p><strong>Date:</strong> ${new Date(event.startDate).toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${event.startTime || 'TBA'}</p>
            <p><strong>Venue:</strong> ${event.Venue?.name || 'TBA'}</p>
            <p><strong>Address:</strong> ${event.Venue?.address || ''}, ${event.Venue?.city || ''}</p>
          </div>
          
          <h3>Your Tickets:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f2f2f2;">
                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Ticket Code</th>
                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Event</th>
                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Date & Time</th>
                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Venue</th>
              </tr>
            </thead>
            <tbody>
              ${ticketListHtml}
            </tbody>
          </table>
          
          <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 5px;">
            <p style="margin-top: 0;"><strong>Important:</strong> Please bring your ticket codes and a valid ID to the event.</p>
          </div>
          
          <p style="margin-top: 30px; font-size: 0.9em; color: #777;">If you have any questions, please contact us at support@creativespace.com</p>
        </div>
      `;

      await sendEmail({
        to: user.email,
        subject: `Your Tickets for ${event.name} - Payment Confirmed`,
        html: emailHtml
      });
    } catch (emailError) {
      console.error('Error sending ticket confirmation email:', emailError);
      // Continue execution, email failure shouldn't stop the process
    }
    
    // Return success response
    res.json({
      msg: 'Payment confirmed and tickets activated',
      tickets: tickets.map(ticket => ({
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        status: ticket.status
      })),
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        status: transaction.status
      }
    });
    
  } catch (err) {
    console.error('Error confirming payment:', err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/events/my-tickets
 * @desc    Get tickets purchased by the logged-in user
 * @access  Private
 */
router.get('/my-tickets', auth, async (req, res) => {
  try {
    const tickets = await EventTicket.findAll({
      where: { userId: req.user.id },
      include: [
        {
          model: Event,
          include: [
            {
              model: Venue,
              attributes: ['name', 'address', 'city', 'country']
            }
          ]
        }
      ],
      order: [['purchaseDate', 'DESC']]
    });
      
    res.json({ tickets });
  } catch (err) {
    console.error('Error fetching user tickets:', err.message);
    res.status(500).send('Server error');
  }
});

// Add this to your existing eventsRoutes.js

// Upload event - Only Creators can upload
router.post('/upload', authMiddleware, authorize(['creator']), uploadEventBanner, async (req, res) => {
  console.log("User Data from Token:", req.user);
  console.log("Received Request Data:", req.body);
  console.log("Received File:", req.file);

  try {
      const { 
          title, 
          description, 
          date,
          time,
          location,
          price, 
          maxAttendees,
          contactEmail,
          rsvpLink,
          speakerInfo,
          category, 
          selectedTags, 
          copyrightInfo 
      } = req.body;
      
      const organizerId = req.user.id;

      // Parse tags if they're sent as JSON string
      const tags = typeof selectedTags === 'string' ? JSON.parse(selectedTags) : selectedTags || [];

      // Basic validation
      if (!title || !description || !date || !time || !location) {
          return res.status(400).json({ error: "Required fields missing" });
      }

      if (!req.file) {
          return res.status(400).json({ error: "Event banner is required" });
      }

      // Create the event
      const eventDateTime = new Date(`${date}T${time}`);
      
      const event = await Event.create({
          title,
          description,
          dateTime: eventDateTime,
          location,
          price: price ? parseFloat(price) : 0,
          maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
          contactEmail,
          rsvpLink,
          speakerInfo,
          bannerImage: req.file.path,
          categoryId: category || null,
          status: 'active',
          organizerId,
          metadata: {
              copyrightInfo,
              fileType: req.file.mimetype
          }
      });

      // Handle tags similar to artwork and photos
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
                  
                  // Create mapping - adjust this based on your event-tag relationship
                  try {
                      await sequelize.query(
                          `INSERT INTO EventTags (eventId, tagId, createdAt, updatedAt) 
                           VALUES (?, ?, NOW(), NOW())`,
                          {
                              replacements: [event.id, newTag.id],
                              type: sequelize.QueryTypes.INSERT
                          }
                      );
                  } catch (error) {
                      console.warn(`Error creating tag mapping: ${error.message}`);
                  }
                  
                  legacyTagNames.push(tagName);
              } else {
                  // Handle existing tag
                  const existingTag = await ArtworkTag.findByPk(tag);
                  if (existingTag) {
                      // Increment use count
                      await existingTag.increment('useCount');
                      
                      // Create mapping - adjust this based on your event-tag relationship
                      try {
                          await sequelize.query(
                              `INSERT INTO EventTags (eventId, tagId, createdAt, updatedAt) 
                               VALUES (?, ?, NOW(), NOW())`,
                              {
                                  replacements: [event.id, existingTag.id],
                                  type: sequelize.QueryTypes.INSERT
                              }
                          );
                      } catch (error) {
                          console.warn(`Error creating tag mapping: ${error.message}`);
                      }
                      
                      legacyTagNames.push(existingTag.name);
                  }
              }
          }
          
          // If you have a legacy tags field for events
          if (event.metadata && legacyTagNames.length > 0) {
              await event.update({ 
                metadata: {
                  ...event.metadata,
                  tags: legacyTagNames
              } 
          });
      }
  }

  res.status(201).json({
      success: true,
      message: "Event created successfully",
      event
  });
} catch (error) {
  console.error("Error creating event:", error);
  res.status(500).json({
      success: false,
      error: "Error creating event",
      details: error.message
  });
}
});

/**
 * Helper function to generate a unique ticket code
 */
function generateUniqueTicketCode(eventId, userId) {
  const eventPrefix = eventId.toString().substring(0, 4);
  const userSuffix = userId.toString().substring(0, 4);
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  const timestamp = Date.now().toString(36).substring(4, 10).toUpperCase();
  
  return `TKT-${eventPrefix}-${randomPart}-${timestamp}-${userSuffix}`;
}

module.exports = router;
