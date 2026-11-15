import type { Organization } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_ORGANIZATION = 'organization';

export const ORGANIZATION_CREATED = 'ORGANIZATION_CREATED';
export type OrganizationCreatedEvent = {
  name: typeof ORGANIZATION_CREATED;
  data: Pick<Organization, 'id'> & Partial<Omit<Organization, 'id'>>;
} & EventBase<typeof AGGREGATE_ORGANIZATION>;

export const ORGANIZATION_UPDATED = 'ORGANIZATION_UPDATED';
export type OrganizationUpdatedEvent = {
  name: typeof ORGANIZATION_UPDATED;
  data: Pick<Organization, 'id'> & Partial<Omit<Organization, 'id'>>;
} & EventBase<typeof AGGREGATE_ORGANIZATION>;

export const ORGANIZATION_DELETED = 'ORGANIZATION_DELETED';
export type OrganizationDeletedEvent = {
  name: typeof ORGANIZATION_DELETED;
  data: Pick<Organization, 'id'>;
} & EventBase<typeof AGGREGATE_ORGANIZATION>;
