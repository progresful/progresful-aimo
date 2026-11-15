import { ulid } from 'ulid';
import type { Verification } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import type { VerificationCreatedEvent, VerificationDeletedEvent, VerificationUpdatedEvent } from './verification.events.ts';
import { AGGREGATE_VERIFICATION, VERIFICATION_CREATED, VERIFICATION_DELETED, VERIFICATION_UPDATED } from './verification.events.ts';

export const createVerificationCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Verification, 'id' | 'identifier' | 'value' | 'expiresAt'> &
    Partial<Omit<Verification, 'id' | 'identifier' | 'value' | 'expiresAt'>>,
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
  const newVerification = await db.verification.create({
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: VerificationCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: VERIFICATION_CREATED,
      data: {
        ...newVerification,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newVerification.id,
      aggregate_type: AGGREGATE_VERIFICATION,
    };
  }

  return { response: newVerification, event };
};
eventStore.registerCommand(VERIFICATION_CREATED, createVerificationCommand, 1);

export const updateVerificationCommand = async (
  db: PrismaClientOrTx,
  data: VerificationUpdatedEvent['data'],
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
  const updatedVerification = await db.verification.update({
    where: {
      id: data.id,
    },
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: VerificationUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: VERIFICATION_UPDATED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_VERIFICATION,
    };
  }

  return { response: updatedVerification, event };
};
eventStore.registerCommand(VERIFICATION_UPDATED, updateVerificationCommand, 1);

export const deleteVerificationCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Verification, 'id'>,
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
  const deletedVerification = await db.verification.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: VerificationDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: VERIFICATION_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_VERIFICATION,
    };
  }

  return { response: deletedVerification, event };
};
eventStore.registerCommand(VERIFICATION_DELETED, deleteVerificationCommand, 1);
