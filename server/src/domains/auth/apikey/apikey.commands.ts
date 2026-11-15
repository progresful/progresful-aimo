import { ulid } from 'ulid';
import type { Apikey } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import type { ApikeyCreatedEvent, ApikeyDeletedEvent, ApikeyUpdatedEvent } from './apikey.events.ts';
import { AGGREGATE_APIKEY, APIKEY_CREATED, APIKEY_DELETED, APIKEY_UPDATED } from './apikey.events.ts';

export const createApikeyCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Apikey, 'id' | 'key' | 'userId'> & Partial<Omit<Apikey, 'id' | 'key' | 'userId'>>,
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
  const newApikey = await db.apikey.create({
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: ApikeyCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: APIKEY_CREATED,
      data: {
        ...newApikey,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newApikey.id,
      aggregate_type: AGGREGATE_APIKEY,
    };
  }

  return { response: newApikey, event };
};
eventStore.registerCommand(APIKEY_CREATED, createApikeyCommand, 1);

export const updateApikeyCommand = async (
  db: PrismaClientOrTx,
  data: ApikeyUpdatedEvent['data'],
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
  const updatedApikey = await db.apikey.update({
    where: {
      id: data.id,
    },
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: ApikeyUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: APIKEY_UPDATED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_APIKEY,
    };
  }

  return { response: updatedApikey, event };
};
eventStore.registerCommand(APIKEY_UPDATED, updateApikeyCommand, 1);

export const deleteApikeyCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Apikey, 'id'>,
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
  const deletedApikey = await db.apikey.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: ApikeyDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: APIKEY_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_APIKEY,
    };
  }

  return { response: deletedApikey, event };
};
eventStore.registerCommand(APIKEY_DELETED, deleteApikeyCommand, 1);
