import type { User } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_USER = 'user';

export const USER_CREATED = 'USER_CREATED';
export type UserCreatedEvent = {
  name: typeof USER_CREATED;
  data: Partial<User>;
} & EventBase<typeof AGGREGATE_USER>;

export const USER_UPDATED = 'USER_UPDATED';
export type UserUpdatedEvent = {
  name: typeof USER_UPDATED;
  data: Pick<User, 'id'> & Partial<Omit<User, 'id'>>;
} & EventBase<typeof AGGREGATE_USER>;

export const USER_DELETED = 'USER_DELETED';
export type UserDeletedEvent = {
  name: typeof USER_DELETED;
  data: Pick<User, 'id'>;
} & EventBase<typeof AGGREGATE_USER>;

export const USER_FORGOTTEN = 'USER_FORGOTTEN';
export type UserForgottenEvent = {
  name: typeof USER_FORGOTTEN;
  data: Pick<User, 'id'> & { reason?: string };
} & EventBase<typeof AGGREGATE_USER>;
