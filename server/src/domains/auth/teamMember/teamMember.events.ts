import type { TeamMember } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_TEAM_MEMBER = 'teamMember';

export const TEAM_MEMBER_CREATED = 'TEAM_MEMBER_CREATED';
export type TeamMemberCreatedEvent = {
  name: typeof TEAM_MEMBER_CREATED;
  data: Partial<TeamMember>;
} & EventBase<typeof AGGREGATE_TEAM_MEMBER>;

export const TEAM_MEMBER_UPDATED = 'TEAM_MEMBER_UPDATED';
export type TeamMemberUpdatedEvent = {
  name: typeof TEAM_MEMBER_UPDATED;
  data: Pick<TeamMember, 'id'> & Partial<Omit<TeamMember, 'id'>>;
} & EventBase<typeof AGGREGATE_TEAM_MEMBER>;

export const TEAM_MEMBER_DELETED = 'TEAM_MEMBER_DELETED';
export type TeamMemberDeletedEvent = {
  name: typeof TEAM_MEMBER_DELETED;
  data: Pick<TeamMember, 'id'>;
} & EventBase<typeof AGGREGATE_TEAM_MEMBER>;
