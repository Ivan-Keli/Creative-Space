// migrate-messaging-data.js
// Run this script after the model files have been updated
// and the database has synced the new schema

// Import entire models object
const models = require('./models');

// Destructure the models we need
const { sequelize, Message, Conversation, User } = models;

async function migrateMessagesToConversations() {
  console.log('Starting migration of existing messages to conversations...');
  
  const transaction = await sequelize.transaction();
  
  try {
    // Get all messages that don't have a conversationId yet
    const messages = await Message.findAll({
      where: {
        conversationId: null
      },
      order: [['createdAt', 'ASC']],
      transaction
    });
    
    console.log(`Found ${messages.length} messages to migrate`);
    
    if (messages.length === 0) {
      console.log('No messages need migration.');
      await transaction.commit();
      return;
    }
    
    // Group messages by sender-receiver pair
    const conversationGroups = {};
    
    for (const message of messages) {
      // Create a unique key for each conversation (smaller ID first to avoid duplicates)
      const participants = [message.senderId, message.receiverId].sort((a, b) => a - b);
      const key = `${participants[0]}-${participants[1]}`;
      
      if (!conversationGroups[key]) {
        conversationGroups[key] = [];
      }
      
      conversationGroups[key].push(message);
    }
    
    console.log(`Grouped messages into ${Object.keys(conversationGroups).length} conversations`);
    
    // Process each conversation group
    for (const [key, msgs] of Object.entries(conversationGroups)) {
      const [participant1Id, participant2Id] = key.split('-').map(id => parseInt(id, 10));
      
      // Check if the participants exist
      const participant1 = await User.findByPk(participant1Id, { transaction });
      const participant2 = await User.findByPk(participant2Id, { transaction });
      
      if (!participant1 || !participant2) {
        console.log(`Skipping conversation ${key} - one or more participants not found`);
        continue;
      }
      
      // Find the newest message for this conversation
      const sortedMsgs = [...msgs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const lastMessage = sortedMsgs[0];
      
      console.log(`Creating conversation between users ${participant1Id} and ${participant2Id}`);
      
      // Create a new conversation
      const conversation = await Conversation.create({
        participant1Id,
        participant2Id,
        lastMessageAt: lastMessage.createdAt,
        lastMessageContent: lastMessage.content.substring(0, 255),
        createdAt: msgs[0].createdAt, // Use the first message time as conversation start
        updatedAt: new Date()
      }, { transaction });
      
      // Update all messages to link to this conversation
      console.log(`Updating ${msgs.length} messages to link to conversation ${conversation.id}`);
      
      // Use bulkUpdate for better performance
      const messageIds = msgs.map(msg => msg.id);
      await Message.update(
        { conversationId: conversation.id },
        { 
          where: { id: messageIds },
          transaction
        }
      );
    }
    
    await transaction.commit();
    console.log('Migration completed successfully!');
    
  } catch (error) {
    await transaction.rollback();
    console.error('Migration failed:', error);
    console.error(error.stack); // Print the full stack trace for better debugging
    throw error;
  }
}

// Execute the migration
migrateMessagesToConversations()
  .then(() => {
    console.log('Migration script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error running migration script:', error);
    process.exit(1);
  });
