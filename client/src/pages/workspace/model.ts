// The order page's plain-words layer: what every rule of the policy says about this
// one order (from the gateway's own checks), and the order's state as one sentence.
// Technical words (policy ids, quote ids, LACS, hashes) stay out — they live in the audit log.
import type { ApprovalStatus, Check, Order, OrderPreview, Policy, PolicyRule, PolicyVersion } from '@/api/gateway';
import type { Tone } from '@/components/kit';
import { shortName } from '@/pages/home/format';
import { eur, num } from '@/pages/playbook/graph';
import { NUTRIENTS, categoryLabel, daysWords, describeRule, perLineAmount } from '@/pages/policies/visuals';

export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'the approver';

/** The version agents use right now. */
export const signedOf = (p: Policy): PolicyVersion | null =>
  p.versions?.find((v) => v.status === 'signed') ?? (p.status === 'signed' ? p : null);

/** A rule's own check in a preview or an order. */
export const checkFor = (r: PolicyRule, checks: Check[] | null | undefined): Check | undefined => {
  const all = checks ?? [];
  return all.find((c) => c.rule === r.key) ?? (r.type === 'data.missing' ? all.find((c) => c.rule === 'data.missing') : undefined);
};

export type Verdict = { tone: Tone; mark: '✓' | '!' | '✕' | '·'; label: string };

export type VerdictContext = {
  decision: OrderPreview['decision'] | null;
  approver: string | null;
  substitutes: boolean;
  decided?: Decided | null;
  /** Requested products a product rule kept out. */
  keptOut?: string[];
  names?: Names;
};

/**
 * What one rule says about this order: passes, needs the approver, blocks — or, for
 * rules that only shape the flow (ranking, who approves), what it means here.
 */
export const verdictOf = (r: PolicyRule, checks: Check[] | null | undefined, ctx: VerdictContext): Verdict | null => {
  if (!checks) return null;
  if (r.type === 'nutrition' && ctx.keptOut?.length && checkFor(r, checks)?.passed !== false) {
    const what = ctx.keptOut.map((code) => ctx.names?.[code] ?? code).join(', ');
    return { tone: 'blocked', mark: '✕', label: `Stops ${what}` };
  }
  const asked = ctx.decided ? decidedVerdict(ctx.decided) : null;
  if (r.type === 'approval')
    return ctx.decision === 'needs_approval'
      ? (asked ?? { tone: 'pending', mark: '!', label: `${firstName(ctx.approver)} is asked` })
      : { tone: 'idle', mark: '·', label: 'Not needed' };
  if (r.type === 'substitution.rank')
    return ctx.substitutes ? { tone: 'auto', mark: '✓', label: 'Used' } : { tone: 'idle', mark: '·', label: 'Not needed' };
  const c = checkFor(r, checks);
  if (!c) return { tone: 'idle', mark: '·', label: r.type === 'substitution' ? 'No substitute' : 'Not checked' };
  if (c.applies === false) return { tone: 'idle', mark: '·', label: notApplicableLabel(c) };
  if (c.passed) return { tone: 'auto', mark: '✓', label: 'Passes' };
  if (c.severity === 'hard') return { tone: 'blocked', mark: '✕', label: 'Blocks it' };
  return asked ?? { tone: 'pending', mark: '!', label: `Needs ${firstName(ctx.approver)}` };
};

/** A rule whose scope this order doesn't touch: "No dairy in this order — …" → "n/a — no dairy ordered". */
export const notApplicableLabel = (c: Check) => {
  // Short enough for the node's one status line; the card says the rest.
  const what = c.detail.split(' — ')[0]?.replace(/ in this order$/, ' ordered').trim();
  return what ? `n/a — ${what.charAt(0).toLowerCase()}${what.slice(1)}` : 'n/a for this order';
};

/** How a person (or the timeout) answered an approval, once they have. */
export type Decided = { status: Exclude<ApprovalStatus, 'pending'>; by: string | null };

const decidedVerdict = ({ status, by }: Decided): Verdict => {
  const who = by ? firstName(by) : 'the approver';
  switch (status) {
    case 'approved':
      return { tone: 'auto', mark: '✓', label: `Approved by ${who}` };
    case 'partial':
      return { tone: 'pending', mark: '!', label: 'Only what’s in stock' };
    case 'declined':
      return { tone: 'blocked', mark: '✕', label: `Declined by ${who}` };
    case 'timed_out':
      return { tone: 'idle', mark: '!', label: 'Nobody answered' };
  }
};

/** Why a rule doesn't simply pass, in plain words — or null when it does. */
export const verdictDetail = (r: PolicyRule, checks: Check[] | null | undefined, names: Names = {}) => {
  const c = checkFor(r, checks);
  return c && !c.passed ? reasonOf(c, names) : null;
};

/** Product code → short name, from whatever an order or a preview carries. */
export type Names = Record<string, string>;

type Named = { code: string; name: string };
export const namesOf = (...lists: (Named[] | null | undefined)[]): Names => {
  const out: Names = {};
  for (const list of lists) for (const l of list ?? []) if (l.code && l.name && !out[l.code]) out[l.code] = shortName(l.name);
  return out;
};

/** The gateway's sentences name products by code ("substitute 464201 for 463359"): say their names. */
export const withNames = (text: string, names: Names) => text.replace(/\b\d{6}\b/g, (code) => names[code] ?? code);

/** Strips the gateway's technical words from a sentence meant for people. */
export const plain = (text: string, names: Names = {}) =>
  withNames(text, names)
    .replace(/\bLACS\s*([=<>≤≥]+)?\s*/g, (_, op) => (op ? `lactose ${op} ` : 'lactose '))
    .replace(/\s*\((?:dairy|other|dry|frozen)\.[a-z.-]+\)/g, '')
    .replace(/\s*·?\s*\b(?:qt|pol|apr)_[\w-]+(?:\s+v\d+)?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** One failing check as a clause: "€1,560 is over the €1,200 per-order limit". */
export const reasonOf = (c: Check, names: Names = {}) => {
  const obs = typeof c.observed === 'number' ? c.observed : null;
  const lim = Number(c.limit);
  if (c.rule === 'limit.perOrder' && obs !== null && Number.isFinite(lim))
    return `${eur(obs, 0)} is over the ${eur(lim, 0)} per-order limit`;
  if (c.rule === 'limit.perWeek' && obs !== null && Number.isFinite(lim))
    return `the week would come to ${eur(obs, 0)}, over the ${eur(lim, 0)} weekly limit`;
  if (c.rule === 'stock.coverage') return 'Valio can’t deliver the full amount in time';
  if (c.rule.startsWith('substitution')) return 'it includes a substitute';
  if (c.rule.startsWith('nutrition') && Array.isArray(c.observed)) {
    const who = (c.observed as { code?: string }[]).map((o) => names[o.code ?? ''] ?? o.code).filter(Boolean);
    if (who.length) return `${who.join(', ')} ${who.length === 1 ? 'isn’t' : 'aren’t'} lactose-free`;
  }
  return lower(plain(c.detail, names));
};

// Lower-case a sentence to use it as a clause — but keep names ("Valio can't…").
const lower = (s: string) => (/^(Valio|[A-Z]{2,}|\d|€)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether the lactose step stopped a product. Its message names products by code or
 * by name: "463359 blocked (LACS 4.8 g/100 g) · …".
 */
export const stoppedBy = (steps: { step: string; message: string }[] | null | undefined, code: string, names: Names = {}) => {
  const msg = steps?.find((s) => s.step === 'lactose')?.message ?? '';
  const who = [code, names[code]]
    .filter(Boolean)
    .map((n) => escapeRe(n!))
    .join('|');
  return new RegExp(`(?:^|· )(?:${who}) blocked`, 'i').test(msg);
};

/** Requested products a product rule kept out. The rule's own check then passes — on the substitute — but it did stop something. */
export const keptOut = (steps: { step: string; message: string }[] | null | undefined, requested: string[], names: Names = {}) =>
  requested.filter((code) => stoppedBy(steps, code, names));

/** Did the preview pick substitutes? */
export const usesSubstitutes = (p: Pick<OrderPreview, 'lines'> | Pick<Order, 'lines'> | null) =>
  !!p?.lines.some((l) => l.role === 'substitute');

/**
 * What the rule verdicts need to know about this order beyond the checks. `steps` are the preview's
 * steps or the order's audit; `requested` adds product names the gateway's sentences may refer to.
 */
export const verdictContext = (
  preview: (Pick<OrderPreview, 'lines' | 'decision'> & { open?: OrderPreview['open']; candidates?: OrderPreview['candidates'] }) | null,
  approver: string | null,
  opts: { decided?: Decided | null; steps?: { step: string; message: string }[] | null; requested?: { code: string; name: string }[] } = {}
): VerdictContext & { names: Names; keptOut: string[] } => {
  const requested = [...(opts.requested?.map((l) => l.code) ?? []), ...(preview?.lines.map((l) => l.substituteFor ?? l.code) ?? [])];
  const names = namesOf(preview?.lines, opts.requested, preview?.open, preview?.candidates);
  return {
    decision: preview?.decision ?? null,
    approver,
    substitutes: usesSubstitutes(preview),
    decided: opts.decided ?? null,
    keptOut: keptOut(opts.steps, [...new Set(requested)], names),
    names,
  };
};

// --- Rules in a few words -----------------------------------------------------------

/** A rule as a short line for its node on the graph: "Up to €1,200 an order", "Lactose-free only". */
export const ruleShort = (r: PolicyRule): string => {
  const f = r as Record<string, unknown>;
  const max = Number(f.max);
  const money = Number.isFinite(max) ? eur(max, 0) : '—';
  switch (r.type) {
    case 'limit.perOrder':
      return f.over === 'block' ? `Never over ${money} an order` : `Up to ${money} an order`;
    case 'limit.perWeek':
      return f.over === 'block' ? `Never over ${money} a week` : `Up to ${money} a week`;
    case 'limit.perLine':
      return `Up to ${perLineAmount(f)} a line`;
    case 'category.allow': {
      const allow = Array.isArray(f.allow) ? (f.allow as string[]) : [];
      if (allow.length && allow.every((c) => c.startsWith('dairy.'))) return 'Dairy products only';
      // Several dairy categories read as "dairy": "Only dairy and pasta".
      const dairy = allow.filter((c) => c.startsWith('dairy.'));
      const rest = allow.filter((c) => !c.startsWith('dairy.'));
      const list = [...(dairy.length > 2 ? ['dairy'] : dairy.map(categoryLabel)), ...rest.map(categoryLabel)].map((w) => w.toLowerCase());
      return `Only ${list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : (list[0] ?? 'nothing')}`;
    }
    case 'nutrition': {
      const n = String(f.nutrient ?? '');
      const scope = (f.scope as { categories?: string[] } | undefined)?.categories ?? [];
      if (n === 'LACS' && f.operator === '=' && Number(f.value) === 0)
        return scope.length ? `Lactose-free ${scope.map((c) => categoryLabel(c).toLowerCase()).join(', ')} only` : 'Lactose-free only';
      if (n === 'ALCOHOL' && Number(f.value) === 0) return 'No alcohol';
      const op =
        ({ '<=': 'at most', '<': 'under', '=': 'exactly', '>=': 'at least', '>': 'over' } as Record<string, string>)[String(f.operator)] ??
        String(f.operator ?? '');
      return `${NUTRIENTS[n] ?? n} ${op} ${num(Number(f.value))} g per 100 g`;
    }
    case 'data.missing':
      return f.onMissing === 'block' ? 'Unknown lactose or allergens: blocked' : 'Unknown lactose or allergens: ask';
    case 'delivery.days':
      return `Deliveries ${daysWords(f.days, true)}`;
    case 'substitution':
      return f.requiresApproval ? 'Substitutes need an OK' : 'Substitutes allowed';
    default: {
      const d = describeRule(r);
      return d.value && d.value.length < 40 ? d.value : d.title;
    }
  }
};

// --- The order as one sentence -------------------------------------------------------

export type Said = { tone: Tone; text: string };

/** What a dry run says would happen: "Goes through on its own · €171.50". */
export const planSentence = (p: OrderPreview, approver: string | null, names: Names, stopped?: string | null): Said => {
  if (p.decision === 'execute') return { tone: 'auto', text: `Goes through on its own · ${eur(p.total)}` };
  if (p.decision === 'block') {
    const hard = p.checks.find((c) => !c.passed && c.severity === 'hard');
    const why = stopped ?? (hard ? reasonOf(hard, names) : null);
    return { tone: 'blocked', text: `Can’t be ordered${why ? ` — ${why}` : ''}` };
  }
  const failing = p.checks.filter((c) => !c.passed && c.severity === 'approval');
  const why = stopped ?? (failing[0] ? reasonOf(failing[0], names) : null);
  return { tone: 'pending', text: `Needs ${firstName(approver)}’s OK · ${eur(p.total)}${why ? ` — ${why}` : ''}` };
};

/** The verdict stamped on the receipt: one or two words. */
export const verdictStamp = (order: Pick<Order, 'status' | 'approval'>): { tone: Tone; label: string } => {
  switch (order.status) {
    case 'executed':
      return order.approval ? { tone: 'auto', label: 'Approved' } : { tone: 'auto', label: 'Ordered' };
    case 'partial':
      return { tone: 'pending', label: 'Part ordered' };
    case 'declined':
      return { tone: 'blocked', label: 'Declined' };
    case 'blocked':
      return { tone: 'blocked', label: 'Blocked' };
    case 'expired':
      return { tone: 'idle', label: 'Expired' };
    case 'pending_approval':
      return { tone: 'pending', label: 'Awaiting OK' };
    default:
      return { tone: 'idle', label: String(order.status) };
  }
};

/** When an order was placed, Helsinki time: "14 Nov, 14:32". */
export const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' });

/** The order's final state in plain words. */
export const doneSentence = (order: Pick<Order, 'status' | 'approval' | 'committedTotal'>): Said => {
  const a = order.approval;
  const by = firstName(a?.decidedBy ?? a?.approver.name ?? null);
  const total = order.committedTotal ? ` · ${eur(order.committedTotal)}` : '';
  switch (order.status) {
    case 'executed':
      return { tone: 'auto', text: a ? `Ordered${total} — ${by} approved it` : `Ordered${total} — it went through on its own` };
    case 'partial':
      return {
        tone: 'pending',
        text:
          a?.status === 'timed_out' ? `Partly ordered${total} — nobody answered in time` : `Partly ordered${total} — only what’s in stock`,
      };
    case 'declined':
      return { tone: 'blocked', text: `Declined by ${by} — nothing was ordered` };
    case 'blocked':
      return { tone: 'blocked', text: 'Blocked — a rule stopped it, nothing was ordered' };
    case 'expired':
      return { tone: 'idle', text: 'Timed out — nothing was ordered' };
    case 'pending_approval':
      return { tone: 'pending', text: `Waiting for ${by}’s OK` };
    default:
      return { tone: 'idle', text: String(order.status) };
  }
};
