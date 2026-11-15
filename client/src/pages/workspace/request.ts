// The workspace's request: the editable lines, where they start from, and the preview read as plain words.
import type { Automation, Check, Order, OrderPreview, ParsedRequest, Unit } from '@/api/gateway';
import type { Tone } from '@/components/kit';
import { composerText, eur } from '@/pages/playbook/graph';
import { Names, namesOf, withNames } from './model';

export type BuilderLine = {
  key: string;
  code: string;
  name: string;
  quantity: number;
  unit: Unit;
  salesUnit?: string;
  /** Parser alternatives — the line's product can be swapped among these. */
  options: { code: string; name: string }[];
  unsure?: boolean;
};

/** Where the workspace starts: blank, someone's words, an earlier order or an automation. */
export type Seed = {
  text: string;
  lines: BuilderLine[];
  date: string;
  agentId: string | null;
  allowSubstitutes: boolean;
  /** Parse `text` as soon as the workspace opens (from Home's composer). */
  parseOnLoad: boolean;
  /** "Edit of …" / "From automation …". */
  source?: string;
};

let lineKey = 0;
export const newKey = () => `l${++lineKey}`;

export const blankSeed: Seed = { text: '', lines: [], date: '', agentId: null, allowSubstitutes: true, parseOnLoad: false };

export const linesFromParse = (p: ParsedRequest): BuilderLine[] =>
  p.lines
    .filter((l) => l.code)
    .map((l) => ({
      key: newKey(),
      code: l.code,
      name: l.name,
      quantity: l.quantity,
      unit: l.unit,
      salesUnit: l.salesUnit,
      unsure: !l.matched || l.confidence < 0.8,
      options: [{ code: l.code, name: l.name }, ...l.alternatives.filter((a) => a.code && a.code !== l.code)],
    }));

export const seedFromOrder = (order: Order): Seed => ({
  text: composerText(order) ?? '',
  lines: order.request.lines.map((l) => {
    const name = order.lines.find((x) => x.code === l.code)?.name ?? order.open.find((x) => x.code === l.code)?.name ?? l.code;
    return { key: newKey(), code: l.code, name, quantity: l.quantity, unit: l.unit, options: [] };
  }),
  date: order.request.requestedDate ?? order.requestedDate,
  agentId: order.agent?.id ?? null,
  allowSubstitutes: order.request.allowSubstitutes ?? true,
  parseOnLoad: false,
  source: `Edit of “${order.title}”`,
});

const hkiDay = (d: number) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });

/** The delivery date of the automation's next run: run day + lead days. */
export const nextDelivery = (a: Automation) => {
  const run = a.nextRunAt ? Date.parse(a.nextRunAt) : Date.now();
  return hkiDay(run + a.schedule.leadDays * 864e5);
};

export const seedFromAutomation = (a: Automation): Seed => ({
  text: '',
  lines: a.lines.map((l) => ({ key: newKey(), code: l.code, name: l.name, quantity: l.quantity, unit: l.unit, options: [] })),
  date: nextDelivery(a),
  agentId: a.agent.id,
  allowSubstitutes: a.allowSubstitutes,
  parseOnLoad: false,
  source: `From the automation “${a.name}”`,
});

// Lower-case a check's sentence to use it as a clause — but keep names ("Valio can't…").
const lower = (s: string) => (/^(Valio|[A-Z]{2,}|\d)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** One failing check as a clause: "€1,650 is over the €1,200 per-order limit". */
const clause = (c: Check) => {
  const obs = typeof c.observed === 'number' ? c.observed : null;
  const lim = Number(c.limit);
  if (c.rule === 'limit.perOrder' && obs !== null && Number.isFinite(lim))
    return `${eur(obs, 0)} is over the ${eur(lim, 0)} per-order limit`;
  if (c.rule === 'limit.perWeek' && obs !== null && Number.isFinite(lim))
    return `the week would come to ${eur(obs, 0)}, over the ${eur(lim, 0)} weekly limit`;
  return lower(c.detail);
};

export const approverOf = (p: OrderPreview) => {
  const a = p.steps.find((s) => s.step === 'approval')?.payload?.approver as { name?: string; role?: string } | undefined;
  return a?.name ? { name: a.name, role: a.role ?? '' } : null;
};

/** The header's status line: what the gateway would do, in words. */
export const headline = (p: OrderPreview, names: Names = {}): { tone: Tone; label: string; detail: string } => {
  const h = rawHeadline(p);
  return { ...h, detail: withNames(h.detail, { ...namesOf(p.lines, p.open, p.candidates), ...names }) };
};

const rawHeadline = (p: OrderPreview): { tone: Tone; label: string; detail: string } => {
  if (p.decision === 'execute') return { tone: 'auto', label: 'Would go through on its own', detail: eur(p.total) };
  if (p.decision === 'block') {
    const hard = p.checks.filter((c) => !c.passed && c.severity === 'hard');
    return {
      tone: 'blocked',
      label: 'Would be blocked',
      detail: hard.map((c) => c.detail).join('; ') || 'A rule in the signed policy stops it',
    };
  }
  const approver = approverOf(p);
  const failing = p.checks.filter((c) => !c.passed && c.severity === 'approval');
  const first = approver?.name.split(' ')[0];
  const reasons = failing.map(clause);
  return {
    tone: 'pending',
    label: first ? `Would need ${first}’s approval` : 'Would need approval',
    // The per-order clause already names the total.
    detail:
      (reasons.length ? reasons.join('; ') : 'outside the signed policy') +
      (failing.some((c) => c.rule === 'limit.perOrder') ? '' : ` · ${eur(p.total)}`),
  };
};
