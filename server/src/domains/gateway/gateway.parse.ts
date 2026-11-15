import { type ConstraintHit, type RequestRule, extractConstraints, meetsRules, rulesFromHits } from './gateway.constraints.ts';
import { geminiJson } from './gateway.gemini.ts';
import type { Product } from './gateway.products.ts';
import { allProducts, searchIndex } from './gateway.products.ts';
import { buildSearchIndex, type SearchIndex } from './gateway.search.ts';
import { addDays, fmtDay, isDay, localDay, weekday } from './gateway.time.ts';
import type { PolicyRule } from './policy.engine.ts';
import { catalogFacts, draftRuleFromText } from './policy.rules.ts';

// Plain language → order lines ("1,000 l lactose-free milk for Monday") and the rules the
// words state ("local only" → origin FI). Product matching prefers products that meet those rules.
// The rule-based parser below is pure and always available; with GEMINI_API_KEY set, Gemini
// extracts phrases + quantities + date + rule clauses, each rule clause is drafted into a rule by
// the LLM (as "Add a rule" does), and the products are still resolved against OUR catalog by `matchProduct` —
// model-invented codes are never trusted. Parsing never places an order.

export type ParseUnit = 'l' | 'kg' | 'pcs';

export type ParsedLine = {
  code: string;
  name: string;
  quantity: number;
  unit: ParseUnit;
  salesUnit: string;
  salesUnits: number;
  matched: string;
  confidence: number;
  alternatives: { code: string; name: string }[];
};

export type ParseResult = {
  text: string;
  lines: ParsedLine[];
  requestedDate: string | null;
  dateText: string | null;
  unmatched: string[];
  parser: 'gemini' | 'rules';
  notes: string[];
  /** The rules the words state ("local only", "lactose-free", "under €300"), each with the words it came from. Never product words. */
  rules: RequestRule[];
};

// --- Dates ----------------------------------------------------------------------------

const WEEKDAYS: Record<string, number> = {
  monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6, sunday: 7, sun: 7,
};
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const WD = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
const MO = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const pad = (n: number) => String(n).padStart(2, '0');

/** Next date with this weekday that is on or after tomorrow. */
const nextWeekday = (today: string, wd: number) => {
  const tomorrow = addDays(today, 1);
  return addDays(tomorrow, (wd - weekday(tomorrow) + 7) % 7);
};

/** A day/month without a year: this year, or next year once it has passed. */
const dayMonth = (today: string, day: number, month: number, year?: number) => {
  if (year !== undefined) {
    const y = year < 100 ? 2000 + year : year;
    const d = `${y}-${pad(month)}-${pad(day)}`;
    return isDay(d) ? d : null;
  }
  const thisYear = `${today.slice(0, 4)}-${pad(month)}-${pad(day)}`;
  if (!isDay(thisYear)) return null;
  return thisYear >= addDays(today, 1) ? thisYear : `${Number(today.slice(0, 4)) + 1}-${pad(month)}-${pad(day)}`;
};

type DateHit = { date: string; text: string; index: number; notes: string[] };

const DATE_PATTERNS: { re: RegExp; resolve: (m: RegExpExecArray, today: string) => { date: string | null; notes?: string[] } }[] = [
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/i, resolve: (m) => ({ date: isDay(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null }) },
  // Fri 20 Nov · 20 November 2026 · Friday 20th Nov
  {
    re: new RegExp(`\\b(?:(${WD})\\.?,?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(${MO})\\.?(?:\\s+(\\d{4}))?\\b`, 'i'),
    resolve: (m, today) => withWeekdayCheck(dayMonth(today, Number(m[2]), MONTHS[m[3].toLowerCase()], m[4] ? Number(m[4]) : undefined), m[1]),
  },
  // Nov 20 · Fri Nov 20
  {
    re: new RegExp(`\\b(?:(${WD})\\.?,?\\s+)?(${MO})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:l|kg|pcs|%))`, 'i'),
    resolve: (m, today) => withWeekdayCheck(dayMonth(today, Number(m[3]), MONTHS[m[2].toLowerCase()]), m[1]),
  },
  // 20.11. · 20.11.2026 · (Fri) 20.11.
  {
    re: new RegExp(`(?:\\b(${WD})\\.?\\s+)?\\b(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2})?(?![\\d%])`, 'i'),
    resolve: (m, today) => withWeekdayCheck(dayMonth(today, Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : undefined), m[1]),
  },
  { re: /\bday after tomorrow\b/i, resolve: (_m, today) => ({ date: addDays(today, 2) }) },
  { re: /\btomorrow\b/i, resolve: (_m, today) => ({ date: addDays(today, 1) }) },
  { re: /\btoday\b/i, resolve: (_m, today) => ({ date: today, notes: ['Same-day delivery is rarely possible — check the quote'] }) },
  { re: new RegExp(`\\b(?:(next|this|coming)\\s+)?(${WD})\\b\\.?`, 'i'), resolve: (m, today) => ({ date: nextWeekday(today, WEEKDAYS[m[2].toLowerCase()]) }) },
];

function withWeekdayCheck(date: string | null, wd?: string) {
  if (!date || !wd) return { date };
  const expected = WEEKDAYS[wd.toLowerCase()];
  return weekday(date) === expected ? { date } : { date, notes: [`${wd} doesn’t match ${fmtDay(date)} — used the date`] };
}

/** The first date expression in `text`, resolved in Europe/Helsinki. */
export const findDate = (text: string, today: string): DateHit | null => {
  // Patterns run most specific first; the first one that resolves wins.
  for (const { re, resolve } of DATE_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const { date, notes = [] } = resolve(m, today);
    if (date) return { date, text: m[0].trim(), index: m.index + (m[0].length - m[0].trimStart().length), notes };
  }
  return null;
};

// --- Quantities -----------------------------------------------------------------------

const UNIT_WORDS: [RegExp, ParseUnit | 'case'][] = [
  [/^(l|lt|ltr|ltrs|litres?|liters?)$/, 'l'],
  [/^(kg|kgs|kilos?|kilograms?)$/, 'kg'],
  [/^(cases?|crates?|trays?)$/, 'case'],
  [/^(pcs|pc|pieces?|units?|cartons?|packs?|packets?|tubs?|boxe?s?|blocks?|bottles?|x)$/, 'pcs'],
];
const UNIT_RE = /(\d+(?:\.\d+)?)\s*(l|lt|ltrs?|litres?|liters?|kgs?|kilos?|kilograms?|cases?|crates?|trays?|pcs|pc|pieces?|units?|cartons?|packs?|packets?|tubs?|boxe?s?|blocks?|bottles?|x)?(?![a-z%\d.])/i;

const unitOf = (word: string | undefined): ParseUnit | 'case' | null => {
  if (!word) return null;
  const w = word.toLowerCase();
  return UNIT_WORDS.find(([re]) => re.test(w))?.[1] ?? null;
};

/** Quantity + unit in an item, skipping percentages ("3 %") and sizes inside names ("500 g"). */
const findQuantity = (item: string) => {
  const re = new RegExp(UNIT_RE.source, 'gi');
  for (let m = re.exec(item); m; m = re.exec(item)) {
    const after = item.slice(m.index + m[0].length);
    if (/^\s*(%|g\b|ml\b|cl\b|dl\b)/i.test(after)) continue;
    return { quantity: Number(m[1]), unit: unitOf(m[2]), text: m[0] };
  }
  return null;
};

// --- Product matching -------------------------------------------------------------------

const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'on', 'by', 'to', 'some', 'please', 'order', 'need', 'we', 'i', 'get', 'want', 'with', 'deliver', 'delivered', 'delivery', 'valio', 'x', 'more', 'also', 'us', 'me', 'next', 'this', 'add', 'buy']);

const names = (p: Product) => `${p.name} | ${p.nameFi ?? ''}`;
const fatOf = (p: Product) => p.nutrition?.FAT ?? p.nutrition?.fat ?? null;

/** Words that name a kind of product (English + Finnish); a phrase that names one must match it. */
const KINDS: { kind: string; re: RegExp; test: (p: Product) => boolean }[] = [
  { kind: 'ice cream', re: /\bice[- ]?cream\b|\bjäätelö/, test: (p) => /ice cream|jäätelö/i.test(names(p)) },
  { kind: 'sour cream', re: /\bsour[- ]?cream\b|\bsmetana\b|\bkermaviili/, test: (p) => /sour cream|smetana|kermaviili/i.test(names(p)) },
  { kind: 'buttermilk', re: /\bbuttermilk\b|\bpiimä/, test: (p) => /buttermilk|piimä/i.test(names(p)) },
  { kind: 'oat', re: /\boat\b|\bplant[- ]based\b|\bkaura/, test: (p) => p.categoryCode.startsWith('plant.') || /\boat\b/i.test(p.name) },
  { kind: 'cream', re: /\bcream\b|\bkerma\b/, test: (p) => p.categoryCode === 'dairy.cream' && !/sour cream|cr[eè]me fra[iî]che|smetana|kermaviili/i.test(names(p)) },
  { kind: 'milk', re: /\bmilk\b|\bmaito\b/, test: (p) => p.categoryCode === 'dairy.milk' && !/buttermilk|sour milk|piimä/i.test(names(p)) },
  { kind: 'yoghurt', re: /\byogh?urts?\b|\byogurts?\b|\bjogurtti/, test: (p) => /yogh?urt|jogurtti/i.test(names(p)) },
  { kind: 'quark', re: /\bquark\b|\brahka\b/, test: (p) => /quark|rahka/i.test(names(p)) },
  { kind: 'cheese', re: /\bcheeses?\b|\bjuusto\b/, test: (p) => p.categoryCode === 'dairy.cheese' },
  { kind: 'butter', re: /\bbutter\b|\bvoi(ta)?\b/, test: (p) => p.categoryCode === 'dairy.butter' && /\bbutter\b|\bvoi\b/i.test(names(p)) },
  { kind: 'spread', re: /\bspreads?\b|\blevite/, test: (p) => /spread|levite/i.test(names(p)) },
  { kind: 'sauce', re: /\bsauce\b|\bkastike/, test: (p) => /sauce|kastike/i.test(names(p)) },
  // Plain "pasta" is dry pasta, not a salmon-pasta ready meal; a dish named with it is left to the words.
  {
    kind: 'pasta',
    re: /^(?!.*\b(salad|casserole|bolognese|carbonara|lasagna|ready|meal|sauce|salmon|chicken|minced|soup|baby)\b).*\b(pasta|macaroni|makaroni|spaghetti|penne|fusilli|tagliatelle)\b/,
    test: (p) => p.categoryCode === 'dry.pasta',
  },
];

/** `required`: a product without the attribute is never offered (asking for lactose-free means lactose-free). */
const ATTRIBUTES: { re: RegExp; test: (p: Product) => boolean; weight: number; required?: boolean; fat?: boolean }[] = [
  { re: /\blactose[- ]?free\b|\blf\b|\blaktoositon\b/, test: (p) => p.lacs === 0, weight: 4, required: true },
  { re: /\bsemi[- ]?skimmed\b|\bsemi\b|\b1[.,]5\s*%|\bkevyt/, test: (p) => /semi skimmed|kevyt/i.test(names(p)), weight: 3, fat: true },
  { re: /(?<!semi[- ]?)\bskimmed\b|\bskim\b|\bfat[- ]?free\b|\brasvaton/, test: (p) => /skimmed|rasvaton/i.test(names(p)) && !/semi|kevyt/i.test(names(p)), weight: 3, fat: true },
  { re: /\bwhole\b|\bfull[- ]?fat\b|\btäys/, test: (p) => (fatOf(p) ?? 0) >= 3, weight: 2, fat: true },
  { re: /\bcooking\b|\bruoka/, test: (p) => /cooking|ruoka/i.test(names(p)), weight: 3 },
  { re: /\bwhipping\b|\bwhipped\b|\bdouble\b|\bkuohu|\bvispi/, test: (p) => /whipping|kuohu|vispi/i.test(names(p)), weight: 3 },
  { re: /\bslices?\b|\bsliced\b|\bviipal/, test: (p) => /slices|viipal/i.test(names(p)), weight: 2 },
  { re: /\bbox\b|\bnovobox\b|\bbag[- ]in[- ]box\b|\b10\s*l\b/, test: (p) => /\bbox\b|novobox/i.test(p.name), weight: 2 },
  { re: /\bnatural\b|\bplain\b|\bmaustamaton/, test: (p) => /natural|plain|maustamaton/i.test(names(p)), weight: 1 },
  { re: /\bsalted\b/, test: (p) => /(?<!un)salted/i.test(p.name), weight: 2 },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‐-―]/g, '-')
    .replace(/(\d),(\d)/g, '$1.$2');

const tokens = (s: string) =>
  norm(s)
    .replace(/(\d)\s*%/g, '$1%')
    .split(/[^a-z0-9%.]+/)
    .map((t) => t.replace(/\.$/, ''))
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));

const percentOf = (s: string) => {
  const m = norm(s).match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
};

const productTokens = new WeakMap<Product, Set<string>>();
const tokensOf = (p: Product) => {
  let t = productTokens.get(p);
  if (!t) productTokens.set(p, (t = new Set([...tokens(p.name), ...tokens(p.nameFi ?? ''), ...tokens(p.category), ...tokens(p.group.replace(/\./g, ' '))])));
  return t;
};

const catalogOrder = new WeakMap<Product[], Map<string, number>>();
const orderOf = (products: Product[]) => {
  let m = catalogOrder.get(products);
  if (!m) catalogOrder.set(products, (m = new Map(products.map((p, i) => [p.code, i]))));
  return m;
};

const indexes = new WeakMap<Product[], SearchIndex>();
const indexFor = (products: Product[]) => {
  if (products === allProducts()) return searchIndex();
  let idx = indexes.get(products);
  if (!idx) indexes.set(products, (idx = buildSearchIndex(products)));
  return idx;
};

/** The products worth scoring: the whole (small) list, or — for the full catalog — the index hits plus the named kinds. */
const candidatesFor = (products: Product[], words: string[], kinds: typeof KINDS) => {
  if (products.length < 2000) return products;
  const order = orderOf(products);
  const hits = new Map<string, Product>();
  for (const p of indexFor(products).candidates(words)) if (order.has(p.code)) hits.set(p.code, p);
  if (kinds.length) for (const p of products) if (kinds.every((k) => k.test(p))) hits.set(p.code, p);
  return [...hits.values()].sort((a, b) => order.get(a.code)! - order.get(b.code)!);
};

/** `meetsRules`: whether the product meets the request's product rules (null = there were none). */
export type ProductMatch = { product: Product; score: number; confidence: number; matched: string[]; alternatives: Product[]; meetsRules: boolean | null };

/** Flavours / variants a plain request doesn't want unless it says so ("milk" ≠ organic coffee milk). */
const MODIFIERS = /\b(organic|luomu|flavou?red|maustettu|coffee|kahvi|chocolate|suklaa|cocoa|kaakao|protein|smoked|savu\w*|vanilla|vanilja|strawberr\w*|mansikka|raspberr\w*|vadelma|blueberr\w*|mustikka|berr(y|ies)|marja\w*|lemon|sitruuna|peach|persikka|mango|kids|lasten|turkish|greek|bulgarian|caramel|toffee|cinnamon|garlic|herbs?|chili|spreadable|processed|kippari|sweetened|gefilus|play|plus|profeel)\b/gi;

/**
 * Best catalog product for a phrase like "lactose-free milk" or "Eila 3%", or null.
 * `quantity` (in `preferUnit`) lets a request for 10 l avoid a 20 l pack. `rules` (from the
 * request: origin, lactose, allergens): among the close matches, one that meets them wins;
 * when none does, the best match stays (and the rule stops it, with its reason).
 */
export const matchProduct = (
  phrase: string,
  products: Product[] = allProducts(),
  preferUnit?: ParseUnit | null,
  quantity?: number | null,
  rules: PolicyRule[] = []
): ProductMatch | null => {
  // A product code in the phrase ("1,000 l of 463359") names the product outright.
  const byCode = (phrase.match(/\b\d{5,8}\b/g) ?? []).map((c) => products.find((p) => p.code === c)).find(Boolean);
  if (byCode) return { product: byCode, score: 100, confidence: 0.98, matched: [byCode.code], alternatives: [], meetsRules: rules.length ? meetsRules(rules, byCode) : null };
  const text = norm(phrase).replace(/-/g, ' ').replace(/\s+/g, ' ');
  const words = tokens(phrase).filter((t) => !/^\d+(\.\d+)?%?$/.test(t));
  const kinds = KINDS.filter((k) => k.re.test(text));
  // "ice cream" / "sour cream" also say "cream"; keep only the most specific kinds.
  const specific = kinds.filter((k) => !kinds.some((o) => o !== k && o.kind.endsWith(` ${k.kind}`)) && !(k.kind === 'milk' && kinds.some((o) => o.kind === 'buttermilk')));
  const attrs = ATTRIBUTES.filter((a) => a.re.test(text));
  const pct = percentOf(phrase);
  if (!words.length && pct === null) return null;

  const order = orderOf(products);
  // "milk" with no fat level: Finnish catering milk means semi-skimmed (kevytmaito).
  const plainWanted = specific.some((k) => k.kind === 'yoghurt' || k.kind === 'quark') && !MODIFIERS.test(text);
  MODIFIERS.lastIndex = 0;
  const defaultSemi = specific.some((k) => k.kind === 'milk') && !attrs.some((a) => a.fat) && pct === null;
  const scored = candidatesFor(products, words, specific).map((p) => {
    const index = order.get(p.code) ?? 0;
    const own = tokensOf(p);
    const matched = words.filter((w) => own.has(w));
    let score = matched.length;
    let ok = matched.length > 0 || specific.length > 0;
    for (const k of specific) {
      if (k.test(p)) score += 3;
      else ok = false;
    }
    for (const a of attrs) {
      const has = a.test(p);
      score += has ? a.weight : -a.weight;
      if (!has && a.required) ok = false;
    }
    if (pct !== null) {
      const own = percentOf(p.name) ?? fatOf(p);
      score += own !== null && Math.abs(own - pct) < 0.05 ? 3 : -1.5;
    }
    // Gentle tie-breaks: the unit asked for, lactose-free (every dairy policy here wants it), full data.
    if (preferUnit && preferUnit !== 'pcs') score += p.salesUnit.base === preferUnit ? 1 : -1;
    if (p.lacs === 0) score += 0.3;
    if (p.allergens !== null && p.lacs !== null) score += 0.1;
    if (defaultSemi && /semi skimmed|kevyt/i.test(names(p))) score += 0.5;
    const extras = new Set((p.name.match(MODIFIERS) ?? []).map((w) => w.toLowerCase()).filter((w) => !text.includes(w)));
    score -= 0.4 * extras.size;
    // Yoghurt / quark with no flavour named: natural.
    if (plainWanted && /natural|plain|maustamaton/i.test(names(p))) score += 0.3;
    if (quantity && preferUnit && preferUnit !== 'pcs' && p.salesUnit.base === preferUnit && p.salesUnit.size > quantity * 1.05) score -= 1;
    score -= Math.min(p.name.length, 150) / 10000; // plainer names first among equals
    if (/valio/i.test(p.vendor) || /valio/i.test(p.brand ?? '')) score += 0.2;
    if (p.reliability !== null && p.reliability >= 0.9) score += 0.1; // a reliable delivery record beats none / a poor one
    return { p, index, score, ok, matched };
  });
  const ranked = scored.filter((s) => s.ok && s.score >= 1).sort((a, b) => b.score - a.score || a.index - b.index);
  if (!ranked.length) return null;
  const top = ranked[0];
  // The request's rules pick among the close matches ("pasta, local only" → Finnish pasta).
  const productRules = rules.filter((r) => r.type === 'product.attribute' || r.type === 'nutrition' || r.type === 'allergen.exclude');
  const fits = (r: (typeof ranked)[number]) => meetsRules(productRules, r.p);
  const fit = productRules.length ? ranked.find((r) => r.score >= top.score - 3 && fits(r)) : undefined;
  const best = fit ?? top;
  const rest = ranked.filter((r) => r !== best);
  const second = rest[0];
  const coverage = words.length ? best.matched.length / words.length : 0.5;
  const margin = second ? best.score - second.score : best.score;
  const confidence = Math.round(Math.min(0.98, Math.max(0.2, 0.35 + 0.35 * coverage + 0.1 * Math.min(Math.max(margin, 0), 3))) * 100) / 100;
  // Alternatives that meet the rules first.
  const alternatives = productRules.length ? [...rest.filter(fits), ...rest.filter((r) => !fits(r))] : rest;
  return {
    product: best.p,
    score: best.score,
    confidence,
    matched: best.matched,
    alternatives: alternatives.slice(0, 3).map((r) => r.p),
    meetsRules: productRules.length ? !!fit : null,
  };
};

// --- Items ------------------------------------------------------------------------------

const salesUnitLabel = (p: Product) => (p.salesUnit.base === 'pcs' ? p.salesUnit.name : `${p.salesUnit.name} (${p.salesUnit.size} ${p.salesUnit.base})`);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Splits on "and", commas, semicolons, "+", "&", "plus" and newlines (thousands separators survive). */
export const splitItems = (text: string) =>
  text
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    .split(/\s*(?:[,;\n+&]|\band\b|\bplus\b|\balso\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

const FILLER = /^(?:please\s+)?(?:(?:can you|could you|pls)\s+)?(?:order|get|buy|send|we need|i need|need|add)?\s*/i;

const cleanPhrase = (s: string) =>
  s
    .replace(FILLER, '')
    .replace(/\b(?:of|for|on|by|delivered|delivery|please|by|asap)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export type ExtractedItem = { phrase: string; quantity: number | null; unit: ParseUnit | 'case' | null; raw: string };

/** Turns one extracted item into an order line against the catalog; `rules` (the request's) steer the match. */
export const resolveItem = (item: ExtractedItem, notes: string[], products: Product[] = allProducts(), rules: PolicyRule[] = []): ParsedLine | null => {
  const hint = item.unit === 'case' ? null : item.unit;
  const m = matchProduct(item.phrase, products, hint, item.quantity, rules);
  if (!m) return null;
  const p = m.product;
  if (m.meetsRules === false) notes.push(`No “${item.phrase}” in the catalog meets the rules from your request — ${p.name} doesn’t, so the rules will stop it`);
  const base = p.salesUnit.base;
  let quantity: number;
  let unit: ParseUnit;
  let confidence = m.confidence;
  if (item.quantity === null) {
    quantity = round3(p.perCase * p.salesUnit.size);
    unit = base;
    confidence = Math.min(confidence, 0.5);
    notes.push(`No quantity for “${item.phrase}” — assumed one case (${p.perCase} × ${p.salesUnit.name} = ${quantity} ${base})`);
  } else if (item.unit === 'case') {
    quantity = round3(item.quantity * p.perCase * p.salesUnit.size);
    unit = base;
    notes.push(`${item.quantity} case${item.quantity === 1 ? '' : 's'} of ${p.name} = ${item.quantity * p.perCase} × ${p.salesUnit.name} = ${quantity} ${base}`);
  } else if (item.unit === null || item.unit === 'pcs') {
    quantity = item.quantity;
    unit = 'pcs';
    if (item.unit === null) notes.push(`No unit for “${item.raw}” — read as ${item.quantity} × ${p.salesUnit.name}`);
  } else if (item.unit !== base) {
    quantity = item.quantity;
    unit = base;
    confidence = Math.min(confidence, base === 'pcs' ? 0.4 : 0.6);
    notes.push(
      base === 'pcs'
        ? `${p.name} has no litre / kg content in the catalog; read ${item.quantity} ${item.unit} as ${item.quantity} × ${p.salesUnit.name} — check the quantity`
        : `${p.name} is sold by ${base}; read ${item.quantity} ${item.unit} as ${item.quantity} ${base}`
    );
  } else {
    quantity = item.quantity;
    unit = item.unit;
  }
  const salesUnits = unit === 'pcs' ? Math.ceil(quantity - 1e-9) : Math.ceil(quantity / p.salesUnit.size - 1e-9);
  return {
    code: p.code,
    name: p.name,
    quantity,
    unit,
    salesUnit: salesUnitLabel(p),
    salesUnits,
    matched: item.phrase,
    confidence,
    alternatives: m.alternatives.map((a) => ({ code: a.code, name: a.name })),
  };
};

/** Rule-based extraction: date, then the constraint words (→ rules), then items with quantity + unit + product phrase. */
export const extractItems = (text: string, today: string) => {
  const notes: string[] = [];
  const hit = findDate(text, today);
  let rest = text;
  if (hit) {
    notes.push(...hit.notes);
    rest = text.slice(0, hit.index) + ' ' + text.slice(hit.index + hit.text.length);
    // Drop the connective that introduced the date ("for Monday", "delivered on Fri 20 Nov").
    rest = rest.replace(/\b(?:for|on|by|delivered|delivery|deliver|arriving|due)(?:\s+(?:on|by|for))?\s*$/i, '').replace(/\b(?:for|on|by|delivered|delivery|deliver|arriving|due)(?:\s+(?:on|by|for))?\s+(?=[,;.\n]|$)/gi, ' ');
  }
  const constraints = extractConstraints(rest.replace(/\.\s*$/, ''));
  const items: ExtractedItem[] = [];
  const unmatched: string[] = [];
  for (const raw of splitItems(constraints.rest)) {
    const q = findQuantity(raw);
    const phrase = cleanPhrase(q ? raw.replace(q.text, ' ') : raw).replace(/^[\s.:-]+|[\s.:-]+$/g, '');
    if (!phrase) {
      if (q) unmatched.push(raw);
      continue;
    }
    items.push({ phrase, quantity: q?.quantity ?? null, unit: q ? (q.unit ?? null) : null, raw });
  }
  return { items, unmatched, notes, date: hit ? { date: hit.date, text: hit.text } : null, hits: constraints.hits };
};

/** Full rule-based parse. `today` is the Helsinki calendar day. */
export const parseRules = (text: string, today = localDay(), products: Product[] = allProducts()): ParseResult => {
  const { items, unmatched, notes, date, hits } = extractItems(text, today);
  const facts = catalogFacts(products);
  const steer = rulesFromHits(hits, facts).map((r) => r.rule);
  const lines: ParsedLine[] = [];
  const resolved: { raw: string; line: ParsedLine }[] = [];
  for (const item of items) {
    const line = resolveItem(item, notes, products, steer);
    if (line) {
      lines.push(line);
      resolved.push({ raw: item.raw, line });
    } else if (tokens(item.phrase).length) unmatched.push(item.raw.trim());
  }
  const rules = rulesFromHits(scopeHits(hits, resolved, products), facts);
  if (!lines.length && !unmatched.length) notes.push('No products found — try e.g. “400 l lactose-free milk for Monday”');
  if (date && date.date < addDays(today, 1) && date.date !== today) notes.push(`${fmtDay(date.date)} is in the past`);
  if (!date) notes.push('No delivery date found — pick one before ordering');
  return { text, lines, requestedDate: date?.date ?? null, dateText: date?.text ?? null, unmatched, parser: 'rules', notes, rules };
};

/**
 * "lactose-free milk": the lactose rule said inside a product phrase covers that kind of
 * product (milk), so it doesn't ask lactose data of the pasta in the same order.
 */
const scopeHits = (hits: ConstraintHit[], resolved: { raw: string; line: ParsedLine }[], products: Product[]) =>
  hits.map((h) => {
    if (!h.item || h.raw.type !== 'nutrition') return h;
    const item = h.item.toLowerCase().trim();
    const own = resolved.filter((r) => {
      const raw = r.raw.toLowerCase().trim();
      return !!raw && (raw === item || item.includes(raw) || raw.includes(item));
    });
    const cats = [...new Set(own.map((r) => products.find((p) => p.code === r.line.code)?.categoryCode).filter((c): c is string => !!c))];
    return cats.length ? { ...h, scope: cats } : h;
  });

// --- Gemini (optional) ---------------------------------------------------------------------

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          productPhrase: { type: 'STRING', description: 'The product words only, e.g. "lactose-free milk", "Eila 3%" — no origin words, spend limits or dates' },
          quantity: { type: 'NUMBER', nullable: true },
          unit: { type: 'STRING', enum: ['l', 'kg', 'pcs', 'case'], nullable: true },
        },
        required: ['productPhrase'],
      },
    },
    constraints: {
      type: 'ARRAY',
      description:
        'Each requirement the buyer states about WHICH products may be bought or how the order is handled, as its own short clause, copied verbatim: origin ("local only", "nothing from Germany"), lactose / allergens ("gluten-free", "no nuts"), spend ("under €300", "ask me if over €200"), carbon footprint, price per litre or kg, size of a line, vendor, chilled / frozen, delivery reliability, which weekdays deliveries may come. Not product names, quantities or the delivery date of this order.',
      items: { type: 'STRING' },
    },
    date: { type: 'STRING', nullable: true, description: 'Delivery date YYYY-MM-DD, or null' },
    dateText: { type: 'STRING', nullable: true, description: 'The words that gave the date' },
  },
  required: ['items'],
};

const geminiExtract = async (text: string, today: string) => {
  const parsed = await geminiJson<{ items?: unknown }>(
    `Today is ${today} (${fmtDay(today)}, Europe/Helsinki). Extract the food-service order below: one item per product with the product words, the quantity and the unit ` +
      '(l, kg, pcs, or case for cases). List separately, verbatim, each requirement the buyer states (origin, lactose, allergens, spend limits, carbon, price, vendor, delivery days…). ' +
      'Resolve a weekday to the next such day on or after tomorrow. Do not invent product codes.\n\nOrder:\n' +
      text,
    GEMINI_SCHEMA,
    15_000
  );
  if (!Array.isArray(parsed.items)) throw new Error('Gemini returned no items');
  return parsed as { items: { productPhrase: string; quantity?: number | null; unit?: string | null }[]; constraints?: unknown; date?: string | null; dateText?: string | null };
};

/** Gemini when GEMINI_API_KEY is set (products still resolved against our catalog), otherwise — or on any error — the rules. */
export const parseRequest = async (text: string, today = localDay()): Promise<ParseResult> => {
  const rules = parseRules(text, today);
  if (!process.env.GEMINI_API_KEY) return rules;
  try {
    const g = await geminiExtract(text, today);
    const notes: string[] = [];
    const lines: ParsedLine[] = [];
    const unmatched: string[] = [];
    // Each rule Gemini found in the words becomes a rule through the LLM rule drafter (the same one
    // as "Add a rule"), all at once; a clause it can't turn into a rule falls back to our phrase
    // parser. Rule words our own splitter caught that Gemini left out are added too.
    const said = Array.isArray(g.constraints) ? g.constraints.filter((c): c is string => typeof c === 'string' && !!c.trim()) : [];
    const drafted = await Promise.all(said.map((c) => draftRuleFromText(c, [], { useGemini: true }).catch(() => null)));
    const fromLlm: ConstraintHit[] = [];
    said.forEach((c, i) => {
      const rule = drafted[i]?.rule;
      if (rule) {
        const { key: _key, label: _label, ...raw } = rule as PolicyRule & { label?: string };
        fromLlm.push({ raw, words: c });
      } else fromLlm.push(...extractConstraints(c).hits.map((h) => ({ ...h, item: undefined })));
    });
    const covered = said.map((c) => c.toLowerCase());
    const missed = extractItems(text, today).hits.filter((h) => !covered.some((c) => c.includes(h.words.toLowerCase()) || h.words.toLowerCase().includes(c)));
    const hits: ConstraintHit[] = [...fromLlm, ...missed];
    const facts = catalogFacts();
    const steer = rulesFromHits(hits, facts).map((r) => r.rule);
    const resolved: { raw: string; line: ParsedLine }[] = [];
    for (const it of g.items) {
      const unit = it.unit === 'l' || it.unit === 'kg' || it.unit === 'pcs' || it.unit === 'case' ? it.unit : null;
      const quantity = typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : null;
      // A product phrase with rule words in it ("local pasta"): the words become rules, the rest is the product.
      const own = extractConstraints(String(it.productPhrase ?? ''));
      hits.push(...own.hits);
      const phrase = own.rest || String(it.productPhrase ?? '');
      const raw = [quantity, unit, phrase].filter(Boolean).join(' ');
      const line = resolveItem({ phrase, quantity, unit, raw }, notes, allProducts(), steer);
      if (line) {
        lines.push(line);
        resolved.push({ raw: phrase, line });
      } else if (it.productPhrase) unmatched.push(String(it.productPhrase));
    }
    const ruleList = rulesFromHits(scopeHits(hits, resolved, allProducts()), facts);
    // The deterministic date parser wins when it found one; Gemini fills in otherwise.
    const geminiDate = g.date && isDay(g.date) && g.date >= today ? g.date : null;
    const requestedDate = rules.requestedDate ?? geminiDate;
    if (!requestedDate) notes.push('No delivery date found — pick one before ordering');
    return { text, lines, requestedDate, dateText: rules.requestedDate ? rules.dateText : geminiDate ? (g.dateText ?? null) : null, unmatched, parser: 'gemini', notes, rules: ruleList };
  } catch (err) {
    return { ...rules, notes: [...rules.notes, `Gemini unavailable (${(err as Error).message}) — parsed with the rules`] };
  }
};
