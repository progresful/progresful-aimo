import type { Account } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_ACCOUNT = 'account';

export const ACCOUNT_CREATED = 'ACCOUNT_CREATED';
export type AccountCreatedEvent = {
  name: typeof ACCOUNT_CREATED;
  data: Partial<Account>;
} & EventBase<typeof AGGREGATE_ACCOUNT>;

export const ACCOUNT_UPDATED = 'ACCOUNT_UPDATED';
export type AccountUpdatedEvent = {
  name: typeof ACCOUNT_UPDATED;
  data: Pick<Account, 'id'> & Partial<Omit<Account, 'id'>>;
} & EventBase<typeof AGGREGATE_ACCOUNT>;

export const ACCOUNT_DELETED = 'ACCOUNT_DELETED';
export type AccountDeletedEvent = {
  name: typeof ACCOUNT_DELETED;
  data: Pick<Account, 'id'>;
} & EventBase<typeof AGGREGATE_ACCOUNT>;
