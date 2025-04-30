'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Try to create Conversations table
      await queryInterface.createTable('Conversations', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        participant1Id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'Users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        participant2Id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'Users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        lastMessageAt: {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: Sequelize.NOW
        },
        lastMessageContent: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        relatedArtworkId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'Artworks',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        isOfficial: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        unreadBy: {
          type: Sequelize.JSON,
          allowNull: true
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      });
      console.log('Conversations table created successfully');
    } catch (error) {
      console.log('Conversations table may already exist:', error.message);
    }

    // Add indexes for the Conversations table with explicit names
    try {
      await queryInterface.addIndex('Conversations', ['participant1Id'], {
        name: 'conversations_participant1id_idx'
      });
      console.log('Added participant1Id index');
    } catch (error) {
      console.log('Index for participant1Id already exists or could not be created:', error.message);
    }

    try {
      await queryInterface.addIndex('Conversations', ['participant2Id'], {
        name: 'conversations_participant2id_idx'
      });
      console.log('Added participant2Id index');
    } catch (error) {
      console.log('Index for participant2Id already exists or could not be created:', error.message);
    }

    try {
      await queryInterface.addIndex('Conversations', ['participant1Id', 'participant2Id'], {
        name: 'conversations_participants_idx'
      });
      console.log('Added participants composite index');
    } catch (error) {
      console.log('Composite participants index already exists or could not be created:', error.message);
    }

    try {
      await queryInterface.addIndex('Conversations', ['lastMessageAt'], {
        name: 'conversations_lastmessageat_idx'
      });
      console.log('Added lastMessageAt index');
    } catch (error) {
      console.log('Index for lastMessageAt already exists or could not be created:', error.message);
    }

    try {
      // Check if the Messages table has the necessary columns
      const messagesTable = await queryInterface.describeTable('Messages');
      
      // Add artworkId column to Messages table if it doesn't already exist
      if (!messagesTable.artworkId) {
        await queryInterface.addColumn('Messages', 'artworkId', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'Artworks',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        });
        console.log('Added artworkId column to Messages');
      }

      // Add metadata column to Messages table if it doesn't already exist
      if (!messagesTable.metadata) {
        await queryInterface.addColumn('Messages', 'metadata', {
          type: Sequelize.JSON,
          allowNull: true
        });
        console.log('Added metadata column to Messages');
      }

      // Update status enum to include 'delivered' if not already there
      // First check if status is an ENUM
      if (messagesTable.status && messagesTable.status.type.includes('ENUM')) {
        // For MySQL/MariaDB
        const dialect = queryInterface.sequelize.getDialect();
        
        if (dialect === 'mysql' || dialect === 'mariadb') {
          // For MySQL/MariaDB - modify the column to be a VARCHAR first
          await queryInterface.sequelize.query(`
            ALTER TABLE \`Messages\` 
            MODIFY COLUMN \`status\` VARCHAR(255)
          `);
          console.log('Modified status column in Messages for MySQL/MariaDB');
        } else if (dialect === 'postgres') {
          // For PostgreSQL
          await queryInterface.sequelize.query(`
            ALTER TABLE "Messages" 
            ALTER COLUMN "status" TYPE VARCHAR(255)
          `);
          
          await queryInterface.sequelize.query(`
            ALTER TABLE "Messages" 
            ADD CONSTRAINT "status_check" 
            CHECK ("status" IN ('sent', 'delivered', 'read'))
          `);
          console.log('Modified status column in Messages for PostgreSQL');
        }
      }
    } catch (error) {
      console.log('Error modifying Messages table:', error.message);
    }

    // Add indexes for the Messages table if they don't exist
    try {
      await queryInterface.addIndex('Messages', ['conversationId'], {
        name: 'messages_conversationid_idx'
      });
      console.log('Added conversationId index to Messages');
    } catch (error) {
      console.log('Index for conversationId already exists or could not be created:', error.message);
    }

    try {
      await queryInterface.addIndex('Messages', ['senderId', 'receiverId'], {
        name: 'messages_sender_receiver_idx'
      });
      console.log('Added senderId/receiverId index to Messages');
    } catch (error) {
      console.log('Index for senderId/receiverId already exists or could not be created:', error.message);
    }

    try {
      await queryInterface.addIndex('Messages', ['status'], {
        name: 'messages_status_idx'
      });
      console.log('Added status index to Messages');
    } catch (error) {
      console.log('Index for status already exists or could not be created:', error.message);
    }

    try {
      await queryInterface.addIndex('Messages', ['createdAt'], {
        name: 'messages_createdat_idx'
      });
      console.log('Added createdAt index to Messages');
    } catch (error) {
      console.log('Index for createdAt already exists or could not be created:', error.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first - with try/catch for safety
    try {
      await queryInterface.removeIndex('Messages', 'messages_conversationid_idx');
    } catch (error) {
      console.log('Error removing conversationId index:', error.message);
    }
    
    try {
      await queryInterface.removeIndex('Messages', 'messages_sender_receiver_idx');
    } catch (error) {
      console.log('Error removing senderId/receiverId index:', error.message);
    }
    
    try {
      await queryInterface.removeIndex('Messages', 'messages_status_idx');
    } catch (error) {
      console.log('Error removing status index:', error.message);
    }
    
    try {
      await queryInterface.removeIndex('Messages', 'messages_createdat_idx');
    } catch (error) {
      console.log('Error removing createdAt index:', error.message);
    }
    
    try {
      await queryInterface.removeIndex('Conversations', 'conversations_participant1id_idx');
    } catch (error) {
      console.log('Error removing participant1Id index:', error.message);
    }
    
    try {
      await queryInterface.removeIndex('Conversations', 'conversations_participant2id_idx');
    } catch (error) {
      console.log('Error removing participant2Id index:', error.message);
    }
    
    try {
      await queryInterface.removeIndex('Conversations', 'conversations_participants_idx');
    } catch (error) {
      console.log('Error removing participants composite index:', error.message);
    }
    
    try {
      await queryInterface.removeIndex('Conversations', 'conversations_lastmessageat_idx');
    } catch (error) {
      console.log('Error removing lastMessageAt index:', error.message);
    }

    // Remove columns from Messages
    try {
      const messagesTable = await queryInterface.describeTable('Messages');
      
      if (messagesTable.metadata) {
        await queryInterface.removeColumn('Messages', 'metadata');
        console.log('Removed metadata column from Messages');
      }
      
      if (messagesTable.artworkId) {
        await queryInterface.removeColumn('Messages', 'artworkId');
        console.log('Removed artworkId column from Messages');
      }
    } catch (error) {
      console.log('Error removing columns from Messages:', error.message);
    }

    // Remove the Conversations table
    try {
      await queryInterface.dropTable('Conversations');
      console.log('Dropped Conversations table');
    } catch (error) {
      console.log('Error dropping Conversations table:', error.message);
    }
  }
};
