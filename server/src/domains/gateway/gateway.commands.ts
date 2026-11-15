import { ulid } from 'ulid';
import type { Agent, Approval, AuditEntry, Automation, Order, Policy, Quote } from '../../../prisma/generated/prisma/index';
import type { PrismaClientOrTx } from '../../services/database.ts';
import { eventStore } from '../../services/eventStore.ts';
import type { GatewayEvent, GatewayModel } from './gateway.events.ts';
import { AUTOMATION_CLAIMED, AUTOMATION_DELETED, GATEWAY_MODELS, POLICY_DRAFT_DISCARDED, SANDBOX_CLEARED } from './gateway.events.ts';

// Event-sourced writes for the gateway models. Same contract as the message
// domain: (db, data, { isRecreating, authorId, idempotencyKey }) →
// { response, event }; callers pass the event to `eventStore.log`.

type CommandOptions = { isRecreating?: boolean; authorId: string; idempotencyKey?: string };

const eventFor = (model: GatewayModel, name: string, data: Record<string, any>, id: string, opts: CommandOptions): GatewayEvent => ({
  id: opts.idempotencyKey ?? ulid(),
  name,
  data,
  meta: { authorId: opts.authorId, ts: Date.now(), version: 1 },
  aggregate_id: id,
  aggregate_type: GATEWAY_MODELS[model].aggregate,
});

const defineCommands = <Row extends { id: string }>(model: GatewayModel) => {
  const delegate = (db: PrismaClientOrTx) => (db as any)[model];

  const create = async (db: PrismaClientOrTx, data: Partial<Row> & { id: string }, opts: CommandOptions) => {
    const row: Row = await delegate(db).create({ data });
    const event = opts.isRecreating ? undefined : eventFor(model, GATEWAY_MODELS[model].created, row, row.id, opts);
    return { response: row, event };
  };

  const update = async (db: PrismaClientOrTx, data: Partial<Row> & { id: string }, opts: CommandOptions) => {
    const { id, ...changes } = data;
    const row: Row = await delegate(db).update({ where: { id }, data: changes });
    const event = opts.isRecreating ? undefined : eventFor(model, GATEWAY_MODELS[model].updated, data, id, opts);
    return { response: row, event };
  };

  eventStore.registerCommand(GATEWAY_MODELS[model].created, create, 1);
  eventStore.registerCommand(GATEWAY_MODELS[model].updated, update, 1);
  return { create, update };
};

export const policyCommands = defineCommands<Policy>('policy');
export const quoteCommands = defineCommands<Quote>('quote');
export const orderCommands = defineCommands<Order>('order');
export const approvalCommands = defineCommands<Approval>('approval');
export const auditEntryCommands = defineCommands<AuditEntry>('auditEntry');
export const agentCommands = defineCommands<Agent>('agent');
export const automationCommands = defineCommands<Automation>('automation');

export const createPolicyCommand = policyCommands.create;
export const updatePolicyCommand = policyCommands.update;
export const createQuoteCommand = quoteCommands.create;
export const createOrderCommand = orderCommands.create;
export const updateOrderCommand = orderCommands.update;
export const createApprovalCommand = approvalCommands.create;
export const updateApprovalCommand = approvalCommands.update;
export const appendAuditEntryCommand = auditEntryCommands.create;
export const createAgentCommand = agentCommands.create;
export const updateAgentCommand = agentCommands.update;
export const createAutomationCommand = automationCommands.create;
export const updateAutomationCommand = automationCommands.update;

export const deleteAutomationCommand = async (db: PrismaClientOrTx, data: { id: string }, opts: CommandOptions) => {
  await db.automation.deleteMany({ where: { id: data.id } });
  const event = opts.isRecreating ? undefined : eventFor('automation', AUTOMATION_DELETED, data, data.id, opts);
  return { response: null, event };
};

/**
 * Compare-and-set on `nextRunAt`: moves an automation from the slot it is due
 * at (`slot`) to `nextRunAt`. Only one process wins a slot, so two servers on
 * one database never both run it. `response.claimed` tells the caller.
 */
export const claimAutomationSlotCommand = async (db: PrismaClientOrTx, data: { id: string; slot: string; nextRunAt: string | null }, opts: CommandOptions) => {
  const { count } = await db.automation.updateMany({
    where: { id: data.id, nextRunAt: new Date(data.slot) },
    data: { nextRunAt: data.nextRunAt ? new Date(data.nextRunAt) : null },
  });
  const event = opts.isRecreating || count === 0 ? undefined : eventFor('automation', AUTOMATION_CLAIMED, data, data.id, opts);
  return { response: { claimed: count === 1 }, event };
};

eventStore.registerCommand(AUTOMATION_DELETED, deleteAutomationCommand, 1);
eventStore.registerCommand(AUTOMATION_CLAIMED, claimAutomationSlotCommand, 1);

/** Discards an unsigned draft version. Signed and superseded versions are never deleted. */
export const discardPolicyDraftCommand = async (db: PrismaClientOrTx, data: { id: string }, opts: CommandOptions) => {
  const { count } = await db.policy.deleteMany({ where: { id: data.id, status: 'draft' } });
  const event = opts.isRecreating || count === 0 ? undefined : eventFor('policy', POLICY_DRAFT_DISCARDED, data, data.id, opts);
  return { response: { discarded: count === 1 }, event };
};
eventStore.registerCommand(POLICY_DRAFT_DISCARDED, discardPolicyDraftCommand, 1);

/**
 * Judge sandbox reset: deletes every order, approval, quote, automation and
 * policy version of ONE sandbox organization (agents and audit entries stay —
 * the audit chain is global and append-only). Refuses any org whose metadata
 * isn't `{ sandbox: true }`, so it can never touch real data, even on replay.
 */
export const clearSandboxCommand = async (db: PrismaClientOrTx, data: { organizationId: string }, opts: CommandOptions) => {
  const org = await db.organization.findUnique({ where: { id: data.organizationId }, select: { metadata: true } });
  let sandbox = false;
  try {
    sandbox = JSON.parse(org?.metadata ?? 'null')?.sandbox === true;
  } catch {
    sandbox = false;
  }
  if (!sandbox) throw new Error(`Organization ${data.organizationId} is not a sandbox — refusing to clear it`);
  const where = { organizationId: data.organizationId };
  const approvals = (await db.approval.deleteMany({ where })).count;
  const orders = (await db.order.deleteMany({ where })).count;
  const quotes = (await db.quote.deleteMany({ where })).count;
  const automations = (await db.automation.deleteMany({ where })).count;
  const policies = (await db.policy.deleteMany({ where })).count;
  const event = opts.isRecreating ? undefined : eventFor('order', SANDBOX_CLEARED, data, data.organizationId, opts);
  return { response: { approvals, orders, quotes, automations, policies }, event };
};
eventStore.registerCommand(SANDBOX_CLEARED, clearSandboxCommand, 1);
