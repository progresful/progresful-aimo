import type { Invitation } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_INVITATION = 'invitation';

export const INVITATION_CREATED = 'INVITATION_CREATED';
export type InvitationCreatedEvent = {
  name: typeof INVITATION_CREATED;
  data: Partial<Invitation>;
} & EventBase<typeof AGGREGATE_INVITATION>;

export const INVITATION_UPDATED = 'INVITATION_UPDATED';
export type InvitationUpdatedEvent = {
  name: typeof INVITATION_UPDATED;
  data: Pick<Invitation, 'id'> & Partial<Omit<Invitation, 'id'>>;
} & EventBase<typeof AGGREGATE_INVITATION>;

export const INVITATION_DELETED = 'INVITATION_DELETED';
export type InvitationDeletedEvent = {
  name: typeof INVITATION_DELETED;
  data: Pick<Invitation, 'id'>;
} & EventBase<typeof AGGREGATE_INVITATION>;
