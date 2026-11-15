// The playbook as an editable graph: nodes are built from the policy's own rules.
// Fixed flow steps (request, Valio, stock, substitutes, limits, approval, order,
// audit) keep the audit trail's step ids, so a preview's audit entries land on
// them; every product rule (nutrition, allergens, categories, missing data) gets
// its own node in the "Product rules" lane and is painted from its check.
import { IconType } from 'react-icons';
import { LuCalendarDays, LuRuler, LuShieldAlert, LuShieldQuestion, LuSlidersHorizontal, LuTag, LuTags } from 'react-icons/lu';
import type { Check, PolicyRule } from '@/api/gateway';
import { daysWords, describeRule, perLineAmount, ruleSentence } from '@/pages/policies/visuals';
import { PlaybookEdge, PlaybookStep, StepStatus, eur, steps as staticSteps } from '../graph';
import type { RunState } from '../useRun';

// --- Rule types -------------------------------------------------------------------

/** Rule types owned by a fixed step; everything else (incl. unknown types) gets its own node in the product-rules lane. */
const FIXED_OWNER: Record<string, string> = {
  'limit.perOrder': 'policy',
  'limit.perWeek': 'policy',
  'limit.perLine': 'policy',
  'delivery.days': 'stock',
  substitution: 'substitutes',
  'substitution.rank': 'substitutes',
  approval: 'approval',
};

/** Rules a fixed step edits, and the order they are shown in. */
export const rulesOfStep = (rules: PolicyRule[], stepId: string) => rules.filter((r) => FIXED_OWNER[r.type] === stepId);

export const isProductRule = (r: PolicyRule) => !FIXED_OWNER[r.type];

/** The graph node that shows a rule: its own node in the lane, or the fixed step that owns it. */
export const nodeOfRule = (r: PolicyRule) => FIXED_OWNER[r.type] ?? ruleNodeId(r.key);

export type AddableType =
  'allergen.exclude' | 'nutrition' | 'category.allow' | 'data.missing' | 'product.attribute' | 'limit.perLine' | 'delivery.days';

export const ADDABLE: { type: AddableType; label: string; hint: string; icon: IconType }[] = [
  { type: 'allergen.exclude', label: 'Allergen exclusion', hint: 'Keep products with these allergens out', icon: LuShieldAlert },
  { type: 'nutrition', label: 'Nutrient limit', hint: 'e.g. lactose = 0 g/100 g', icon: LuSlidersHorizontal },
  { type: 'product.attribute', label: 'Product attribute', hint: 'e.g. only from Finland, price per litre', icon: LuTag },
  { type: 'category.allow', label: 'Allowed categories', hint: 'Only buy from these categories', icon: LuTags },
  { type: 'limit.perLine', label: 'Per-line limit', hint: 'e.g. at most 200 l in one line', icon: LuRuler },
  { type: 'delivery.days', label: 'Delivery days', hint: 'e.g. Monday to Friday only', icon: LuCalendarDays },
  { type: 'data.missing', label: 'Missing data handling', hint: 'Unknown data goes to a person', icon: LuShieldQuestion },
];

/** Types a policy has at most one of: a drafted rule of this type replaces the existing one. */
const SINGLETON = new Set(['limit.perOrder', 'limit.perWeek', 'approval', 'substitution.rank', 'delivery.days']);

/** Adds a rule (e.g. one drafted from words): keys stay unique, singletons are replaced in place. */
export const insertRule = (rules: PolicyRule[], rule: PolicyRule): { rules: PolicyRule[]; rule: PolicyRule } => {
  const same = SINGLETON.has(rule.type) ? rules.find((r) => r.type === rule.type) : undefined;
  if (same) {
    const next = { ...rule, key: same.key };
    return { rules: rules.map((r) => (r === same ? next : r)), rule: next };
  }
  const next = { ...rule, key: uniqueKey(rules, rule.key || rule.type) };
  return { rules: [...rules, next], rule: next };
};

/** Whether a rule is "always enforced" (vs. a person decides), across the ways rule types say it. */
export const isEnforced = (r: PolicyRule) => {
  if ('over' in r || r.type.startsWith('limit.') || r.type === 'delivery.days')
    return r.over === 'block' || (r.type === 'category.allow' && r.over === undefined);
  if (r.type === 'data.missing') return r.onMissing === 'block';
  return r.hard !== false;
};

/** Sets "always enforced" on a rule in its own terms (hard / over / onMissing). */
export const withEnforced = (r: PolicyRule, on: boolean): PolicyRule => {
  if ('over' in r || r.type.startsWith('limit.') || r.type === 'delivery.days' || r.type === 'category.allow')
    return { ...r, over: on ? 'block' : 'needs_approval' };
  if (r.type === 'data.missing') return { ...r, onMissing: on ? 'block' : 'needs_approval' };
  return { ...r, hard: on };
};

const uniqueKey = (rules: PolicyRule[], base: string) => {
  if (!rules.some((r) => r.key === base)) return base;
  let i = 2;
  while (rules.some((r) => r.key === `${base}.${i}`)) i++;
  return `${base}.${i}`;
};

/** A new rule with sensible defaults and a key unique in this policy. */
export const newRule = (type: AddableType, rules: PolicyRule[]): PolicyRule => {
  switch (type) {
    case 'allergen.exclude':
      return { key: uniqueKey(rules, 'allergen.exclude'), type, allergens: ['AW'], hard: true };
    case 'nutrition': {
      const nutrient = rules.some((r) => r.type === 'nutrition' && r.nutrient === 'LACS') ? 'FAT' : 'LACS';
      // e.g. lactose = 0, or fat ≤ 3 g/100 g
      return {
        key: uniqueKey(rules, `nutrition.${nutrient}`),
        type,
        nutrient,
        operator: nutrient === 'LACS' ? '=' : '<=',
        value: nutrient === 'LACS' ? 0 : 3,
        unit: 'g/100g',
        hard: true,
      };
    }
    case 'category.allow':
      return { key: uniqueKey(rules, 'category.allow'), type, allow: ['dairy.milk'] };
    case 'data.missing':
      return { key: uniqueKey(rules, 'data.missing'), type, fields: ['allergens'], onMissing: 'needs_approval' };
    case 'product.attribute':
      return {
        key: uniqueKey(rules, 'product.attribute.origin'),
        type,
        attribute: 'origin',
        operator: 'in',
        value: ['FI'],
        hard: true,
        onMissing: 'needs_approval',
      };
    case 'limit.perLine':
      return { key: uniqueKey(rules, 'limit.perLine'), type, max: 200, unit: 'l', over: 'needs_approval' };
    case 'delivery.days':
      return { key: uniqueKey(rules, 'delivery.days'), type, days: [1, 2, 3, 4, 5], over: 'needs_approval' };
  }
};

/** Keeps a nutrition rule's key in step with its nutrient (keys stay unique). */
export const rekeyNutrition = (rule: PolicyRule, others: PolicyRule[]): PolicyRule => {
  if (rule.type !== 'nutrition') return rule;
  const want = `nutrition.${String(rule.nutrient)}`;
  if (rule.key === want || rule.key.startsWith(`${want}.`)) return rule;
  return { ...rule, key: uniqueKey(others, want) };
};

/** What's wrong with a set of rules before it can be saved. */
export const problemsOf = (rules: PolicyRule[]): Record<string, string> => {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const r of rules) {
    const f = r as Record<string, unknown>;
    if (seen.has(r.key)) out[r.key] = 'Another rule already uses this key';
    seen.add(r.key);
    if ((r.type === 'limit.perOrder' || r.type === 'limit.perWeek') && !(Number(f.max) > 0)) out[r.key] = 'Set an amount above zero';
    if (r.type === 'category.allow' && !(Array.isArray(f.allow) && f.allow.length)) out[r.key] = 'Pick at least one category';
    if (r.type === 'allergen.exclude' && !(Array.isArray(f.allergens) && f.allergens.length)) out[r.key] = 'Pick at least one allergen';
    if (r.type === 'nutrition' && (!String(f.nutrient ?? '').trim() || !Number.isFinite(Number(f.value))))
      out[r.key] = 'Set a nutrient and a value';
    if (r.type === 'data.missing' && !(Array.isArray(f.fields) && f.fields.length)) out[r.key] = 'Pick at least one field';
    if (r.type === 'limit.perLine' && !(Number(f.max) > 0)) out[r.key] = 'Set an amount above zero';
    if (r.type === 'delivery.days' && !(Array.isArray(f.days) && f.days.length)) out[r.key] = 'Pick at least one delivery day';
    if (r.type === 'product.attribute') {
      const v = f.value;
      const empty = Array.isArray(v) ? !v.length : typeof v === 'number' ? !Number.isFinite(v) : !String(v ?? '').trim();
      if (!String(f.attribute ?? '').trim()) out[r.key] = 'Pick what to check';
      else if (empty) out[r.key] = 'Set a value to compare with';
    }
    if (r.type === 'approval') {
      const a = (f.approver ?? {}) as { name?: string };
      if (!a.name?.trim()) out[r.key] = 'Name the approver';
      else if (!(Number(f.windowMinutes) > 0)) out[r.key] = 'Give the approver some time to answer';
    }
  }
  return out;
};

export type Change = 'new' | 'changed';

/** Per rule key: new or changed against the signed version. */
export const changesAgainst = (rules: PolicyRule[], signed: PolicyRule[] | null): Record<string, Change> => {
  if (!signed) return {};
  const out: Record<string, Change> = {};
  for (const r of rules) {
    const before = signed.find((b) => b.key === r.key);
    if (!before) out[r.key] = 'new';
    else if (stableJson(before) !== stableJson(r)) out[r.key] = 'changed';
  }
  return out;
};

/** JSON with sorted keys, so field order never counts as a change. */
export const stableJson = (v: unknown): string =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x
  );

// --- Layout -----------------------------------------------------------------------

export const EDITOR_NODE_WIDTH = 224;
/** A product rule is a clause on the rules sheet: one row, a fixed height. */
export const CLAUSE_WIDTH = 272;
export const CLAUSE_HEIGHT = 80;
const STEP_HEIGHT = 96;
const COL = 268; // column pitch
const GAP = 72; // room either side of the rules sheet for the edge labels
const LIMITS_GAP = 56; // extra room after Spending limits for the "Within limits" label
const LOWER = 196; // lower lane (substitutes, approval, audit)
const LANE_PAD = 10;
const LANE_HEAD = 46;
const LANE_FOOT = 54; // "+ Add a rule" at the foot of the sheet, in edit mode

export type LaneBox = { x: number; y: number; width: number; height: number };

export type EditorStep = PlaybookStep & {
  /** The rule this node edits (product-rule nodes). */
  ruleKey?: string;
  change?: Change;
  /** Fixed flow steps can't be deleted. */
  deletable?: boolean;
  /** Its number on the diagram: "03" for a step, "R02" for a rule. */
  no: string;
};

export type EditorGraph = {
  steps: EditorStep[];
  /** The flow, rule by rule — what a run is painted onto. */
  edges: PlaybookEdge[];
  /** The flow as drawn: the rules sheet is one block, entered on the left and left on the right. */
  drawn: PlaybookEdge[];
  lane: LaneBox & { no: string };
  ruleIds: string[];
};

export const ruleNodeId = (key: string) => `rule:${key}`;

const fixed = (id: string) => staticSteps.find((s) => s.id === id)!;

const RANK_SHORT: Record<string, string> = { valio_substitute: 'Valio subs', delivery_reliability: 'reliability', unit_price: 'price' };

const limitsSentence = (rules: PolicyRule[]) => {
  const per = rules.find((r) => r.type === 'limit.perOrder') as (PolicyRule & { max?: number; over?: string }) | undefined;
  const week = rules.find((r) => r.type === 'limit.perWeek') as (PolicyRule & { max?: number; over?: string }) | undefined;
  const lines = rules.filter((r) => r.type === 'limit.perLine');
  if (!per && !week && !lines.length) return 'No spending limits';
  const parts = [
    per ? `${eur(Number(per.max), 0)} an order` : null,
    week ? `${eur(Number(week.max), 0)} a week` : null,
    ...lines.map((l) => `${perLineAmount(l)} a line`),
  ]
    .filter(Boolean)
    .join(' · ');
  const blocks = [per, week, ...lines].some((r) => r?.over === 'block');
  return `Up to ${parts}; above that ${blocks ? 'blocked' : 'a person decides'}`;
};

const substitutesSentence = (rules: PolicyRule[]) => {
  const sub = rules.find((r) => r.type === 'substitution');
  const rank = rules.find((r) => r.type === 'substitution.rank') as (PolicyRule & { order?: string[] }) | undefined;
  const order = (rank?.order ?? []).map((o) => RANK_SHORT[o] ?? o).join(' → ');
  const approval = sub ? (sub.requiresApproval ? 'Need approval' : 'Allowed') : 'Allowed';
  return order ? `${approval} · ${order}` : approval;
};

const stockSentence = (rules: PolicyRule[]) => {
  const days = rules.find((r) => r.type === 'delivery.days');
  return days ? `Covers qty by the date · delivers ${daysWords(days.days, true)} only` : undefined;
};

const approvalSentence = (rules: PolicyRule[]) => {
  const r = rules.find((x) => x.type === 'approval') as
    (PolicyRule & { approver?: { name?: string; role?: string }; windowMinutes?: number }) | undefined;
  if (!r) return 'No approver — exceptions are blocked';
  const role = r.approver?.role ? `, ${r.approver.role.toLowerCase()}` : '';
  return `${r.approver?.name ?? 'Someone'}${role} · ${r.windowMinutes ?? 30} min to answer`;
};

/**
 * Builds the graph from the rules. Three bands left to right: the order and Valio
 * (request → quote → stock, substitutes below), the rules sheet (one clause per
 * product rule), then limits → order with approval and audit underneath. The steps
 * sit level with the middle of the sheet, as on the order page.
 */
export const buildEditorGraph = (rules: PolicyRule[], changes: Record<string, Change> = {}, editable = false): EditorGraph => {
  const product = rules.filter(isProductRule);
  const laneX = COL * 2 + EDITOR_NODE_WIDTH + GAP;
  const laneW = CLAUSE_WIDTH + LANE_PAD * 2;
  const laneH = LANE_HEAD + (product.length ? product.length * CLAUSE_HEIGHT : 64) + (editable ? LANE_FOOT : LANE_PAD);
  const afterLane = laneX + laneW + GAP;
  const top = Math.round(laneH / 2 - STEP_HEIGHT / 2);
  const fixedChange = (id: string): Change | undefined => (rulesOfStep(rules, id).some((r) => changes[r.key]) ? 'changed' : undefined);
  // Steps are numbered in the order an order meets them; the rules sheet takes its place in the chain.
  const NO = ['request', 'lookup', 'stock', 'substitutes', 'lane', 'policy', 'approval', 'order', 'audit'];
  const noOf = (id: string) => String(NO.indexOf(id) + 1).padStart(2, '0');

  const s = (id: string, x: number, y: number, extra: Partial<EditorStep> = {}): EditorStep => ({
    ...fixed(id),
    position: { x, y: top + y },
    no: noOf(id),
    ...extra,
  });

  const ruleSteps: EditorStep[] = product.map((r, i) => {
    const d = describeRule(r);
    return {
      id: ruleNodeId(r.key),
      kind: 'rule',
      title: d.title,
      subtitle: d.value,
      sentence: ruleSentence(r),
      description: d.detail,
      icon: d.icon,
      position: { x: laneX + LANE_PAD, y: LANE_HEAD + i * CLAUSE_HEIGHT },
      ruleKey: r.key,
      change: changes[r.key],
      deletable: true,
      no: `R${String(i + 1).padStart(2, '0')}`,
    };
  });

  const steps: EditorStep[] = [
    s('request', 0, 0),
    s('lookup', COL, 0),
    s('stock', COL * 2, 0, { sentence: stockSentence(rules), change: fixedChange('stock') }),
    s('substitutes', COL * 2, LOWER, { title: 'Substitutes', sentence: substitutesSentence(rules), change: fixedChange('substitutes') }),
    ...ruleSteps,
    s('policy', afterLane, 0, { title: 'Spending limits', sentence: limitsSentence(rules), change: fixedChange('policy') }),
    s('approval', afterLane, LOWER, { title: 'Approval', sentence: approvalSentence(rules), change: fixedChange('approval') }),
    s('order', afterLane + COL + LIMITS_GAP, 0),
    s('audit', afterLane + COL + LIMITS_GAP, LOWER),
  ];

  const first = ruleSteps[0]?.id ?? 'policy';
  const last = ruleSteps.at(-1)?.id ?? null;
  const edges: PlaybookEdge[] = [
    { id: 'e-request-lookup', source: 'request', target: 'lookup' },
    { id: 'e-lookup-stock', source: 'lookup', target: 'stock' },
    { id: 'e-stock-rules', source: 'stock', target: first, sourceHandle: 'ok', label: 'Covered' },
    { id: 'e-stock-substitutes', source: 'stock', target: 'substitutes', sourceHandle: 'alt', targetHandle: 'top', label: 'Short' },
    { id: 'e-substitutes-rules', source: 'substitutes', target: first },
    ...ruleSteps
      .slice(1)
      .map((r, i) => ({
        id: `e-chain-${i}`,
        source: ruleSteps[i].id,
        target: r.id,
        sourceHandle: 'alt' as const,
        targetHandle: 'top' as const,
      })),
    ...(last ? [{ id: 'e-rules-policy', source: last, target: 'policy' }] : []),
    { id: 'e-policy-order', source: 'policy', target: 'order', sourceHandle: 'ok', label: 'Within limits' },
    { id: 'e-policy-approval', source: 'policy', target: 'approval', sourceHandle: 'alt', targetHandle: 'top', label: 'Needs sign-off' },
    { id: 'e-approval-order', source: 'approval', target: 'order' },
    { id: 'e-order-audit', source: 'order', target: 'audit', sourceHandle: 'alt', targetHandle: 'top' },
  ];
  const isRule = (id: string) => id.startsWith('rule:');
  const drawn = edges
    .filter((e) => !e.id.startsWith('e-chain-'))
    .map((e) => ({
      ...e,
      ...(isRule(e.target) ? { target: 'lane', targetHandle: undefined } : {}),
      ...(isRule(e.source) ? { source: 'lane', sourceHandle: undefined } : {}),
    }));

  const lane = { x: laneX, y: 0, width: laneW, height: laneH, no: noOf('lane') };

  return { steps, edges, drawn, lane, ruleIds: ruleSteps.map((r) => r.id) };
};

// --- Painting a run onto the editor graph ----------------------------------------------

const reached = (s: StepStatus | undefined) => s === 'auto' || s === 'pending' || s === 'blocked';
const flows = (s: StepStatus | undefined) => s === 'auto' || s === 'pending';

const checkStatus = (c: Check | undefined): StepStatus => (!c || c.passed ? 'auto' : c.severity === 'hard' ? 'blocked' : 'pending');

const failOutcome = (c: Check) => {
  const codes = Array.isArray(c.observed)
    ? (c.observed as unknown[]).map((o) => (typeof o === 'string' ? o : (o as { code?: string })?.code)).filter(Boolean)
    : [];
  const verb = c.severity === 'hard' ? 'Blocks' : 'Asks about';
  return codes.length
    ? `${verb} ${codes.slice(0, 2).join(', ')}${codes.length > 2 ? '…' : ''}`
    : c.severity === 'hard'
      ? 'Blocks it'
      : 'Needs a person';
};

/**
 * Re-keys a run (statuses by audit step id) onto the editor graph: limits and
 * every product rule take their status from their own check; the edges taken are
 * worked out from the painted statuses.
 */
export const paintRun = (run: RunState, graph: EditorGraph, rules: PolicyRule[], checks: Check[] | null): RunState => {
  if (run.phase === 'idle') return run;
  const statuses: Record<string, StepStatus> = { ...run.statuses };
  const outcomes: Record<string, string> = { ...run.outcomes };
  const policy = run.statuses.policy;
  const lactose = run.statuses.lactose;
  const all = checks ?? [];

  // Spending limits: only the limit checks.
  if (reached(policy)) {
    const limitRules = rulesOfStep(rules, 'policy');
    const limitChecks = all.filter((c) => limitRules.some((r) => r.key === c.rule));
    const failing = limitChecks.filter((c) => !c.passed);
    statuses.policy = failing.some((c) => c.severity === 'hard') ? 'blocked' : failing.length ? 'pending' : 'auto';
    const types = failing.map((c) => rules.find((r) => r.key === c.rule)?.type);
    const over = [
      types.includes('limit.perOrder') ? 'per-order' : null,
      types.includes('limit.perWeek') ? 'weekly' : null,
      types.includes('limit.perLine') ? 'per-line' : null,
    ].filter(Boolean) as string[];
    outcomes.policy = over.length
      ? `Over ${over.length > 1 ? `${over.slice(0, -1).join(', ')} and ${over.at(-1)} limits` : `${over[0]} limit`}`
      : 'Within limits';
  }

  // Stock & delivery also carries the delivery-days rule: a wrong day shows there.
  const dayRule = rulesOfStep(rules, 'stock')[0];
  const dayCheck = dayRule ? all.find((c) => c.rule === dayRule.key) : undefined;
  if (dayCheck && !dayCheck.passed && reached(run.statuses.stock)) {
    statuses.stock = checkStatus(dayCheck);
    outcomes.stock = dayCheck.severity === 'hard' ? 'Not a delivery day — blocked' : 'Not a delivery day';
  }

  for (const id of graph.ruleIds) {
    const step = graph.steps.find((s) => s.id === id)!;
    const rule = rules.find((r) => r.key === step.ruleKey);
    if (!rule) continue;
    if (policy === 'running' || (rule.type === 'nutrition' && lactose === 'running')) {
      statuses[id] = 'running';
      continue;
    }
    if (!reached(policy)) {
      statuses[id] = policy === 'skipped' ? 'skipped' : 'idle';
      continue;
    }
    const check =
      all.find((c) => c.rule === rule.key) ?? (rule.type === 'data.missing' ? all.find((c) => c.rule === 'data.missing') : undefined);
    if (!check && rule.type !== 'nutrition') {
      // Not in the tested version (e.g. added since the last save): nothing to show yet.
      statuses[id] = 'idle';
      delete outcomes[id];
      continue;
    }
    statuses[id] = checkStatus(check);
    outcomes[id] =
      check && !check.passed
        ? failOutcome(check)
        : rule.type === 'nutrition' && (lactose === 'auto' || lactose === 'blocked') && run.outcomes.lactose
          ? run.outcomes.lactose
          : 'Passes';
  }

  // Edges, from what was reached.
  const st = (id: string) => (id === 'stock' ? run.statuses.stock : statuses[id]);
  const taken = graph.edges
    .filter((e) => {
      switch (e.id) {
        case 'e-stock-substitutes':
          return reached(st('substitutes'));
        case 'e-stock-rules':
          return flows(st('stock')) && !reached(st('substitutes')) && reached(st(e.target));
        // Which way the order went is the whole policy step's call, not just the limits'.
        case 'e-policy-order':
          return policy === 'auto' && reached(st('order'));
        case 'e-policy-approval':
          return policy === 'pending' && reached(st('approval'));
        case 'e-approval-order':
          return st('approval') === 'auto' && reached(st('order'));
        case 'e-rules-policy':
          // The policy step is reached whichever way the product rules went (all checks run).
          return flows(st(e.source)) && reached(st('policy'));
        default:
          return flows(st(e.source)) && reached(st(e.target));
      }
    })
    .map((e) => e.id);

  const active =
    run.activeStepId === 'lactose'
      ? (graph.steps.find((s) => s.ruleKey && rules.find((r) => r.key === s.ruleKey)?.type === 'nutrition')?.id ?? null)
      : run.activeStepId;
  return { ...run, statuses, outcomes, takenEdges: taken, liveEdges: [], activeStepId: active };
};
