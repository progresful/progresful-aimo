import { Router } from 'express';

import { catchAsync } from '../../utils/catchAsync.ts';
import { userIsAuthenticated } from '../../middleware/session.ts';

import * as messageController from './message.controller.ts';
// import * as messageRecipientController from './messageRecipient/messageRecipient.controller.ts';

export function messageRoutes(router: Router) {
  router.get('/api/message', userIsAuthenticated, catchAsync(messageController.getMyMessages));
  router.post('/api/message', userIsAuthenticated, catchAsync(messageController.createMessage));
  router.get('/api/message/:messageId', userIsAuthenticated, catchAsync(messageController.getMessage));
  router.patch('/api/message/:messageId', userIsAuthenticated, catchAsync(messageController.updateMessage));
  router.delete('/api/message/:messageId', userIsAuthenticated, catchAsync(messageController.deleteMessage));
  // router.post('/api/message/:messageId/read', userIsAuthenticated, catchAsync(messageRecipientsController.readMessageRecipient));
  // router.post('/api/message/:messageId/unread', userIsAuthenticated, catchAsync(messageRecipientsController.unreadMessageRecipient));
  // router.post('/api/message/:messageId/add-recipients', userIsAuthenticated, catchAsync(messageRecipientsController.addRecipientsToMessage));
  // router.post('/api/message/:messageId/remove-recipients', userIsAuthenticated, catchAsync(messageRecipientsController.removeRecipientsFromMessage));
}
