import type { Apikey } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_APIKEY = 'apikey';

export const APIKEY_CREATED = 'APIKEY_CREATED';
export type ApikeyCreatedEvent = {
  name: typeof APIKEY_CREATED;
  data: Pick<Apikey, 'id'> & Partial<Omit<Apikey, 'id'>>;
} & EventBase<typeof AGGREGATE_APIKEY>;

export const APIKEY_UPDATED = 'APIKEY_UPDATED';
export type ApikeyUpdatedEvent = {
  name: typeof APIKEY_UPDATED;
  data: Pick<Apikey, 'id'> & Partial<Omit<Apikey, 'id'>>;
} & EventBase<typeof AGGREGATE_APIKEY>;

export const APIKEY_DELETED = 'APIKEY_DELETED';
export type ApikeyDeletedEvent = {
  name: typeof APIKEY_DELETED;
  data: Pick<Apikey, 'id'>;
} & EventBase<typeof AGGREGATE_APIKEY>;
