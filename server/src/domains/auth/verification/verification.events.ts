import type { Verification } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_VERIFICATION = 'verification';

export const VERIFICATION_CREATED = 'VERIFICATION_CREATED';
export type VerificationCreatedEvent = {
  name: typeof VERIFICATION_CREATED;
  data: Partial<Verification>;
} & EventBase<typeof AGGREGATE_VERIFICATION>;

export const VERIFICATION_UPDATED = 'VERIFICATION_UPDATED';
export type VerificationUpdatedEvent = {
  name: typeof VERIFICATION_UPDATED;
  data: Pick<Verification, 'id'> & Partial<Omit<Verification, 'id'>>;
} & EventBase<typeof AGGREGATE_VERIFICATION>;

export const VERIFICATION_DELETED = 'VERIFICATION_DELETED';
export type VerificationDeletedEvent = {
  name: typeof VERIFICATION_DELETED;
  data: Pick<Verification, 'id'>;
} & EventBase<typeof AGGREGATE_VERIFICATION>;
