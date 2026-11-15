import { ulid } from 'ulid';
import type { Invitation } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import type { InvitationCreatedEvent, InvitationDeletedEvent, InvitationUpdatedEvent } from './invitation.events.ts';
import { AGGREGATE_INVITATION, INVITATION_CREATED, INVITATION_DELETED, INVITATION_UPDATED } from './invitation.events.ts';

export const createInvitationCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Invitation, 'id' | 'organizationId' | 'email' | 'status' | 'expiresAt' | 'inviterId'> &
    Partial<Omit<Invitation, 'id' | 'organizationId' | 'email' | 'status' | 'expiresAt' | 'inviterId'>>,
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
  const newInvitation = await db.invitation.create({
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: InvitationCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: INVITATION_CREATED,
      data: {
        ...newInvitation,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newInvitation.id,
      aggregate_type: AGGREGATE_INVITATION,
    };
  }

  return { response: newInvitation, event };
};
eventStore.registerCommand(INVITATION_CREATED, createInvitationCommand, 1);

export const updateInvitationCommand = async (
  db: PrismaClientOrTx,
  data: InvitationUpdatedEvent['data'],
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
  const updatedInvitation = await db.invitation.update({
    where: {
      id: data.id,
    },
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: InvitationUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: INVITATION_UPDATED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_INVITATION,
    };
  }

  return { response: updatedInvitation, event };
};
eventStore.registerCommand(INVITATION_UPDATED, updateInvitationCommand, 1);

export const deleteInvitationCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Invitation, 'id'>,
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
  const deletedInvitation = await db.invitation.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: InvitationDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: INVITATION_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_INVITATION,
    };
  }

  return { response: deletedInvitation, event };
};
eventStore.registerCommand(INVITATION_DELETED, deleteInvitationCommand, 1);
