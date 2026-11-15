// One sentence → one typed policy rule, for people adding rules on the fly.
// Gemini fills a strict, flat JSON form (only supported types/fields/enums);
// the result is always validated here against the engine's rule types and the
// catalog. Without a key (or on error) a rule-based parser handles the common
// phrasings. Nothing is saved: the client inserts the rule and PATCHes.

import logger from '../../services/logger.ts';
import { geminiJson } from './gateway.gemini.ts';
import { allProducts } from './gateway.products.ts';
import type { PolicyRule } from './policy.engine.ts';
import { ATTRIBUTES, COUNTRY_CODES, GS1_ALLERGENS, NUMBER_ATTRIBUTES, OPERATORS, STRING_ATTRIBUTES, describeRule } from './policy.describe.ts';
import { ALLERGEN_WORDS, ASK_BEFORE, MONEY_LIMIT, NUM, TAXONOMY, categoriesIn, countryIn, detectDeliveryDays, detectOrigin, detectPerLine, isSoft, toNum } from './policy.phrases.ts';

// --- Catalog facts the validator checks against ---------------------------------

export type CatalogFacts = {
  categories: string[]; // categoryCodes present in the catalog
  taxonomy: string[]; // + policy taxonomy codes (e.g. dry.pasta) that rules may name
  codes: Set<string>;
  values: Record<string, string[]>; // distinct values of string attributes
  nutrients: string[]; // nutrient keys (incl. LACS)
};

type FactProduct = { code: string; categoryCode: string; group?: string; vendor?: string; origin?: string; temperature?: string; nutrition?: Record<string, number> | null };

const factsCache = new WeakMap<FactProduct[], CatalogFacts>();

/** Facts about `products` (memoised per catalog array — the real catalog has 17.5k products). */
export const catalogFacts = (products: FactProduct[] = allProducts()): CatalogFacts => {
  const cached = factsCache.get(products);
  if (cached) return cached;
  const distinct = (f: (p: FactProduct) => string | undefined) => [...new Set(products.map(f).filter((v): v is string => !!v && v.trim() !== ''))].sort();
  const categories = distinct((p) => p.categoryCode);
  // Nutrients that at least 1 % of products declare (the real file has ~100 rare GS1 nutrient codes).
  const nutrientCounts = new Map<string, number>();
  for (const p of products) for (const k of Object.keys(p.nutrition ?? {})) nutrientCounts.set(k, (nutrientCounts.get(k) ?? 0) + 1);
  const common = [...nutrientCounts.entries()].filter(([, n]) => n >= Math.max(1, products.length * 0.01)).map(([k]) => k);
  const facts: CatalogFacts = {
    categories,
    taxonomy: [...new Set([...categories, ...TAXONOMY])].sort(),
    codes: new Set(products.map((p) => p.code)),
    values: {
      origin: distinct((p) => p.origin),
      vendor: distinct((p) => p.vendor),
      temperatureClass: distinct((p) => p.temperature),
      group: distinct((p) => p.group),
      categoryCode: categories,
    },
    nutrients: [...new Set(['LACS', 'ALCOHOL', ...common])],
  };
  factsCache.set(products, facts);
  return facts;
};

// --- Validation -------------------------------------------------------------------

/** Rule types the drafter may produce (all evaluated by the engine). */
export const DRAFTABLE_TYPES = [
  'product.attribute',
  'limit.perLine',
  'delivery.days',
  'allergen.exclude',
  'nutrition',
  'limit.perOrder',
  'limit.perWeek',
  'category.allow',
  'substitution',
] as const;

/** Types validated strictly on PATCH too (older types keep their lenient handling). */
export const STRICT_TYPES = ['product.attribute', 'limit.perLine', 'delivery.days'];

export type Validation = { rule: PolicyRule | null; errors: string[]; warnings: string[]; notes: string[] };

const knownCategory = (facts: CatalogFacts, c: string) => facts.taxonomy.some((t) => t === c || t.startsWith(`${c}.`));

const validScope = (raw: unknown, facts: CatalogFacts, errors: string[], warnings: string[]) => {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('scope must be an object { categories?, codes? }');
    return undefined;
  }
  const s = raw as { categories?: unknown; codes?: unknown };
  const categories = Array.isArray(s.categories) ? s.categories.map(String) : [];
  const codes = Array.isArray(s.codes) ? s.codes.map(String) : [];
  if ((s.categories !== undefined && !Array.isArray(s.categories)) || (s.codes !== undefined && !Array.isArray(s.codes))) errors.push('scope.categories and scope.codes must be arrays');
  for (const c of categories) {
    if (!knownCategory(facts, c)) errors.push(`Unknown category "${c}" — known: ${facts.taxonomy.join(', ')}`);
    else if (!facts.categories.some((k) => k === c || k.startsWith(`${c}.`))) warnings.push(`No product in the current catalog is in ${c}`);
  }
  for (const c of codes) if (!facts.codes.has(c)) errors.push(`Unknown product code ${c}`);
  if (!categories.length && !codes.length) return undefined;
  return { ...(categories.length ? { categories } : {}), ...(codes.length ? { codes } : {}) };
};

const ORIGIN_NAMES: Record<string, string> = Object.fromEntries(Object.entries(COUNTRY_CODES).map(([code, name]) => [name.replace(/^the /, '').toLowerCase(), code]));

/** Snap a text value onto the catalog spelling: "valio" → "Valio Oy", "Finland" → "FI". */
const snapValue = (attribute: string, value: string, facts: CatalogFacts, notes: string[], warnings: string[]) => {
  const v = value.trim();
  if (attribute === 'origin') {
    const code = v.length === 2 ? v.toUpperCase() : (ORIGIN_NAMES[v.toLowerCase()] ?? countryIn(v) ?? v);
    if (code !== v) notes.push(`"${v}" read as country code ${code}`);
    if (facts.values.origin.length && !facts.values.origin.some((o) => o.toLowerCase() === code.toLowerCase())) warnings.push(`No product in the catalog has origin ${code} (catalog: ${facts.values.origin.join(', ')})`);
    return code;
  }
  const known = facts.values[attribute] ?? [];
  const exact = known.find((k) => k.toLowerCase() === v.toLowerCase());
  if (exact) return exact;
  if (attribute === 'categoryCode') return v;
  const partial = known.filter((k) => k.toLowerCase().includes(v.toLowerCase()));
  if (partial.length === 1) {
    notes.push(`"${v}" matched the catalog's ${attribute} "${partial[0]}"`);
    return partial[0];
  }
  if (known.length) warnings.push(`No product in the catalog has ${attribute} "${v}" (catalog: ${known.slice(0, 12).join(', ')})`);
  return v;
};

const overOf = (v: unknown, errors: string[]) => {
  if (v === undefined || v === null) return 'needs_approval';
  if (v === 'needs_approval' || v === 'block') return v;
  errors.push(`over must be "needs_approval" or "block"`);
  return 'needs_approval';
};

const posNumber = (v: unknown, field: string, errors: string[]) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    errors.push(`${field} must be a positive number`);
    return 0;
  }
  return n;
};

/** Checks a rule's type, fields and values; returns it normalised (key untouched). */
export const validateRule = (raw: unknown, facts: CatalogFacts = catalogFacts()): Validation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { rule: null, errors: ['Rule must be an object'], warnings, notes };
  const r = raw as Record<string, unknown>;
  const type = String(r.type ?? '');
  const key = typeof r.key === 'string' && r.key.trim() ? r.key.trim() : '';
  const out = (rule: Record<string, unknown>): Validation => ({ rule: errors.length ? null : ({ key, ...rule } as PolicyRule), errors, warnings, notes });

  switch (type) {
    case 'product.attribute': {
      const attribute = String(r.attribute ?? '');
      let attr = attribute;
      if (attribute.startsWith('nutrition.')) {
        const n = attribute.slice('nutrition.'.length);
        const known = facts.nutrients.find((k) => k.toLowerCase() === n.toLowerCase());
        if (!known) errors.push(`Unknown nutrient "${n}" — known: ${facts.nutrients.join(', ')}`);
        else attr = `nutrition.${known}`;
      } else if (!(ATTRIBUTES as string[]).includes(attribute)) {
        errors.push(`Unknown attribute "${attribute}" — use one of ${ATTRIBUTES.join(', ')}, nutrition.<NUTRIENT>`);
      }
      const operator = String(r.operator ?? '');
      if (!(OPERATORS as readonly string[]).includes(operator)) errors.push(`Unknown operator "${operator}" — use one of ${OPERATORS.join(' ')}`);
      const numeric = (NUMBER_ATTRIBUTES as readonly string[]).includes(attr) || attr.startsWith('nutrition.');
      let value: unknown = r.value;
      if (numeric) {
        if (operator === 'in' || operator === 'not_in') errors.push(`${attr} is a number — use = != < <= > >=`);
        const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
        if (typeof n !== 'number' || !Number.isFinite(n)) errors.push(`${attr} needs a numeric value`);
        else value = n;
        if (attr === 'deliveryReliability' && typeof value === 'number' && value > 1) {
          value = value / 100;
          notes.push(`Reliability is a 0–1 share: read as ${value}`);
        }
      } else if ((STRING_ATTRIBUTES as readonly string[]).includes(attr)) {
        if (['<', '<=', '>', '>='].includes(operator)) errors.push(`${attr} is text — use = != in not_in`);
        const list = Array.isArray(value) ? value : typeof value === 'string' ? (operator === 'in' || operator === 'not_in' ? value.split(/\s*,\s*/) : [value]) : null;
        if (!list || !list.length || list.some((v) => typeof v !== 'string' || !v.trim())) errors.push(`${attr} needs a text value${operator === 'in' || operator === 'not_in' ? ' list' : ''}`);
        else {
          const snapped = (list as string[]).map((v) => snapValue(attr, v, facts, notes, warnings));
          if (attr === 'categoryCode') for (const c of snapped) if (!knownCategory(facts, c)) errors.push(`Unknown category "${c}"`);
          if ((operator === '=' || operator === '!=') && snapped.length > 1) errors.push(`${operator} takes one value — use in / not_in for a list`);
          value = operator === 'in' || operator === 'not_in' ? snapped : snapped[0];
        }
      }
      if (typeof r.hard !== 'boolean') errors.push('hard must be true (block) or false (needs approval)');
      const onMissing = r.onMissing ?? 'needs_approval';
      if (!['needs_approval', 'block', 'ignore'].includes(String(onMissing))) errors.push('onMissing must be needs_approval, block or ignore');
      const scope = validScope(r.scope, facts, errors, warnings);
      if (attr === 'pricePerBase') notes.push('Price is compared per litre or per kg, whichever the product is sold by (the quoted price when known)');
      return out({
        type,
        attribute: attr,
        operator,
        value,
        ...(scope ? { scope } : {}),
        hard: r.hard,
        onMissing,
        ...(typeof r.label === 'string' && r.label.trim() ? { label: r.label.trim().slice(0, 120) } : {}),
      });
    }
    case 'limit.perLine': {
      const max = posNumber(r.max, 'max', errors);
      const unit = String(r.unit ?? '');
      if (!['l', 'kg', 'pcs', 'EUR'].includes(unit)) errors.push('unit must be l, kg, pcs or EUR');
      const scope = validScope(r.scope, facts, errors, warnings);
      return out({ type, max, unit, ...(scope ? { scope } : {}), over: overOf(r.over, errors) });
    }
    case 'delivery.days': {
      const days = Array.isArray(r.days) ? r.days.map(Number) : [];
      if (!days.length || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) errors.push('days must be a non-empty list of weekdays 1 (Mon) … 7 (Sun)');
      const unique = [...new Set(days)].sort((a, b) => a - b);
      if (unique.length === 7) warnings.push('Every day is allowed — this rule never triggers');
      return out({ type, days: unique, over: overOf(r.over, errors) });
    }
    case 'allergen.exclude': {
      const allergens = (Array.isArray(r.allergens) ? r.allergens : []).map((a) => String(a).toUpperCase());
      if (!allergens.length) errors.push('allergens must list GS1 allergen codes');
      for (const a of allergens) if (!GS1_ALLERGENS[a]) errors.push(`Unknown GS1 allergen code ${a} — known: ${Object.keys(GS1_ALLERGENS).join(', ')}`);
      return out({ type, allergens: [...new Set(allergens)], hard: r.hard !== false });
    }
    case 'nutrition': {
      const known = facts.nutrients.find((k) => k.toLowerCase() === String(r.nutrient ?? '').toLowerCase());
      if (!known) errors.push(`Unknown nutrient "${r.nutrient}" — known: ${facts.nutrients.join(', ')}`);
      const operator = String(r.operator ?? '=');
      if (!['=', '<', '<=', '>', '>='].includes(operator)) errors.push('nutrition operator must be = < <= > >=');
      const value = Number(r.value);
      if (r.value === undefined || r.value === null || !Number.isFinite(value)) errors.push('nutrition needs a numeric value');
      const scope = validScope(r.scope, facts, errors, warnings);
      return out({ type, hard: r.hard !== false, nutrient: known ?? r.nutrient, operator, value, unit: known === 'ALCOHOL' ? '%vol' : 'g/100g', ...(scope ? { scope } : {}) });
    }
    case 'limit.perOrder':
    case 'limit.perWeek': {
      const max = posNumber(r.max, 'max', errors);
      return out({ type, max, currency: 'EUR', ...(type === 'limit.perWeek' ? { window: 'iso_week' } : {}), over: overOf(r.over, errors) });
    }
    case 'category.allow': {
      const allow = (Array.isArray(r.allow) ? r.allow : []).map(String);
      if (!allow.length) errors.push('allow must list category codes');
      for (const c of allow) if (!knownCategory(facts, c)) errors.push(`Unknown category "${c}"`);
      return out({ type, allow, ...(r.over === 'needs_approval' ? { over: 'needs_approval' } : {}) });
    }
    case 'substitution':
      return out({ type, requiresApproval: r.requiresApproval !== false });
    default:
      errors.push(`Unknown or unsupported rule type "${type}" — supported: ${DRAFTABLE_TYPES.join(', ')}`);
      return { rule: null, errors, warnings, notes };
  }
};

/** Strict validation of the new rule types inside a PATCHed rule list; returns problems by key. */
export const validateRuleList = (rules: PolicyRule[], facts: CatalogFacts = catalogFacts()) => {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const r of rules) {
    if (keys.has(r.key)) problems.push(`Duplicate rule key ${r.key}`);
    keys.add(r.key);
    if (!STRICT_TYPES.includes(r.type)) continue;
    const v = validateRule(r, facts);
    if (v.errors.length) problems.push(`${r.key}: ${v.errors.join('; ')}`);
  }
  return problems;
};

// --- Keys -------------------------------------------------------------------------

export const baseKey = (r: PolicyRule) => {
  const scope = (r.scope ?? {}) as { categories?: string[]; codes?: string[] };
  const suffix = [...(scope.categories ?? []), ...(scope.codes ?? [])].join('+');
  switch (r.type) {
    case 'product.attribute':
      return `product.attribute.${r.attribute}${suffix ? `.${suffix}` : ''}`;
    case 'limit.perLine':
      return `limit.perLine${suffix ? `.${suffix}` : ''}`;
    case 'allergen.exclude':
      return `allergen.exclude.${((r.allergens as string[]) ?? []).join('.')}`;
    case 'nutrition':
      return `nutrition.${r.nutrient}`;
    case 'substitution':
      return 'substitution.requiresApproval';
    default:
      return r.type;
  }
};

export const uniqueKey = (base: string, taken: Iterable<string>) => {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}.${i}`)) return `${base}.${i}`;
};

const sameRule = (a: PolicyRule, b: PolicyRule) => {
  const strip = ({ key: _k, label: _l, ...rest }: PolicyRule) => JSON.stringify(rest, Object.keys(rest).sort());
  return strip(a) === strip(b);
};

// --- Rule-based parser -------------------------------------------------------------

const attr = (attribute: string, operator: string, value: unknown, text: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'product.attribute',
  attribute,
  operator,
  value,
  hard: !isSoft(text),
  onMissing: 'needs_approval',
  ...extra,
});

const scopeFor = (text: string, exclude: RegExp[] = []) => {
  const t = exclude.reduce((s, re) => s.replace(re, ''), text);
  const categories = categoriesIn(t);
  return categories.length ? { scope: { categories } } : {};
};

/** One sentence → one raw rule (unvalidated), or null. Covers the common phrasings. */
export const parseRuleText = (text: string, facts: CatalogFacts = catalogFacts()): Record<string, unknown> | null => {
  const t = text.trim();
  const soft = isSoft(t);
  const money = String.raw`(?:€\s?${NUM}|${NUM}\s*(?:€|eur(?:os?)?))`;
  const amount = (m: RegExpMatchArray) => toNum(m[1] ?? m[2]);

  // price per litre / kg
  const ppb = t.match(new RegExp(`${money}\\s*(?:per|/|a|an)\\s*(?:litre|liter|l|kg|kilo(?:gram)?)\\b`, 'i'));
  if (ppb) return attr('pricePerBase', '<=', amount(ppb), t, scopeFor(t));

  // spend per order / week
  const perOrder = t.match(new RegExp(`${money}\\s*(?:per|an|a|each)\\s*order`, 'i'));
  if (perOrder) return { type: 'limit.perOrder', max: amount(perOrder), over: /\bblock/i.test(t) ? 'block' : 'needs_approval' };
  const perWeek = t.match(new RegExp(`${money}\\s*(?:per|a|each)\\s*week`, 'i'));
  if (perWeek) return { type: 'limit.perWeek', max: amount(perWeek), over: /\bblock/i.test(t) ? 'block' : 'needs_approval' };
  // "above 1200 euro approve", "orders over €300 ask me", "max €500 a week": the same spend phrasing a request understands.
  const spend = MONEY_LIMIT.exec(t);
  if (spend && !/\bline\b/i.test(t) && !/^\s*(?:per|\/|a)\s*(?:litre|liter|l|kg|kilo)\b/i.test(t.slice(spend.index + spend[0].length))) {
    const max = Number(spend[2] ?? spend[3] ?? spend[5] ?? spend[6]);
    const week = (spend[4] ?? spend[8] ?? '').toLowerCase() === 'week' || /\bweekly\b|\ba week\b|\bper week\b/i.test(t);
    if (Number.isFinite(max) && max > 0)
      return { type: week ? 'limit.perWeek' : 'limit.perOrder', max, over: ASK_BEFORE.test(t) || soft ? 'needs_approval' : 'block' };
  }

  // CO2
  if (/\bco2|co₂|carbon|emission/i.test(t)) {
    const m = t.replace(/co2e?|co₂e?/gi, 'carbon').match(new RegExp(`${NUM}\\s*(?:kg)?`, 'i'));
    if (m) return attr('co2eKgPerKg', /\bat least\b|\bminimum\b/i.test(t) ? '>=' : '<=', toNum(m[1]), t, scopeFor(t));
  }

  // delivery reliability
  if (/reliab/i.test(t)) {
    const m = t.match(new RegExp(`${NUM}\\s*(%)?`));
    if (m) {
      const v = m[2] || toNum(m[1]) > 1 ? toNum(m[1]) / 100 : toNum(m[1]);
      return attr('deliveryReliability', /\b(below|under|at most|less than)\b/i.test(t) && !/\bnot\b/i.test(t) ? '<=' : '>=', v, t, scopeFor(t));
    }
  }

  // delivery days
  const days = detectDeliveryDays(t) ?? (/\bdeliver/i.test(t) ? detectDeliveryDays(`${t} only`) : null);
  if (days) return { type: 'delivery.days', days, over: soft ? 'needs_approval' : 'block' };

  // lactose / alcohol (nutrition)
  if (/lactose[- ]free|no lactose|without lactose/i.test(t)) return { type: 'nutrition', hard: !soft, nutrient: 'LACS', operator: '=', value: 0 };
  if (/\b(no|never|without)\b[^.]*\balcohol|alcohol[- ]free/i.test(t)) return { type: 'nutrition', hard: !soft, nutrient: 'ALCOHOL', operator: '=', value: 0 };

  // allergens
  const allergens = ALLERGEN_WORDS.filter(([re]) => re.test(t)).map(([, c]) => c);
  if (allergens.length && (/\b(no|never|without|exclude|avoid|free of|contain\w*|allerg\w*)\b/i.test(t) || /-free\b|\bfree\b/i.test(t))) {
    // "milk" alongside another allergen is usually the product word (e.g. "milk with soy").
    const codes = allergens.length > 1 ? allergens.filter((c) => c !== 'AM') : allergens;
    return { type: 'allergen.exclude', allergens: codes, hard: !soft };
  }

  // per-line limits
  const perLine = detectPerLine(t);
  if (perLine) return { type: 'limit.perLine', max: perLine.max, unit: perLine.unit, ...(perLine.categories.length ? { scope: { categories: perLine.categories } } : {}), over: /\bblock/i.test(t) && !soft ? 'block' : 'needs_approval' };

  // origin
  const origin = detectOrigin(t);
  if (origin) return attr('origin', origin.operator, origin.value, t, scopeFor(t));

  // temperature class
  const temp = t.match(/\b(chilled|frozen|ambient|refrigerated|room temperature)\b/i);
  if (temp) {
    const v = /refrigerated/i.test(temp[1]) ? 'chilled' : /room/i.test(temp[1]) ? 'ambient' : temp[1].toLowerCase();
    return attr('temperatureClass', /\b(no|never|not|nothing)\b/i.test(t) ? '!=' : '=', v, t, scopeFor(t));
  }

  // vendor: "cheese only from Valio", "only Valio products"
  const vendor = t.match(/\b(?:only|just|exclusively)\s+(?:from|by|made by)\s+([A-Za-z][\w&.' -]*?)(?:\s+(?:products?|only))?\s*[.!]?$/i) ?? t.match(/\bfrom\s+([A-Za-z][\w&.' -]*?)\s+only\b/i);
  if (vendor && !countryIn(vendor[1])) {
    const name = vendor[1].trim();
    return attr('vendor', '=', name, t, scopeFor(t, [new RegExp(name, 'i')]));
  }

  // substitutes
  if (/substitut/i.test(t) && /approv|ask|check/i.test(t)) return { type: 'substitution', requiresApproval: true };

  // categories: "only dairy", "only milk and cream"
  const cats = categoriesIn(t);
  if (cats.length && /\bonly\b/i.test(t)) return { type: 'category.allow', allow: cats.filter((c) => facts.taxonomy.includes(c)) };

  return null;
};

// --- Gemini -------------------------------------------------------------------------

const REFUSAL = 'Try naming what to check: where it’s from, an allergen, a price per litre or kg, a delivery day, or a spend limit.';

const POSSIBLE =
  'Rules can check: a product attribute (origin, vendor, temperature class, delivery reliability, CO₂e per kg, price per litre/kg, category, product group, a nutrient per 100 g) against a value; ' +
  'excluded allergens; lactose / nutrient limits; the size of any single order line (litres, kg, sales units or €); which weekdays deliveries may arrive; spend per order or per week; allowed categories; substitutes needing approval.';

const geminiSchema = (facts: CatalogFacts) => {
  const properties = {
    supported: { type: 'BOOLEAN', description: 'false when the sentence cannot be expressed with one of the rule types' },
    explanation: { type: 'STRING', description: 'One short sentence: how the sentence was mapped, or why it is not supported' },
    type: { type: 'STRING', nullable: true, enum: [...DRAFTABLE_TYPES] },
    attribute: { type: 'STRING', nullable: true, enum: [...ATTRIBUTES, ...facts.nutrients.map((n) => `nutrition.${n}`)] },
    operator: { type: 'STRING', nullable: true, enum: [...OPERATORS] },
    textValue: { type: 'STRING', nullable: true },
    numberValue: { type: 'NUMBER', nullable: true },
    listValue: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
    scopeCategories: { type: 'ARRAY', nullable: true, items: { type: 'STRING', enum: facts.taxonomy } },
    scopeCodes: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
    hard: { type: 'BOOLEAN', nullable: true },
    onMissing: { type: 'STRING', nullable: true, enum: ['needs_approval', 'block', 'ignore'] },
    max: { type: 'NUMBER', nullable: true },
    unit: { type: 'STRING', nullable: true, enum: ['l', 'kg', 'pcs', 'EUR'] },
    over: { type: 'STRING', nullable: true, enum: ['needs_approval', 'block'] },
    days: { type: 'ARRAY', nullable: true, items: { type: 'INTEGER' } },
    allergens: { type: 'ARRAY', nullable: true, items: { type: 'STRING', enum: Object.keys(GS1_ALLERGENS) } },
    nutrient: { type: 'STRING', nullable: true, enum: facts.nutrients },
    allow: { type: 'ARRAY', nullable: true, items: { type: 'STRING', enum: facts.taxonomy } },
    label: { type: 'STRING', nullable: true, description: 'Optional short title, max 6 words' },
  };
  // Every field required (null when it doesn't apply): Gemini otherwise tends to omit optional ones.
  const keys = Object.keys(properties);
  return { type: 'OBJECT', properties, required: keys, propertyOrdering: keys };
};

const geminiPrompt = (text: string, facts: CatalogFacts, context: { approver?: string; existing: string[] }) =>
  [
    'You turn ONE sentence from a hospital kitchen buyer into ONE purchasing-policy rule for a Valio ordering gateway. Fill the JSON form; leave fields that do not apply null.',
    'Rule types (never invent others):',
    '- product.attribute: attribute + operator + value (textValue for = / !=, listValue for in / not_in, numberValue for numbers), optional scopeCategories/scopeCodes (the rule then only applies to those products), hard (true = block, false = a person approves), onMissing (default needs_approval).',
    '  attributes: origin (ISO-2 country code, e.g. FI), vendor, temperatureClass (' + (facts.values.temperatureClass.join(', ') || 'chilled, frozen, ambient') + '), categoryCode, group, deliveryReliability (0–1 share), co2eKgPerKg (kg CO2e per kg), pricePerBase (EUR per litre or kg), nutrition.<NUTRIENT> (per 100 g).',
    '  A rule states what products MUST satisfy: "nothing from outside Finland" → origin = FI; "block CO2 above 3" → co2eKgPerKg <= 3, hard true; "ask me if it costs more than €4 per litre" → pricePerBase <= 4, hard false.',
    '- limit.perLine: max + unit (l, kg, pcs, EUR) — any single order line above max triggers; optional scopeCategories; over = needs_approval | block.',
    '- delivery.days: days = allowed ISO weekdays (1=Mon … 7=Sun); over = needs_approval | block.',
    '- allergen.exclude: allergens = GS1 codes; hard.',
    '- nutrition: nutrient + operator + numberValue (e.g. lactose-free = LACS = 0); hard.',
    '- limit.perOrder / limit.perWeek: max in EUR; over.',
    '- category.allow: allow = category codes; substitution: substitutes need approval.',
    'Hard vs approval: "never", "no", "nothing", "only", "block", "must" → hard true / over block. "ask me", "needs approval", "check with", "without <person>" → hard false / over needs_approval.',
    `Catalog facts — categories: ${facts.taxonomy.join(', ')} (in stock now: ${facts.categories.join(', ')}); vendors: ${facts.values.vendor.join(', ')}; origins: ${facts.values.origin.join(', ')}; product groups: ${facts.values.group.join(', ')}; nutrients: ${facts.nutrients.join(', ')}.`,
    `GS1 allergen codes: ${Object.entries(GS1_ALLERGENS).map(([c, l]) => `${c}=${l}`).join('; ')}.`,
    'Examples:',
    '"Nothing from outside Finland" → product.attribute origin = FI, hard true.',
    '"Local only", "local products", "Finnish only", "made in Finland" → product.attribute origin = FI, hard true (the kitchen is in Finland: local / domestic = FI).',
    '"No single line over 200 litres without Mikko" → limit.perLine max 200 unit l, over needs_approval.',
    '"Cheese only from Valio" → product.attribute vendor = "Valio Oy", scopeCategories [dairy.cheese], hard true.',
    '"More than 50 kg of cheese needs approval" → limit.perLine max 50 unit kg, scopeCategories [dairy.cheese], over needs_approval.',
    '"Deliveries Monday to Friday only" → delivery.days days [1,2,3,4,5], over block.',
    '"Never products with soy" → allergen.exclude allergens [AY], hard true.',
    '"Only organic products" → supported false (no organic attribute).',
    context.approver ? `Approvals go to ${context.approver}.` : '',
    context.existing.length ? `The policy already has: ${context.existing.join(' | ')}` : '',
    `Sentence: ${text}`,
  ]
    .filter(Boolean)
    .join('\n');

type GeminiDraft = Record<string, unknown> & { supported?: boolean; explanation?: string; type?: string | null };

const fromGemini = (g: GeminiDraft): Record<string, unknown> | null => {
  if (!g.supported || !g.type) return null;
  const scope =
    (g.scopeCategories as string[] | null)?.length || (g.scopeCodes as string[] | null)?.length
      ? { scope: { ...((g.scopeCategories as string[])?.length ? { categories: g.scopeCategories } : {}), ...((g.scopeCodes as string[])?.length ? { codes: g.scopeCodes } : {}) } }
      : {};
  const label = g.label ? { label: g.label } : {};
  switch (g.type) {
    case 'product.attribute': {
      const op = String(g.operator ?? '=');
      const value = op === 'in' || op === 'not_in' ? (g.listValue ?? (g.textValue ? [g.textValue] : null)) : (g.numberValue ?? g.textValue ?? (g.listValue as string[] | null)?.[0] ?? null);
      return { type: g.type, attribute: g.attribute, operator: op, value, ...scope, hard: g.hard ?? true, onMissing: g.onMissing ?? 'needs_approval', ...label };
    }
    case 'limit.perLine':
      return { type: g.type, max: g.max ?? g.numberValue, unit: g.unit, ...scope, over: g.over ?? 'needs_approval' };
    case 'delivery.days':
      return { type: g.type, days: g.days, over: g.over ?? 'needs_approval' };
    case 'allergen.exclude':
      return { type: g.type, allergens: g.allergens ?? g.listValue, hard: g.hard ?? true };
    case 'nutrition':
      return { type: g.type, nutrient: g.nutrient ?? String(g.attribute ?? '').replace(/^nutrition\./, ''), operator: g.operator ?? '=', value: g.numberValue, hard: g.hard ?? true };
    case 'limit.perOrder':
    case 'limit.perWeek':
      return { type: g.type, max: g.max ?? g.numberValue, over: g.over ?? 'needs_approval' };
    case 'category.allow':
      return { type: g.type, allow: g.allow ?? g.scopeCategories ?? g.listValue };
    case 'substitution':
      return { type: g.type, requiresApproval: true };
    default:
      return { type: g.type };
  }
};

// --- Entry point ----------------------------------------------------------------------

export type DraftRuleResult = { rule: PolicyRule | null; sentence: string; supported: boolean; compiler: 'gemini' | 'rules'; notes: string[]; warnings: string[] };

/**
 * One sentence → one validated rule with a key that doesn't clash with
 * `existing`. Never saves anything.
 */
export const draftRuleFromText = async (
  text: string,
  existing: PolicyRule[] = [],
  opts: { approver?: string; facts?: CatalogFacts; useGemini?: boolean } = {}
): Promise<DraftRuleResult> => {
  const facts = opts.facts ?? catalogFacts();
  const notes: string[] = [];
  const warnings: string[] = [];
  let raw: Record<string, unknown> | null = null;
  let compiler: 'gemini' | 'rules' = 'rules';

  if (opts.useGemini ?? !!process.env.GEMINI_API_KEY) {
    try {
      const g = await geminiJson<GeminiDraft>(geminiPrompt(text, facts, { approver: opts.approver, existing: existing.map(describeRule) }), geminiSchema(facts));
      compiler = 'gemini';
      raw = fromGemini(g);
      // A refusal's explanation is technical ("…ISO country codes…"): only keep it with a rule.
      if (raw && g.explanation) notes.push(String(g.explanation));
      if (!raw && g.explanation) logger.info(`Gateway: Gemini declined "${text}": ${g.explanation}`);
    } catch (err) {
      logger.warn(`Gateway: Gemini rule draft failed, using the rule-based parser: ${(err as Error).message}`);
      notes.push('Gemini unavailable — drafted with the rule-based parser');
    }
  }

  let v = raw ? validateRule(raw, facts) : null;
  if (!v || !v.rule) {
    // Gemini errored, declined or produced an invalid rule: try the rule-based parser.
    const parsed = parseRuleText(text, facts);
    const pv = parsed ? validateRule(parsed, facts) : null;
    if (pv?.rule) {
      if (v?.errors.length) notes.push(`Gemini's rule was invalid (${v.errors.join('; ')}) — used the rule-based parser`);
      v = pv;
      compiler = 'rules';
    } else if (!v && pv) v = pv;
  }

  if (!v || !v.rule) {
    if (v?.errors.length) logger.info(`Gateway: no valid rule for "${text}": ${v.errors.join('; ')}`);
    // Plain and short first (shown as is); the full list second (shown folded).
    return { rule: null, sentence: '', supported: false, compiler, notes: [REFUSAL, `Not expressible as a rule. ${POSSIBLE}`], warnings: [...warnings, ...(v?.warnings ?? [])] };
  }

  const rule = { ...v.rule, key: uniqueKey(baseKey(v.rule), existing.map((r) => r.key)) } as PolicyRule;
  const duplicate = existing.find((r) => r.type === rule.type && sameRule(r, rule));
  if (duplicate) warnings.push(`The policy already has this rule (${duplicate.key})`);
  const asksPerson = (rule.type === 'product.attribute' && rule.hard === false) || rule.over === 'needs_approval' || (rule.hard === false && rule.type !== 'product.attribute');
  if (asksPerson && opts.approver) notes.push(`Exceptions go to ${opts.approver}`);
  return { rule, sentence: describeRule(rule), supported: true, compiler, notes: [...notes, ...v.notes], warnings: [...warnings, ...v.warnings] };
};
