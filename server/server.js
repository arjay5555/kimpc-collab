const path = require("path");

// Load environment variables before anything else
require("dotenv").config({ path: path.join(__dirname, ".env") });
if (!process.env.MONGODB_URI) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
}

// Initialize effective environment variables from DEFAULT and CUSTOM keys
require("./services/apiKeyManager");

const app = require("./app");
const { connectDB, disconnectDB } = require("./config/database");
const { startAuditArchiveWorker } = require("./workers/archiveAuditLogs");
const { startBookingReminderWorker } = require("./workers/bookingReminderNotifications");

const port = process.env.PORT || 3000;

async function startServer() {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Start scheduled background cron workers
  startAuditArchiveWorker({ runImmediately: false });
  startBookingReminderWorker();

  // 3. Start listening on configured port
  const server = app.listen(port, () => {
    console.log(`[Server] KIMPC Machinery Portal running at: http://localhost:${port}/login`);
  });

  // Graceful shutdown
  const handleShutdown = async (signal) => {
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

startServer().catch((error) => {
  console.error("[Server] Fatal error on startup:", error.message);
  process.exit(1);
});
