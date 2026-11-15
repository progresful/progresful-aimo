// View helpers for the approvals inbox: formatting (Helsinki wall clock) and
// mapping the gateway's approval/order shapes onto the lines the UI renders.
import type { ApprovalListItem, ApprovalStatus, Check, OrderLine, Quote, Unit } from '@/api/gateway';

const TZ = 'Europe/Helsinki';

export const eur = (n: number, digits = 2) => `€${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const fmtQty = (qty: number, unit: Unit | string) => `${num(qty)} ${unit}`;
export const unitLabel = (unit: Unit | string) => (unit === 'pcs' ? 'pc' : unit);

export const fmtTime = (iso: string | number, seconds = false) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, timeZone: TZ });

export const fmtDate = (iso: string | number) =>
  new Date(typeof iso === 'string' && iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).replace(',', '');

const dayKey = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });

/** "Today", "Yesterday" or "Thu 12 Nov" (Helsinki days). */
export const fmtDay = (iso: string | number, now: number) => {
  const day = dayKey(new Date(iso).getTime());
  if (day === dayKey(now)) return 'Today';
  if (day === dayKey(now - 86_400_000)) return 'Yesterday';
  return fmtDate(iso);
};

export const fmtWhen = (iso: string | number, now: number) => `${fmtDay(iso, now)} ${fmtTime(iso)}`;

/** 754_000 → "12:34". */
export const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// --- Lines -----------------------------------------------------------------------

export type LineTag = 'substitute' | 'short' | 'blocked' | 'not-ordered';

export type ViewLine = { key: string; code: string; name: string; qty: number; unit: string; price: number; priceUnit: string; total: number; tag?: LineTag; note?: string };

export const sumLines = (lines: { total: number }[]) => lines.reduce((s, l) => s + l.total, 0);

/** Proposed (or, once decided, ordered/not ordered) lines with substitutes marked. */
export const proposedLines = (item: ApprovalListItem): ViewLine[] =>
  (item.proposal?.lines ?? []).map((l: OrderLine) => ({
    key: `${l.code}-${l.role}`,
    code: l.code,
    name: l.name,
    qty: l.quantity,
    unit: l.unit,
    price: l.unitPrice,
    priceUnit: l.salesUnit || unitLabel(l.unit),
    total: l.total,
    tag: l.role === 'substitute' ? 'substitute' : l.status === 'blocked' ? 'blocked' : l.status === 'not_ordered' ? 'not-ordered' : undefined,
    note: l.role === 'substitute' && l.substituteFor ? `for ${l.substituteFor}` : l.status === 'not_ordered' ? l.note : undefined,
  }));

/** What the agent asked for, priced per base unit from the signed quote. */
export const askedLines = (item: ApprovalListItem, quote: Quote | null | undefined): ViewLine[] =>
  item.order.request.lines.map((r) => {
    const q = quote?.lines.find((l) => l.code === r.code);
    const proposed = item.proposal?.lines.find((l) => l.code === r.code && l.role === 'requested');
    const perBase = q ? q.unitPrice / (q.salesUnit.contains || 1) : proposed ? proposed.total / (proposed.quantity || 1) : 0;
    const name = q?.name ?? proposed?.name ?? r.code;
    const covered = (item.proposal?.lines ?? []).filter((l) => l.code === r.code && l.role === 'requested').reduce((s, l) => s + l.quantity, 0);
    const short = covered < r.quantity;
    return {
      key: r.code,
      code: r.code,
      name,
      qty: r.quantity,
      unit: r.unit,
      price: perBase,
      priceUnit: unitLabel(r.unit),
      total: Math.round(perBase * r.quantity * 100) / 100,
      tag: short ? 'short' : undefined,
      note: short ? `only ${fmtQty(covered, r.unit)} by ${fmtDate(item.order.deliveryDate)}` : undefined,
    };
  });

/** What was actually ordered once decided. */
export const orderedTotal = (item: ApprovalListItem) => sumLines((item.proposal?.lines ?? []).filter((l) => l.status === 'ordered'));

export const proposedTotal = (item: ApprovalListItem) => item.proposal?.total ?? 0;

// --- Kinds & checks ----------------------------------------------------------------

export type ApprovalKind = 'stockout' | 'budget' | 'missing-data' | 'category' | 'other';

export const kindOf = (item: ApprovalListItem): ApprovalKind => {
  const rules = item.reasons.map((r) => r.rule);
  if (item.proposal?.lines.some((l) => l.role === 'substitute') || rules.includes('stock.coverage')) return 'stockout';
  if (rules.includes('data.missing')) return 'missing-data';
  if (rules.some((r) => r.startsWith('limit.'))) return 'budget';
  if (rules.some((r) => r.startsWith('category'))) return 'category';
  return 'other';
};

export const checksOf = (item: ApprovalListItem, fresh?: unknown): Check[] => ((fresh ?? item.order.checks ?? []) as Check[]).filter(Boolean);

export const limitCheck = (checks: Check[], rule: 'limit.perOrder' | 'limit.perWeek') => {
  const c = checks.find((x) => x.rule === rule);
  return c && typeof c.observed === 'number' && c.limit !== undefined ? { ...c, observed: c.observed, limit: Number(c.limit) } : null;
};

/** A rule's clause number as it sits in the signed policy (the order the gateway checks them). */
export const clauseNo = (checks: Check[], rule: string, i: number) => {
  const at = checks.findIndex((c) => c.rule === rule);
  return at >= 0 ? at + 1 : i + 1;
};

export const isPending = (item: ApprovalListItem) => item.status === 'pending';

export type Decided = Exclude<ApprovalStatus, 'pending'>;

/** Pending first (oldest window closing first), then history, newest decision first. */
export const sortInbox = (items: ApprovalListItem[]) => {
  const pending = items.filter(isPending).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const history = items.filter((i) => !isPending(i)).sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt));
  return { pending, history };
};

// --- Plain language ------------------------------------------------------------------

/** "Valio Eila semi skimmed milk drink 1 l UHT lactose free" → "Eila semi skimmed milk drink 1 l UHT lactose free". */
export const shortName = (name: string) => name.replace(/^Valio\s+/, '');

const eur0 = (n: number) => eur(n, n % 1 ? 2 : 0);

/** One reason the gateway stopped, as a sentence a kitchen person reads at a glance. */
export const plainReason = (reason: { rule: string; detail: string }, checks: Check[]): string => {
  const c = checks.find((x) => x.rule === reason.rule);
  const observed = typeof c?.observed === 'number' ? c.observed : null;
  const limit = c?.limit !== undefined ? Number(c.limit) : null;
  switch (reason.rule) {
    case 'limit.perOrder':
      return observed !== null && limit !== null ? `${eur0(observed)} is over the ${eur0(limit)} per-order limit` : reason.detail;
    case 'limit.perWeek':
      return observed !== null && limit !== null ? `This week would come to ${eur0(observed)}, over the ${eur0(limit)} weekly limit` : reason.detail;
    case 'substitution.requiresApproval':
      return 'It includes a substitute';
    case 'stock.coverage':
      return 'Valio can’t deliver the full amount in time';
    case 'data.missing':
      return 'Some product data the rules need is missing';
    case 'category.allow':
      return 'It includes a product outside the allowed categories';
    case 'nutrition.LACS':
      return 'A product isn’t lactose-free';
    default:
      return c?.title ? `${c.title}: ${reason.detail}` : reason.detail;
  }
};

const productName = (item: ApprovalListItem, code: string) =>
  shortName(item.proposal?.lines.find((l) => l.code === code)?.name ?? item.order.candidates.find((c) => c.code === code)?.name ?? code);

/** The trade-off in one line, e.g. "400 l of Eila 3 % instead of Eila semi skimmed — 3 % fat instead of 1.5 %, €100 cheaper." */
export const tradeoffLine = (item: ApprovalListItem): string => {
  if (!item.tradeoffs.length) return 'No substitutes — it’s exactly what was asked.';
  return item.tradeoffs
    .map((t) => {
      const fat = t.fat && t.fat.from !== t.fat.to ? `${num(t.fat.to)} % fat instead of ${num(t.fat.from)} %` : null;
      const cost = Math.abs(t.costDelta) < 0.005 ? 'same price' : t.costDelta < 0 ? `${eur0(-t.costDelta)} cheaper` : `${eur0(t.costDelta)} more`;
      return `${fmtQty(t.quantity, t.unit)} of ${productName(item, t.code)} instead of ${productName(item, t.substituteFor)} — ${[fat, cost].filter(Boolean).join(', ')}.`;
    })
    .join(' ');
};

/** "12 min left", "under a minute left". */
export const minutesLeft = (ms: number) => (ms <= 0 ? 'Time’s up' : ms < 60_000 ? 'Under a minute left' : `${Math.ceil(ms / 60_000)} min left`);
