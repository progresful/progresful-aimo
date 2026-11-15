import type { Agent, Approval, Order } from '../../../prisma/generated/prisma/index';
import { eur, lineTotal, num, round2, sum } from './gateway.money.ts';
import { productByCode } from './gateway.products.ts';
import { shortSignature } from './gateway.signing.ts';
import { productLabel } from './policy.describe.ts';
import type { DraftLine } from './policy.engine.ts';

// Response shapes shared by REST, MCP and the web UI (documented in openapi.ts).

export type LineStatus = 'ordered' | 'proposed' | 'not_ordered' | 'blocked' | 'open';
export type OrderLine = DraftLine & { status: LineStatus; note?: string };

export const ordered = (lines: OrderLine[]) => lines.filter((l) => l.status === 'ordered');

/** What a substitute changes vs the product it replaces: price and fat. */
export const tradeoffs = (lines: OrderLine[]) =>
  lines
    .filter((l) => l.role === 'substitute' && l.substituteFor)
    .map((l) => {
      const sub = productByCode(l.code);
      const orig = productByCode(l.substituteFor!);
      // Compare with what the requested product costs on this same quote (per l / kg), not a catalog reference price.
      const origLine = lines.find((x) => x.code === l.substituteFor && x.role === 'requested');
      const subPerBase = l.quantity > 0 ? l.total / l.quantity : l.unitPrice / (sub?.salesUnit.size || 1);
      const origPerBase =
        origLine && origLine.quantity > 0 && origLine.total > 0
          ? origLine.total / origLine.quantity
          : origLine && orig && origLine.unitPrice > 0
            ? origLine.unitPrice / orig.salesUnit.size
            : orig && orig.price > 0
              ? orig.price / orig.salesUnit.size
              : subPerBase;
      const costDelta = round2(l.total - lineTotal(origPerBase, l.quantity));
      const fatOf = (p: typeof sub) => p?.nutrition?.FAT ?? p?.nutrition?.fat;
      const fat = fatOf(sub) !== undefined && fatOf(orig) !== undefined ? { from: fatOf(orig)!, to: fatOf(sub)! } : null;
      const parts = [
        fat && fat.from !== fat.to ? `${num(fat.to)} % fat instead of ${num(fat.from)} %` : null,
        `${costDelta >= 0 ? '+' : '−'}${eur(Math.abs(costDelta))}`,
      ].filter(Boolean);
      return { code: l.code, substituteFor: l.substituteFor!, quantity: l.quantity, unit: l.unit, costDelta, fat, summary: `${productLabel(sub ?? l)} for ${productLabel(orig ?? undefined, l.substituteFor!)}: ${parts.join(', ')}` };
    });

export const approvalView = (a: Approval, order?: Order | null) => {
  const fallback = (a.fallback as unknown as DraftLine[]) ?? [];
  const lines = order ? ((order.lines as unknown as OrderLine[]) ?? []).filter((l) => l.status !== 'open') : [];
  return {
    id: a.id,
    orderId: a.orderId,
    status: a.status,
    approver: { name: a.approverName, role: a.approverRole },
    reasons: a.reasons,
    proposal: order ? { lines, total: sum(lines.map((l) => l.total)) } : null,
    fallback: { lines: fallback, total: sum(fallback.map((l) => l.total)), description: 'Ordered on partial approval or timeout: requested products only, inside every rule' },
    tradeoffs: order ? tradeoffs(lines) : [],
    expiresAt: a.expiresAt.toISOString(),
    decidedAt: a.decidedAt?.toISOString() ?? null,
    decidedBy: a.decidedBy,
    decidedRole: a.decidedRole,
    comment: a.comment,
    signature: a.signature,
    signatureShort: shortSignature(a.signature),
    createdAt: a.createdAt.toISOString(),
  };
};

export const orderView = (o: Order, agent?: Pick<Agent, 'id' | 'name' | 'vendor' | 'model'> | null, approval?: Approval | null) => {
  const all = (o.lines as unknown as OrderLine[]) ?? [];
  return {
    id: o.id,
    title: o.title,
    status: o.status,
    policy: { id: o.policyId, key: o.policyKey, version: o.policyVersion },
    agent: agent ? { id: agent.id, name: agent.name, vendor: agent.vendor, model: agent.model } : o.agentId ? { id: o.agentId } : null,
    request: o.request,
    automationId: ((o.request as any)?.automationId as string | undefined) ?? null,
    requestedDate: (o.request as any)?.requestedDate ?? o.deliveryDate,
    deliveryDate: o.deliveryDate,
    lines: all.filter((l) => l.status !== 'open'),
    open: all.filter((l) => l.status === 'open').map((l) => ({ code: l.code, name: l.name, quantity: l.quantity, unit: l.unit, note: l.note ?? null })),
    total: o.total,
    committedTotal: o.committedTotal,
    quoteId: o.quoteId,
    checks: o.checks,
    candidates: o.candidates ?? [],
    approval: approval
      ? { id: approval.id, status: approval.status, approver: { name: approval.approverName, role: approval.approverRole }, expiresAt: approval.expiresAt.toISOString(), decidedBy: approval.decidedBy, decidedAt: approval.decidedAt?.toISOString() ?? null }
      : null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
};
