import type { Message } from '../../../prisma/generated/prisma/index';
import type { EventBase } from '../../services/eventStore.ts';

export const AGGREGATE_MESSAGE = 'message';

export const MESSAGE_CREATED = 'MESSAGE_CREATED';
export type MessageCreatedEvent = {
  name: typeof MESSAGE_CREATED;
  data: Partial<Message>;
} & EventBase<typeof AGGREGATE_MESSAGE>;

export const MESSAGE_UPDATED = 'MESSAGE_UPDATED';
export type MessageUpdatedEvent = {
  name: typeof MESSAGE_UPDATED;
  data: Pick<Message, 'id'> & Partial<Omit<Message, 'id'>>;
} & EventBase<typeof AGGREGATE_MESSAGE>;

export const MESSAGE_DELETED = 'MESSAGE_DELETED';
export type MessageDeletedEvent = {
  name: typeof MESSAGE_DELETED;
  data: Pick<Message, 'id'>;
} & EventBase<typeof AGGREGATE_MESSAGE>;
