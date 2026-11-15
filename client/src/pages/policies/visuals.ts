import { keyframes } from '@emotion/react';
import { IconType } from 'react-icons';
import {
  LuBan,
  LuCalendarDays,
  LuCalendarClock,
  LuCalendarRange,
  LuEuro,
  LuGlobe,
  LuListOrdered,
  LuMilkOff,
  LuPackagePlus,
  LuReplace,
  LuRuler,
  LuShieldAlert,
  LuShieldQuestion,
  LuSlidersHorizontal,
  LuTag,
  LuTags,
  LuThermometer,
  LuUserCheck,
  LuWheat,
} from 'react-icons/lu';
import { Policy, PolicyRule } from '@/api/gateway';

// Turns the server's typed `mandate.policy/v1` rules into the cards the editor
// shows. Everything displayed comes from the rule's own fields; unknown rule
// types fall back to a generic card listing their parameters.

type Kind = 'policy' | 'valio' | 'rule' | 'rank' | 'human' | 'action';

export type DisplayRule = {
  key: string;
  type: string;
  kind: Kind;
  icon: IconType;
  title: string;
  value: string;
  detail: string;
  hard: boolean;
  // How the rule reads in the sign-off summary.
  alone?: string;
  person?: string;
  never?: string;
};

export type Approver = { name: string; role: string; windowMinutes: number; fallback: string };

const CATEGORY_LABELS: Record<string, string> = {
  'dairy.milk': 'Milk',
  'dairy.yoghurt': 'Yoghurt & quark',
  'dairy.cheese': 'Cheese',
  'dairy.butter': 'Butter & spreads',
  'dairy.cream': 'Cream',
  'dairy.desserts': 'Desserts',
  'plant.drinks': 'Plant-based drinks',
  'dry.flour': 'Flour',
  'dry.cereals': 'Cereals & oats',
  'dry.pasta': 'Pasta',
  'dry.rice': 'Rice',
  'bakery.pastries': 'Pastries',
  'beverages.coffee': 'Coffee & tea',
  'beverages.juice': 'Juice',
  'produce.fruit': 'Fruit',
};

const RANK_LABELS: Record<string, string> = { valio_substitute: 'Valio subs', delivery_reliability: 'reliability', unit_price: 'price' };
export const NUTRIENTS: Record<string, string> = { LACS: 'Lactose', FAT: 'Fat', SUGARS: 'Sugars', SALT: 'Salt', PROTEIN: 'Protein', CARBS: 'Carbohydrates', GLUTEN: 'Gluten', ALCOHOL: 'Alcohol' };

const euro = (n: unknown, currency = 'EUR') =>
  typeof n === 'number' ? `${currency === 'EUR' ? '€' : `${currency} `}${n.toLocaleString('en-US')}` : String(n ?? '—');
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const effect = (v: unknown) => (v === 'needs_approval' ? 'goes to a person' : v === 'block' ? 'is blocked' : str(v).replace(/_/g, ' '));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const minutes = (m: number) => (m >= 60 && m % 60 === 0 ? plural(m / 60, 'hour') : `${m} min`);

/** A category in words: the editor's label, else its last part ("other.frozen-fish" → "Frozen fish"). */
export const categoryLabel = (code: string) => {
  if (CATEGORY_LABELS[code]) return CATEGORY_LABELS[code];
  const last = (code.split('.').pop() || code).replace(/-/g, ' ');
  return last.charAt(0).toUpperCase() + last.slice(1);
};

/** Every category the editor offers, as [code, label]. */
export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS);

/** Allergen codes as the Valio catalog reports them (GS1), with their official names. */
export const ALLERGEN_LABELS: Record<string, string> = {
  AW: 'Cereals containing gluten',
  AM: 'Milk',
  AE: 'Eggs',
  AN: 'Tree nuts',
  AP: 'Peanuts',
  AY: 'Soy',
  AF: 'Fish',
  AC: 'Crustaceans',
  UM: 'Molluscs',
  BC: 'Celery',
  BM: 'Mustard',
  AS: 'Sesame',
  AU: 'Sulphites',
  NL: 'Lupin',
  GO: 'Oats',
  // Common alternative spellings a compiled policy may use.
  GLU: 'Cereals containing gluten',
  EGG: 'Eggs',
  NUT: 'Tree nuts',
  SOY: 'Soy',
  FISH: 'Fish',
};

/** The GS1 codes, in the order the editor offers them. */
export const ALLERGEN_CODES = ['AW', 'AM', 'AE', 'AN', 'AP', 'AY', 'AF', 'AC', 'UM', 'BC', 'BM', 'AS', 'AU', 'NL', 'GO'];

/** Shorter words for sentences ("never products containing gluten"). */
const ALLERGEN_WORDS: Record<string, string> = { AW: 'gluten', GLU: 'gluten', NUT: 'tree nuts' };

export const allergenLabel = (code: string) => ALLERGEN_LABELS[code.toUpperCase()] ?? code;
const allergenWord = (code: string) => ALLERGEN_WORDS[code.toUpperCase()] ?? allergenLabel(code).toLowerCase();

/** Approver from the rules (falls back to the policy view's approver). */
export const approverOf = (rules: PolicyRule[], fallback?: Policy['approver']): Approver | null => {
  const route = rules.find((r) => r.type === 'approval') as
    (PolicyRule & { approver?: { name?: string; role?: string }; windowMinutes?: number; fallback?: string }) | undefined;
  if (!route && !fallback) return null;
  return {
    name: route?.approver?.name ?? fallback?.name ?? 'Approver',
    role: route?.approver?.role ?? fallback?.role ?? '',
    windowMinutes: Number(route?.windowMinutes ?? fallback?.windowMinutes ?? 30),
    fallback: route?.fallback ?? fallback?.fallback ?? 'order only what the policy allows',
  };
};


// --- Rules made on the fly: product attributes, per-line limits, delivery days -------------

const listWords = (xs: string[], joiner = 'and') => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${joiner} ${xs.at(-1)}`);

export const COUNTRIES: Record<string, string> = {
  FI: 'Finland',
  SE: 'Sweden',
  EE: 'Estonia',
  DK: 'Denmark',
  NO: 'Norway',
  DE: 'Germany',
  NL: 'the Netherlands',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  PL: 'Poland',
  LT: 'Lithuania',
  LV: 'Latvia',
  EU: 'the EU',
};
export const countryName = (code: string) => COUNTRIES[code.toUpperCase()] ?? code;

/** Attributes a `product.attribute` rule can read, with how to talk about them. */
export const ATTRIBUTES: Record<string, { label: string; noun: string; numeric: boolean; unit?: string }> = {
  origin: { label: 'Country of origin', noun: 'origin', numeric: false },
  vendor: { label: 'Brand', noun: 'brand', numeric: false },
  temperatureClass: { label: 'Storage temperature', noun: 'storage temperature', numeric: false },
  categoryCode: { label: 'Category', noun: 'category', numeric: false },
  group: { label: 'Product group', noun: 'product group', numeric: false },
  deliveryReliability: { label: 'Delivery reliability', noun: 'delivery reliability', numeric: true, unit: '%' },
  co2eKgPerKg: { label: 'Carbon footprint', noun: 'carbon footprint', numeric: true, unit: 'kg CO₂e/kg' },
  pricePerBase: { label: 'Price per litre or kilo', noun: 'price per litre or kilo', numeric: true, unit: '€' },
};

export const attributeMeta = (attribute: string) => {
  if (attribute.startsWith('nutrition.')) {
    const n = attribute.slice('nutrition.'.length);
    return { label: NUTRIENTS[n] ?? n, noun: (NUTRIENTS[n] ?? n).toLowerCase(), numeric: true, unit: 'g/100g' };
  }
  return ATTRIBUTES[attribute] ?? { label: attribute, noun: attribute, numeric: false };
};

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === '' ? [] : [String(v)]);

/** One attribute value in words: FI → Finland, dairy.milk → milk, 0.95 reliability → 95 %. */
const attributeValue = (attribute: string, v: string) => {
  if (attribute === 'origin') return countryName(v);
  if (attribute === 'categoryCode') return categoryLabel(v).toLowerCase();
  return v;
};

const numberWords = (attribute: string, v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return str(v);
  if (attribute === 'pricePerBase') return `€${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (attribute === 'deliveryReliability') return `${Math.round(n <= 1 ? n * 100 : n)} %`;
  const unit = attributeMeta(attribute).unit;
  return `${n.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
};

const OP_WORDS: Record<string, string> = { '<=': 'at most', '<': 'under', '=': 'exactly', '>=': 'at least', '>': 'over', '!=': 'not' };

type Scope = { categories?: string[]; codes?: string[] };
/** " for milk and cream" / " for product 464398". */
export const scopeWords = (scope: unknown) => {
  const s = (scope ?? {}) as Scope;
  const parts = [...(s.categories ?? []).map((c) => categoryLabel(c).toLowerCase()), ...(s.codes ?? []).map((c) => `product ${c}`)];
  return parts.length ? ` for ${listWords(parts)}` : '';
};

const attributeSentence = (f: Record<string, unknown>, hard: boolean) => {
  const attribute = str(f.attribute);
  const meta = attributeMeta(attribute);
  const op = str(f.operator);
  const scope = scopeWords(f.scope);
  const values = asList(f.value).map((v) => attributeValue(attribute, v));
  let core: string;
  if (meta.numeric || ['<', '<=', '>', '>='].includes(op)) {
    const subject = attribute === 'pricePerBase' ? 'Price per litre or kilo' : meta.label;
    core = `${subject}${scope} ${OP_WORDS[op] ?? op} ${numberWords(attribute, f.value)}`;
    return core + (hard ? ' — always enforced' : ' — otherwise a person decides');
  }
  const positive = op === '=' || op === 'in';
  if (attribute === 'origin') core = positive ? `Only products from ${listWords(values, 'or')}${scope}` : `Never products from ${listWords(values, 'or')}${scope}`;
  else if (attribute === 'temperatureClass') core = positive ? `Only ${listWords(values, 'or')} products${scope}` : `No ${listWords(values, 'or')} products${scope}`;
  else core = positive ? `Only products whose ${meta.noun} is ${listWords(values, 'or')}${scope}` : `Never products whose ${meta.noun} is ${listWords(values, 'or')}${scope}`;
  return core + (hard ? (positive ? ' — always enforced' : '') : ' — otherwise a person decides');
};

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** [1,2,3,4,5] → "Monday to Friday"; [1,3,5] → "Monday, Wednesday and Friday". */
export const daysWords = (days: unknown, short = false) => {
  const ds = [...new Set(asList(days).map(Number).filter((d) => d >= 1 && d <= 7))].sort();
  const name = (d: number) => (short ? DAY_NAMES[d - 1].slice(0, 3) : DAY_NAMES[d - 1]);
  if (!ds.length) return 'no days';
  if (ds.length === 7) return 'any day';
  const contiguous = ds.length >= 3 && ds.every((d, i) => i === 0 || d === ds[i - 1] + 1);
  return contiguous ? `${name(ds[0])}${short ? '–' : ' to '}${name(ds.at(-1)!)}` : listWords(ds.map(name));
};

const LINE_UNITS: Record<string, string> = { l: 'litres', kg: 'kg', pcs: 'pieces', EUR: '€' };
export const perLineAmount = (f: Record<string, unknown>) => {
  const n = Number(f.max);
  const unit = str(f.unit);
  if (unit === 'EUR') return euro(n);
  return `${Number.isFinite(n) ? n.toLocaleString('en-US') : '—'} ${LINE_UNITS[unit] ?? unit}`;
};

// Sentences the server wrote for rules drafted from words — used for rule types the
// client has no wording for. Session only; never sent back.
const serverSentences = new Map<string, string>();
export const rememberSentence = (key: string, sentence: string | null | undefined) => {
  if (sentence) serverSentences.set(key, sentence);
};

export const describeRule = (r: PolicyRule): DisplayRule => {
  const f = r as Record<string, unknown>;
  const base = { key: r.key, type: r.type, hard: !!r.hard };
  switch (r.type) {
    case 'limit.perOrder': {
      const max = euro(f.max, str(f.currency) || 'EUR');
      return {
        ...base,
        kind: 'policy',
        icon: LuEuro,
        title: 'Spend per order',
        value: `≤ ${max}`,
        detail: `Orders at or under the limit execute automatically at the quoted, fixed prices. Above it the order ${effect(f.over)}.`,
        alone: `Place orders up to ${max}`,
        person: f.over === 'needs_approval' ? `Any order above ${max}` : undefined,
        never: f.over === 'block' ? `Any order above ${max}` : undefined,
      };
    }
    case 'limit.perWeek': {
      const max = euro(f.max, str(f.currency) || 'EUR');
      return {
        ...base,
        kind: 'policy',
        icon: LuCalendarRange,
        title: 'Spend per week',
        value: `≤ ${max}`,
        detail: `${f.window === 'iso_week' ? 'Monday–Sunday' : str(f.window)} total across every agent using this policy. Past it the order ${effect(f.over)}.`,
        alone: `Spend up to ${max} a week`,
        person: f.over === 'needs_approval' ? `Anything past ${max} in a week` : undefined,
        never: f.over === 'block' ? `Anything past ${max} in a week` : undefined,
      };
    }
    case 'schedule.frequency': {
      const n = Number(f.maxOrders ?? 1);
      return {
        ...base,
        kind: 'policy',
        icon: LuCalendarClock,
        title: 'Frequency',
        value: `${plural(n, 'order')} / week`,
        detail: `At most ${plural(n, 'order')} per ${f.window === 'iso_week' ? 'Monday–Sunday week' : str(f.window)}; one more goes to the approver.`,
        alone: `${plural(n, 'order')} a week`,
        person: 'Another order in the same week',
      };
    }
    case 'category.allow': {
      const allow = Array.isArray(f.allow) ? (f.allow as string[]) : [];
      const labels = allow.map(categoryLabel);
      return {
        ...base,
        kind: 'valio',
        icon: LuTags,
        title: 'Categories',
        value:
          allow.every((c) => c.startsWith('dairy.')) && allow.length >= 5
            ? 'Dairy only'
            : labels.length > 4
              ? `${labels.length} categories`
              : labels.join(', '),
        detail: `${labels.join(', ')}. Everything else is rejected.`,
        alone: `Buy ${labels.join(', ').toLowerCase()}`,
        person: f.over === 'needs_approval' ? 'Products outside these categories' : undefined,
        never: f.over === 'needs_approval' ? undefined : 'Products outside these categories',
      };
    }
    case 'allergen.exclude': {
      const codes = Array.isArray(f.allergens) ? (f.allergens as string[]) : [];
      const words = listWords(codes.map(allergenWord)) || 'listed allergens';
      return {
        ...base,
        kind: 'rule',
        icon: LuShieldAlert,
        title: 'Allergens',
        value: `No ${words}`,
        detail: 'Read from the allergen codes Valio reports. Products with unknown allergens go to a person.',
        never: r.hard === false ? undefined : `Products containing ${words}`,
        person: r.hard === false ? `Products containing ${words}` : undefined,
      };
    }
    case 'nutrition': {
      const nutrient = str(f.nutrient ?? f.attribute);
      const label = NUTRIENTS[nutrient] ?? nutrient;
      const value = `${nutrient} ${str(f.operator)} ${str(f.value)} ${str(f.unit)}`.trim();
      const zero = f.operator === '=' && f.value === 0;
      return {
        ...base,
        kind: 'rule',
        icon: nutrient === 'LACS' ? LuMilkOff : nutrient === 'GLUTEN' ? LuWheat : nutrient === 'ALCOHOL' ? LuBan : LuSlidersHorizontal,
        title:
          nutrient === 'LACS' && zero
            ? 'Lactose-free'
            : nutrient === 'GLUTEN'
              ? 'Gluten-free'
              : nutrient === 'ALCOHOL' && zero
                ? 'No alcohol'
                : label,
        value,
        detail:
          nutrient === 'LACS'
            ? 'Read from the nutrition value, not allergen codes — lactose-free milk is still tagged AM.'
            : `Read from the product attribute ${nutrient}, not from product names.`,
        never: `Any product failing ${value}`,
      };
    }
    case 'data.missing': {
      const fields = Array.isArray(f.fields) ? (f.fields as string[]) : [];
      return {
        ...base,
        kind: 'rule',
        icon: LuShieldQuestion,
        title: 'Missing data',
        value: f.onMissing === 'needs_approval' ? 'Fail closed → person' : `On missing: ${effect(f.onMissing)}`,
        detail: `If ${fields.join(', ') || 'a field the rules read'} is unknown for a product, it ${effect(f.onMissing)} — never guessed.`,
        person:
          f.onMissing === 'needs_approval'
            ? `Products where ${fields.map((x) => FIELD_WORDS[x] ?? x.replace(/^nutrition\./, '')).join(' or ') || 'the data'} is unknown`
            : undefined,
      };
    }
    case 'substitution':
      return {
        ...base,
        kind: 'rank',
        icon: r.key === 'product.new' ? LuPackagePlus : LuReplace,
        title: r.key === 'product.new' ? 'New products' : 'Substitutes',
        value: f.requiresApproval ? 'Need approval' : 'Allowed',
        detail: f.requiresApproval
          ? 'Any product other than the one requested goes to the approver, with the trade-off spelled out.'
          : 'The agent may substitute within the other rules.',
        person: f.requiresApproval ? 'Any substitute product' : undefined,
        alone: f.requiresApproval ? undefined : 'Substitute within the rules',
      };
    case 'substitution.rank': {
      const order = Array.isArray(f.order) ? (f.order as string[]) : [];
      return {
        ...base,
        kind: 'rank',
        icon: LuListOrdered,
        title: 'Substitute ranking',
        value: order.map((o) => RANK_LABELS[o] ?? o).join(' → '),
        detail: `Ranked by ${order.map((o) => (RANK_LABELS[o] ?? o).toLowerCase()).join(', then ')}.${f.mustMeetDeliveryDate ? ' The delivery date must still be met.' : ''}`,
        alone: 'Rank substitutes that pass the hard rules',
      };
    }
    case 'product.attribute': {
      const attribute = str(f.attribute);
      const meta = attributeMeta(attribute);
      const sentence = attributeSentence(f, r.hard !== false);
      return {
        ...base,
        kind: 'rule',
        icon: attribute === 'origin' ? LuGlobe : attribute === 'pricePerBase' ? LuEuro : attribute === 'temperatureClass' ? LuThermometer : attribute.startsWith('nutrition.') ? LuSlidersHorizontal : LuTag,
        title: str(f.label) || meta.label,
        value: sentence.replace(/ — .*$/, ''),
        detail: `Read from the product’s ${meta.noun} in Valio’s data. If a product doesn’t report it, ${f.onMissing === 'block' ? 'it is blocked' : f.onMissing === 'ignore' ? 'the rule is skipped' : 'a person decides'}.`,
        never: r.hard === false ? undefined : sentence.replace(/ — .*$/, ''),
        person: r.hard === false ? `Products that don’t meet: ${sentence.replace(/ — .*$/, '').toLowerCase()}` : undefined,
      };
    }
    case 'limit.perLine': {
      const amount = perLineAmount(f);
      return {
        ...base,
        kind: 'policy',
        icon: LuRuler,
        title: 'Per line',
        value: `≤ ${amount}`,
        detail: `Each order line up to ${amount}${scopeWords(f.scope)}. A bigger line ${effect(f.over)}.`,
        alone: `Order up to ${amount} in one line${scopeWords(f.scope)}`,
        person: f.over === 'needs_approval' ? `A line over ${amount}${scopeWords(f.scope)}` : undefined,
        never: f.over === 'block' ? `A line over ${amount}${scopeWords(f.scope)}` : undefined,
      };
    }
    case 'delivery.days': {
      const days = daysWords(f.days);
      return {
        ...base,
        kind: 'valio',
        icon: LuCalendarDays,
        title: 'Delivery days',
        value: daysWords(f.days, true),
        detail: `Deliveries ${days} only. Another day ${effect(f.over)}.`,
        alone: `Take deliveries ${days}`,
        person: f.over === 'block' ? undefined : 'A delivery on another day',
        never: f.over === 'block' ? 'A delivery on another day' : undefined,
      };
    }
    case 'approval': {
      const a = approverOf([r]);
      return {
        ...base,
        kind: 'human',
        icon: LuUserCheck,
        title: 'Approver',
        value: a ? `${a.name} · ${minutes(a.windowMinutes)}` : '—',
        detail: a ? `${a.role}. No answer within ${minutes(a.windowMinutes)} → ${a.fallback}.` : '',
      };
    }
    default: {
      const params = Object.entries(f).filter(([k]) => !['key', 'type', 'hard', 'label'].includes(k));
      return {
        ...base,
        kind: 'action',
        icon: LuSlidersHorizontal,
        title: str(f.label) || r.type.replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase()),
        value: params.length ? params.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : str(v)}`)[0] : '',
        detail: params.map(([k, v]) => `${k} = ${typeof v === 'object' ? JSON.stringify(v) : str(v)}`).join(' · ') || 'No parameters.',
      };
    }
  }
};

export const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(8px) scale(0.99); }
  to { opacity: 1; transform: none; }
`;

export const pulse = keyframes`
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
`;

export type PolicyState = 'signed' | 'changed' | 'draft';

/** signed = latest version is in effect; changed = a draft sits above a signed version; draft = never signed. */
export const policyState = (p: Pick<Policy, 'status' | 'activeVersion'>): PolicyState =>
  p.status === 'signed' ? 'signed' : p.activeVersion !== null ? 'changed' : 'draft';

const ruleValue = (r: PolicyRule) => describeRule(r).value;

/** One-line summary of what changed between the signed version and this draft (sent with the signature). */
export const diffSummary = (rules: PolicyRule[], before: PolicyRule[] | null, approver: Approver | null) => {
  if (!before) {
    const limit = rules.find((r) => r.type === 'limit.perOrder');
    return `First version: ${plural(rules.length, 'rule')}${limit ? `, ${ruleValue(limit).replace('≤ ', '')} per order` : ''}${approver ? `, approver ${approver.name}` : ''}`;
  }
  const changes = [
    ...rules.map((r) => {
      const old = before.find((b) => b.key === r.key);
      if (!old) return `added ${describeRule(r).title.toLowerCase()}`;
      const [a, b] = [ruleValue(old), ruleValue(r)];
      return a !== b ? `${describeRule(r).title} ${a.replace('≤ ', '')} → ${b.replace('≤ ', '')}` : null;
    }),
    ...before.filter((b) => !rules.some((r) => r.key === b.key)).map((b) => `removed ${describeRule(b).title.toLowerCase()}`),
  ].filter(Boolean);
  return changes.length ? changes.join(' · ') : 'Wording updated · same compiled rules';
};

export const ruleChanged = (rule: PolicyRule, previous: PolicyRule | null) => previous === null || ruleValue(previous) !== ruleValue(rule);

export const shortDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

const FIELD_WORDS: Record<string, string> = { 'nutrition.LACS': 'the lactose content', allergens: 'the allergens', 'nutrition.GLUTEN': 'the gluten content' };

const RANK_WORDS: Record<string, string> = { valio_substitute: 'Valio’s own suggestions', delivery_reliability: 'delivery reliability', unit_price: 'price' };

/** One plain sentence per rule, for the readable policy page. */
export const ruleSentence = (r: PolicyRule): string => {
  const f = r as Record<string, unknown>;
  const always = r.hard ? ' — always enforced' : '';
  switch (r.type) {
    case 'limit.perOrder': {
      const max = euro(f.max, str(f.currency) || 'EUR');
      return f.over === 'block' ? `Never more than ${max} per order${always}` : `Up to ${max} per order without approval${always}`;
    }
    case 'limit.perWeek': {
      const max = euro(f.max, str(f.currency) || 'EUR');
      const span = f.window === 'iso_week' ? ' (Monday–Sunday)' : '';
      return f.over === 'block' ? `Never more than ${max} a week${span}${always}` : `Up to ${max} a week${span} without approval${always}`;
    }
    case 'schedule.frequency': {
      const n = Number(f.maxOrders ?? 1);
      return `At most ${plural(n, 'order')} a week without approval${always}`;
    }
    case 'category.allow': {
      const allow = Array.isArray(f.allow) ? (f.allow as string[]) : [];
      return `Only ${allow.map(categoryLabel).join(', ').toLowerCase() || 'listed categories'} — anything else ${f.over === 'needs_approval' ? 'goes to a person' : 'is rejected'}`;
    }
    case 'allergen.exclude': {
      const codes = Array.isArray(f.allergens) ? (f.allergens as string[]) : [];
      const words = listWords(codes.map(allergenWord)) || 'listed allergens';
      return r.hard === false ? `Products containing ${words} go to a person` : `Never products containing ${words}${always}`;
    }
    case 'nutrition': {
      const d = describeRule(r);
      const nutrient = str(f.nutrient ?? f.attribute);
      const special = (nutrient === 'LACS' || nutrient === 'ALCOHOL') && f.operator === '=' && f.value === 0;
      const otherwise = r.hard === false ? ' — otherwise a person decides' : always;
      if (special || nutrient === 'GLUTEN') return `${d.title} only (${d.value})${otherwise}`;
      const op = ({ '<=': 'at most', '<': 'under', '=': 'exactly', '>=': 'at least', '>': 'over' } as Record<string, string>)[str(f.operator)] ?? str(f.operator);
      return `${NUTRIENTS[nutrient] ?? nutrient} ${op} ${str(f.value)} ${str(f.unit)}`.trim() + otherwise;
    }
    case 'data.missing': {
      const fields = (Array.isArray(f.fields) ? (f.fields as string[]) : []).map((x) => FIELD_WORDS[x] ?? x.replace(/^nutrition\./, ''));
      return f.onMissing === 'needs_approval'
        ? `If ${fields.join(' or ') || 'product data'} is unknown, a person decides — it is never guessed`
        : `If ${fields.join(' or ') || 'product data'} is unknown, the product ${effect(f.onMissing)}`;
    }
    case 'substitution':
      return r.key === 'product.new'
        ? f.requiresApproval
          ? 'New products need approval'
          : 'New products are allowed'
        : f.requiresApproval
          ? 'Substitutes need approval'
          : 'Substitutes are allowed within these rules';
    case 'substitution.rank': {
      const order = Array.isArray(f.order) ? (f.order as string[]) : [];
      return `Substitutes are ranked by ${order.map((o) => RANK_WORDS[o] ?? o).join(', then ')}${f.mustMeetDeliveryDate ? ', and must still arrive on time' : ''}`;
    }
    case 'product.attribute':
      return attributeSentence(f, r.hard !== false);
    case 'limit.perLine': {
      const amount = perLineAmount(f);
      return f.over === 'block' ? `Never more than ${amount} in one line${scopeWords(f.scope)}` : `Up to ${amount} in one line${scopeWords(f.scope)} without approval`;
    }
    case 'delivery.days':
      return `Deliveries ${daysWords(f.days)} only — another day ${f.over === 'block' ? 'is blocked' : 'goes to a person'}`;
    case 'approval': {
      const a = approverOf([r]);
      return a ? `${a.name}${a.role ? `, ${a.role.toLowerCase()},` : ''} approves exceptions within ${minutes(a.windowMinutes)}; with no answer, ${a.fallback}` : 'A named person approves exceptions';
    }
    default: {
      const remembered = serverSentences.get(r.key);
      if (remembered) return remembered;
      const d = describeRule(r);
      return `${d.title}: ${d.value}${always}`;
    }
  }
};
