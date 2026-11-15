import { ulid } from 'ulid';
import type { FeatureFlag } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import type { FeatureFlagCreatedEvent, FeatureFlagDeletedEvent, FeatureFlagUpdatedEvent } from './featureFlag.events.ts';
import { AGGREGATE_FEATURE_FLAG, FEATURE_FLAG_CREATED, FEATURE_FLAG_DELETED, FEATURE_FLAG_UPDATED } from './featureFlag.events.ts';

export const createFeatureFlagCommand = async (
  db: PrismaClientOrTx,
  data: FeatureFlag,
  {
    isRecreating = false,
    authorId,
    idempotencyKey,
  }: {
    isRecreating?: boolean;
    authorId: string;
    idempotencyKey?: string;
  }
) => {
  const newFeatureFlag = await db.featureFlag.create({ data });

  const eventId = idempotencyKey ?? ulid();

  let event: FeatureFlagCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: FEATURE_FLAG_CREATED,
      data: {
        ...newFeatureFlag,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newFeatureFlag.id,
      aggregate_type: AGGREGATE_FEATURE_FLAG,
    };
  }

  return { response: newFeatureFlag, event };
};
eventStore.registerCommand(FEATURE_FLAG_CREATED, createFeatureFlagCommand, 1);

export const updateFeatureFlagCommand = async (
  db: PrismaClientOrTx,
  data: FeatureFlagUpdatedEvent['data'],
  {
    isRecreating = false,
    authorId,
    idempotencyKey,
  }: {
    isRecreating?: boolean;
    authorId: string;
    idempotencyKey?: string;
  }
) => {
  const updateData: FeatureFlagUpdatedEvent['data'] = { ...data };
  delete updateData.id;
  const updatedFeatureFlag = await db.featureFlag.update({
    where: {
      id: data.id,
    },
    data: updateData,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: FeatureFlagUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: FEATURE_FLAG_UPDATED,
      data: {
        ...updateData,
        id: data.id,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_FEATURE_FLAG,
    };
  }

  return { response: updatedFeatureFlag, event };
};
eventStore.registerCommand(FEATURE_FLAG_UPDATED, updateFeatureFlagCommand, 1);

export const deleteFeatureFlagCommand = async (
  db: PrismaClientOrTx,
  data: Pick<FeatureFlag, 'id'>,
  {
    isRecreating = false,
    authorId,
    idempotencyKey,
  }: {
    isRecreating?: boolean;
    authorId: string;
    idempotencyKey?: string;
  }
) => {
  const deletedFeatureFlag = await db.featureFlag.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: FeatureFlagDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: FEATURE_FLAG_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_FEATURE_FLAG,
    };
  }

  return { response: deletedFeatureFlag, event };
};
eventStore.registerCommand(FEATURE_FLAG_DELETED, deleteFeatureFlagCommand, 1);
