import { ulid } from 'ulid';
import type { Account } from '../../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../../services/database.ts';
import { eventStore } from '../../../services/eventStore.ts';
import { hashPassword } from '../password.utils.ts';
import type { AccountCreatedEvent, AccountDeletedEvent, AccountUpdatedEvent } from './account.events.ts';
import { AGGREGATE_ACCOUNT, ACCOUNT_CREATED, ACCOUNT_DELETED, ACCOUNT_UPDATED } from './account.events.ts';

export const createAccountCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Account, 'id' | 'accountId' | 'providerId' | 'userId'> & Partial<Omit<Account, 'id' | 'accountId' | 'providerId' | 'userId'>>,
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
  const password = isRecreating ? data.password : await hashPassword(data.password);
  const newAccount = await db.account.create({ data: { ...data, password } });

  const eventId = idempotencyKey ?? ulid();

  let event: AccountCreatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: ACCOUNT_CREATED,
      data: {
        ...newAccount,
        password,
      },
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: newAccount.id,
      aggregate_type: AGGREGATE_ACCOUNT,
    };
  }

  return { response: newAccount, event };
};
eventStore.registerCommand(ACCOUNT_CREATED, createAccountCommand, 1);

export const updateAccountCommand = async (
  db: PrismaClientOrTx,
  data: AccountUpdatedEvent['data'],
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
  const updateData: AccountUpdatedEvent['data'] = { ...data };
  delete updateData.id;
  if (data.password) {
    updateData.password = isRecreating ? data.password : await hashPassword(data.password);
  }
  const updatedAccount = await db.account.update({
    where: {
      id: data.id,
    },
    data: updateData,
  });

  const eventId = idempotencyKey ?? ulid();

  let event: AccountUpdatedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: ACCOUNT_UPDATED,
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
      aggregate_type: AGGREGATE_ACCOUNT,
    };
  }

  return { response: updatedAccount, event };
};
eventStore.registerCommand(ACCOUNT_UPDATED, updateAccountCommand, 1);

export const deleteAccountCommand = async (
  db: PrismaClientOrTx,
  data: Pick<Account, 'id'>,
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
  const deletedAccount = await db.account.delete({
    where: {
      id: data.id,
    },
  });

  const eventId = idempotencyKey ?? ulid();

  let event: AccountDeletedEvent | undefined;
  if (!isRecreating) {
    event = {
      id: eventId,
      name: ACCOUNT_DELETED,
      data,
      meta: {
        authorId,
        ts: Date.now(),
        version: 1,
      },
      aggregate_id: data.id,
      aggregate_type: AGGREGATE_ACCOUNT,
    };
  }

  return { response: deletedAccount, event };
};
eventStore.registerCommand(ACCOUNT_DELETED, deleteAccountCommand, 1);
