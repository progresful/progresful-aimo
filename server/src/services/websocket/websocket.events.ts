// System events
type WsEvent_Shutdown = { type: 'shutdown'; data: { message: string } };
// Error events
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WsEvent_Error = { type: 'error'; data: any };

export type WebSocketMessage = WsEvent_Shutdown | WsEvent_Error;
