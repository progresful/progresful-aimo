import { ulid } from 'ulid';
import type { Invitation, Team } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import type { TeamCreatedEvent, TeamDeletedEvent, TeamUpdatedEvent } from './team.events.ts';
import { AGGREGATE_TEAM, TEAM_CREATED, TEAM_DELETED, TEAM_UPDATED } from './team.events.ts';

export const createTeamCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Team, 'id' | 'name' | 'organizationId'> & Partial<Omit<Team, 'id' | 'name' | 'organizationId'>>,
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
  const newTeam = await db.team.create({
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: TeamCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: TEAM_CREATED,
      data: {
        ...newTeam,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newTeam.id,
      aggregate_type: AGGREGATE_TEAM,
    };
  }

  return { response: newTeam, event };
};
eventStore.registerCommand(TEAM_CREATED, createTeamCommand, 1);

export const updateTeamCommand = async (
  db: PrismaClientOrTx,
  data: TeamUpdatedEvent['data'],
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
  const updatedTeam = await db.team.update({
    where: {
      id: data.id,
    },
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: TeamUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: TEAM_UPDATED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_TEAM,
    };
  }

  return { response: updatedTeam, event };
};
eventStore.registerCommand(TEAM_UPDATED, updateTeamCommand, 1);

export const deleteTeamCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Team, 'id'>,
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
  const deletedTeam = await db.team.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: TeamDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: TEAM_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_TEAM,
    };
  }

  return { response: deletedTeam, event };
};
eventStore.registerCommand(TEAM_DELETED, deleteTeamCommand, 1);
