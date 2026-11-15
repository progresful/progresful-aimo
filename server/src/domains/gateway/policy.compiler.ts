import { geminiJson } from './gateway.gemini.ts';
import logger from '../../services/logger.ts';
import type { PolicyDocument, PolicyRule } from './policy.engine.ts';
import { DEFAULT_RANK } from './policy.engine.ts';
import { catalogFacts } from './policy.rules.ts';
import { CATEGORY_WORDS, DAIRY, detectDeliveryDays, detectOrigin, detectPerLine, sentences } from './policy.phrases.ts';

// Plain language → mandate.policy/v1 rules, in two stages:
//  1. extract the intent (limits, categories, dietary rules, approver) — with
//     Gemini when GEMINI_API_KEY is set, otherwise with the rule-based parser;
//  2. build typed rules from that intent deterministically (`rulesFromIntent`).
// So the AI never writes rules directly; it fills a fixed, typed form.

export type PolicyIntent = {
  perOrderMax: number | null;
  perWeekMax: number | null;
  maxOrdersPerWeek: number | null;
  categories: string[]; // taxonomy codes, e.g. dairy.milk
  lactoseFree: boolean;
  glutenFree: boolean;
  noAlcohol: boolean;
  substitutesNeedApproval: boolean;
  approverRole: string | null;
  approverWindowMinutes: number | null;
  // Newer, optional: absent/null = not stated.
  /** ISO-2 country every product must come from (product.attribute origin =). */
  originCountry?: string | null;
  /** Any single order line above this needs approval (limit.perLine). */
  perLineMax?: number | null;
  perLineUnit?: 'l' | 'kg' | 'pcs' | 'EUR' | null;
  perLineCategories?: string[] | null;
  /** ISO weekdays (1 = Mon … 7 = Sun) deliveries may arrive on (delivery.days). */
  deliveryDays?: number[] | null;
};

/** Origin / per-line / delivery-day phrases, sentence by sentence (rule-based). */
const parseExtras = (text: string): Pick<PolicyIntent, 'originCountry' | 'perLineMax' | 'perLineUnit' | 'perLineCategories' | 'deliveryDays'> => {
  let originCountry: string | null = null;
  let perLine: ReturnType<typeof detectPerLine> = null;
  let deliveryDays: number[] | null = null;
  for (const s of sentences(text)) {
    const o = detectOrigin(s);
    if (o?.operator === '=' && !originCountry) originCountry = o.value;
    perLine ??= detectPerLine(s, true);
    deliveryDays ??= detectDeliveryDays(s);
  }
  return {
    originCountry,
    perLineMax: perLine?.max ?? null,
    perLineUnit: perLine?.unit ?? null,
    perLineCategories: perLine?.categories.length ? perLine.categories : null,
    deliveryDays,
  };
};

export type Approver = { name: string; role: string; windowMinutes: number; fallback: string };

export const BUYER = { org: 'Helsinki University Hospital', unit: 'Ward 4 kitchen' };

// Who holds which role in the demo org. A production gateway would read this from org membership.
export const ROLE_DIRECTORY: Record<string, string> = {
  'head chef': 'Mikko Laine',
  'ward manager': 'Sari Nieminen',
  'purchasing manager': 'Anna Virtanen',
  'kitchen manager': 'Jukka Korhonen',
};

export { CATEGORY_WORDS, DAIRY };

const money = (m: RegExpMatchArray | null) => (m ? Number(m[1].replace(/[,\s]/g, '')) : null);

/** Deterministic parser for the phrasings the policy editor uses. */
export const parseIntent = (text: string): PolicyIntent => {
  const perOrder = money(text.match(/€\s?([\d,\s]*\d)\s*(?:per|an|each|a)\s*order/i)) ?? money(text.match(/up to €\s?([\d,\s]*\d)(?!\s*(?:a|per)\s*week)/i));
  const perWeek = money(text.match(/€\s?([\d,\s]*\d)\s*(?:a|per|each)\s*week/i));
  const categories = [...new Set(CATEGORY_WORDS.filter(([re]) => re.test(text)).flatMap(([, codes]) => codes))];
  const approverRole = text.match(/goes to (?:the )?([a-z][a-z ]*?)(?:\s*[.,;]|$)/i)?.[1]?.trim() ?? null;
  const minutes = text.match(/within (\d+)\s*min/i)?.[1] ?? (text.match(/within (\d+)\s*hours?/i)?.[1] ? String(Number(text.match(/within (\d+)\s*hours?/i)![1]) * 60) : null);
  return {
    perOrderMax: perOrder,
    perWeekMax: perWeek,
    maxOrdersPerWeek: /\bone order a week\b/i.test(text) ? 1 : null,
    categories,
    lactoseFree: /lactose[- ]free/i.test(text),
    glutenFree: /gluten[- ]free/i.test(text),
    noAlcohol: /(never|no) alcohol/i.test(text),
    substitutesNeedApproval: /substitut/i.test(text),
    approverRole,
    approverWindowMinutes: minutes ? Number(minutes) : null,
    ...parseExtras(text),
  };
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const approverFromIntent = (intent: PolicyIntent, previous?: Approver | null): Approver => {
  const role = intent.approverRole ? capitalise(intent.approverRole.toLowerCase()) : (previous?.role ?? 'Head chef');
  const name = ROLE_DIRECTORY[role.toLowerCase()] ?? (previous?.role === role ? previous.name : role);
  return {
    name,
    role,
    windowMinutes: intent.approverWindowMinutes ?? previous?.windowMinutes ?? 30,
    fallback: previous?.fallback ?? 'order only what the policy allows',
  };
};

export const rulesFromIntent = (intent: PolicyIntent, approver: Approver): PolicyRule[] => {
  const rules: PolicyRule[] = [];
  if (intent.perOrderMax !== null) rules.push({ key: 'limit.perOrder', type: 'limit.perOrder', max: intent.perOrderMax, currency: 'EUR', over: 'needs_approval' });
  if (intent.perWeekMax !== null)
    rules.push({ key: 'limit.perWeek', type: 'limit.perWeek', max: intent.perWeekMax, currency: 'EUR', window: 'iso_week', over: 'needs_approval' });
  if (intent.maxOrdersPerWeek !== null) rules.push({ key: 'schedule.frequency', type: 'schedule.frequency', maxOrders: intent.maxOrdersPerWeek, window: 'iso_week' });
  if (intent.categories.length) rules.push({ key: 'category.allow', type: 'category.allow', allow: intent.categories });
  if (intent.originCountry)
    rules.push({ key: 'product.attribute.origin', type: 'product.attribute', attribute: 'origin', operator: '=', value: intent.originCountry.toUpperCase(), hard: true, onMissing: 'needs_approval' });
  if (intent.perLineMax && intent.perLineUnit)
    rules.push({
      key: intent.perLineCategories?.length ? `limit.perLine.${intent.perLineCategories.join('+')}` : 'limit.perLine',
      type: 'limit.perLine',
      max: intent.perLineMax,
      unit: intent.perLineUnit,
      ...(intent.perLineCategories?.length ? { scope: { categories: intent.perLineCategories } } : {}),
      over: 'needs_approval',
    });
  if (intent.deliveryDays?.length && intent.deliveryDays.length < 7) rules.push({ key: 'delivery.days', type: 'delivery.days', days: intent.deliveryDays, over: 'needs_approval' });
  const missing: string[] = [];
  if (intent.lactoseFree) {
    rules.push({ key: 'nutrition.LACS', type: 'nutrition', hard: true, nutrient: 'LACS', operator: '=', value: 0, unit: 'g/100g' });
    missing.push('nutrition.LACS', 'allergens');
  }
  if (intent.glutenFree) {
    // GS1 allergen code AW = cereals containing gluten (the Valio product file uses GS1 codes, e.g. AM = milk).
    rules.push({ key: 'allergen.exclude.AW', type: 'allergen.exclude', allergens: ['AW'], hard: true });
    missing.push('allergens');
  }
  if (intent.noAlcohol) rules.push({ key: 'nutrition.ALCOHOL', type: 'nutrition', hard: true, nutrient: 'ALCOHOL', operator: '=', value: 0, unit: '%vol' });
  if (missing.length) rules.push({ key: 'data.missing', type: 'data.missing', onMissing: 'needs_approval', fields: [...new Set(missing)] });
  if (intent.substitutesNeedApproval) {
    rules.push({ key: 'substitution.requiresApproval', type: 'substitution', requiresApproval: true });
    rules.push({ key: 'substitution.rank', type: 'substitution.rank', order: DEFAULT_RANK, mustMeetDeliveryDate: true });
  }
  rules.push({
    key: 'approval.route',
    type: 'approval',
    approver: { name: approver.name, role: approver.role },
    windowMinutes: approver.windowMinutes,
    onTimeout: 'order_policy_allowed_part',
    fallback: approver.fallback,
  });
  return rules;
};

export const buildDocument = (p: { key: string; name: string; version: number; plainLanguage: string; rules: PolicyRule[]; approver: Approver; unit?: string }): PolicyDocument => ({
  schema: 'mandate.policy/v1',
  id: p.key,
  name: p.name,
  buyer: { org: BUYER.org, unit: p.unit ?? BUYER.unit },
  supplier: 'valio-aimo',
  version: p.version,
  plain_language: p.plainLanguage,
  scope: { applies_to: 'categories_and_attributes', per_product_rules: false },
  rules: p.rules,
  approvers: [{ name: p.approver.name, role: p.approver.role, window_minutes: p.approver.windowMinutes }],
  on_violation: { soft: 'pause_pending_approval', hard: 'reject_with_reason' },
  on_timeout: 'order_policy_allowed_part',
});

export const approverOf = (doc: PolicyDocument): Approver => {
  const route = doc.rules.find((r) => r.type === 'approval') as any;
  const a = doc.approvers?.[0];
  return {
    name: route?.approver?.name ?? a?.name ?? 'Approver',
    role: route?.approver?.role ?? a?.role ?? 'Approver',
    windowMinutes: Number(route?.windowMinutes ?? a?.window_minutes ?? 30),
    fallback: route?.fallback ?? 'order only what the policy allows',
  };
};

// --- Gemini ---------------------------------------------------------------------

/** Category codes Gemini may use: the policy taxonomy plus every category in the loaded catalog. */
const categoryEnum = () => [...new Set([...CATEGORY_WORDS.flatMap(([, c]) => c), ...catalogFacts().categories])].sort();

const intentSchema = () => ({
  type: 'OBJECT',
  properties: {
    perOrderMax: { type: 'NUMBER', nullable: true, description: 'EUR limit per order that may execute automatically' },
    perWeekMax: { type: 'NUMBER', nullable: true, description: 'EUR limit per ISO week' },
    maxOrdersPerWeek: { type: 'INTEGER', nullable: true },
    categories: { type: 'ARRAY', items: { type: 'STRING', enum: categoryEnum() } },
    lactoseFree: { type: 'BOOLEAN' },
    glutenFree: { type: 'BOOLEAN' },
    noAlcohol: { type: 'BOOLEAN' },
    substitutesNeedApproval: { type: 'BOOLEAN' },
    approverRole: { type: 'STRING', nullable: true, description: 'Role that approves exceptions, e.g. "head chef"' },
    approverWindowMinutes: { type: 'INTEGER', nullable: true },
    originCountry: { type: 'STRING', nullable: true, description: 'ISO 3166 alpha-2 code when the text requires every product to come from one country (e.g. "only Finnish products" → FI); else null' },
    perLineMax: { type: 'NUMBER', nullable: true, description: 'Limit for any single order line, only when the text speaks of a single line; else null' },
    perLineUnit: { type: 'STRING', nullable: true, enum: ['l', 'kg', 'pcs', 'EUR'] },
    perLineCategories: { type: 'ARRAY', nullable: true, items: { type: 'STRING', enum: categoryEnum() } },
    deliveryDays: {
      type: 'ARRAY',
      nullable: true,
      items: { type: 'INTEGER' },
      description: 'ISO weekdays 1=Mon…7=Sun, only when the text RESTRICTS delivery days ("deliveries Monday to Friday only"); a plain "delivered on Friday" is not a restriction → null',
    },
  },
  required: ['categories', 'lactoseFree', 'glutenFree', 'noAlcohol', 'substitutesNeedApproval'],
});

const geminiIntent = async (text: string): Promise<PolicyIntent> => {
  const parsed = await geminiJson<Record<string, unknown>>(
    'Extract the purchasing policy below into the JSON form. Only fill what the text states; use null when a limit is not stated. ' +
      'Categories must come from the enum.\n\nPolicy:\n' +
      text,
    intentSchema()
  );
  const fallback = parseIntent(text);
  const merged = { ...fallback, ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)) } as PolicyIntent;
  // The newer fields only count when the text has the matching phrasing (keeps existing policies' rules stable).
  const all = sentences(text);
  if (!all.some((s) => detectOrigin(s))) merged.originCountry = null;
  if (!/\b(line|single)\b/i.test(text)) Object.assign(merged, { perLineMax: null, perLineUnit: null, perLineCategories: null });
  if (!all.some((s) => detectDeliveryDays(s))) merged.deliveryDays = null;
  return merged;
};

export const compilePlainLanguage = async (text: string, previous?: Approver | null) => {
  let intent: PolicyIntent;
  let compiler: 'gemini' | 'rules' = 'rules';
  let note: string | undefined;
  if (process.env.GEMINI_API_KEY) {
    try {
      intent = await geminiIntent(text);
      compiler = 'gemini';
    } catch (err) {
      logger.warn(`Gateway: Gemini compile failed, using the rule-based parser: ${(err as Error).message}`);
      intent = parseIntent(text);
      note = 'Gemini unavailable — compiled with the rule-based parser';
    }
  } else {
    intent = parseIntent(text);
  }
  const approver = approverFromIntent(intent, previous);
  return { intent, approver, rules: rulesFromIntent(intent, approver), compiler, ...(note ? { note } : {}) };
};
