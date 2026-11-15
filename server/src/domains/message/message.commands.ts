import { ulid } from 'ulid';
import type { Message } from '../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../services/database.ts';
import { eventStore } from '../../services/eventStore.ts';
import type { MessageCreatedEvent, MessageDeletedEvent, MessageUpdatedEvent } from './message.events.ts';
import { AGGREGATE_MESSAGE, MESSAGE_CREATED, MESSAGE_DELETED, MESSAGE_UPDATED } from './message.events.ts';

export const createMessageCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Message, 'id' | 'content' | 'fromUserId'> & Partial<Omit<Message, 'id' | 'content' | 'fromUserId'>>,
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
  const newMessage = await db.message.create({ data });

  const eventId = idempotencyKey ?? ulid();

  let event: MessageCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MESSAGE_CREATED,
      data: newMessage,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newMessage.id,
      aggregate_type: AGGREGATE_MESSAGE,
    };
  }

  return { response: newMessage, event };
};
eventStore.registerCommand(MESSAGE_CREATED, createMessageCommand, 1);

export const updateMessageCommand = async (
  db: PrismaClientOrTx,
  data: MessageUpdatedEvent['data'],
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
  const updateData: MessageUpdatedEvent['data'] = { ...data };
  delete updateData.id;
  const updatedMessage = await db.message.update({
    where: {
      id: data.id,
    },
    data: updateData,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: MessageUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MESSAGE_UPDATED,
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
      aggregate_type: AGGREGATE_MESSAGE,
    };
  }

  return { response: updatedMessage, event };
};
eventStore.registerCommand(MESSAGE_UPDATED, updateMessageCommand, 1);

export const deleteMessageCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Message, 'id'>,
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
  const deletedMessage = await db.message.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: MessageDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MESSAGE_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_MESSAGE,
    };
  }

  return { response: deletedMessage, event };
};
eventStore.registerCommand(MESSAGE_DELETED, deleteMessageCommand, 1);
