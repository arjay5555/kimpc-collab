const mongoose = require("mongoose");

/**
 * Connect to MongoDB database
 * Reads MONGODB_URI from environment variables.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[Database] Missing MONGODB_URI environment variable.");
    console.error("[Database] Please configure MONGODB_URI in server/.env");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host} (DB: ${conn.connection.name})`);

    // Connection event listeners for runtime monitoring
    mongoose.connection.on("error", (err) => {
      console.error("[Database] MongoDB connection error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[Database] MongoDB disconnected. Attempting reconnection...");
    });

    return conn;
  } catch (error) {
    console.error("[Database] MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

/**
 * Disconnect from MongoDB database (useful for graceful shutdown & tests)
 */
async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log("[Database] MongoDB disconnected gracefully.");
  } catch (err) {
    console.error("[Database] Error disconnecting:", err.message);
  }
}

module.exports = { connectDB, disconnectDB };
