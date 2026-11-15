import { ulid } from 'ulid';
import type { Organization } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import type { OrganizationCreatedEvent, OrganizationDeletedEvent, OrganizationUpdatedEvent } from './organization.events.ts';
import { AGGREGATE_ORGANIZATION, ORGANIZATION_CREATED, ORGANIZATION_DELETED, ORGANIZATION_UPDATED } from './organization.events.ts';

export const createOrganizationCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Organization, 'id' | 'name' | 'slug'> & Partial<Omit<Organization, 'id' | 'name' | 'slug'>>,
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
  const newOrganization = await db.organization.create({
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: OrganizationCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: ORGANIZATION_CREATED,
      data: {
        ...newOrganization,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newOrganization.id.toString(),
      aggregate_type: AGGREGATE_ORGANIZATION,
    };
  }

  return { response: newOrganization, event };
};
eventStore.registerCommand(ORGANIZATION_CREATED, createOrganizationCommand, 1);

export const updateOrganizationCommand = async (
  db: PrismaClientOrTx,
  data: OrganizationUpdatedEvent['data'],
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
  const updatedOrganization = await db.organization.update({
    where: {
      id: data.id,
    },
    data,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: OrganizationUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: ORGANIZATION_UPDATED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id.toString(),
      aggregate_type: AGGREGATE_ORGANIZATION,
    };
  }

  return { response: updatedOrganization, event };
};
eventStore.registerCommand(ORGANIZATION_UPDATED, updateOrganizationCommand, 1);

export const deleteOrganizationCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Organization, 'id'>,
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
  const deletedOrganization = await db.organization.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: OrganizationDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: ORGANIZATION_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id.toString(),
      aggregate_type: AGGREGATE_ORGANIZATION,
    };
  }

  return { response: deletedOrganization, event };
};
eventStore.registerCommand(ORGANIZATION_DELETED, deleteOrganizationCommand, 1);
