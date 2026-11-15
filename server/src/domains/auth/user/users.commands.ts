import { ulid } from 'ulid';
import { eventStore } from '../../../services/eventStore.ts';
import { anonymizationService } from '../../../services/anonymization.ts';
import type { User } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import type { UserCreatedEvent, UserDeletedEvent, UserForgottenEvent, UserUpdatedEvent } from './users.events.ts';
import { AGGREGATE_USER, USER_CREATED, USER_DELETED, USER_FORGOTTEN, USER_UPDATED } from './users.events.ts';

export const createUserCommand = async (
  db: PrismaClientOrTx,
  data: Pick<User, 'id' | 'email' | 'name'> & Partial<Omit<User, 'id' | 'email' | 'name' | 'password'>>,
  {
    isRecreating = false,
    authorId,
    idempotencyKey,
  }: {
    isRecreating?: boolean;
    authorId?: string;
    idempotencyKey?: string;
  }
) => {
  const newUser = await db.user.create({
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: UserCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: USER_CREATED,
      data: newUser,
      meta: {
        authorId: authorId ?? newUser.id,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newUser.id.toString(),
      aggregate_type: AGGREGATE_USER,
    };
  }

  return { response: newUser, event };
};
eventStore.registerCommand(USER_CREATED, createUserCommand, 1);

export const updateUserCommand = async (
  db: PrismaClientOrTx,
  data: UserUpdatedEvent['data'],
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
  const updateData: UserUpdatedEvent['data'] = { ...data };
  delete updateData.id;
  const updatedUser = await db.user.update({
    where: {
      id: data.id,
    },
    data: updateData,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: UserUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: USER_UPDATED,
      data: {
        ...updateData,
        id: data.id,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id.toString(),
      aggregate_type: AGGREGATE_USER,
    };
  }

  return { response: updatedUser, event };
};
eventStore.registerCommand(USER_UPDATED, updateUserCommand, 1);

export const deleteUserCommand = async (
  db: PrismaClientOrTx,
  data: UserDeletedEvent['data'],
  { isRecreating = false, authorId, idempotencyKey }: { isRecreating?: boolean; authorId: string; idempotencyKey?: string }
) => {
  const deletedUser = await db.user.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: UserDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: USER_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id.toString(),
      aggregate_type: AGGREGATE_USER,
    };
  }

  return { response: deletedUser, event };
};
eventStore.registerCommand(USER_DELETED, deleteUserCommand, 1);

export const forgetUserCommand = async (db: PrismaClientOrTx, data: UserForgottenEvent['data'], { authorId }: { authorId: string }) => {
  const userData = await db.user.findUnique({
    where: { id: data.id },
  });

  if (!userData) {
    throw new Error('User not found');
  }

  const anonymizedUser = anonymizationService.anonymizeAggregateSensitiveFields(userData, AGGREGATE_USER, data.id);
  const forgottenUser = await db.user.update({
    where: { id: data.id },
    data: anonymizedUser,
  });

  const eventId = ulid();

  let event: UserForgottenEvent | undefined;
  event = {
    id: eventId,
    name: USER_FORGOTTEN,
    data,
    meta: {
      authorId,
      ts: Date.now(),
      version: 1,
    },
    aggregate_id: data.id.toString(),
    aggregate_type: AGGREGATE_USER,
  };
  return { response: forgottenUser, event };
};
eventStore.registerCommand(USER_FORGOTTEN, forgetUserCommand, 1);
