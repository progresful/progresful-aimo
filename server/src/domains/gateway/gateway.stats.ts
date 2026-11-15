import prisma from '../../services/database.ts';
import { sum } from './gateway.money.ts';
import { weekSpend } from './gateway.orders.ts';
import type { PolicyDocument } from './policy.engine.ts';
import { ruleOfType } from './policy.engine.ts';
import { localDay, sameWeek } from './gateway.time.ts';

const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** KPIs for the dashboard. Spend and limit refer to `policyKey` (default: the org's most-used signed policy). */
export const gatewayStats = async (organizationId: string, policyKey?: string, now = new Date()) => {
  const recent = await prisma.order.findMany({
    where: { organizationId, createdAt: { gte: new Date(now.getTime() - 8 * 24 * 3600 * 1000) } },
    include: { approval: true },
  });
  const week = recent.filter((o) => sameWeek(o.createdAt, now));
  const key = policyKey ?? mostUsed(week.map((o) => o.policyKey)) ?? (await prisma.policy.findFirst({ where: { organizationId, status: 'signed' } }))?.key;
  const policy = key ? await prisma.policy.findFirst({ where: { organizationId, key, status: 'signed' }, orderBy: { version: 'desc' } }) : null;
  const doc = policy?.document as unknown as PolicyDocument | undefined;
  const decided = week.filter((o) => o.status !== 'pending_approval');
  const auto = decided.filter((o) => o.status === 'executed' && !o.approval);
  const approvals = await prisma.approval.findMany({ where: { organizationId, decidedAt: { not: null }, status: { in: ['approved', 'declined', 'partial'] } } });
  const startOfToday = new Date(now.getTime() - 26 * 3600 * 1000);
  const entriesToday = (await prisma.auditEntry.findMany({ where: { organizationId, createdAt: { gte: startOfToday } }, select: { createdAt: true } })).filter(
    (e) => localDay(e.createdAt) === localDay(now)
  ).length;
  return {
    week: { ordersThisWeek: week.length, byStatus: countBy(week.map((o) => o.status)) },
    autoApprovedShare: decided.length ? Math.round((auto.length / decided.length) * 1000) / 1000 : null,
    spend: {
      policyKey: key ?? null,
      // Demo replays ("Run scenario") are reported separately so pressing Run doesn't eat the weekly budget.
      thisWeek: key ? await weekSpend(organizationId, key, now, true) : sum(week.filter((o) => !isDemo(o.request)).map((o) => o.committedTotal)),
      demoReplays: week.filter((o) => isDemo(o.request)).length,
      demoReplaySpend: sum(week.filter((o) => isDemo(o.request)).map((o) => o.committedTotal)),
      limitPerWeek: doc ? (Number(ruleOfType(doc, 'limit.perWeek')?.max) || null) : null,
      limitPerOrder: doc ? (Number(ruleOfType(doc, 'limit.perOrder')?.max) || null) : null,
      currency: 'EUR',
    },
    pendingApprovals: await prisma.approval.count({ where: { organizationId, status: 'pending' } }),
    medianApprovalMinutes: median(approvals.map((a) => Math.round(((a.decidedAt!.getTime() - a.createdAt.getTime()) / 60000) * 10) / 10)),
    auditEntriesToday: entriesToday,
    blockedThisWeek: week.filter((o) => o.status === 'blocked').length,
  };
};

const isDemo = (request: unknown) => (request as { demo?: boolean } | null)?.demo === true;
const countBy = (values: string[]) => values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
const mostUsed = (values: string[]) => Object.entries(countBy(values)).sort((a, b) => b[1] - a[1])[0]?.[0];
