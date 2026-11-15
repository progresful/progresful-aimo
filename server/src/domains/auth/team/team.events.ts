import type { Team } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_TEAM = 'team';

export const TEAM_CREATED = 'TEAM_CREATED';
export type TeamCreatedEvent = {
  name: typeof TEAM_CREATED;
  data: Partial<Team>;
} & EventBase<typeof AGGREGATE_TEAM>;

export const TEAM_UPDATED = 'TEAM_UPDATED';
export type TeamUpdatedEvent = {
  name: typeof TEAM_UPDATED;
  data: Pick<Team, 'id'> & Partial<Omit<Team, 'id'>>;
} & EventBase<typeof AGGREGATE_TEAM>;

export const TEAM_DELETED = 'TEAM_DELETED';
export type TeamDeletedEvent = {
  name: typeof TEAM_DELETED;
  data: Pick<Team, 'id'>;
} & EventBase<typeof AGGREGATE_TEAM>;
