import { ulid } from 'ulid';
import type { Agent, Automation } from '../../../prisma/generated/prisma/index';
import prisma from '../../services/database.ts';
import { eventStore } from '../../services/eventStore.ts';
import logger from '../../services/logger.ts';
import { AppError } from '../../utils/AppError.ts';
import type { Caller } from './gateway.auth.ts';
import { claimAutomationSlotCommand, createAutomationCommand, deleteAutomationCommand, updateAutomationCommand } from './gateway.commands.ts';
import { placeOrder } from './gateway.orders.ts';
import type { RunContext } from './gateway.orders.ts';
import { productByCode } from './gateway.products.ts';
import type { Schedule } from './gateway.schedule.ts';
import { earliestDelivery, fetchAvailability } from './valio.client.ts';
import { MISSED_SLOT_GRACE_MS, deliveryDateFor, nextRunAfter, normalizeDays, scheduleLabel } from './gateway.schedule.ts';
import { localDay } from './gateway.time.ts';
import type { RequestUnit } from './policy.engine.ts';
import { UnitMismatchError, toSalesUnits } from './policy.engine.ts';

// Automations: standing orders the gateway places itself, on a schedule, as
// the automation's agent and under that agent's signed policy. Every run goes
// through the real `placeOrder` (quote, policy, approval, audit) — they are
// real orders. The sweeper claims each due slot with a compare-and-set on
// `nextRunAt` and orders with idempotencyKey `auto:<id>:<slot ISO>`, so a
// restart or a second server never orders the same slot twice.

export const DEFAULT_AUTOMATION_AGENT = 'agt_gemini';

type Line = { code: string; quantity: number; unit: RequestUnit };

const linesOf = (a: Automation) => (a.lines as unknown as Line[]) ?? [];
const scheduleOf = (a: Automation): Schedule => ({ days: a.days, time: a.time, leadDays: a.leadDays });

/** Products must exist and be sold in the requested unit, or the standing order would fail on every run. */
const validateLines = (lines: Line[]) => {
  for (const l of lines) {
    const p = productByCode(l.code);
    if (!p) throw new AppError(`Unknown product ${l.code}`, 422, { code: l.code });
    try {
      toSalesUnits(l.quantity, l.unit, p);
    } catch (err) {
      if (err instanceof UnitMismatchError) throw new AppError(err.message, 422, { code: l.code, unit: l.unit });
      throw err;
    }
  }
  return lines;
};

const agentIn = async (organizationId: string, agentId: string) => {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, organizationId } });
  if (!agent) throw new AppError('Agent not found in this organization', 404, { agentId });
  return agent;
};

const find = async (caller: Caller, id: string) => {
  const a = await prisma.automation.findFirst({ where: { id, organizationId: caller.organizationId } });
  // Agents see (and run) only the automations that act as them.
  if (!a || (caller.agent && a.agentId !== caller.agent.id)) throw new AppError('Automation not found', 404, { id });
  return a;
};

const nextRunFor = (a: Pick<Automation, 'enabled' | 'days' | 'time'>, now = new Date()) => (a.enabled ? nextRunAfter(a, now) : null);

// --- Views -------------------------------------------------------------------------

const ordersOf = (automationId: string) => ({ request: { path: ['automationId'], equals: automationId } });

export const automationView = async (a: Automation, agents?: Map<string, Agent>) => {
  const agent = agents?.get(a.agentId) ?? (await prisma.agent.findUnique({ where: { id: a.agentId } }));
  const policyKey = agent?.policyId ?? null;
  const [policy, last, runsLast7Days] = await Promise.all([
    policyKey
      ? prisma.policy.findFirst({ where: { organizationId: a.organizationId, key: policyKey, status: 'signed' }, orderBy: { version: 'desc' } }).then(
          async (signed) => signed ?? (await prisma.policy.findFirst({ where: { organizationId: a.organizationId, key: policyKey }, orderBy: { version: 'desc' } }))
        )
      : null,
    prisma.order.findFirst({ where: { organizationId: a.organizationId, ...ordersOf(a.id) }, orderBy: { createdAt: 'desc' } }),
    prisma.order.count({ where: { organizationId: a.organizationId, ...ordersOf(a.id), createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } }),
  ]);
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    enabled: a.enabled,
    schedule: scheduleOf(a),
    scheduleLabel: scheduleLabel(scheduleOf(a)),
    lines: linesOf(a).map((l) => ({ code: l.code, name: productByCode(l.code)?.name ?? l.code, quantity: l.quantity, unit: l.unit })),
    allowSubstitutes: a.allowSubstitutes,
    agent: { id: a.agentId, name: agent?.name ?? a.agentId },
    policy: { key: policyKey, version: policy?.status === 'signed' ? policy.version : null, name: policy?.name ?? null },
    lastRun: last ? { orderId: last.id, status: last.status, at: last.createdAt.toISOString(), total: last.total, committedTotal: last.committedTotal } : null,
    nextRunAt: a.enabled && a.nextRunAt ? a.nextRunAt.toISOString() : null,
    runsLast7Days,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
};

export const listAutomations = async (caller: Caller) => {
  const rows = await prisma.automation.findMany({
    where: { organizationId: caller.organizationId, ...(caller.agent ? { agentId: caller.agent.id } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  const agents = new Map((await prisma.agent.findMany({ where: { organizationId: caller.organizationId } })).map((a) => [a.id, a]));
  return Promise.all(rows.map((a) => automationView(a, agents)));
};

export const getAutomation = async (caller: Caller, id: string) => automationView(await find(caller, id));

// --- Writes --------------------------------------------------------------------------

export type AutomationInput = {
  name: string;
  description?: string | null;
  schedule: Schedule;
  lines: Line[];
  agentId?: string;
  enabled?: boolean;
  allowSubstitutes?: boolean;
};

/** Creates an automation (also used by the seed, with a fixed id). */
export const createAutomation = async (organizationId: string, input: AutomationInput, authorId: string, opts: { id?: string; at?: Date } = {}) => {
  // No agentId: agt_gemini, or the org's first agent where that doesn't exist (the judge sandbox).
  const agent = input.agentId
    ? await agentIn(organizationId, input.agentId)
    : ((await prisma.agent.findFirst({ where: { id: DEFAULT_AUTOMATION_AGENT, organizationId } })) ??
      (await prisma.agent.findFirst({ where: { organizationId }, orderBy: { createdAt: 'asc' } })) ??
      (await agentIn(organizationId, DEFAULT_AUTOMATION_AGENT)));
  const at = opts.at ?? new Date();
  const enabled = input.enabled ?? true;
  const days = normalizeDays(input.schedule.days);
  const { response, event } = await createAutomationCommand(
    prisma,
    {
      id: opts.id ?? `aut_${ulid(at.getTime())}`,
      organizationId,
      name: input.name,
      description: input.description ?? null,
      enabled,
      days,
      time: input.schedule.time,
      leadDays: input.schedule.leadDays,
      lines: validateLines(input.lines) as object,
      allowSubstitutes: input.allowSubstitutes ?? true,
      agentId: agent.id,
      nextRunAt: nextRunFor({ enabled, days, time: input.schedule.time }),
      createdBy: authorId,
      createdAt: at,
      updatedAt: at,
    },
    { authorId }
  );
  await eventStore.log(event!);
  return response;
};

export type AutomationPatch = Partial<Omit<AutomationInput, 'schedule' | 'agentId'>> & { schedule?: Partial<Schedule> };

export const updateAutomation = async (caller: Caller, id: string, patch: AutomationPatch) => {
  const current = await find(caller, id);
  const days = patch.schedule?.days ? normalizeDays(patch.schedule.days) : current.days;
  const time = patch.schedule?.time ?? current.time;
  const enabled = patch.enabled ?? current.enabled;
  const scheduleChanged = days.join() !== current.days.join() || time !== current.time || enabled !== current.enabled;
  const data = {
    id,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.lines ? { lines: validateLines(patch.lines) as object } : {}),
    ...(patch.allowSubstitutes !== undefined ? { allowSubstitutes: patch.allowSubstitutes } : {}),
    ...(patch.schedule?.leadDays !== undefined ? { leadDays: patch.schedule.leadDays } : {}),
    ...(scheduleChanged ? { days, time, enabled, nextRunAt: nextRunFor({ enabled, days, time }) } : {}),
    updatedAt: new Date(),
  };
  const { response, event } = await updateAutomationCommand(prisma, data, { authorId: caller.authorId });
  await eventStore.log(event!);
  return automationView(response);
};

export const deleteAutomation = async (caller: Caller, id: string) => {
  await find(caller, id);
  const { event } = await deleteAutomationCommand(prisma, { id }, { authorId: caller.authorId });
  await eventStore.log(event!);
};

// --- Runs ------------------------------------------------------------------------------

/** The gateway itself acting as the automation's agent (the scheduler has no person or key). */
const automationCaller = (a: Automation, agent: Agent, authorId?: string): Caller => ({
  organizationId: a.organizationId,
  via: 'automation',
  agent,
  user: null,
  authorId: authorId ?? agent.id,
});

const nextDeliverableDate = async (codes: string[], target: string) => {
  try {
    const availability = await fetchAvailability(codes, target);
    const earliest = codes.map((code) => earliestDelivery(availability.find((x) => x.code === code)));
    if (earliest.some((d) => d === null)) return target;
    const latest = (earliest as string[]).sort().pop()!;
    return latest > target ? latest : target;
  } catch {
    return target; // Valio unreachable: let the order flow report it.
  }
};

const runAutomation = async (a: Automation, trigger: 'schedule' | 'manual', opts: { slot?: Date; authorId?: string; now?: Date }) => {
  const agent = await agentIn(a.organizationId, a.agentId);
  const now = opts.now ?? new Date();
  const runDay = opts.slot ?? now;
  // A late slot (e.g. 23:50 run at 00:10) must not ask for a date that is already past.
  const target = [deliveryDateFor(runDay, a.leadDays), localDay(now)].sort().pop()!;
  // "Delivery next day" means the next day Valio delivers (no Sunday runs, past cut-offs).
  const deliveryDate = await nextDeliverableDate(linesOf(a).map((l) => l.code), target);
  const idempotencyKey = trigger === 'schedule' ? `auto:${a.id}:${opts.slot!.toISOString()}` : `auto:${a.id}:${deliveryDate}:${now.getTime()}`;
  const automation: RunContext['automation'] = { id: a.id, name: a.name, trigger, ...(opts.slot ? { slot: opts.slot.toISOString() } : {}) };
  const result = await placeOrder(
    automationCaller(a, agent, opts.authorId),
    agent,
    { lines: linesOf(a), requestedDate: deliveryDate, allowSubstitutes: a.allowSubstitutes, note: a.name, idempotencyKey },
    { automation }
  );
  return { automationId: a.id, ...result };
};

/** POST /automations/:id/run — runs now (enabled or not); doesn't move the schedule. */
export const runAutomationNow = async (caller: Caller, id: string) => runAutomation(await find(caller, id), 'manual', { authorId: caller.authorId });

let sweeping = false;

/** Runs every enabled automation whose slot is due, then moves it to its next slot. */
export const sweepAutomations = async (now = new Date()) => {
  if (sweeping) return [];
  sweeping = true;
  const results: { id: string; slot: string; outcome: 'ran' | 'skipped' | 'lost' | 'failed'; orderId?: string; status?: string }[] = [];
  try {
    const due = await prisma.automation.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, orderBy: { nextRunAt: 'asc' } });
    for (const a of due) {
      const slot = a.nextRunAt!;
      // Always advance past `now`: a restart after a long outage runs at most one (recent) slot.
      const next = nextRunAfter(a, new Date(Math.max(now.getTime(), slot.getTime())));
      const { response, event } = await claimAutomationSlotCommand(prisma, { id: a.id, slot: slot.toISOString(), nextRunAt: next?.toISOString() ?? null }, { authorId: 'gateway' });
      if (!response.claimed) {
        results.push({ id: a.id, slot: slot.toISOString(), outcome: 'lost' }); // another process took this slot
        continue;
      }
      await eventStore.log(event!);
      if (now.getTime() - slot.getTime() > MISSED_SLOT_GRACE_MS) {
        logger.warn(`Gateway: automation ${a.id} (“${a.name}”) missed its ${slot.toISOString()} slot by more than 2 h — skipped, next run ${next?.toISOString() ?? 'never'}`);
        results.push({ id: a.id, slot: slot.toISOString(), outcome: 'skipped' });
        continue;
      }
      try {
        const run = await runAutomation(a, 'schedule', { slot, now });
        logger.info(`Gateway: automation ${a.id} (“${a.name}”) ran for ${slot.toISOString()} → ${run.order.id} ${run.order.status}${'idempotentReplay' in run ? ' (already placed)' : ''}`);
        results.push({ id: a.id, slot: slot.toISOString(), outcome: 'ran', orderId: run.order.id, status: run.order.status });
      } catch (err) {
        logger.error(`Gateway: automation ${a.id} (“${a.name}”) failed for slot ${slot.toISOString()}`, err);
        results.push({ id: a.id, slot: slot.toISOString(), outcome: 'failed' });
      }
    }
  } finally {
    sweeping = false;
  }
  return results;
};

let timer: NodeJS.Timeout | null = null;

export const startAutomationSweeper = (intervalMs = 30_000) => {
  if (timer) return;
  const tick = () => void sweepAutomations().catch((err) => logger.error('Gateway: automation sweep failed', err));
  timer = setInterval(tick, intervalMs);
  timer.unref();
  setTimeout(tick, 5_000).unref(); // pick up due slots soon after a restart
};
