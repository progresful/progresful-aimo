import { ulid } from 'ulid';
import type { MessageRecipient } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import type {
  MessageRecipientCreatedEvent,
  MessageRecipientDeletedEvent,
  MessageRecipientReadEvent,
  MessageRecipientUnreadEvent,
  MessageRecipientUpdatedEvent,
} from './messageRecipient.events.ts';
import {
  AGGREGATE_MESSAGE_RECIPIENT,
  MESSAGE_RECIPIENT_CREATED,
  MESSAGE_RECIPIENT_DELETED,
  MESSAGE_RECIPIENT_READ,
  MESSAGE_RECIPIENT_UNREAD,
  MESSAGE_RECIPIENT_UPDATED,
} from './messageRecipient.events.ts';

export const createMessageRecipientCommand = async (
  db: PrismaClientOrTx,
  data: Pick<MessageRecipient, 'id' | 'messageId' | 'toUserId'> & Partial<Omit<MessageRecipient, 'id' | 'messageId' | 'toUserId'>>,
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
  const newMessageRecipient = await db.messageRecipient.create({ data });

  const eventId = idempotencyKey ?? ulid();

  let event: MessageRecipientCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MESSAGE_RECIPIENT_CREATED,
      data: newMessageRecipient,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newMessageRecipient.id,
      aggregate_type: AGGREGATE_MESSAGE_RECIPIENT,
    };
  }

  return { response: newMessageRecipient, event };
};
eventStore.registerCommand(MESSAGE_RECIPIENT_CREATED, createMessageRecipientCommand, 1);

export const createManyMessageRecipientsCommand = async (
  db: PrismaClientOrTx,
  data: (Pick<MessageRecipient, 'id' | 'messageId' | 'toUserId'> & Partial<Omit<MessageRecipient, 'id' | 'messageId' | 'toUserId'>>)[],
  {
    isRecreating = false,
    authorId,
  }: {
    isRecreating?: boolean;
    authorId: string;
  }
) => {
  await db.messageRecipient.createMany({
    data,
  });
  const newMessageRecipients = await db.messageRecipient.findMany({
    where: {
      messageId: data[0].messageId,
      toUserId: {
        in: data.map((recipient) => recipient.toUserId),
      },
    },
  });

  let events: MessageRecipientCreatedEvent[] = [];
  if (!isRecreating) {
    events = newMessageRecipients.map((newMessageRecipient) => ({
      id: ulid(),
      name: MESSAGE_RECIPIENT_CREATED,
      data: newMessageRecipient,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newMessageRecipient.id,
      aggregate_type: AGGREGATE_MESSAGE_RECIPIENT,
    }));
  }

  return { response: newMessageRecipients, events };
};

export const updateMessageRecipientCommand = async (
  db: PrismaClientOrTx,
  data: MessageRecipientUpdatedEvent['data'],
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
  const updateData: MessageRecipientUpdatedEvent['data'] = { ...data };
  delete updateData.id;
  const updatedMessageRecipient = await db.messageRecipient.update({
    where: {
      id: data.id,
    },
    data: updateData,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: MessageRecipientUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MESSAGE_RECIPIENT_UPDATED,
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
      aggregate_type: AGGREGATE_MESSAGE_RECIPIENT,
    };
  }

  return { response: updatedMessageRecipient, event };
};
eventStore.registerCommand(MESSAGE_RECIPIENT_UPDATED, updateMessageRecipientCommand, 1);

export const deleteMessageRecipientCommand = async (
  db: PrismaClientOrTx,
  data: Pick<MessageRecipient, 'id'>,
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
  const deletedMessageRecipient = await db.messageRecipient.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: MessageRecipientDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MESSAGE_RECIPIENT_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_MESSAGE_RECIPIENT,
    };
  }

  return { response: deletedMessageRecipient, event };
};
eventStore.registerCommand(MESSAGE_RECIPIENT_DELETED, deleteMessageRecipientCommand, 1);

export const readMessageRecipientCommand = async (
  db: PrismaClientOrTx,
  data: Pick<MessageRecipient, 'id'>,
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
  const readAt = new Date();
  const readMessageRecipient = await db.messageRecipient.update({
    where: {
      id: data.id,
    },
    data: {
      readAt,
    },
  });
  const eventId = idempotencyKey ?? ulid();

  let event: MessageRecipientReadEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MESSAGE_RECIPIENT_READ,
      data: {
        ...data,
        readAt,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_MESSAGE_RECIPIENT,
    };
  }
  return { response: readMessageRecipient, event };
};

eventStore.registerCommand(MESSAGE_RECIPIENT_READ, readMessageRecipientCommand, 1);

export const unreadMessageRecipientCommand = async (
  db: PrismaClientOrTx,
  data: Pick<MessageRecipient, 'id'>,
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
  const unreadMessageRecipient = await db.messageRecipient.update({
    where: {
      id: data.id,
    },
    data: {
      readAt: null,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: MessageRecipientUnreadEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MESSAGE_RECIPIENT_UNREAD,
      data: {
        id: data.id,
        readAt: null,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_MESSAGE_RECIPIENT,
    };
  }
  return { response: unreadMessageRecipient, event };
};
eventStore.registerCommand(MESSAGE_RECIPIENT_UNREAD, unreadMessageRecipientCommand, 1);
