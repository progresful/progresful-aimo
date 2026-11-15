import { ulid } from 'ulid';
import type { BetterAuthOptions, Where } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

import db from '../database.ts';
import { eventStore } from '../eventStore.ts';

import { AGGREGATE_ACCOUNT, ACCOUNT_CREATED, ACCOUNT_UPDATED, ACCOUNT_DELETED } from '../../domains/auth/account/account.events.ts';
import { AGGREGATE_APIKEY, APIKEY_CREATED, APIKEY_DELETED, APIKEY_UPDATED } from '../../domains/auth/apikey/apikey.events.ts';
import { AGGREGATE_FEATURE, FEATURE_CREATED, FEATURE_DELETED, FEATURE_UPDATED } from '../../domains/auth/feature/feature.events.ts';
import {
  AGGREGATE_FEATURE_FLAG,
  FEATURE_FLAG_CREATED,
  FEATURE_FLAG_DELETED,
  FEATURE_FLAG_UPDATED,
} from '../../domains/auth/featureFlag/featureFlag.events.ts';
import {
  AGGREGATE_INVITATION,
  INVITATION_CREATED,
  INVITATION_DELETED,
  INVITATION_UPDATED,
} from '../../domains/auth/invitation/invitation.events.ts';
import { AGGREGATE_MEMBER, MEMBER_CREATED, MEMBER_DELETED, MEMBER_UPDATED } from '../../domains/auth/member/member.events.ts';
import {
  AGGREGATE_ORGANIZATION,
  ORGANIZATION_CREATED,
  ORGANIZATION_DELETED,
  ORGANIZATION_UPDATED,
} from '../../domains/auth/organization/organization.events.ts';
import { AGGREGATE_TEAM, TEAM_CREATED, TEAM_DELETED, TEAM_UPDATED } from '../../domains/auth/team/team.events.ts';
import {
  AGGREGATE_TEAM_MEMBER,
  TEAM_MEMBER_CREATED,
  TEAM_MEMBER_DELETED,
  TEAM_MEMBER_UPDATED,
} from '../../domains/auth/teamMember/teamMember.events.ts';
import { AGGREGATE_USER, USER_CREATED, USER_DELETED, USER_UPDATED } from '../../domains/auth/user/users.events.ts';
import {
  AGGREGATE_VERIFICATION,
  VERIFICATION_CREATED,
  VERIFICATION_DELETED,
  VERIFICATION_UPDATED,
} from '../../domains/auth/verification/verification.events.ts';

let customerAdapter: any;

export const databaseAdapter = (options: BetterAuthOptions) => {
  if (customerAdapter) {
    return customerAdapter;
  }
  const adapter = prismaAdapter(db, {
    provider: 'sqlite',
  })(options);
  const originalCreate = adapter.create;
  adapter.create = async <T extends Record<string, any>, R = T>(data: {
    model: string;
    data: Omit<T, 'id'>;
    select?: string[];
    forceAllowId?: boolean;
  }): Promise<R> => {
    const result = (await originalCreate<T, R>(data)) as R & { id: string };
    let eventName: string;
    let aggregateType: string;
    switch (data.model) {
      case 'account':
        eventName = ACCOUNT_CREATED;
        aggregateType = AGGREGATE_ACCOUNT;
        break;
      case 'apikey':
        eventName = APIKEY_CREATED;
        aggregateType = AGGREGATE_APIKEY;
        break;
      case 'feature':
        eventName = FEATURE_CREATED;
        aggregateType = AGGREGATE_FEATURE;
        break;
      case 'featureFlag':
        eventName = FEATURE_FLAG_CREATED;
        aggregateType = AGGREGATE_FEATURE_FLAG;
        break;
      case 'invitation':
        eventName = INVITATION_CREATED;
        aggregateType = AGGREGATE_INVITATION;
        break;
      case 'member':
        eventName = MEMBER_CREATED;
        aggregateType = AGGREGATE_MEMBER;
        break;
      case 'organization':
        eventName = ORGANIZATION_CREATED;
        aggregateType = AGGREGATE_ORGANIZATION;
        break;
      case 'team':
        eventName = TEAM_CREATED;
        aggregateType = AGGREGATE_TEAM;
        break;
      case 'teamMember':
        eventName = TEAM_MEMBER_CREATED;
        aggregateType = AGGREGATE_TEAM_MEMBER;
        break;
      case 'user':
        eventName = USER_CREATED;
        aggregateType = AGGREGATE_USER;
        break;
      case 'session':
        // Not storing session events
        break;
      case 'verification':
        eventName = VERIFICATION_CREATED;
        aggregateType = AGGREGATE_VERIFICATION;
        break;
      default: {
        console.warn('unknown event', data.model, result);
        break;
      }
    }
    if (eventName && aggregateType) {
      await eventStore.log({
        id: ulid(),
        name: eventName,
        data: result,
        meta: {
          authorId: result.id,
          ts: Date.now(),
          version: 1,
        },
        aggregate_id: result.id,
        aggregate_type: aggregateType,
      });
    }
    return result;
  };

  const originalUpdate = adapter.update;
  adapter.update = async <T>(data: { model: string; where: Where[]; update: Record<string, any> }): Promise<T | null> => {
    const affectedEntries = await adapter.findMany({ model: data.model, where: data.where });
    let eventName: string;
    let aggregateType: string;
    const result = await originalUpdate<T>(data);
    switch (data.model) {
      case 'account':
        eventName = ACCOUNT_UPDATED;
        aggregateType = AGGREGATE_ACCOUNT;
        break;
      case 'apikey':
        eventName = APIKEY_UPDATED;
        aggregateType = AGGREGATE_APIKEY;
        break;
      case 'feature':
        eventName = FEATURE_UPDATED;
        aggregateType = AGGREGATE_FEATURE;
        break;
      case 'featureFlag':
        eventName = FEATURE_FLAG_UPDATED;
        aggregateType = AGGREGATE_FEATURE_FLAG;
        break;
      case 'invitation':
        eventName = INVITATION_UPDATED;
        aggregateType = AGGREGATE_INVITATION;
        break;
      case 'member':
        eventName = MEMBER_UPDATED;
        aggregateType = AGGREGATE_MEMBER;
        break;
      case 'organization':
        eventName = ORGANIZATION_UPDATED;
        aggregateType = AGGREGATE_ORGANIZATION;
        break;
      case 'team':
        eventName = TEAM_UPDATED;
        aggregateType = AGGREGATE_TEAM;
        break;
      case 'teamMember':
        eventName = TEAM_MEMBER_UPDATED;
        aggregateType = AGGREGATE_TEAM_MEMBER;
        break;
      case 'user':
        eventName = USER_UPDATED;
        aggregateType = AGGREGATE_USER;
        break;
      case 'verification':
        eventName = VERIFICATION_UPDATED;
        aggregateType = AGGREGATE_VERIFICATION;
        break;
      case 'session':
        // Not storing session events
        break;
      default: {
        console.warn('unknown event', data.model, result);
        break;
      }
    }
    if (eventName && aggregateType) {
      await eventStore.log(
        ...affectedEntries.map((entry: { id: string }) => ({
          id: ulid(),
          name: eventName,
          data: {
            ...data.update,
            id: entry.id,
          },
          meta: {
            authorId: entry.id,
            ts: Date.now(),
            version: 1,
          },
          aggregate_id: entry.id,
          aggregate_type: aggregateType,
        }))
      );
    }
    return result;
  };

  const originalUpdateMany = adapter.updateMany;
  adapter.updateMany = async (data: { model: string; where: Where[]; update: Record<string, any> }): Promise<number> => {
    const affectedEntries = await adapter.findMany({ model: data.model, where: data.where });
    const result = await originalUpdateMany(data);
    let eventName: string;
    let aggregateType: string;
    switch (data.model) {
      case 'account':
        eventName = ACCOUNT_UPDATED;
        aggregateType = AGGREGATE_ACCOUNT;
        break;
      case 'apikey':
        eventName = APIKEY_UPDATED;
        aggregateType = AGGREGATE_APIKEY;
        break;
      case 'feature':
        eventName = FEATURE_UPDATED;
        aggregateType = AGGREGATE_FEATURE;
        break;
      case 'featureFlag':
        eventName = FEATURE_FLAG_UPDATED;
        aggregateType = AGGREGATE_FEATURE_FLAG;
        break;
      case 'invitation':
        eventName = INVITATION_UPDATED;
        aggregateType = AGGREGATE_INVITATION;
        break;
      case 'member':
        eventName = MEMBER_UPDATED;
        aggregateType = AGGREGATE_MEMBER;
        break;
      case 'organization':
        eventName = ORGANIZATION_UPDATED;
        aggregateType = AGGREGATE_ORGANIZATION;
        break;
      case 'team':
        eventName = TEAM_UPDATED;
        aggregateType = AGGREGATE_TEAM;
        break;
      case 'teamMember':
        eventName = TEAM_MEMBER_UPDATED;
        aggregateType = AGGREGATE_TEAM_MEMBER;
        break;
      case 'user':
        eventName = USER_UPDATED;
        aggregateType = AGGREGATE_USER;
        break;
      case 'verification':
        eventName = VERIFICATION_UPDATED;
        aggregateType = AGGREGATE_VERIFICATION;
        break;
      case 'session':
        // Not storing session events
        break;
      default: {
        console.warn('unknown event', data.model, result);
        break;
      }
    }
    if (eventName && aggregateType) {
      await eventStore.log(
        ...affectedEntries.map((entry: { id: string }) => ({
          id: ulid(),
          name: eventName,
          data: {
            ...data.update,
            id: entry.id,
          },
          meta: {
            authorId: entry.id,
            ts: Date.now(),
            version: 1,
          },
          aggregate_id: entry.id,
          aggregate_type: aggregateType,
        }))
      );
    }
    return result;
  };

  const originalDelete = adapter.delete;
  adapter.delete = async <T>(data: { model: string; where: Where[] }): Promise<void> => {
    const affectedEntries = await adapter.findMany({ model: data.model, where: data.where });
    const result = await originalDelete<T>(data);
    let eventName: string;
    let aggregateType: string;
    switch (data.model) {
      case 'account':
        eventName = ACCOUNT_DELETED;
        aggregateType = AGGREGATE_ACCOUNT;
        break;
      case 'apikey':
        eventName = APIKEY_DELETED;
        aggregateType = AGGREGATE_APIKEY;
        break;
      case 'feature':
        eventName = FEATURE_DELETED;
        aggregateType = AGGREGATE_FEATURE;
        break;
      case 'featureFlag':
        eventName = FEATURE_FLAG_DELETED;
        aggregateType = AGGREGATE_FEATURE_FLAG;
        break;
      case 'invitation':
        eventName = INVITATION_DELETED;
        aggregateType = AGGREGATE_INVITATION;
        break;
      case 'member':
        eventName = MEMBER_DELETED;
        aggregateType = AGGREGATE_MEMBER;
        break;
      case 'organization':
        eventName = ORGANIZATION_DELETED;
        aggregateType = AGGREGATE_ORGANIZATION;
        break;
      case 'team':
        eventName = TEAM_DELETED;
        aggregateType = AGGREGATE_TEAM;
        break;
      case 'teamMember':
        eventName = TEAM_MEMBER_DELETED;
        aggregateType = AGGREGATE_TEAM_MEMBER;
        break;
      case 'user':
        eventName = USER_DELETED;
        aggregateType = AGGREGATE_USER;
        break;
      case 'verification':
        eventName = VERIFICATION_DELETED;
        aggregateType = AGGREGATE_VERIFICATION;
        break;
      case 'session':
        // Not storing session events
        break;
      default: {
        console.warn('unknown event', data.model, result);
        break;
      }
    }
    if (eventName && aggregateType) {
      await eventStore.log(
        ...affectedEntries.map((entry: { id: string }) => ({
          id: ulid(),
          name: eventName,
          data: {
            id: entry.id,
          },
          meta: {
            authorId: entry.id,
            ts: Date.now(),
            version: 1,
          },
          aggregate_id: entry.id,
          aggregate_type: aggregateType,
        }))
      );
    }
    return result;
  };

  const originalDeleteMany = adapter.deleteMany;
  adapter.deleteMany = async (data: { model: string; where: Where[] }): Promise<number> => {
    const affectedEntries = await adapter.findMany({ model: data.model, where: data.where });
    const result = await originalDeleteMany(data);
    let eventName: string;
    let aggregateType: string;
    switch (data.model) {
      case 'account':
        eventName = ACCOUNT_DELETED;
        aggregateType = AGGREGATE_ACCOUNT;
        break;
      case 'apikey':
        eventName = APIKEY_DELETED;
        aggregateType = AGGREGATE_APIKEY;
        break;
      case 'feature':
        eventName = FEATURE_DELETED;
        aggregateType = AGGREGATE_FEATURE;
        break;
      case 'featureFlag':
        eventName = FEATURE_FLAG_DELETED;
        aggregateType = AGGREGATE_FEATURE_FLAG;
        break;
      case 'invitation':
        eventName = INVITATION_DELETED;
        aggregateType = AGGREGATE_INVITATION;
        break;
      case 'member':
        eventName = MEMBER_DELETED;
        aggregateType = AGGREGATE_MEMBER;
        break;
      case 'organization':
        eventName = ORGANIZATION_DELETED;
        aggregateType = AGGREGATE_ORGANIZATION;
        break;
      case 'team':
        eventName = TEAM_DELETED;
        aggregateType = AGGREGATE_TEAM;
        break;
      case 'teamMember':
        eventName = TEAM_MEMBER_DELETED;
        aggregateType = AGGREGATE_TEAM_MEMBER;
        break;
      case 'user':
        eventName = USER_DELETED;
        aggregateType = AGGREGATE_USER;
        break;
      case 'verification':
        eventName = VERIFICATION_DELETED;
        aggregateType = AGGREGATE_VERIFICATION;
        break;
      case 'session':
        // Not storing session events
        break;
      default: {
        console.warn('unknown event', data.model, result);
        break;
      }
    }
    if (eventName && aggregateType) {
      await eventStore.log(
        ...affectedEntries.map((entry: { id: string }) => ({
          id: ulid(),
          name: eventName,
          data: {
            id: entry.id,
          },
          meta: {
            authorId: entry.id,
            ts: Date.now(),
            version: 1,
          },
          aggregate_id: entry.id,
          aggregate_type: aggregateType,
        }))
      );
    }
    return result;
  };

  const originalTransaction = adapter.transaction;
  adapter.transaction = async <R>(callback: (trx: any) => Promise<R>): Promise<R> => {
    console.log('transaction started', callback.name, Date.now());
    const result = await originalTransaction(callback);
    console.log('transaction ended', callback.name, Date.now());
    return result;
  };

  const originalFindOne = adapter.findOne;
  adapter.findOne = async <T>(data: { model: string; where: Where[]; select?: string[] }): Promise<T> => {
    // @ts-ignore
    const result = await originalFindOne<T>({ ...data, include: { organization: true } });
    if (data.model === 'invitation') {
      if (result && 'organizationId' in (result as Record<string, any>)) {
        // @ts-ignore
        const org = await originalFindOne({
          model: 'organization',
          where: [{ field: 'id', operator: 'eq', value: (result as Record<string, any>).organizationId }],
        });
        // @ts-ignore
        result.organizationName = org.name;
      }
    }
    return result;
  };

  const originalFindMany = adapter.findMany;
  adapter.findMany = async <T>(data: { model: string; where: Where[]; select?: string[] }): Promise<T[]> => {
    // @ts-ignore
    let results = await originalFindMany<T>({ ...data, include: { organization: true } });
    if (data.model === 'invitation') {
      // @ts-ignore
      const orgIds = [...new Set(results.map((result) => result.organizationId))];
      if (orgIds) {
        // @ts-ignore
        const orgs = await originalFindMany({
          model: 'organization',
          where: orgIds.map((orgId) => ({ field: 'id', operator: 'eq', value: orgId })),
        });
        results = results.map((result) => ({
          ...result,
          // @ts-ignore
          organizationName: orgs.find((org: { id: string; name: string }) => org.id === result.organizationId)?.name,
        }));
      }
    }
    return results;
  };

  customerAdapter = adapter;

  return adapter;
};
