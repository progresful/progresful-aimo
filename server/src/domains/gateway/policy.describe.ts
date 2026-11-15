// Plain-English one-liners for policy rules (any type, old and new), plus the
// labels the engine uses in check titles and details. Pure, no I/O.

import type { PolicyRule } from './policy.engine.ts';

// GS1 AllergenTypeCode → label (the Valio product file uses GS1 codes).
export const GS1_ALLERGENS: Record<string, string> = {
  AC: 'crustaceans',
  AE: 'eggs',
  AF: 'fish',
  AM: 'milk',
  AN: 'tree nuts',
  AP: 'peanuts',
  AS: 'sesame',
  AU: 'sulphites',
  AW: 'gluten (cereals containing gluten)',
  AY: 'soy',
  BC: 'celery',
  BM: 'mustard',
  NL: 'lupin',
  UM: 'molluscs',
  GO: 'oats',
  UW: 'wheat',
  NR: 'rye',
  GB: 'barley',
};

// Nutrient ids in Valio's data (GS1 / INFOODS tagnames) → plain words.
const NUTRIENTS: Record<string, string> = {
  LACS: 'lactose',
  GLUTEN: 'gluten',
  FAT: 'fat',
  FASAT: 'saturated fat',
  'SUGAR-': 'sugar',
  SUGAR: 'sugar',
  SALTEQ: 'salt',
  'PRO-': 'protein',
  CHOAVL: 'carbohydrate',
  FIBTG: 'fibre',
  'ENER-': 'energy',
  'ENER-KJO': 'energy (kJ)',
  'ENER-E14': 'energy (kcal)',
};

export const nutrientName = (id: string) => NUTRIENTS[id.toUpperCase()] ?? id.toLowerCase();

/** What Valio may have no info on, in words: "lactose", "allergen", "origin". */
export const infoLabel = (field: string) =>
  field === 'allergens'
    ? 'allergen'
    : field === 'product'
      ? 'product'
      : field.startsWith('nutrition.')
        ? nutrientName(field.slice('nutrition.'.length))
        : attributeLabel(field).toLowerCase();

/** "a, b or c". */
export const joinOr = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);

/** "Valio has no lactose or allergen info for Bulgarian yoghurt 200 g" — data a rule needs but the catalog lacks. */
export const noInfo = (fields: string[], who?: string) => `Valio has no ${joinOr(fields.map(infoLabel))} info${who ? ` for ${who}` : ' for this product'}`;

/** "a, b and c". */
export const joinAnd = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

const SHOUTING = /^[^a-z]*$/;

/**
 * A product as people read it in check and audit messages: its name without
 * the ® / ™ marks, the "Valio" prefix or "UHT" (ALL-CAPS names toned down),
 * else its code. "Valio Eila® 3 % milk drink 1 l lactose free" → "Eila 3 % milk drink 1 l lactose free".
 */
export const productLabel = (p: { code: string; name?: string | null } | undefined, code = p?.code ?? '') => {
  let name = (p?.name ?? '').replace(/[®™]/g, '').replace(/\bUHT\b/g, '').replace(/\s+/g, ' ').trim();
  if (!name) return code;
  if (SHOUTING.test(name)) name = name.toLowerCase().replace(/(^|\s)([a-zäöå])/g, (_, s: string, c: string) => s + c.toUpperCase());
  return name.replace(/^valio\s+/i, '') || name;
};

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const STRING_ATTRIBUTES = ['origin', 'vendor', 'temperatureClass', 'categoryCode', 'group'] as const;
export const NUMBER_ATTRIBUTES = ['deliveryReliability', 'co2eKgPerKg', 'pricePerBase'] as const;
export const ATTRIBUTES = [...STRING_ATTRIBUTES, ...NUMBER_ATTRIBUTES];
export const OPERATORS = ['=', '!=', '<', '<=', '>', '>=', 'in', 'not_in'] as const;

export const isNumericAttribute = (attribute: string) => (NUMBER_ATTRIBUTES as readonly string[]).includes(attribute) || attribute.startsWith('nutrition.');

const COUNTRIES: Record<string, string> = {
  FI: 'Finland',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  EE: 'Estonia',
  DE: 'Germany',
  NL: 'the Netherlands',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  PL: 'Poland',
  LT: 'Lithuania',
  LV: 'Latvia',
};

export const attributeLabel = (attribute: string) =>
  attribute.startsWith('nutrition.')
    ? `${capitalise(nutrientName(attribute.slice('nutrition.'.length)))} per 100 g`
    : ({
        origin: 'Origin',
        vendor: 'Vendor',
        temperatureClass: 'Temperature class',
        categoryCode: 'Category',
        group: 'Product group',
        deliveryReliability: 'Delivery reliability',
        co2eKgPerKg: 'CO₂e',
        pricePerBase: 'Price',
      }[attribute] ?? attribute);

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

/** A value of `attribute` with its unit, e.g. "€4.00 per l/kg", "3 kg CO₂e/kg", "FI". */
export const fmtAttributeValue = (attribute: string, v: unknown): string => {
  if (Array.isArray(v)) return v.map((x) => fmtAttributeValue(attribute, x)).join(', ');
  if (typeof v === 'number') {
    if (attribute === 'pricePerBase') return `€${v.toFixed(2)} per l/kg`;
    if (attribute === 'co2eKgPerKg') return `${fmtNum(v)} kg per kg`;
    if (attribute.startsWith('nutrition.')) return `${fmtNum(v)}`;
    return fmtNum(v);
  }
  return String(v);
};

const OP_WORDS: Record<string, string> = {
  '=': 'must be',
  '==': 'must be',
  '!=': 'must not be',
  '<': 'must be below',
  '<=': 'must be at most',
  '>': 'must be above',
  '>=': 'must be at least',
  in: 'must be one of',
  not_in: 'must not be',
};

const categoryLabel = (code: string) => {
  const last = code.split('.').pop() ?? code;
  return last.replace(/-/g, ' ');
};

export const scopeText = (scope: unknown) => {
  const s = (scope ?? {}) as { categories?: string[]; codes?: string[] };
  const parts = [...(s.categories ?? []).map(categoryLabel), ...(s.codes ?? []).map((c) => `product ${c}`)];
  return parts.length ? parts.join(' or ') : '';
};

/** "Origin must be FI" — the condition a product.attribute rule asks for (no outcome). */
export const attributeCondition = (r: PolicyRule) => {
  const attribute = String(r.attribute);
  const op = String(r.operator ?? '=');
  const scope = scopeText(r.scope);
  return `${scope ? `${capitalise(scope)}: ` : ''}${scope ? attributeLabel(attribute).toLowerCase() : attributeLabel(attribute)} ${OP_WORDS[op] ?? op} ${fmtAttributeValue(attribute, r.value)}`;
};

/** "Mon–Fri", "Mon, Thu", "Sat–Sun". */
export const fmtDays = (days: number[]) => {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (sorted.length === 0) return 'no day';
  if (sorted.length === 7) return 'any day';
  const runs: number[][] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && d === last[last.length - 1] + 1) last.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length >= 3 ? `${WEEKDAYS[r[0] - 1]}–${WEEKDAYS[r[r.length - 1] - 1]}` : r.map((d) => WEEKDAYS[d - 1]).join(', '))).join(', ');
};

export const weekdayName = (isoDay: number) => WEEKDAY_NAMES[isoDay - 1] ?? String(isoDay);

const eur0 = (n: number) => `€${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const outcome = (block: boolean) => (block ? 'otherwise blocked' : 'otherwise a person approves');

export const lineLimitText = (r: PolicyRule) => {
  const max = Number(r.max);
  const amount = r.unit === 'EUR' ? eur0(max) : `${fmtNum(max)} ${r.unit === 'pcs' ? 'sales units' : r.unit}`;
  const scope = scopeText(r.scope);
  return `Any single line${scope ? ` of ${scope}` : ''} over ${amount}`;
};

/** Plain-English one-liner for any rule. */
export const describeRule = (r: PolicyRule): string => {
  switch (r.type) {
    case 'limit.perOrder':
      return `Orders over ${eur0(Number(r.max))} ${r.over === 'block' || r.hard ? 'are blocked' : 'need approval'}`;
    case 'limit.perWeek':
      return r.max === undefined ? 'Weekly spend limit (no amount set — a person decides)' : `Spending over ${eur0(Number(r.max))} a week ${r.over === 'block' || r.hard ? 'is blocked' : 'needs approval'}`;
    case 'limit.perLine':
      return `${lineLimitText(r)} ${r.over === 'block' ? 'is blocked' : 'needs approval'}`;
    case 'category.allow': {
      const allow = (r.allow as string[]) ?? [];
      return `Only ${allow.map(categoryLabel).join(', ') || 'no categories'} — anything else ${r.over === 'needs_approval' ? 'needs approval' : 'is blocked'}`;
    }
    case 'nutrition': {
      const n = String(r.nutrient);
      const v = Number(r.value);
      const op = String(r.operator ?? '=');
      const how = r.hard === false ? 'otherwise a person approves' : 'otherwise blocked';
      // A scoped rule says what it covers: "Dairy: lactose-free only …".
      const scope = scopeText(r.scope);
      const lead = (text: string) => (scope ? `${capitalise(scope)}: ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text);
      if (n.toUpperCase() === 'LACS' && v === 0 && (op === '=' || op === '==')) return lead(`Lactose-free only (LACS = 0 g/100 g) — ${how}`);
      if (n.toUpperCase() === 'ALCOHOL' && v === 0 && (op === '=' || op === '==')) return lead(`Never alcohol — ${how}`);
      return `${scope ? `${capitalise(scope)}: ` : ''}${n} ${OP_WORDS[op] ?? op} ${fmtNum(v)}${r.unit ? ` ${r.unit}` : ''} — ${how}`;
    }
    case 'allergen.exclude': {
      const codes = ((r.allergens as string[]) ?? []).map((c) => c.toUpperCase());
      return `Never products containing ${codes.map((c) => (GS1_ALLERGENS[c] ? `${GS1_ALLERGENS[c].replace(/ \(.*\)$/, '')} (${c})` : c)).join(', ')} — ${outcome(r.hard !== false)}`;
    }
    case 'data.missing': {
      const fields = ((r.fields as string[]) ?? []).map((f) => (f.startsWith('nutrition.') ? `${f.slice(10)} data` : `${f} data`));
      return `If ${fields.join(' or ') || 'data a rule needs'} is missing, ${r.onMissing === 'block' ? 'the product is blocked' : 'a person decides'}`;
    }
    case 'substitution':
      return r.requiresApproval ? 'Substitutes need approval' : 'Substitutes may be ordered automatically';
    case 'substitution.rank': {
      const words: Record<string, string> = {
        valio_substitute: "Valio's own substitutes",
        delivery_reliability: 'delivery reliability',
        reliability: 'delivery reliability',
        unit_price: 'unit price',
        price: 'unit price',
      };
      return `Pick substitutes by ${((r.order as string[]) ?? []).map((k) => words[k] ?? k).join(', then ')}${r.mustMeetDeliveryDate ? ' — only ones that arrive in time' : ''}`;
    }
    case 'approval': {
      const a = (r.approver ?? {}) as { name?: string; role?: string };
      const who = a.name && a.role && a.name !== a.role ? `${a.name} (${a.role})` : (a.name ?? a.role ?? 'the approver');
      return `Exceptions go to ${who}${r.windowMinutes ? `, who has ${r.windowMinutes} min to decide` : ''}${r.fallback ? `; then ${r.fallback}` : ''}`;
    }
    case 'schedule.frequency':
      return `At most ${r.maxOrders} order${Number(r.maxOrders) === 1 ? '' : 's'} a week`;
    case 'product.attribute':
      return `${attributeCondition(r)} — ${outcome(r.hard === true)}${r.onMissing === 'block' ? '; blocked if unknown' : r.onMissing === 'ignore' ? '; ignored if unknown' : ''}`;
    case 'delivery.days': {
      const days = ((r.days as number[]) ?? []).map(Number);
      return `Deliveries only on ${fmtDays(days)} — ${outcome(r.over === 'block')}`;
    }
    default:
      return `Rule ${r.key} (${r.type}) — can't be checked automatically, a person decides`;
  }
};

export const countryName = (code: string) => COUNTRIES[code.toUpperCase()] ?? code;
export const COUNTRY_CODES = COUNTRIES;
