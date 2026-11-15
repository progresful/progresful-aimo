import { ulid } from 'ulid';
import type { Feature } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import type { FeatureCreatedEvent, FeatureDeletedEvent, FeatureUpdatedEvent } from './feature.events.ts';
import { AGGREGATE_FEATURE, FEATURE_CREATED, FEATURE_DELETED, FEATURE_UPDATED } from './feature.events.ts';

export const createFeatureCommand = async (
  db: PrismaClientOrTx,
  data: Feature,
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
  const newFeature = await db.feature.create({ data });

  const eventId = idempotencyKey ?? ulid();

  let event: FeatureCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: FEATURE_CREATED,
      data: {
        ...newFeature,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newFeature.id,
      aggregate_type: AGGREGATE_FEATURE,
    };
  }

  return { response: newFeature, event };
};
eventStore.registerCommand(FEATURE_CREATED, createFeatureCommand, 1);

export const updateFeatureCommand = async (
  db: PrismaClientOrTx,
  data: FeatureUpdatedEvent['data'],
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
  const updateData: FeatureUpdatedEvent['data'] = { ...data };
  delete updateData.id;
  const updatedFeature = await db.feature.update({
    where: {
      id: data.id,
    },
    data: updateData,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: FeatureUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: FEATURE_UPDATED,
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
      aggregate_type: AGGREGATE_FEATURE,
    };
  }

  return { response: updatedFeature, event };
};
eventStore.registerCommand(FEATURE_UPDATED, updateFeatureCommand, 1);

export const deleteFeatureCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Feature, 'id'>,
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
  const deletedFeature = await db.feature.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: FeatureDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: FEATURE_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_FEATURE,
    };
  }

  return { response: deletedFeature, event };
};
eventStore.registerCommand(FEATURE_DELETED, deleteFeatureCommand, 1);
