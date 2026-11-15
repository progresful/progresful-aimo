import type { Feature } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_FEATURE = 'feature';

export const FEATURE_CREATED = 'FEATURE_CREATED';
export type FeatureCreatedEvent = {
  name: typeof FEATURE_CREATED;
  data: Partial<Feature>;
} & EventBase<typeof AGGREGATE_FEATURE>;

export const FEATURE_UPDATED = 'FEATURE_UPDATED';
export type FeatureUpdatedEvent = {
  name: typeof FEATURE_UPDATED;
  data: Pick<Feature, 'id'> & Partial<Omit<Feature, 'id'>>;
} & EventBase<typeof AGGREGATE_FEATURE>;

export const FEATURE_DELETED = 'FEATURE_DELETED';
export type FeatureDeletedEvent = {
  name: typeof FEATURE_DELETED;
  data: Pick<Feature, 'id'>;
} & EventBase<typeof AGGREGATE_FEATURE>;
