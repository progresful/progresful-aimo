import { ulid } from 'ulid';
import type { Member } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import type { MemberCreatedEvent, MemberDeletedEvent, MemberUpdatedEvent } from './member.events.ts';
import { AGGREGATE_MEMBER, MEMBER_CREATED, MEMBER_DELETED, MEMBER_UPDATED } from './member.events.ts';

export const createMemberCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Member, 'id' | 'organizationId' | 'userId' | 'role'> & Partial<Omit<Member, 'id' | 'organizationId' | 'userId' | 'role'>>,
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
  const newMember = await db.member.create({
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: MemberCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MEMBER_CREATED,
      data: {
        ...newMember,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newMember.id,
      aggregate_type: AGGREGATE_MEMBER,
    };
  }

  return { response: newMember, event };
};
eventStore.registerCommand(MEMBER_CREATED, createMemberCommand, 1);

export const updateMemberCommand = async (
  db: PrismaClientOrTx,
  data: MemberUpdatedEvent['data'],
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
  const updatedMember = await db.member.update({
    where: {
      id: data.id,
    },
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: MemberUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MEMBER_UPDATED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_MEMBER,
    };
  }

  return { response: updatedMember, event };
};
eventStore.registerCommand(MEMBER_UPDATED, updateMemberCommand, 1);

export const deleteMemberCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Member, 'id'>,
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
  const deletedMember = await db.member.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: MemberDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: MEMBER_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_MEMBER,
    };
  }

  return { response: deletedMember, event };
};
eventStore.registerCommand(MEMBER_DELETED, deleteMemberCommand, 1);
