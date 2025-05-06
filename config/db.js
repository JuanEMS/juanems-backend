const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Add database name "JuanEMS" to the connection string if not already there
    let uri = process.env.MONGO_URI;
    
    // Check if URI already includes a database name
    if (!uri.includes('/JuanEMS')) {
      // If URI ends with a slash, just add the database name
      if (uri.endsWith('/')) {
        uri += 'JuanEMS';
      } else {
        // If URI doesn't end with a slash, add slash and database name
        uri += '/JuanEMS';
      }
    }
    
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,  // Timeout after 5s instead of 10s
      socketTimeoutMS: 45000,  // Close sockets after 45s of inactivity
    });
    
    // Log the connected database name for debugging
    const dbName = mongoose.connection.db.databaseName;
    console.log(`MongoDB connected successfully to database: ${dbName}`);
    
    // List available collections for debugging
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(collection => collection.name);
    console.log(`Collections in database: ${collectionNames.join(',')}`);
    console.log('Available collections:', collectionNames);
    
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to DB');
});

mongoose.connection.on('error', (err) => {
  console.log('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

module.exports = connectDB;