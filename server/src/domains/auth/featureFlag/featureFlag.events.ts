import type { FeatureFlag } from '../../../../prisma/generated/prisma/index';
import type { EventBase } from '../../../services/eventStore.ts';

export const AGGREGATE_FEATURE_FLAG = 'featureFlag';

export const FEATURE_FLAG_CREATED = 'FEATURE_FLAG_CREATED';
export type FeatureFlagCreatedEvent = {
  name: typeof FEATURE_FLAG_CREATED;
  data: Partial<FeatureFlag>;
} & EventBase<typeof AGGREGATE_FEATURE_FLAG>;

export const FEATURE_FLAG_UPDATED = 'FEATURE_FLAG_UPDATED';
export type FeatureFlagUpdatedEvent = {
  name: typeof FEATURE_FLAG_UPDATED;
  data: Pick<FeatureFlag, 'id'> & Partial<Omit<FeatureFlag, 'id'>>;
} & EventBase<typeof AGGREGATE_FEATURE_FLAG>;

export const FEATURE_FLAG_DELETED = 'FEATURE_FLAG_DELETED';
export type FeatureFlagDeletedEvent = {
  name: typeof FEATURE_FLAG_DELETED;
  data: Pick<FeatureFlag, 'id'>;
} & EventBase<typeof AGGREGATE_FEATURE_FLAG>;
