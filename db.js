const mongoose = require('mongoose');

/**
 * Establishes an asynchronous connection to MongoDB using the connection
 * string supplied via environment variables. Registers listeners so that
 * connection drops or runtime errors are logged instead of crashing the
 * Node process.
 */
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in the environment configuration.');
    }

    mongoose.set('strictQuery', true);

    const conn = await mongoose.connect(mongoUri, {
      // Modern Mongoose (6+/8+) no longer needs useNewUrlParser / useUnifiedTopology,
      // but these options are harmless if a slightly older driver is used.
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`[MongoDB] Connected successfully -> Host: ${conn.connection.host}`);

    // Fired if the connection is lost after a successful initial connect
    // (e.g. network blip, Atlas maintenance). We log it rather than
    // letting it bubble up and kill the server thread.
    mongoose.connection.on('disconnected', () => {
      console.error('[MongoDB] Connection lost. Attempting to remain resilient...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] Reconnected successfully.');
    });

    mongoose.connection.on('error', (err) => {
      console.error(`[MongoDB] Runtime connection error: ${err.message}`);
    });
  } catch (error) {
    console.error(`[MongoDB] Initial connection failed: ${error.message}`);
    // Exit only on the INITIAL failed connection, since the app is useless
    // without a database at boot. Runtime drops are handled by the
    // listeners above and do NOT crash the process.
    process.exit(1);
  }
};

module.exports = connectDB;
