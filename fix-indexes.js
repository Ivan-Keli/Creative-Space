// fix-indexes.js
const sequelize = require('./config/database');

async function dropDuplicateIndexes() {
  try {
    console.log('Dropping duplicate indexes...');
    
    // List of indexes to check and drop if they exist
    const indexesToFix = [
      'messages_conversation_id_idx',
      'messages_sender_id_receiver_id',
      'messages_status_idx',
      'messages_created_at_idx'
    ];
    
    for (const indexName of indexesToFix) {
      try {
        await sequelize.query(`DROP INDEX ${indexName} ON Messages`);
        console.log(`Dropped index: ${indexName}`);
      } catch (err) {
        console.log(`Index ${indexName} either doesn't exist or couldn't be dropped: ${err.message}`);
      }
    }
    
    console.log('Index cleanup completed');
  } catch (error) {
    console.error('Error fixing indexes:', error);
  } finally {
    await sequelize.close();
  }
}

dropDuplicateIndexes();
