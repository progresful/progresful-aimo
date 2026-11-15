import server from './app.ts';
import logger from './src/services/logger.ts';
import db from './src/services/database.ts';
import { eventStore } from './src/services/eventStore.ts';
import { wsService } from './src/services/websocket/websocket.server.ts';

// Graceful shutdown handling
const shutdown = async () => {
  logger.info('Gracefully shutting down...');
  await wsService.close();
  await db.$disconnect();
  await eventStore.close();
  await logger.cleanup();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle unhandled errors
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  shutdown();
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  shutdown();
});
