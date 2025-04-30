// socket-manager.js
const { Notification, User, Message } = require('./models');
const { Server } = require('socket.io');
const events = require('./events');
const jwt = require('jsonwebtoken');
const config = require('./config/auth.config'); // Adjust path to your JWT config

// Initialize variables that will be set later
let io = null;
const _onlineUsers = {};
const _onlineAdmins = {};
const _userRooms = {}; // Store which conversation rooms users are in

/**
 * Initialize socket.io with the server.
 * This ensures socket.io is fully initialized and avoids circular dependencies.
 */
const initialize = (server) => {
    io = new Server(server, { 
        cors: { 
            origin: process.env.CLIENT_URL || "*",
            methods: ["GET", "POST"],
            credentials: true
        } 
    });

    // Socket authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            
            if (!token) {
                return next(new Error('Authentication error: Token not provided'));
            }
            
            const decoded = jwt.verify(token, config.secret);
            socket.user = {
                id: decoded.id,
                role: decoded.role
            };
            
            next();
        } catch (error) {
            console.error('Socket authentication error:', error);
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user?.id;
        
        console.log('A user connected:', socket.id, userId ? `(User ID: ${userId})` : '');

        if (userId) {
            // ✅ Join a room specific to this user for private messages
            socket.join(`user_${userId}`);
            
            // ✅ Track Online Users
            _onlineUsers[userId] = socket.id;
            
            // ✅ Track Online Admins
            if (socket.user.role === 'admin') {
                _onlineAdmins[userId] = socket.id;
                socket.join('admin_room');
            }
            
            // ✅ Notify others that this user is online
            io.emit('user_status_changed', { userId, status: 'online' });
        }

        // ✅ Join Conversation Room
        socket.on('join_conversation', (conversationId) => {
            if (!userId) return;
            
            const roomName = `conversation_${conversationId}`;
            socket.join(roomName);
            
            // Keep track of which rooms this user is in
            if (!_userRooms[userId]) {
                _userRooms[userId] = new Set();
            }
            _userRooms[userId].add(roomName);
            
            console.log(`User ${userId} joined conversation: ${conversationId}`);
        });

        // ✅ Leave Conversation Room
        socket.on('leave_conversation', (conversationId) => {
            if (!userId) return;
            
            const roomName = `conversation_${conversationId}`;
            socket.leave(roomName);
            
            if (_userRooms[userId]) {
                _userRooms[userId].delete(roomName);
            }
            
            console.log(`User ${userId} left conversation: ${conversationId}`);
        });

        // ✅ Enhanced Message Notification
        socket.on('send_message', async (data) => {
            const { conversationId, receiverId, content } = data;
            
            if (!userId) return;
            
            // Emit to the conversation room
            io.to(`conversation_${conversationId}`).emit('message_received', {
                ...data,
                senderId: userId,
                timestamp: new Date()
            });
            
            // Also emit to the receiver's personal room (for notifications when not in conversation)
            if (receiverId) {
                io.to(`user_${receiverId}`).emit('message_notification', {
                    senderId: userId,
                    conversationId,
                    content,
                    timestamp: new Date()
                });
            }
            
            // Create notification in database
            try {
                await Notification.create({
                    type: 'message',
                    userId: receiverId,
                    message: `New message from ${socket.user.name || 'User ID: ' + userId}`,
                    status: 'unread',
                    metadata: {
                        senderId: userId,
                        conversationId
                    }
                });
            } catch (error) {
                console.error("Error creating message notification:", error);
            }
        });

        // ✅ Typing Indicator
        socket.on('typing', (data) => {
            const { conversationId, isTyping } = data;
            
            if (!userId || !conversationId) return;
            
            socket.to(`conversation_${conversationId}`).emit('user_typing', {
                userId,
                conversationId,
                isTyping
            });
        });

        // ✅ Mark Messages as Read
        socket.on('mark_read', async (data) => {
            const { conversationId, messageIds } = data;
            
            if (!userId || !conversationId) return;
            
            // Notify others in the conversation that messages were read
            socket.to(`conversation_${conversationId}`).emit('messages_read', {
                userId,
                conversationId,
                messageIds
            });
        });

        // ✅ Transaction Completion Notification (Existing)
        socket.on('transaction_completed', async ({ buyerId, creatorId, artworkId, amount }) => {
            if (_onlineUsers[creatorId]) {
                io.to(_onlineUsers[creatorId]).emit('transaction_notification', {
                    message: `Payment of $${amount} received for Artwork ID: ${artworkId}`,
                });
            }
            try {
                await Notification.create({
                    type: 'transaction',
                    userId: creatorId,
                    message: `Payment of $${amount} received for Artwork ID: ${artworkId}`,
                    status: 'unread',
                });
            } catch (error) {
                console.error("Error creating transaction notification:", error);
            }
        });

        // ✅ Artwork Upload Notification to Admins (Existing)
        socket.on('new_artwork_uploaded', async ({ artworkId, creatorId, title }) => {
            io.to('admin_room').emit('admin_notification', {
                message: `New artwork "${title}" uploaded by Creator ID: ${creatorId}`,
            });
            
            try {
                await Notification.create({
                    type: 'artwork_review',
                    message: `New artwork "${title}" uploaded by Creator ID: ${creatorId}`,
                    status: 'unread',
                });
            } catch (error) {
                console.error("Error creating artwork review notification:", error);
            }
        });

        // ✅ Flagged Content Notification (Existing)
        socket.on('flagged_content', async ({ reportId, reportedBy, artworkId }) => {
            io.to('admin_room').emit('admin_notification', {
                message: `Content flagged for review (Report ID: ${reportId}, Reported by: ${reportedBy}, Artwork ID: ${artworkId})`,
            });
            
            try {
                await Notification.create({
                    type: 'flagged_content',
                    message: `Content flagged (Report ID: ${reportId})`,
                    status: 'unread',
                });
            } catch (error) {
                console.error("Error creating flagged content notification:", error);
            }
        });

        // ✅ Handle Disconnections
        socket.on('disconnect', () => {
            if (userId) {
                // Clean up user rooms
                if (_userRooms[userId]) {
                    delete _userRooms[userId];
                }
                
                // Clean up online tracking
                delete _onlineUsers[userId];
                if (socket.user?.role === 'admin') {
                    delete _onlineAdmins[userId];
                }
                
                // Notify others that user is offline
                io.emit('user_status_changed', { userId, status: 'offline' });
            }
            
            console.log('User disconnected:', socket.id, userId ? `(User ID: ${userId})` : '');
        });
    });

    // Set up listener for admin notification events
    events.on('admin_notification', async (data) => {
        sendAdminNotification(data.message, data.type);
    });

    return io;
};

/**
 * ✅ Function to Send Real-time Notifications to Admins
 */
const sendAdminNotification = async (message, type = 'general') => {
    if (!io) {
        console.error("Socket.io not initialized when trying to send admin notification");
        return;
    }
    
    io.to('admin_room').emit('admin_notification', {
        message,
        type,
        timestamp: new Date()
    });

    try {
        await Notification.create({ type, message, status: 'unread' });
    } catch (error) {
        console.error("Error creating admin notification:", error);
    }
};

/**
 * ✅ Function to Send Real-time Messages to Specific Users
 */
const sendMessageToUser = (userId, eventName, data) => {
    if (!io) {
        console.error("Socket.io not initialized when trying to send message");
        return;
    }
    
    io.to(`user_${userId}`).emit(eventName, {
        ...data,
        timestamp: new Date()
    });
    
    return true;
};

/**
 * ✅ Function to Broadcast to a Conversation Room
 */
const sendToConversation = (conversationId, eventName, data) => {
    if (!io) {
        console.error("Socket.io not initialized when trying to send to conversation");
        return;
    }
    
    io.to(`conversation_${conversationId}`).emit(eventName, {
        ...data,
        conversationId,
        timestamp: new Date()
    });
    
    return true;
};

/**
 * ✅ Check if User is Online
 */
const isUserOnline = (userId) => {
    return !!_onlineUsers[userId];
};

module.exports = {
    initialize,
    sendAdminNotification,
    sendMessageToUser,
    sendToConversation,
    isUserOnline,
    getIO: () => io,
    getOnlineUsers: () => _onlineUsers,
    getOnlineAdmins: () => _onlineAdmins
};
