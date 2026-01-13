/**
 * Database Index Cleanup Script
 * Removes duplicate indexes to prevent Mongoose warnings
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function cleanupIndexes() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sales_chatbot');
    console.log('✅ Connected to MongoDB');

    // Get the chat_notifications collection
    const db = mongoose.connection.db;
    const collection = db.collection('chat_notifications');

    console.log('🔍 Checking existing indexes...');
    
    // Get current indexes
    const indexes = await collection.indexes();
    console.log('📊 Current indexes:');
    indexes.forEach((index, i) => {
      console.log(`   ${i + 1}. ${JSON.stringify(index.key)} - ${index.name}`);
    });

    // Drop all indexes except _id (which can't be dropped)
    console.log('\n🗑️  Dropping custom indexes...');
    
    for (const index of indexes) {
      if (index.name !== '_id_') {
        try {
          await collection.dropIndex(index.name);
          console.log(`   ✅ Dropped index: ${index.name}`);
        } catch (error) {
          console.log(`   ⚠️  Could not drop index ${index.name}: ${error.message}`);
        }
      }
    }

    // Recreate indexes using the model (this will use the schema definition)
    console.log('\n🔨 Recreating indexes from schema...');
    
    // Import the model to trigger index creation
    const ChatNotification = require('../models/ChatNotification');
    
    // Ensure indexes are created
    await ChatNotification.createIndexes();
    console.log('✅ Indexes recreated from schema');

    // Verify new indexes
    console.log('\n🔍 Verifying new indexes...');
    const newIndexes = await collection.indexes();
    console.log('📊 New indexes:');
    newIndexes.forEach((index, i) => {
      console.log(`   ${i + 1}. ${JSON.stringify(index.key)} - ${index.name}`);
    });

    console.log('\n✅ Index cleanup completed successfully!');

  } catch (error) {
    console.error('❌ Error during index cleanup:', error.message);
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run cleanup if this file is executed directly
if (require.main === module) {
  cleanupIndexes().catch(console.error);
}

module.exports = { cleanupIndexes };