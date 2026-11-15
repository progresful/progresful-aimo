import { useEffect } from 'react';
import { MessageHandler, websocketService } from '../services/websocket';

export function useWebSocket(type: string, handler: MessageHandler) {
  useEffect(() => {
    websocketService.registerHandler(type, handler);
    return () => {
      websocketService.unregisterHandler(type);
    };
  }, [type, handler]);
}

export function useWebSocketSend() {
  return websocketService.send.bind(websocketService);
}

/** Usage example:
 * 
 * Handle response on channel: "whoami!":
 * 
useWebSocket('whoami!', (data) => {
  console.log('whoami!', data);
});
 * 
 * Send message to channel: "whoami?":
 * 
 const { send } = useWebSocketSend();
 send('whoami?', {});
 */
