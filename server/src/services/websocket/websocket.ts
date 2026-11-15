import { WebSocket } from 'ws';
import logger from '../logger.ts';

interface WebSocketConnection {
  socket: WebSocket;
  userId: string;
  lastActivity: number;
}

export type WebSocketMessage = {
  type: string;
  data: unknown;
};

export type MessageHandler = (userId: string, data: unknown) => Promise<void>;

export class WebSocketService {
  // Map of userId to WebSocket connection
  private users: Map<string, WebSocketConnection> = new Map();
  // Map of tenantId to set of userIds
  private tenants: Map<string, Set<string>> = new Map();
  // Map of userId to active tenantId
  private userTenant: Map<string, string> = new Map();
  // Connection timeout
  private connectionTimeout: number = 30000; // 30 seconds
  // Message handlers
  private messageHandlers: Map<string, MessageHandler> = new Map();
  // Shutdown state
  isShuttingDown: boolean = false;

  addConnection(userId: string, socket: WebSocket, tenantId?: string) {
    if (this.isShuttingDown) {
      logger.warn('WebSocketService: Rejecting new connection during shutdown');
      socket.close(1013, 'Service unavailable - Server is shutting down');
      return;
    }

    this.removeConnection(userId);

    const connection: WebSocketConnection = {
      socket,
      userId,
      lastActivity: Date.now(),
    };

    this.users.set(userId, connection);

    if (tenantId) {
      if (!this.tenants.has(tenantId)) {
        this.tenants.set(tenantId, new Set());
      }
      this.tenants.get(tenantId)?.add(userId);
      this.userTenant.set(userId, tenantId);
    }

    this.setupConnectionCleanup(socket, userId);
  }

  removeConnection(userId: string) {
    const connection = this.users.get(userId);
    if (!connection) return;

    const tenantId = this.userTenant.get(userId);
    if (tenantId) {
      this.tenants.get(tenantId)?.delete(userId);
      this.userTenant.delete(userId);
    }

    this.users.delete(userId);
  }

  switchTenant(userId: string, newTenantId: string) {
    const connection = this.users.get(userId);
    if (!connection) return;

    const oldTenantId = this.userTenant.get(userId);
    if (oldTenantId) {
      this.tenants.get(oldTenantId)?.delete(userId);
    }

    if (!this.tenants.has(newTenantId)) {
      this.tenants.set(newTenantId, new Set());
    }
    this.tenants.get(newTenantId)?.add(userId);
    this.userTenant.set(userId, newTenantId);
  }

  broadcastToTenant(tenantId: string, message: WebSocketMessage) {
    const userIds = this.tenants.get(tenantId);
    if (!userIds) return;

    for (const userId of userIds) {
      const connection = this.users.get(userId);
      if (connection) {
        connection.socket.send(JSON.stringify(message));
      }
    }
  }

  broadcastToUserActiveTenant(userId: string, message: WebSocketMessage) {
    const tenantId = this.userTenant.get(userId);
    if (!tenantId) return;

    this.broadcastToTenant(tenantId, message);
  }

  sendToUser(userId: string, message: WebSocketMessage) {
    const connection = this.users.get(userId);
    if (connection) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  getUserActiveTenant(userId: string) {
    return this.userTenant.get(userId);
  }

  private setupConnectionCleanup(socket: WebSocket, userId: string) {
    const heartbeat = setInterval(() => {
      const connection = this.users.get(userId);
      if (!connection) {
        clearInterval(heartbeat);
        return;
      }

      // Check for timeout
      if (Date.now() - connection.lastActivity > this.connectionTimeout) {
        this.removeConnection(userId);
        socket.close();
        clearInterval(heartbeat);
        return;
      }

      // Send ping
      socket.ping();
    }, 10000);

    socket.on('pong', () => {
      const connection = this.users.get(userId);
      if (connection) {
        connection.lastActivity = Date.now();
      }
    });

    socket.on('close', () => {
      this.removeConnection(userId);
      clearInterval(heartbeat);
    });
  }

  public registerHandler(type: string, handler: MessageHandler) {
    this.messageHandlers.set(type, handler);
    logger.info(`WebSocketService: Registered handler for message type: ${type}`);
  }

  public unregisterHandler(type: string) {
    this.messageHandlers.delete(type);
    logger.info(`WebSocketService: Unregistered handler for message type: ${type}`);
  }

  public handleMessage(userId: string, message: WebSocketMessage) {
    const { type, data } = message;
    const handler = this.messageHandlers.get(type);

    if (!handler) {
      logger.warn(`WebSocketService: No handler registered for message type: ${type}`);
      return;
    }

    try {
      handler(userId, data).catch((error) => {
        logger.error(`WebSocketService: Error handling message type ${type}:`, error);
        this.sendToUser(userId, {
          type: 'error',
          data: {
            message: 'Error processing message',
            originalType: type,
          },
        });
      });
    } catch (error) {
      logger.error(`WebSocketService: Error in message handler for type ${type}:`, error);
      this.sendToUser(userId, {
        type: 'error',
        data: {
          message: 'Internal server error',
          originalType: type,
        },
      });
    }
  }

  public async close() {
    if (this.isShuttingDown) {
      logger.warn('WebSocketService: Already shutting down');
      return;
    }

    this.isShuttingDown = true;
    logger.info('WebSocketService: Closing all connections...');

    await Promise.all(
      [...this.users.entries()].map(
        ([userId, connection]) =>
          new Promise<void>((resolve) => {
            try {
              connection.socket.send(
                JSON.stringify({
                  type: 'shutdown',
                  data: {
                    message: 'Server is shutting down',
                  },
                })
              );
              connection.socket.close(1000, 'Server shutdown');
              this.removeConnection(userId);
              resolve();
            } catch (error) {
              logger.error(`WebSocketService: Error closing connection for user ${userId}:`, error);
              resolve();
            }
          })
      )
    );

    this.users.clear();
    this.tenants.clear();
    this.userTenant.clear();
    this.messageHandlers.clear();

    logger.info('WebSocketService: All connections closed');
  }
}
