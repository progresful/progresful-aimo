import type { MessageRecipient } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_MESSAGE_RECIPIENT = 'messageRecipient';

export const MESSAGE_RECIPIENT_CREATED = 'MESSAGE_RECIPIENT_CREATED';
export type MessageRecipientCreatedEvent = {
  name: typeof MESSAGE_RECIPIENT_CREATED;
  data: Partial<MessageRecipient>;
} & EventBase<typeof AGGREGATE_MESSAGE_RECIPIENT>;

export const MESSAGE_RECIPIENT_UPDATED = 'MESSAGE_RECIPIENT_UPDATED';
export type MessageRecipientUpdatedEvent = {
  name: typeof MESSAGE_RECIPIENT_UPDATED;
  data: Pick<MessageRecipient, 'id'> & Partial<Omit<MessageRecipient, 'id'>>;
} & EventBase<typeof AGGREGATE_MESSAGE_RECIPIENT>;

export const MESSAGE_RECIPIENT_DELETED = 'MESSAGE_RECIPIENT_DELETED';
export type MessageRecipientDeletedEvent = {
  name: typeof MESSAGE_RECIPIENT_DELETED;
  data: Pick<MessageRecipient, 'id'>;
} & EventBase<typeof AGGREGATE_MESSAGE_RECIPIENT>;

export const MESSAGE_RECIPIENT_READ = 'MESSAGE_RECIPIENT_READ';
export type MessageRecipientReadEvent = {
  name: typeof MESSAGE_RECIPIENT_READ;
  data: Pick<MessageRecipient, 'id'> & { readAt: Date };
} & EventBase<typeof AGGREGATE_MESSAGE_RECIPIENT>;

export const MESSAGE_RECIPIENT_UNREAD = 'MESSAGE_RECIPIENT_UNREAD';
export type MessageRecipientUnreadEvent = {
  name: typeof MESSAGE_RECIPIENT_UNREAD;
  data: Pick<MessageRecipient, 'id' | 'readAt'>;
} & EventBase<typeof AGGREGATE_MESSAGE_RECIPIENT>;
