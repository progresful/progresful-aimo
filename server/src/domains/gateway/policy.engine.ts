// Pure policy evaluation: no I/O, no clock. Everything the gateway decides
// about an order comes out of `evaluate`, so it is unit-testable in isolation.

import { eur, lineTotal, num, sum } from './gateway.money.ts';
import { GS1_ALLERGENS, attributeCondition, attributeLabel, describeRule, fmtAttributeValue, fmtDays, isNumericAttribute, joinAnd, noInfo, nutrientName, productLabel, scopeText, weekdayName } from './policy.describe.ts';

export { describeRule };

// --- Policy document (mandate.policy/v1) -------------------------------------

export type PolicyRule = { key: string; type: string; hard?: boolean; [param: string]: unknown };

export type PolicyDocument = {
  schema: 'mandate.policy/v1';
  id: string;
  name: string;
  buyer: { org: string; unit: string };
  supplier: string;
  version: number;
  plain_language: string;
  scope: { applies_to: string; per_product_rules: boolean };
  rules: PolicyRule[];
  approvers: { name: string; role: string; window_minutes: number }[];
  on_violation: { soft: string; hard: string };
  on_timeout: string;
};

export const ruleOfType = (doc: PolicyDocument, type: string) => doc.rules.find((r) => r.type === type);
export const rulesOfType = (doc: PolicyDocument, type: string) => doc.rules.filter((r) => r.type === type);

// --- Products as the engine sees them -----------------------------------------

export type RuleProduct = {
  code: string;
  name: string;
  categoryCode: string;
  /** size = litres / kg per sales unit; base 'pcs' = no litre / kg content known (size 1). */
  salesUnit: { name: string; size: number; base: 'l' | 'kg' | 'pcs' };
  price: number;
  lacs: number | null;
  nutrition: Record<string, number> | null;
  allergens: { code: string }[] | null;
  substitutes: string[];
  reliability: number | null; // null = no delivery-reliability data
  // Optional catalog attributes read by product.attribute rules (missing → fails closed).
  group?: string;
  vendor?: string;
  origin?: string;
  temperature?: string;
  co2eKgPerKg?: number | null;
};

export type RequestUnit = 'l' | 'kg' | 'pcs';

export class UnitMismatchError extends Error {}

/** Requested litres / kg / pieces → whole sales units (always rounded up). */
export const toSalesUnits = (quantity: number, unit: RequestUnit, product: Pick<RuleProduct, 'code' | 'salesUnit'>) => {
  if (unit === 'pcs') return Math.ceil(quantity - 1e-9);
  if (product.salesUnit.base === 'pcs') throw new UnitMismatchError(`${product.code} has no litre / kg content in the catalog — order it in pieces (pcs = ${product.salesUnit.name})`);
  if (unit !== product.salesUnit.base) throw new UnitMismatchError(`${product.code} is sold by ${product.salesUnit.base}, not ${unit}`);
  return Math.ceil(quantity / product.salesUnit.size - 1e-9);
};

/** Sales units → base quantity (l / kg). */
export const toBase = (units: number, product: Pick<RuleProduct, 'salesUnit'>) => Math.round(units * product.salesUnit.size * 1000) / 1000;

const nutrientValue = (p: RuleProduct, nutrient: string): number | null => {
  if (nutrient.toUpperCase() === 'LACS') return p.lacs;
  const v = p.nutrition?.[nutrient] ?? p.nutrition?.[nutrient.toLowerCase()];
  return v === undefined ? null : v;
};

const compare = (observed: number, op: string, limit: number) =>
  ({ '=': observed === limit, '==': observed === limit, '<': observed < limit, '<=': observed <= limit, '>': observed > limit, '>=': observed >= limit })[op] ?? false;

const categoryAllowed = (allow: string[], categoryCode: string) => allow.some((a) => categoryCode === a || categoryCode.startsWith(`${a}.`));

/**
 * Is a nutrient needed for `p`? A nutrient only nutrition rules read is needed when one of
 * them covers the product (`scope`): lactose data isn't asked of pasta when the lactose
 * rule covers dairy only. A nutrient no rule reads (data.missing alone) is always needed.
 */
const nutrientNeeded = (doc: PolicyDocument, p: RuleProduct, nutrient: string) => {
  const readers = rulesOfType(doc, 'nutrition').filter((r) => String(r.nutrient).toUpperCase() === nutrient.toUpperCase());
  return readers.length === 0 || readers.some((r) => inScope(r.scope, p));
};

const missingFields = (doc: PolicyDocument, p: RuleProduct) => {
  const fields = new Set<string>(rulesOfType(doc, 'data.missing').flatMap((r) => (r.fields as string[]) ?? []));
  // Any nutrient a rule reads must be known, whether or not data.missing lists it.
  for (const r of rulesOfType(doc, 'nutrition')) fields.add(`nutrition.${r.nutrient as string}`);
  if (rulesOfType(doc, 'allergen.exclude').length) fields.add('allergens');
  return [...fields].filter((f) => {
    if (f === 'allergens') return p.allergens === null;
    if (f.startsWith('nutrition.')) {
      const n = f.slice('nutrition.'.length);
      return nutrientNeeded(doc, p, n) && nutrientValue(p, n) === null;
    }
    return false;
  });
};

/** Allergen codes (e.g. GLU, AM) a product contains that an allergen.exclude rule forbids. */
const excludedAllergens = (r: PolicyRule, p: RuleProduct) => {
  const banned = new Set(((r.allergens as string[]) ?? []).map((c) => c.toUpperCase()));
  return (p.allergens ?? []).map((a) => a.code.toUpperCase()).filter((c) => banned.has(c));
};

// --- product.attribute --------------------------------------------------------

/** Does `p` fall under a rule's `scope` ({ categories: prefixes, codes })? No scope = every product. */
export const inScope = (scope: unknown, p: Pick<RuleProduct, 'code' | 'categoryCode'>) => {
  const s = (scope ?? {}) as { categories?: string[]; codes?: string[] };
  const cats = s.categories ?? [];
  const codes = s.codes ?? [];
  if (!cats.length && !codes.length) return true;
  return codes.includes(p.code) || categoryAllowed(cats, p.categoryCode);
};

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && !Number.isFinite(v));

/** The value a product.attribute rule reads. `unitPrice` = the quoted price per sales unit when known. */
export const attributeValue = (p: RuleProduct, attribute: string, unitPrice?: number): string | number | null => {
  let v: unknown;
  if (attribute.startsWith('nutrition.')) v = nutrientValue(p, attribute.slice('nutrition.'.length));
  else if (attribute === 'temperatureClass') v = p.temperature;
  else if (attribute === 'deliveryReliability') v = p.reliability;
  else if (attribute === 'pricePerBase') {
    const price = unitPrice ?? p.price;
    v = price > 0 && p.salesUnit?.size > 0 ? Math.round((price / p.salesUnit.size) * 1000) / 1000 : null; // price 0 = unknown
  } else v = (p as Record<string, unknown>)[attribute];
  return blank(v) ? null : (v as string | number);
};

const lc = (v: unknown) => String(v).trim().toLowerCase();

const compareAttribute = (attribute: string, observed: string | number, op: string, value: unknown): boolean => {
  const list = (Array.isArray(value) ? value : [value]).map(lc);
  // Categories match by prefix: "dairy" covers dairy.cheese.
  const eq = (o: string, v: string) => (attribute === 'categoryCode' ? o === v || o.startsWith(`${v}.`) : o === v);
  if (op === 'in') return list.some((v) => eq(lc(observed), v));
  if (op === 'not_in') return !list.some((v) => eq(lc(observed), v));
  if (isNumericAttribute(attribute) || typeof observed === 'number') {
    const o = Number(observed);
    const v = Number(Array.isArray(value) ? value[0] : value);
    if (!Number.isFinite(o) || !Number.isFinite(v)) return false;
    if (op === '!=') return o !== v;
    return compare(o, op, v);
  }
  if (op === '=' || op === '==') return eq(lc(observed), list[0]);
  if (op === '!=') return !eq(lc(observed), list[0]);
  return false; // ordering operators on text: can't hold
};

export type AttributeResult = { status: 'pass' | 'fail' | 'missing' | 'out_of_scope'; observed: string | number | null };

export const checkAttribute = (r: PolicyRule, p: RuleProduct, unitPrice?: number): AttributeResult => {
  if (!inScope(r.scope, p)) return { status: 'out_of_scope', observed: null };
  const attribute = String(r.attribute ?? '');
  const observed = attributeValue(p, attribute, unitPrice);
  if (observed === null) return { status: 'missing', observed };
  return { status: compareAttribute(attribute, observed, String(r.operator ?? '='), r.value) ? 'pass' : 'fail', observed };
};

/** "Edam slices is from DE", "Edam slices has delivery reliability 0.86". `who` = the product as people read it. */
const observedPhrase = (who: string, attribute: string, observed: string | number) => {
  const v = fmtAttributeValue(attribute, observed);
  if (attribute === 'origin') return `${who} is from ${v}`;
  if (attribute === 'vendor') return `${who} is made by ${v}`;
  if (attribute === 'temperatureClass') return `${who} is ${v}`;
  if (attribute === 'categoryCode') return `${who} is in ${v}`;
  return `${who} has ${attributeLabel(attribute).toLowerCase()} ${v}`;
};

/** "lactose 4.8 g/100g" — a nutrient value as people read it. */
const nutrientPhrase = (nutrient: string, value: number | null, unit?: unknown) => `${nutrientName(nutrient)} ${value === null ? 'unknown' : num(value)} ${unit ?? ''}`.trim();

const allergenNames = (codes: string[]) => joinAnd(codes.map((c) => GS1_ALLERGENS[c] ?? c));

const onMissingOf = (r: PolicyRule) => (r.onMissing === 'block' || r.onMissing === 'ignore' ? r.onMissing : 'needs_approval');

export type ProductVerdict = { hard: string[]; missing: string[]; /** soft rule breaks: allowed only with a person's approval */ soft: string[] };

/**
 * Product-level rules: nutrition (hard), categories, allergens, product
 * attributes, missing data. `unitPrice` (per sales unit) feeds pricePerBase.
 */
export const checkProduct = (doc: PolicyDocument, p: RuleProduct, opts: { unitPrice?: number } = {}): ProductVerdict => {
  const hard: string[] = [];
  const soft: string[] = [];
  const missing = missingFields(doc, p);
  for (const r of rulesOfType(doc, 'nutrition')) {
    if (!inScope(r.scope, p)) continue;
    const observed = nutrientValue(p, r.nutrient as string);
    if (observed !== null && !compare(observed, (r.operator as string) ?? '=', Number(r.value))) {
      hard.push(`${nutrientPhrase(r.nutrient as string, observed, r.unit)} — the rule allows ${nutrientName(r.nutrient as string)} ${r.operator ?? '='} ${r.value}`);
    }
  }
  const cat = ruleOfType(doc, 'category.allow');
  if (cat && !categoryAllowed((cat.allow as string[]) ?? [], p.categoryCode)) hard.push(`category ${p.categoryCode} is not allowed`);
  for (const r of rulesOfType(doc, 'allergen.exclude')) {
    const found = excludedAllergens(r, p);
    if (found.length) hard.push(`contains ${allergenNames(found)} — the rule excludes ${allergenNames((r.allergens as string[]) ?? [])}`);
  }
  for (const r of rulesOfType(doc, 'product.attribute')) {
    const { status, observed } = checkAttribute(r, p, opts.unitPrice);
    const attribute = String(r.attribute);
    if (status === 'fail') (r.hard === true ? hard : soft).push(`${attributeCondition(r)} — ${observedPhrase(productLabel(p), attribute, observed!)}`);
    else if (status === 'missing') {
      const how = onMissingOf(r);
      if (how === 'block') hard.push(`${noInfo([attribute])} — the rule needs it: ${attributeCondition(r)}`);
      else if (how === 'needs_approval' && !missing.includes(attribute)) missing.push(attribute);
    }
  }
  return { hard, missing, soft };
};

// --- Order evaluation ----------------------------------------------------------

export type DraftLine = {
  code: string;
  name: string;
  role: 'requested' | 'substitute';
  substituteFor?: string;
  salesUnits: number;
  salesUnit: string;
  quantity: number; // base units (l / kg; sales units when the product has no litre / kg content)
  unit: 'l' | 'kg' | 'pcs';
  unitPrice: number;
  total: number;
  deliveryDate: string;
};

export type OrderDraft = {
  lines: DraftLine[];
  total: number;
  requestedDate: string;
  shortfalls: { code: string; quantity: number; unit: string }[];
  unknownCodes: string[];
};

export type Severity = 'hard' | 'approval' | 'info';

export type Check = {
  rule: string;
  passed: boolean;
  severity: Severity;
  title: string;
  detail: string;
  observed: unknown;
  limit: unknown;
  /** order.nonEmpty only: a later date Valio can deliver on — the agent can ask again for it. */
  suggestedDate?: string;
  /** Rule type, for checks that come from a policy rule. */
  type?: string;
  /** false: the rule's scope covers none of this order's lines — it passes because it doesn't apply. */
  applies?: boolean;
};

/**
 * A scoped rule (`scope: { categories, codes }`) none of the lines fall under: it passes
 * without applying. `detail` names what it covers: "No dairy in this order — …".
 */
const notApplicable = (r: PolicyRule, title: string, lines: DraftLine[], product: (code: string) => RuleProduct | undefined): Check | null => {
  const covered = (l: DraftLine) => {
    const p = product(l.code);
    return !p || inScope(r.scope, p);
  };
  if (!r.scope || lines.length === 0 || lines.some(covered)) return null;
  const what = scopeText(r.scope) || 'products this rule covers';
  return {
    rule: r.key,
    type: r.type,
    passed: true,
    applies: false,
    severity: 'info',
    title,
    detail: `No ${what} in this order — the rule doesn't apply`,
    observed: [],
    limit: { scope: r.scope },
  };
};

/** ISO weekday 1 = Mon … 7 = Sun of a YYYY-MM-DD date (null if unparseable). */
export const isoWeekday = (day: string) => {
  const t = Date.parse(`${day}T12:00:00Z`);
  if (Number.isNaN(t)) return null;
  return ((new Date(t).getUTCDay() + 6) % 7) + 1;
};

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

export type Decision = 'execute' | 'needs_approval' | 'block';

export type EvaluationContext = {
  weekSpend: number;
  products: Map<string, RuleProduct>;
  /** Fallback evaluation: a partial order is the point, not a deviation. */
  allowShort?: boolean;
  /** Earliest date Valio can deliver everything requested, when it's later than the requested date. */
  suggestedDate?: string | null;
};

export const buildDraft = (lines: DraftLine[], requestedDate: string, shortfalls: OrderDraft['shortfalls'] = [], unknownCodes: string[] = []): OrderDraft => ({
  lines,
  total: sum(lines.map((l) => l.total)),
  requestedDate,
  shortfalls,
  unknownCodes,
});

const softOrHard = (r: PolicyRule): Severity => (r.hard || r.over === 'block' ? 'hard' : 'approval');

const ruleChecks = (doc: PolicyDocument, draft: OrderDraft, ctx: EvaluationContext): Check[] => {
  const product = (code: string) => ctx.products.get(code);
  const name = (code: string) => productLabel(product(code), code);
  const checks: Check[] = [];
  for (const r of doc.rules) {
    switch (r.type) {
      case 'limit.perOrder': {
        const max = Number(r.max);
        checks.push({
          rule: r.key,
          passed: draft.total <= max,
          severity: softOrHard(r),
          title: 'Spend per order',
          detail: draft.total <= max ? `${eur(draft.total)} within the ${eur(max, 0)} per-order limit` : `${eur(draft.total)} exceeds the ${eur(max, 0)} per-order limit`,
          observed: draft.total,
          limit: max,
        });
        break;
      }
      case 'limit.perWeek': {
        if (r.max === undefined) {
          checks.push(unsupported(r));
          break;
        }
        const max = Number(r.max);
        const after = sum([ctx.weekSpend, draft.total]);
        checks.push({
          rule: r.key,
          passed: after <= max,
          severity: softOrHard(r),
          title: 'Spend per week',
          detail: `${eur(ctx.weekSpend)} spent this week + ${eur(draft.total)} = ${eur(after)} of ${eur(max, 0)}`,
          observed: after,
          limit: max,
        });
        break;
      }
      case 'category.allow': {
        const allow = (r.allow as string[]) ?? [];
        const outside = draft.lines.filter((l) => !categoryAllowed(allow, product(l.code)?.categoryCode ?? ''));
        checks.push({
          rule: r.key,
          passed: outside.length === 0,
          severity: r.over === 'needs_approval' ? 'approval' : 'hard',
          title: 'Allowed categories',
          detail: outside.length
            ? `Outside the allowed categories: ${outside.map((l) => `${name(l.code)} (${product(l.code)?.categoryCode ?? 'unknown category'})`).join(', ')}`
            : `All lines in ${allow.join(', ')}`,
          observed: outside.map((l) => l.code),
          limit: allow,
        });
        break;
      }
      case 'nutrition': {
        const nutrient = r.nutrient as string;
        const na = notApplicable(r, nutrient === 'LACS' && Number(r.value) === 0 ? 'Lactose-free (LACS = 0)' : `${nutrient} ${r.operator ?? '='} ${r.value}`, draft.lines, product);
        if (na) {
          checks.push(na);
          break;
        }
        const failing = draft.lines.filter((l) => {
          const p = product(l.code);
          return p && checkProduct({ ...doc, rules: [r] }, p).hard.length > 0;
        });
        checks.push({
          rule: r.key,
          passed: failing.length === 0,
          severity: r.hard === false ? 'approval' : 'hard',
          title: nutrient === 'LACS' && Number(r.value) === 0 ? 'Lactose-free (LACS = 0)' : `${nutrient} ${r.operator ?? '='} ${r.value}`,
          detail: failing.length
            ? failing.map((l) => `${name(l.code)} has ${nutrientPhrase(nutrient, nutrientValue(product(l.code)!, nutrient), r.unit)}`).join('; ')
            : `Every line with known ${nutrientName(nutrient)} content meets ${nutrientName(nutrient)} ${r.operator ?? '='} ${r.value} ${r.unit ?? ''}`.trim(),
          observed: failing.map((l) => ({ code: l.code, value: nutrientValue(product(l.code)!, nutrient) })),
          limit: { operator: r.operator ?? '=', value: r.value, unit: r.unit },
        });
        break;
      }
      case 'allergen.exclude': {
        const banned = ((r.allergens as string[]) ?? []).map((c) => c.toUpperCase());
        const failing = draft.lines.filter((l) => {
          const p = product(l.code);
          return p && excludedAllergens(r, p).length > 0;
        });
        checks.push({
          rule: r.key,
          passed: failing.length === 0,
          severity: r.hard === false ? 'approval' : 'hard',
          title: `No ${banned.join(', ')}`,
          detail: failing.length
            ? failing.map((l) => `${name(l.code)} contains ${allergenNames(excludedAllergens(r, product(l.code)!))}`).join('; ')
            : `No line contains ${allergenNames(banned)}`,
          observed: failing.map((l) => l.code),
          limit: banned,
        });
        break;
      }
      case 'data.missing':
        break; // handled once below, together with nutrients no product reports
      case 'substitution': {
        if (!r.requiresApproval) break;
        const subs = draft.lines.filter((l) => l.role === 'substitute');
        checks.push({
          rule: r.key,
          passed: subs.length === 0,
          severity: 'approval',
          title: 'Substitutes need approval',
          detail: subs.length ? `Includes substitute ${subs.map((l) => `${name(l.code)} for ${name(l.substituteFor ?? '')}`).join(', ')}` : 'No substitutes',
          observed: subs.map((l) => l.code),
          limit: 'requested products only',
        });
        break;
      }
      case 'product.attribute': {
        const attribute = String(r.attribute ?? '');
        if (!attribute || r.operator === undefined || r.value === undefined) {
          checks.push(unsupported(r));
          break;
        }
        const na = notApplicable(r, (r.label as string) || attributeCondition(r), draft.lines, product);
        if (na) {
          checks.push(na);
          break;
        }
        const failing: { code: string; observed: string | number }[] = [];
        const unknown: string[] = [];
        for (const l of draft.lines) {
          const p = product(l.code);
          if (!p) continue;
          const res = checkAttribute(r, p, l.unitPrice);
          if (res.status === 'fail') failing.push({ code: l.code, observed: res.observed! });
          if (res.status === 'missing' && onMissingOf(r) !== 'ignore') unknown.push(l.code);
        }
        const condition = attributeCondition(r);
        const parts = [
          ...failing.map((f) => observedPhrase(name(f.code), attribute, f.observed)),
          ...(unknown.length ? [`${noInfo([attribute], joinAnd(unknown.map(name)))}${onMissingOf(r) === 'block' ? '' : ' — a person decides'}`] : []),
        ];
        checks.push({
          rule: r.key,
          type: r.type,
          passed: parts.length === 0,
          severity: (failing.length && r.hard === true) || (unknown.length && onMissingOf(r) === 'block') ? 'hard' : 'approval',
          title: (r.label as string) || condition,
          detail: parts.length ? `${condition} — ${parts.join('; ')}` : `Every line meets: ${condition.charAt(0).toLowerCase()}${condition.slice(1)}`,
          observed: { failing, missing: unknown },
          limit: { attribute, operator: r.operator, value: r.value, ...(r.scope ? { scope: r.scope } : {}) },
        });
        break;
      }
      case 'limit.perLine': {
        const max = Number(r.max);
        const unit = String(r.unit ?? '');
        if (!Number.isFinite(max) || !['l', 'kg', 'pcs', 'EUR'].includes(unit)) {
          checks.push(unsupported(r));
          break;
        }
        const measure = (l: DraftLine) => (unit === 'EUR' ? l.total : unit === 'pcs' ? l.salesUnits : l.unit === unit ? l.quantity : null);
        const fmt = (n: number) => (unit === 'EUR' ? eur(n) : `${num(n)} ${unit === 'pcs' ? 'sales units' : unit}`);
        const over = draft.lines.filter((l) => {
          const p = product(l.code);
          const m = measure(l);
          return (p ? inScope(r.scope, p) : !r.scope) && m !== null && m > max;
        });
        checks.push({
          rule: r.key,
          type: r.type,
          passed: over.length === 0,
          severity: r.over === 'block' ? 'hard' : 'approval',
          title: describeRule(r),
          detail: over.length
            ? over.map((l) => `${name(l.code)}: ${fmt(measure(l)!)} — over the ${fmt(max)} per-line limit`).join('; ')
            : `Every line within ${fmt(max)}`,
          observed: over.map((l) => ({ code: l.code, value: measure(l) })),
          limit: { max, unit, ...(r.scope ? { scope: r.scope } : {}) },
        });
        break;
      }
      case 'delivery.days': {
        const days = ((r.days as unknown[]) ?? []).map(Number).filter((d) => d >= 1 && d <= 7);
        const iso = isoWeekday(draft.requestedDate);
        const passed = iso !== null && days.includes(iso);
        checks.push({
          rule: r.key,
          type: r.type,
          passed,
          severity: r.over === 'block' ? 'hard' : 'approval',
          title: `Deliveries ${fmtDays(days)}`,
          detail: passed
            ? `${dayLabel(draft.requestedDate)} is an allowed delivery day (${fmtDays(days)})`
            : `Requested delivery ${iso ? `${weekdayName(iso)} ${dayLabel(draft.requestedDate).replace(/^\w+ /, '')}` : draft.requestedDate} — deliveries allowed ${fmtDays(days)} only`,
          observed: { date: draft.requestedDate, weekday: iso },
          limit: days,
        });
        break;
      }
      case 'substitution.rank':
      case 'approval':
        break; // routing and ranking rules, applied by the orchestration
      default:
        checks.push(unsupported(r));
    }
  }
  return checks;
};

// Fail closed: a rule the engine cannot evaluate goes to a person.
const unsupported = (r: PolicyRule): Check => ({
  rule: r.key,
  passed: false,
  severity: r.hard ? 'hard' : 'approval',
  title: `Rule ${r.key}`,
  detail: `The gateway can't check this rule (${r.type}) by itself — a person decides`,
  observed: null,
  limit: r,
});

const missingDataCheck = (doc: PolicyDocument, draft: OrderDraft, ctx: EvaluationContext): Check | null => {
  const rule = ruleOfType(doc, 'data.missing');
  const missing = draft.lines
    .map((l) => ({ code: l.code, fields: ctx.products.get(l.code) ? missingFields(doc, ctx.products.get(l.code)!) : ['product'] }))
    .filter((m) => m.fields.length > 0);
  if (!rule && missing.length === 0) return null;
  return {
    rule: rule?.key ?? 'data.missing',
    passed: missing.length === 0,
    severity: rule?.onMissing === 'block' ? 'hard' : 'approval',
    title: 'Data the rules need',
    detail: missing.length
      ? `${missing.map((m) => (m.fields.includes('product') ? `${m.code} is not in Valio's catalog` : noInfo(m.fields, productLabel(ctx.products.get(m.code), m.code)))).join('; ')} — a person decides`
      : 'All rule inputs present',
    observed: missing,
    limit: (rule?.fields as string[]) ?? [],
  };
};

const builtInChecks = (draft: OrderDraft, ctx: EvaluationContext): Check[] => {
  const checks: Check[] = [];
  if (draft.unknownCodes.length) {
    checks.push({
      rule: 'catalog.known',
      passed: false,
      severity: 'hard',
      title: 'Known products',
      detail: `Not in the Valio Aimo catalog: ${draft.unknownCodes.join(', ')}`,
      observed: draft.unknownCodes,
      limit: 'catalog',
    });
  }
  if (draft.lines.length === 0 && draft.unknownCodes.length === 0) {
    checks.push({
      rule: 'order.nonEmpty',
      passed: false,
      severity: 'hard',
      title: 'Something to order',
      detail: ctx.suggestedDate
        ? `Valio can't deliver on ${dayLabel(draft.requestedDate)} — the earliest delivery is ${dayLabel(ctx.suggestedDate)}`
        : 'Nothing can be delivered by the requested date',
      observed: 0,
      limit: '> 0',
      ...(ctx.suggestedDate ? { suggestedDate: ctx.suggestedDate } : {}),
    });
  }
  if (!ctx.allowShort) {
    checks.push({
      rule: 'stock.coverage',
      passed: draft.shortfalls.length === 0,
      severity: 'approval',
      title: 'Covers the requested quantity',
      detail: draft.shortfalls.length
        ? `Still short: ${draft.shortfalls.map((s) => `${num(s.quantity)} ${s.unit} of ${productLabel(ctx.products.get(s.code), s.code)}`).join(', ')}`
        : 'Every line covered by the requested date',
      observed: draft.shortfalls,
      limit: 'full quantity',
    });
  }
  return checks;
};

export const decide = (checks: Check[]): Decision =>
  checks.some((c) => !c.passed && c.severity === 'hard') ? 'block' : checks.some((c) => !c.passed && c.severity === 'approval') ? 'needs_approval' : 'execute';

export const evaluate = (doc: PolicyDocument, draft: OrderDraft, ctx: EvaluationContext) => {
  const checks = [...builtInChecks(draft, ctx), ...ruleChecks(doc, draft, ctx)];
  const missing = missingDataCheck(doc, draft, ctx);
  if (missing) checks.push(missing);
  return { decision: decide(checks), checks };
};

/** The reasons a person is asked to decide / the order was blocked. */
export const failingReasons = (checks: Check[]) => checks.filter((c) => !c.passed && c.severity !== 'info').map((c) => ({ rule: c.rule, severity: c.severity, detail: c.detail }));

// --- Substitutes -----------------------------------------------------------------

export type CandidateVerdict = 'picked' | 'eligible' | 'blocked' | 'needs_approval' | 'missing_data' | 'late' | 'no_stock';

export type Candidate = {
  code: string;
  name: string;
  salesUnit: string;
  unitPrice: number;
  pricePerBase: number;
  lacs: number | null;
  reliability: number | null;
  valioSubstitute: boolean;
  earliestDelivery: string | null;
  availableBase: number; // l / kg deliverable by the requested date
  verdict: CandidateVerdict;
  reason: string;
  score: number;
  rank: number | null;
};

export type CandidateInput = { product: RuleProduct; unitPrice: number; availableUnits: number; earliestDelivery: string | null; cutoffPassed?: string | null };

const RANK_KEYS: Record<string, (a: Candidate, b: Candidate) => number> = {
  valio_substitute: (a, b) => Number(b.valioSubstitute) - Number(a.valioSubstitute),
  // No reliability data ranks after any known value.
  delivery_reliability: (a, b) => (b.reliability ?? -1) - (a.reliability ?? -1),
  reliability: (a, b) => (b.reliability ?? -1) - (a.reliability ?? -1),
  unit_price: (a, b) => a.pricePerBase - b.pricePerBase,
  price: (a, b) => a.pricePerBase - b.pricePerBase,
};

const fmtCutoff = (iso: string) =>
  Number.isNaN(Date.parse(iso))
    ? iso
    : new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' }).replace(',', '');

export const DEFAULT_RANK = ['valio_substitute', 'delivery_reliability', 'unit_price'];

/** Ranks replacements for `requested`: eligible first, in the policy's rank order. */
export const rankSubstitutes = (doc: PolicyDocument, requested: RuleProduct, inputs: CandidateInput[], requestedDate: string): Candidate[] => {
  const order = (ruleOfType(doc, 'substitution.rank')?.order as string[]) ?? DEFAULT_RANK;
  const cheapest = Math.min(...inputs.map((i) => i.unitPrice / i.product.salesUnit.size));
  const candidates = inputs.map(({ product: p, unitPrice, availableUnits, earliestDelivery, cutoffPassed }): Candidate => {
    const { hard, missing, soft } = checkProduct(doc, p, { unitPrice });
    const pricePerBase = Math.round((unitPrice / p.salesUnit.size) * 1000) / 1000;
    const base = {
      code: p.code,
      name: p.name,
      salesUnit: `${num(p.salesUnit.size)} ${p.salesUnit.base} ${p.salesUnit.name}`,
      unitPrice,
      pricePerBase,
      lacs: p.lacs,
      reliability: p.reliability,
      valioSubstitute: requested.substitutes.includes(p.code),
      earliestDelivery,
      availableBase: toBase(availableUnits, p),
      rank: null,
    };
    const [verdict, reason]: [CandidateVerdict, string] = hard.length
      ? ['blocked', `Breaks a hard rule: ${hard.join('; ')}`]
      : soft.length
        ? ['needs_approval', `Only with approval: ${soft.join('; ')} — not auto-selected`]
      : missing.length
        ? ['missing_data', `${noInfo(missing)} — not picked automatically, a person decides`]
        : cutoffPassed
          ? ['late', `Order cut-off ${fmtCutoff(cutoffPassed)} has passed — can't arrive by the requested date`]
          : availableUnits <= 0 && earliestDelivery && earliestDelivery > requestedDate
          ? ['late', `Earliest delivery ${earliestDelivery} — after the requested date`]
          : availableUnits <= 0
            ? ['no_stock', 'No stock for the requested date']
            : ['eligible', `Meets the rules · ${num(toBase(availableUnits, p))} ${p.salesUnit.base} by the requested date`];
    const score = verdict === 'eligible' ? Math.round(((base.valioSubstitute ? 0.5 : 0) + 0.4 * (p.reliability ?? 0) + 0.1 * (cheapest / (pricePerBase || 1))) * 100) / 100 : 0;
    return { ...base, verdict, reason, score };
  });
  const byPolicy = (a: Candidate, b: Candidate) => {
    for (const key of order) {
      const d = RANK_KEYS[key]?.(a, b) ?? 0;
      if (d !== 0) return d;
    }
    return a.code.localeCompare(b.code);
  };
  const eligible = candidates.filter((c) => c.verdict === 'eligible').sort(byPolicy);
  const rest = candidates.filter((c) => c.verdict !== 'eligible').sort(byPolicy);
  eligible.forEach((c, i) => (c.rank = i + 1));
  return [...eligible, ...rest];
};

/** Fills `shortBase` (l / kg) from eligible candidates in rank order. Marks the ones used as picked. */
export const pickSubstitutes = (candidates: Candidate[], shortBase: number, products: Map<string, RuleProduct>) => {
  let remaining = shortBase;
  const picks: { candidate: Candidate; salesUnits: number }[] = [];
  for (const c of candidates) {
    if (remaining <= 1e-9 || c.verdict !== 'eligible') continue;
    const p = products.get(c.code)!;
    const take = Math.min(remaining, c.availableBase);
    const units = Math.ceil(take / p.salesUnit.size - 1e-9);
    picks.push({ candidate: c, salesUnits: units });
    c.verdict = 'picked';
    c.reason = `Picked · covers ${num(toBase(units, p))} ${p.salesUnit.base}`;
    remaining = Math.max(0, remaining - toBase(units, p));
  }
  return { picks, remaining: Math.round(remaining * 1000) / 1000 };
};

export const draftLine = (
  p: RuleProduct,
  units: number,
  unitPrice: number,
  deliveryDate: string,
  role: DraftLine['role'],
  substituteFor?: string
): DraftLine => ({
  code: p.code,
  name: p.name,
  role,
  ...(substituteFor ? { substituteFor } : {}),
  salesUnits: units,
  salesUnit: p.salesUnit.name,
  quantity: toBase(units, p),
  unit: p.salesUnit.base,
  unitPrice,
  total: lineTotal(unitPrice, units),
  deliveryDate,
});

/**
 * What the policy allows on its own when nobody approves in time: requested
 * products only, rule-compliant, within limits. Empty if even that is outside
 * the rules.
 */
export const policyAllowedPart = (doc: PolicyDocument, draft: OrderDraft, ctx: EvaluationContext) => {
  const lines = draft.lines.filter((l) => {
    const p = ctx.products.get(l.code);
    if (l.role !== 'requested' || !p) return false;
    const v = checkProduct(doc, p, { unitPrice: l.unitPrice });
    return v.hard.length === 0 && v.missing.length === 0 && v.soft.length === 0;
  });
  if (lines.length === 0) return [];
  const result = evaluate(doc, buildDraft(lines, draft.requestedDate), { ...ctx, allowShort: true });
  return result.decision === 'execute' ? lines : [];
};
