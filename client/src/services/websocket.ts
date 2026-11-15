export type MessageHandler = (data: unknown) => void | Promise<void>;

// System events
type WsEvent_Shutdown = { type: 'shutdown'; data: { message: string } };
// Error events
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WsEvent_Error = { type: 'error'; data: any };

type WebSocketMessage = WsEvent_Shutdown | WsEvent_Error;

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private maxReconnectDelay = 32000;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Map<string, MessageHandler> = new Map();
  isConnecting = false;
  isShutdown = false;
  isConnected = false;

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }

  connect() {
    if (this.isConnecting || this.ws || this.isShutdown) return;

    this.isConnecting = true;
    this.ws = new WebSocket(this.getWebSocketUrl());

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.isConnected = true;
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.isConnecting = false;
      this.isConnected = false;
      if (!this.isShutdown) {
        this.handleDisconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.ws?.close();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;

        // Handle shutdown message
        if (message.type === 'shutdown') {
          console.log('Received server shutdown message:', message.data);
          this.isShutdown = true;
          this.disconnect();
          return;
        }

        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  }

  private handleDisconnect() {
    if (this.isShutdown) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);

      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }

      this.reconnectTimeout = setTimeout(() => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private handleMessage(message: WebSocketMessage) {
    const { type, data } = message;
    const handler = this.messageHandlers.get(type);

    if (handler) {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error handling message type ${type}:`, error);
      }
    } else {
      console.warn(`No handler registered for message type: ${type}`);
    }
  }

  public registerHandler(type: string, handler: MessageHandler) {
    this.messageHandlers.set(type, handler);
  }

  public unregisterHandler(type: string) {
    this.messageHandlers.delete(type);
  }

  public send(type: string, data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this.isConnected = false;
  }
}

export const websocketService = new WebSocketService();
