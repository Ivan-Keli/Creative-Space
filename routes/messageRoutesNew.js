const express = require('express');
const router = express.Router();
const { Message, User, Conversation, Artwork } = require('../models');
const { authMiddleware } = require('../middleware/authMiddleware');
const events = require('../events');
const socketManager = require('../socket-manager');
const { Op } = require('sequelize');

// ✅ NEW ENDPOINT: Create a new conversation
router.post('/conversations', authMiddleware, async (req, res) => {
    try {
        const { receiverId, message, artworkId, isOfficial } = req.body;
        const senderId = req.user.id;

        if (!receiverId || !message) {
            return res.status(400).json({ error: 'Receiver ID and message are required' });
        }

        // Validate receiver exists
        const receiver = await User.findByPk(receiverId);
        if (!receiver) {
            return res.status(404).json({ error: 'Receiver not found' });
        }

        // Check if artwork exists if artworkId is provided
        let artwork = null;
        if (artworkId) {
            artwork = await Artwork.findByPk(artworkId);
            if (!artwork) {
                return res.status(404).json({ error: 'Artwork not found' });
            }
        }

        // Check if conversation already exists between these users
        let conversation = await Conversation.findOne({
            where: {
                [Op.or]: [
                    { participant1Id: senderId, participant2Id: receiverId },
                    { participant1Id: receiverId, participant2Id: senderId }
                ]
            }
        });

        // Create new conversation if it doesn't exist
        if (!conversation) {
            conversation = await Conversation.create({
                participant1Id: senderId,
                participant2Id: receiverId,
                lastMessageAt: new Date(),
                lastMessageContent: message.substring(0, 50), // Store preview of message
                // Store artwork reference if provided
                ...(artworkId && { relatedArtworkId: artworkId }),
                isOfficial: isOfficial || false
            });
        }

        // Create the first message
        const newMessage = await Message.create({
            senderId,
            receiverId,
            content: message,
            conversationId: conversation.id,
            status: 'sent',
            ...(artworkId && { artworkId }) // Add artwork reference if provided
        });

        // Update conversation's last message details
        await conversation.update({
            lastMessageAt: new Date(),
            lastMessageContent: message.substring(0, 50)
        });

        // Get populated conversation data for response
        const populatedConversation = await Conversation.findByPk(conversation.id, {
            include: [
                {
                    model: User,
                    as: 'participant1',
                    attributes: ['id', 'name', 'profilePicture', 'role']
                },
                {
                    model: User,
                    as: 'participant2',
                    attributes: ['id', 'name', 'profilePicture', 'role']
                },
                {
                    model: Artwork,
                    as: 'relatedArtwork',
                    attributes: ['id', 'title', 'imageUrl', 'price'],
                    required: false
                }
            ]
        });

        // Format the response for the new UI
        const otherUser = populatedConversation.participant1Id === senderId 
            ? populatedConversation.participant2 
            : populatedConversation.participant1;

        const formattedResponse = {
            id: populatedConversation.id,
            participants: [populatedConversation.participant1, populatedConversation.participant2],
            otherUser: otherUser,
            lastMessage: message,
            lastMessageTime: new Date(),
            unread: 0,
            isOfficial: populatedConversation.isOfficial || false,
            artwork: populatedConversation.relatedArtwork || null
        };

        // Emit real-time notification to receiver if online
        const io = socketManager.getIO();
        if (io) {
            io.emit('message_notification', {
                senderId,
                receiverId,
                content: message,
                conversationId: conversation.id
            });
        }

        res.status(201).json({
            message: 'Conversation started successfully',
            conversation: formattedResponse,
            firstMessage: newMessage
        });
    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ error: 'Error creating conversation', details: error.message });
    }
});

// Send a message in an existing conversation
router.post('/conversations/:id/reply', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const senderId = req.user.id;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        // Find the conversation
        const conversation = await Conversation.findByPk(id);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Verify the user is part of this conversation
        if (conversation.participant1Id !== senderId && conversation.participant2Id !== senderId) {
            return res.status(403).json({ error: 'Not authorized to message in this conversation' });
        }

        // Determine the receiver
        const receiverId = conversation.participant1Id === senderId
            ? conversation.participant2Id
            : conversation.participant1Id;

        // Create the message
        const newMessage = await Message.create({
            senderId,
            receiverId,
            content,
            conversationId: id,
            status: 'sent'
        });

        // Update conversation's last message details
        await conversation.update({
            lastMessageAt: new Date(),
            lastMessageContent: content.substring(0, 50)
        });

        // Emit real-time notification to receiver if online
        const io = socketManager.getIO();
        if (io) {
            io.emit('message_received', {
                conversationId: id,
                message: newMessage
            });
        }

        res.status(201).json(newMessage);
    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({ error: 'Error sending message', details: error.message });
    }
});

// Send a message (Buyer → Creator) - Legacy support
router.post('/send', authMiddleware, async (req, res) => {
    try {
        const { receiverId, content, conversationId } = req.body;
        const senderId = req.user.id;

        // Validate receiver exists
        const receiver = await User.findByPk(receiverId);
        if (!receiver) {
            return res.status(404).json({ error: 'Receiver not found' });
        }

        let conversation;
        
        // Find or create conversation
        if (conversationId) {
            conversation = await Conversation.findByPk(conversationId);
            if (!conversation) {
                return res.status(404).json({ error: 'Conversation not found' });
            }
            
            // Verify the user is part of this conversation
            if (conversation.participant1Id !== senderId && conversation.participant2Id !== senderId) {
                return res.status(403).json({ error: 'Not authorized to message in this conversation' });
            }
        } else {
            // Check if conversation already exists
            conversation = await Conversation.findOne({
                where: {
                    [Op.or]: [
                        { participant1Id: senderId, participant2Id: receiverId },
                        { participant1Id: receiverId, participant2Id: senderId }
                    ]
                }
            });
            
            // Create new conversation if it doesn't exist
            if (!conversation) {
                conversation = await Conversation.create({
                    participant1Id: senderId,
                    participant2Id: receiverId,
                    lastMessageAt: new Date()
                });
            }
        }

        // Create message
        const message = await Message.create({ 
            senderId, 
            receiverId, 
            content,
            conversationId: conversation.id,
            status: 'sent'
        });

        // Update conversation's last message time
        await conversation.update({ 
            lastMessageAt: new Date(),
            lastMessageContent: content.substring(0, 50) // Store preview of message
        });

        // Emit real-time notification to receiver if online
        const io = socketManager.getIO();
        if (io) {
            io.emit('message_notification', { 
                senderId, 
                receiverId, 
                content,
                conversationId: conversation.id
            });
        }

        res.status(201).json({ 
            message: 'Message sent successfully', 
            data: message,
            conversationId: conversation.id
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Error sending message' });
    }
});

// Get all conversations for a user
router.get('/conversations/:userId', authMiddleware, async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Ensure the requesting user is accessing their own conversations or is an admin
        if (req.user.id != userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to access these conversations' });
        }
        
        // First try to get conversations from the Conversation model
        const conversations = await Conversation.findAll({
            where: {
                [Op.or]: [
                    { participant1Id: userId },
                    { participant2Id: userId }
                ]
            },
            include: [
                {
                    model: User,
                    as: 'participant1',
                    attributes: ['id', 'name', 'profilePicture', 'role', 'email']
                },
                {
                    model: User,
                    as: 'participant2',
                    attributes: ['id', 'name', 'profilePicture', 'role', 'email']
                },
                {
                    model: Artwork,
                    as: 'relatedArtwork',
                    attributes: ['id', 'title', 'imageUrl', 'price', 'description'],
                    required: false
                }
            ],
            order: [['lastMessageAt', 'DESC']]
        });
        
        if (conversations && conversations.length > 0) {
            // Format conversations for the new UI
            const formattedConversations = await Promise.all(conversations.map(async (conv) => {
                const otherUser = conv.participant1Id == userId ? conv.participant2 : conv.participant1;
                
                // Count unread messages
                const unreadCount = await Message.count({
                    where: {
                        conversationId: conv.id,
                        receiverId: userId,
                        status: 'sent'
                    }
                });
                
                return {
                    id: conv.id,
                    participants: [conv.participant1, conv.participant2],
                    otherUser: otherUser,
                    lastMessage: conv.lastMessageContent || '',
                    lastMessageTime: conv.lastMessageAt,
                    unread: unreadCount,
                    isOfficial: conv.isOfficial || false,
                    artwork: conv.relatedArtwork || null
                };
            }));
            
            return res.json(formattedConversations);
        }
        
        // Fallback: For backward compatibility without Conversation model, create a synthesized response
        try {
            // Find all messages where the user is either sender or receiver
            const messages = await Message.findAll({
                where: {
                    [Op.or]: [
                        { senderId: userId },
                        { receiverId: userId }
                    ]
                },
                include: [
                    {
                        model: User,
                        as: 'sender',
                        attributes: ['id', 'name', 'profilePicture', 'role', 'email']
                    },
                    {
                        model: User,
                        as: 'receiver',
                        attributes: ['id', 'name', 'profilePicture', 'role', 'email']
                    }
                ],
                order: [['createdAt', 'DESC']]
            });
            
            // Group messages by conversation (other participant)
            const conversationsMap = {};
            messages.forEach(msg => {
                const otherUser = msg.senderId == userId ? msg.receiver : msg.sender;
                const otherUserId = otherUser.id;
                
                if (!conversationsMap[otherUserId]) {
                    conversationsMap[otherUserId] = {
                        id: `legacy-${otherUserId}`,
                        participants: [msg.sender, msg.receiver],
                        otherUser,
                        lastMessage: msg.content,
                        lastMessageTime: msg.createdAt,
                        unread: (msg.receiverId === userId && msg.status === 'sent') ? 1 : 0
                    };
                } else {
                    // Just update the unread count
                    if (msg.receiverId === userId && msg.status === 'sent') {
                        conversationsMap[otherUserId].unread++;
                    }
                    
                    // Only update last message if this is more recent
                    if (new Date(msg.createdAt) > new Date(conversationsMap[otherUserId].lastMessageTime)) {
                        conversationsMap[otherUserId].lastMessage = msg.content;
                        conversationsMap[otherUserId].lastMessageTime = msg.createdAt;
                    }
                }
            });
            
            // Convert to array and sort by most recent message
            const formattedConversations = Object.values(conversationsMap)
                .sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
            
            res.json(formattedConversations);
        } catch (error) {
            console.error('Error creating legacy conversations view:', error);
            // Return empty array as fallback
            res.json([]);
        }
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: 'Error fetching conversations' });
    }
});

// Get a single conversation by ID
router.get('/conversations/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const conversation = await Conversation.findByPk(id, {
            include: [
                {
                    model: User,
                    as: 'participant1',
                    attributes: ['id', 'name', 'profilePicture', 'role', 'email']
                },
                {
                    model: User,
                    as: 'participant2',
                    attributes: ['id', 'name', 'profilePicture', 'role', 'email']
                },
                {
                    model: Artwork,
                    as: 'relatedArtwork',
                    attributes: ['id', 'title', 'imageUrl', 'price', 'description'],
                    required: false
                }
            ]
        });
        
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        
        // Check if the user is a participant
        const isParticipant = conversation.participant1Id === req.user.id || 
                             conversation.participant2Id === req.user.id;
        
        if (!isParticipant && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to view this conversation' });
        }
        
        // Format the conversation for response
        const artwork = conversation.relatedArtwork ? {
            id: conversation.relatedArtwork.id,
            title: conversation.relatedArtwork.title,
            price: conversation.relatedArtwork.price,
            image: conversation.relatedArtwork.imageUrl,
            description: conversation.relatedArtwork.description
        } : null;
        
        const formattedConversation = {
            id: conversation.id,
            participants: [conversation.participant1, conversation.participant2],
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            isOfficial: conversation.isOfficial || false,
            artwork
        };
        
        res.status(200).json(formattedConversation);
    } catch (error) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({ error: 'Failed to fetch conversation', details: error.message });
    }
});

// Get messages for a specific conversation
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        // Special handling for legacy IDs (they start with 'legacy-')
        if (id.startsWith('legacy-')) {
            const otherUserId = id.replace('legacy-', '');
            
            // Find all messages between these two users
            const messages = await Message.findAll({
                where: {
                    [Op.or]: [
                        { senderId: userId, receiverId: otherUserId },
                        { senderId: otherUserId, receiverId: userId }
                    ]
                },
                include: [
                    {
                        model: User,
                        as: 'sender',
                        attributes: ['id', 'name', 'profilePicture', 'role']
                    }
                ],
                order: [['createdAt', 'ASC']]
            });
            
            // Mark all messages as read if user is the receiver
            await Message.update(
                { status: 'read' },
                {
                    where: { 
                        senderId: otherUserId,
                        receiverId: userId,
                        status: 'sent'
                    }
                }
            );
            
            return res.json(messages);
        }
        
        // Regular conversation handling
        // Verify the conversation exists
        const conversation = await Conversation.findByPk(id);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        
        // Verify the user is part of this conversation
        if (conversation.participant1Id !== userId && conversation.participant2Id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to view this conversation' });
        }
        
        // Get messages
        const messages = await Message.findAll({
            where: { conversationId: id },
            order: [['createdAt', 'ASC']],
            include: [
                { 
                    model: User, 
                    as: 'sender',
                    attributes: ['id', 'name', 'profilePicture'] 
                }
            ]
        });
        
        // Mark messages as read if user is the receiver
        await Message.update(
            { status: 'read' },
            {
                where: { 
                    conversationId: id,
                    receiverId: userId,
                    status: 'sent'
                }
            }
        );
        
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Error fetching messages' });
    }
});

// Legacy endpoint for backward compatibility
router.get('/conversation/:conversationId', authMiddleware, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.id;
        
        // Special handling for legacy IDs (they start with 'legacy-')
        if (conversationId.startsWith('legacy-')) {
            const otherUserId = conversationId.replace('legacy-', '');
            
            // Find all messages between these two users
            const messages = await Message.findAll({
                where: {
                    [Op.or]: [
                        { senderId: userId, receiverId: otherUserId },
                        { senderId: otherUserId, receiverId: userId }
                    ]
                },
                include: [
                    {
                        model: User,
                        as: 'sender',
                        attributes: ['id', 'name', 'profilePicture', 'role']
                    }
                ],
                order: [['createdAt', 'ASC']]
            });
            
            // Mark all messages as read if user is the receiver
            await Message.update(
                { status: 'read' },
                {
                    where: { 
                        senderId: otherUserId,
                        receiverId: userId,
                        status: 'sent'
                    }
                }
            );
            
            return res.json(messages);
        }
        
        // Regular conversation handling
        // Verify the conversation exists
        const conversation = await Conversation.findByPk(conversationId);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        
        // Verify the user is part of this conversation
        if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
            return res.status(403).json({ error: 'Not authorized to view this conversation' });
        }
        
        // Get messages
        const messages = await Message.findAll({
            where: { conversationId },
            order: [['createdAt', 'ASC']],
            include: [
                { 
                    model: User, 
                    as: 'sender',
                    attributes: ['id', 'name', 'profilePicture'] 
                }
            ]
        });
        
        // Mark messages as read if user is the receiver
        await Message.update(
            { status: 'read' },
            {
                where: { 
                    conversationId,
                    receiverId: userId,
                    status: 'sent'
                }
            }
        );
        
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Error fetching messages' });
    }
});

// Mark conversation as read
router.post('/conversations/:id/read', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        // Handle legacy conversation IDs
        if (id.startsWith('legacy-')) {
            const otherUserId = id.replace('legacy-', '');
            
            // Mark all messages from the other user as read
            await Message.update(
                { status: 'read' },
                {
                    where: { 
                        senderId: otherUserId,
                        receiverId: userId,
                        status: 'sent'
                    }
                }
            );
            
            return res.status(200).json({ message: 'Messages marked as read' });
        }
        
        // Find the conversation
        const conversation = await Conversation.findByPk(id);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        
        // Verify the user is part of this conversation
        if (conversation.participant1Id !== userId && conversation.participant2Id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to mark this conversation as read' });
        }
        
        // Mark all messages in this conversation as read where the user is the receiver
        await Message.update(
            { status: 'read' },
            {
                where: { 
                    conversationId: id,
                    receiverId: userId,
                    status: 'sent'
                }
            }
        );
        
        res.status(200).json({ message: 'Conversation marked as read' });
    } catch (error) {
        console.error('Error marking conversation as read:', error);
        res.status(500).json({ error: 'Failed to mark conversation as read' });
    }
});

// Fetch all messages between two users (legacy endpoint)
router.get('/:userId', authMiddleware, async (req, res) => {
    try {
        const userId = req.params.userId;
        const loggedInUserId = req.user.id;

        const messages = await Message.findAll({
            where: {
                [Op.or]: [
                    { senderId: loggedInUserId, receiverId: userId },
                    { senderId: userId, receiverId: loggedInUserId }
                ]
            },
            order: [['createdAt', 'ASC']]
        });

        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Error retrieving messages' });
    }
});

// Mark messages as read
router.put('/read/:messageId', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const message = await Message.findByPk(messageId);

        if (!message || message.receiverId !== req.user.id) {
            return res.status(403).json({ error: 'Message not found or unauthorized' });
        }

        await message.update({ status: 'read' });

        res.json({ message: 'Message marked as read' });
    } catch (error) {
        console.error('Error marking message as read:', error);
        res.status(500).json({ error: 'Error updating message status' });
    }
});

// Get unread message count
router.get('/unread/count', authMiddleware, async (req, res) => {
    try {
        const unreadCount = await Message.count({
            where: {
                receiverId: req.user.id,
                status: 'sent'
            }
        });
        
        res.json({ count: unreadCount });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ error: 'Error fetching unread count' });
    }
});

// Search for users for messaging
router.get('/users/search', authMiddleware, async (req, res) => {
    try {
        const { query, role } = req.query;
        
        if (!query || query.length < 2) {
            return res.status(400).json({ message: 'Search query must be at least 2 characters' });
        }
        
        // Build the search query
        const searchQuery = {
            [Op.or]: [
                { name: { [Op.like]: `%${query}%` } },
                { email: { [Op.like]: `%${query}%` } }
            ],
            // Exclude the current user
            id: { [Op.ne]: req.user.id }
        };
        
        // Add role filter if provided
        if (role && role !== 'all') {
            searchQuery.role = role;
        }
        
        // Only admins can search for other admins
        if (req.user.role !== 'admin' && (role === 'admin' || !role)) {
            searchQuery.role = { [Op.ne]: 'admin' };
        }
        
        // Find users matching the query
        const users = await User.findAll({
            where: searchQuery,
            attributes: ['id', 'name', 'email', 'profilePicture', 'role', 'bio'],
            limit: 10
        });
        
        res.status(200).json(users);
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Failed to search users', details: error.message });
    }
});

// Get user's contacts (users they've had conversations with)
router.get('/contacts', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get all conversations for this user
        const conversations = await Conversation.findAll({
            where: {
                [Op.or]: [
                    { participant1Id: userId },
                    { participant2Id: userId }
                ]
            },
            include: [
                {
                    model: User,
                    as: 'participant1',
                    attributes: ['id', 'name', 'profilePicture', 'role']
                },
                {
                    model: User,
                    as: 'participant2',
                    attributes: ['id', 'name', 'profilePicture', 'role']
                }
            ],
            order: [['lastMessageAt', 'DESC']]
        });
        
        // Format contacts list
        const contacts = conversations.map(conv => {
            const otherUser = conv.participant1Id === userId ? conv.participant2 : conv.participant1;
            
            return {
                id: otherUser.id,
                name: otherUser.name,
                profilePicture: otherUser.profilePicture,
                role: otherUser.role,
                lastMessage: conv.lastMessageContent,
                lastMessageTime: conv.lastMessageAt,
                conversationId: conv.id
            };
        });
        
        res.status(200).json(contacts);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

module.exports = router;
