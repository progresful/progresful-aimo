import type { Approval, Order } from '../../../prisma/generated/prisma/index';
import prisma from '../../services/database.ts';
import { eventStore } from '../../services/eventStore.ts';
import logger from '../../services/logger.ts';
import { AppError } from '../../utils/AppError.ts';
import { auditView } from './audit.service.ts';
import { updateApprovalCommand } from './gateway.commands.ts';
import { eur, lineTotal, num, sum } from './gateway.money.ts';
import { auditTrail, openLine, orderDetails, updateOrder } from './gateway.orders.ts';
import { issueQuote } from './gateway.quotes.ts';
import { sign } from './gateway.signing.ts';
import type { Clock } from './gateway.time.ts';
import { systemClock } from './gateway.time.ts';
import type { OrderLine } from './gateway.views.ts';
import { approvalView, ordered } from './gateway.views.ts';
import { joinAnd, productLabel } from './policy.describe.ts';
import type { DraftLine } from './policy.engine.ts';

// A pending approval ends one of four ways: approved (order everything
// proposed), partial (order only what the policy allows on its own), declined
// (order nothing) or timed out (the policy's fallback: same as partial).

export type DecisionKind = 'approve' | 'decline' | 'partial';
type Outcome = 'approved' | 'declined' | 'partial' | 'timed_out';

const SYSTEM_AUTHOR = 'gateway';

const loadPending = async (organizationId: string | null, approvalId: string) => {
  const approval = await prisma.approval.findFirst({ where: { id: approvalId, ...(organizationId ? { organizationId } : {}) }, include: { order: true } });
  if (!approval) throw new AppError('Approval not found', 404, { approvalId });
  if (approval.status !== 'pending') throw new AppError(`Approval is already ${approval.status}`, 409, { status: approval.status });
  return approval;
};

/** Lines to order for an outcome, with every other proposed line marked not ordered and its quantity left open. */
const linesFor = (order: Order, approval: Approval, outcome: Outcome): OrderLine[] => {
  const proposed = (order.lines as unknown as OrderLine[]).filter((l) => l.status !== 'open');
  const open = (order.lines as unknown as OrderLine[]).filter((l) => l.status === 'open');
  if (outcome === 'approved') return [...proposed.map((l) => ({ ...l, status: 'ordered' as const })), ...open];
  const fallback = new Set(((approval.fallback as unknown as DraftLine[]) ?? []).map((l) => `${l.code}:${l.role}`));
  const keep = outcome === 'declined' ? new Set<string>() : fallback;
  const result: OrderLine[] = proposed.map((l) =>
    keep.has(`${l.code}:${l.role}`) ? { ...l, status: 'ordered' } : { ...l, status: 'not_ordered', note: outcome === 'declined' ? 'Declined' : 'Not ordered — needed approval' }
  );
  // Whatever isn't ordered stays open against the product that was asked for.
  const openBy = new Map<string, number>(open.map((l) => [l.code, l.quantity]));
  for (const l of result.filter((x) => x.status === 'not_ordered')) {
    const code = l.substituteFor ?? l.code;
    openBy.set(code, (openBy.get(code) ?? 0) + l.quantity);
  }
  return [...result, ...[...openBy].map(([code, qty]) => openLine(code, Math.round(qty * 1000) / 1000, 'Left open for the buyer'))];
};

/** Re-issues the quote if it expired while waiting; prices are fixed, so totals normally don't move. */
const ensureFreshQuote = async (order: Order, lines: OrderLine[], trail: ReturnType<typeof auditTrail>, at: Date) => {
  const current = order.quoteId ? await prisma.quote.findUnique({ where: { id: order.quoteId } }) : null;
  if (current && current.expiresAt > at) return { quoteId: current.id, lines };
  const { quote } = await issueQuote({
    organizationId: order.organizationId,
    requestedDate: order.deliveryDate,
    items: ordered(lines).map((l) => ({ code: l.code, salesUnits: l.salesUnits })),
    policy: { id: order.policyId, key: order.policyKey, version: order.policyVersion },
    agentId: order.agentId,
    at,
    authorId: SYSTEM_AUTHOR,
  });
  const repriced = lines.map((l) => {
    const q = quote.lines.find((x) => x.code === l.code);
    return l.status === 'ordered' && q ? { ...l, unitPrice: q.unitPrice, total: lineTotal(q.unitPrice, l.salesUnits) } : l;
  });
  const before = sum(ordered(lines).map((l) => l.total));
  const after = sum(ordered(repriced).map((l) => l.total));
  await trail.log(
    'lookup',
    'auto',
    'valio-api',
    `Quote ${order.quoteId} expired while waiting — re-issued ${quote.id}${before === after ? ' at unchanged prices' : ` (${eur(before)} → ${eur(after)})`}`,
    { previousQuoteId: order.quoteId, quoteId: quote.id, signature: quote.signature, before, after }
  );
  return { quoteId: quote.id, lines: repriced };
};

const ORDER_STATUS: Record<Outcome, string> = { approved: 'executed', partial: 'partial', declined: 'declined', timed_out: 'partial' };

const finish = async (
  approval: Approval & { order: Order },
  outcome: Outcome,
  decider: { name: string; role: string; comment?: string } | null,
  clock: Clock,
  authorId: string
) => {
  const order = approval.order;
  const trail = auditTrail(order.organizationId, order.id, authorId, clock);
  const decidedAt = clock();
  const decision = { approvalId: approval.id, orderId: order.id, outcome, decidedBy: decider?.name ?? 'gateway', role: decider?.role ?? 'system', comment: decider?.comment ?? null, decidedAt: decidedAt.toISOString() };
  const signature = sign(decision);

  const { response: updated, event } = await updateApprovalCommand(
    prisma,
    { id: approval.id, status: outcome, decidedAt, decidedBy: decision.decidedBy, decidedRole: decision.role, comment: decision.comment, signature },
    { authorId }
  );
  await eventStore.log(event!);

  let lines = linesFor(order, approval, outcome);
  const subs = (order.lines as unknown as OrderLine[]).filter((l) => l.role === 'substitute').map((l) => productLabel(l));
  const message = {
    approved: `Approved by ${decider?.name} (${decider?.role.toLowerCase()})${subs.length ? ` — substitute ${joinAnd(subs)} accepted` : ''}`,
    partial: `${decider?.name} (${decider?.role.toLowerCase()}) chose the in-stock part only`,
    declined: `Declined by ${decider?.name} (${decider?.role.toLowerCase()})`,
    timed_out: `No decision within ${Math.round((approval.expiresAt.getTime() - approval.createdAt.getTime()) / 60000)} min — falling back to the in-stock part only`,
  }[outcome];
  await trail.log('approval', outcome === 'approved' || outcome === 'partial' ? 'auto' : 'blocked', outcome === 'timed_out' ? 'gateway' : 'head-chef', message + (decider?.comment ? ` · “${decider.comment}”` : ''), {
    ...decision,
    signature,
  });

  let quoteId = order.quoteId;
  if (ordered(lines).length) ({ quoteId, lines } = await ensureFreshQuote(order, lines, trail, clock()));
  const committed = sum(ordered(lines).map((l) => l.total));
  const status = ordered(lines).length ? ORDER_STATUS[outcome] : outcome === 'declined' ? 'declined' : 'expired';
  const finalOrder = await updateOrder({ id: order.id, status, lines: lines as object, committedTotal: committed, quoteId, updatedAt: clock() }, authorId);

  const open = lines.filter((l) => l.status === 'open');
  const openNote = open.length ? ` — ${open.map((l) => `${num(l.quantity)} ${l.unit}`).join(' + ')} left open for the buyer` : '';
  if (ordered(lines).length) {
    const what = ordered(lines).length > 1 ? `${ordered(lines).length} lines` : ordered(lines).map((l) => `${num(l.quantity)} ${l.unit} of ${productLabel(l)}`).join('');
    await trail.log('order', 'auto', 'gateway', `Order ${order.id} placed · ${what} · ${eur(committed)}${openNote}`, { orderId: order.id, quoteId, total: committed, status });
  } else {
    await trail.log('order', 'skipped', 'gateway', `Order ${order.id} not placed${outcome === 'declined' ? ' — declined' : ' — nothing the policy allows on its own'}`, { orderId: order.id, status });
  }
  await trail.close();

  return { approval: approvalView(updated, finalOrder), order: (await orderDetails(order.organizationId, order.id)).order, audit: trail.entries.map(auditView) };
};

const OUTCOME: Record<DecisionKind, Outcome> = { approve: 'approved', decline: 'declined', partial: 'partial' };

export const decideApproval = async (
  organizationId: string,
  approvalId: string,
  decision: DecisionKind,
  decider: { name: string; role: string; comment?: string },
  authorId: string,
  clock: Clock = systemClock
) => {
  const approval = await loadPending(organizationId, approvalId);
  if (approval.expiresAt <= clock()) throw new AppError('The approval window has closed — the policy fallback applies', 409, { expiresAt: approval.expiresAt });
  // The named approver decides in their policy role (e.g. Head chef), not their account role.
  const role = decider.name === approval.approverName ? approval.approverRole : decider.role;
  return finish(approval, OUTCOME[decision], { ...decider, role }, clock, authorId);
};

export const expireApproval = async (organizationId: string | null, approvalId: string, clock: Clock = systemClock) =>
  finish(await loadPending(organizationId, approvalId), 'timed_out', null, clock, SYSTEM_AUTHOR);

export const listApprovals = async (organizationId: string, status?: string) => {
  const rows = await prisma.approval.findMany({ where: { organizationId, ...(status ? { status } : {}) }, include: { order: true }, orderBy: { createdAt: 'desc' } });
  const agents = new Map((await prisma.agent.findMany({ where: { organizationId } })).map((a) => [a.id, a]));
  return rows.map((a) => {
    const agent = a.order.agentId ? agents.get(a.order.agentId) : null;
    return {
      ...approvalView(a, a.order),
      order: { id: a.order.id, title: a.order.title, status: a.order.status, request: a.order.request, deliveryDate: a.order.deliveryDate, candidates: a.order.candidates, quoteId: a.order.quoteId, checks: a.order.checks },
      agent: agent ? { id: agent.id, name: agent.name, vendor: agent.vendor } : null,
    };
  });
};

// --- Sweeper -------------------------------------------------------------------

let sweeper: NodeJS.Timeout | null = null;

export const sweepExpired = async () => {
  const due = await prisma.approval.findMany({ where: { status: 'pending', expiresAt: { lte: new Date() } }, select: { id: true } });
  for (const { id } of due) {
    try {
      await expireApproval(null, id);
      logger.info(`Gateway: approval ${id} timed out — fallback applied`);
    } catch (err) {
      logger.error(`Gateway: failed to time out approval ${id}`, err);
    }
  }
  return due.length;
};

export const startApprovalSweeper = (intervalMs = 15_000) => {
  if (sweeper) return;
  sweeper = setInterval(() => void sweepExpired(), intervalMs);
  sweeper.unref();
};
