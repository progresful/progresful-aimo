import type { Request, Response } from 'express';
import { ulid } from 'ulid';

import { getAuthorizedSession } from '../../middleware/session.ts';
import prisma from '../../services/database.ts';
import { eventStore } from '../../services/eventStore.ts';
import * as messageValidation from './message.validation.ts';
import * as messageCommands from './message.commands.ts';
import * as messageRecipientCommands from './messageRecipient/messageRecipient.commands.ts';
import { AppError } from '../../utils/AppError.ts';

export const getMyMessages = async (req: Request, res: Response) => {
  const { user } = await getAuthorizedSession(req)!;

  const userAsRecipientMessages = await prisma.messageRecipient.findMany({
    where: {
      user: {
        id: user.id,
      },
    },
  });

  if (userAsRecipientMessages.length === 0) {
    return res.json([]);
  }

  const messages = await prisma.message.findMany({
    where: {
      id: {
        in: userAsRecipientMessages.map((message) => message.messageId),
      },
    },
  });

  res.json(
    messages.map((message) => {
      const recipientMessage = userAsRecipientMessages.find((recipient) => recipient.messageId === message.id)!;
      return {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        deletedAt: message.deletedAt,
        fromUserId: message.fromUserId,
        fromType: message.fromType,
        organizationId: message.organizationId,
        teamId: message.teamId,
        isRead: recipientMessage.readAt !== null,
        readAt: recipientMessage.readAt,
      };
    })
  );
};

export const createMessage = async (req: Request, res: Response) => {
  const { user } = await getAuthorizedSession(req)!;
  const { recipientIds, ...messageData } = messageValidation.createMessage.parse(req).body;
  const { response: message, event } = await messageCommands.createMessageCommand(
    prisma,
    {
      id: ulid(),
      fromUserId: user.id,
      ...messageData,
    },
    {
      authorId: user.id,
    }
  );
  await eventStore.log(event);

  const { response: messageRecipients, events } = await messageRecipientCommands.createManyMessageRecipientsCommand(
    prisma,
    recipientIds.map((recipientId) => ({
      id: ulid(),
      messageId: message.id,
      toUserId: recipientId,
    })),
    {
      authorId: user.id,
    }
  );
  await eventStore.log(...events);

  // TODO: dispatch via websocket to the recipients

  res.json({
    id: message.id,
    content: message.content,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    deletedAt: message.deletedAt,
    fromUserId: message.fromUserId,
    fromType: message.fromType,
    organizationId: message.organizationId,
    teamId: message.teamId,
    recipients: messageRecipients.map((recipient) => ({
      id: recipient.id,
      toUserId: recipient.toUserId,
      createdAt: recipient.createdAt,
      updatedAt: recipient.updatedAt,
      deletedAt: recipient.deletedAt,
      isRead: recipient.readAt !== null,
      readAt: recipient.readAt,
    })),
  });
};

export const getMessage = async (req: Request, res: Response) => {
  const { user } = await getAuthorizedSession(req)!;
  const { messageId } = messageValidation.getMessage.parse(req).params;
  const message = await prisma.message.findUnique({
    where: {
      id: messageId,
    },
  });
  if (!message) {
    throw new AppError('Message not found', 404, { messageId });
  }
  const recipientMessage = await prisma.messageRecipient.findFirst({
    where: {
      messageId: messageId,
      toUserId: user.id,
    },
  });
  if (!recipientMessage) {
    throw new AppError('Recipient message not found', 404, { messageId, userId: user.id });
  }
  res.json({
    id: message.id,
    content: message.content,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    deletedAt: message.deletedAt,
    fromUserId: message.fromUserId,
    fromType: message.fromType,
    organizationId: message.organizationId,
    teamId: message.teamId,
    isRead: recipientMessage.readAt !== null,
    readAt: recipientMessage.readAt,
  });
};

export const updateMessage = async (req: Request, res: Response) => {
  const { user } = await getAuthorizedSession(req)!;
  const { body, params } = messageValidation.updateMessage.parse(req);
  const { response: message, event } = await messageCommands.updateMessageCommand(
    prisma,
    {
      id: params.messageId,
      ...body,
    },
    {
      authorId: user.id,
    }
  );
  await eventStore.log(event);

  // TODO: dispatch updated message via websocket to the recipients

  res.json({
    id: message.id,
    content: message.content,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    deletedAt: message.deletedAt,
  });
};

export const deleteMessage = async (req: Request, res: Response) => {
  const { user } = await getAuthorizedSession(req)!;
  const { messageId } = messageValidation.deleteMessage.parse(req).params;
  const { event } = await messageCommands.deleteMessageCommand(
    prisma,
    {
      id: messageId,
    },
    {
      authorId: user.id,
    }
  );
  await eventStore.log(event);

  // TODO: dispatch deleted message via websocket to the recipients

  res.sendStatus(204);
};
