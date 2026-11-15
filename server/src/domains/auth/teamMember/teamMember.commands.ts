import { ulid } from 'ulid';
import type { TeamMember } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import type { TeamMemberCreatedEvent, TeamMemberDeletedEvent, TeamMemberUpdatedEvent } from './teamMember.events.ts';
import { AGGREGATE_TEAM_MEMBER, TEAM_MEMBER_CREATED, TEAM_MEMBER_DELETED, TEAM_MEMBER_UPDATED } from './teamMember.events.ts';

export const createTeamMemberCommand = async (
  db: PrismaClientOrTx,
  data: Pick<TeamMember, 'id' | 'teamId' | 'userId'> & Partial<Omit<TeamMember, 'id' | 'teamId' | 'userId'>>,
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
  const newTeamMember = await db.teamMember.create({
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: TeamMemberCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: TEAM_MEMBER_CREATED,
      data: {
        ...newTeamMember,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newTeamMember.id,
      aggregate_type: AGGREGATE_TEAM_MEMBER,
    };
  }

  return { response: newTeamMember, event };
};
eventStore.registerCommand(TEAM_MEMBER_CREATED, createTeamMemberCommand, 1);

export const updateTeamMemberCommand = async (
  db: PrismaClientOrTx,
  data: TeamMemberUpdatedEvent['data'],
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
  const updatedTeamMember = await db.teamMember.update({
    where: {
      id: data.id,
    },
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: TeamMemberUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: TEAM_MEMBER_UPDATED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_TEAM_MEMBER,
    };
  }

  return { response: updatedTeamMember, event };
};
eventStore.registerCommand(TEAM_MEMBER_UPDATED, updateTeamMemberCommand, 1);

export const deleteTeamMemberCommand = async (
  db: PrismaClientOrTx,
  data: Pick<TeamMember, 'id'>,
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
  const deletedTeamMember = await db.teamMember.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: TeamMemberDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: TEAM_MEMBER_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_TEAM_MEMBER,
    };
  }

  return { response: deletedTeamMember, event };
};
eventStore.registerCommand(TEAM_MEMBER_DELETED, deleteTeamMemberCommand, 1);
