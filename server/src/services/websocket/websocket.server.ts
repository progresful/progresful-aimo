import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { WebSocketService } from './websocket.ts';
import { getAuthorizedSession } from '../../middleware/session.ts';
import logger from '../logger.ts';

let wss: WebSocketServer;
const wsService = new WebSocketService();

export function setupWebSocketServer(server: Server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', async (ws, req) => {
    try {
      if (wsService.isShuttingDown) {
        logger.warn('WebSocketService: Rejecting new connection during shutdown');
        ws.close(1013, 'Service unavailable - Server is shutting down');
        return;
      }

      const session = await getAuthorizedSession(req);
      if (!session?.user) {
        logger.error('WebSocketService: Unauthorized WebSocket connection');
        ws.close(1008, 'Unauthorized');
        return;
      }

      if (!session.user) {
        logger.error('WebSocketService: User not found');
        ws.close(1008, 'User not found');
        return;
      }

      wsService.addConnection(session.user.id, ws, session.session.activeOrganizationId);
      logger.info(`WebSocketService: User ${session.user.id} connected`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          logger.info(`WebSocketService: User ${session.user.id} message: ${JSON.stringify(message)}`);

          const connection = wsService['users'].get(session.user.id);
          if (connection) {
            connection.lastActivity = Date.now();
          }

          wsService.handleMessage(session.user.id, message);
        } catch (error) {
          logger.error(`WebSocketService: Error handling message: ${error}`);
          ws.send(
            JSON.stringify({
              type: 'error',
              data: {
                message: 'Invalid message format',
              },
            })
          );
        }
      });

      ws.on('close', () => {
        logger.info(`WebSocketService: User ${session.user.id} disconnected`);
        wsService.removeConnection(session.user.id);
      });
    } catch (error) {
      logger.error(`WebSocketService: Connection error: ${error}`);
      ws.close(1011, 'Internal server error');
    }
  });

  return wsService;
}

export { wsService };
