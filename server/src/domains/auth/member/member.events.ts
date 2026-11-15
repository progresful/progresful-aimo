import type { Member } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_MEMBER = 'member';

export const MEMBER_CREATED = 'MEMBER_CREATED';
export type MemberCreatedEvent = {
  name: typeof MEMBER_CREATED;
  data: Partial<Member>;
} & EventBase<typeof AGGREGATE_MEMBER>;

export const MEMBER_UPDATED = 'MEMBER_UPDATED';
export type MemberUpdatedEvent = {
  name: typeof MEMBER_UPDATED;
  data: Pick<Member, 'id'> & Partial<Omit<Member, 'id'>>;
} & EventBase<typeof AGGREGATE_MEMBER>;

export const MEMBER_DELETED = 'MEMBER_DELETED';
export type MemberDeletedEvent = {
  name: typeof MEMBER_DELETED;
  data: Pick<Member, 'id'>;
} & EventBase<typeof AGGREGATE_MEMBER>;
