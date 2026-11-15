// The rules a request states, next to its products: "20 kg pasta, local only" asks for
// pasta AND says where it must come from. Pure and deterministic (no I/O):
//
//   extractConstraints(text) → the text with the constraint words taken out (what's left is
//   products, quantities and the date) + one hit per constraint, with the words it came from.
//
// What counts as a rule: where products come from ("local only", "Finnish", "nothing from
// Germany"), lactose ("lactose-free"), allergens ("gluten-free", "no soy or nuts"), spend
// ("under €300", "max 300 €" → per-order limit that blocks; "ask me if over €200" → a person
// decides; "… per week"), and whatever else the single-rule parser understands in a clause
// that has no product in it ("price under €3 per kg", "substitutes need my OK"). Plain
// product words ("pasta", "20 kg") are never rules, and a date ("deliver Friday") is a date.

import type { Product } from './gateway.products.ts';
import { countryName, describeRule } from './policy.describe.ts';
import type { PolicyDocument, PolicyRule, RuleProduct } from './policy.engine.ts';
import { checkProduct } from './policy.engine.ts';
import { ALLERGEN_WORDS, ASK_BEFORE, COUNTRY_WORDS, MONEY_LIMIT, countryIn, isSoft } from './policy.phrases.ts';
import { type CatalogFacts, baseKey, parseRuleText, uniqueKey, validateRule } from './policy.rules.ts';

/** One rule the words state. `inItem`: the words sit inside a product phrase ("lactose-free milk"). */
export type ConstraintHit = { raw: Record<string, unknown>; words: string; keepInPhrase?: boolean; /** The product phrase the words sit in ("lactose-free milk"). */ item?: string };

/** A rule as the parser returns it: the rule, its plain sentence and the words it came from. */
export type RequestRule = { rule: PolicyRule; sentence: string; words: string };


const FI_WORDS = String.raw`local(?:ly)?(?:[- ](?:sourced|produced|grown|made))?|domestic(?:ally)?(?:[- ]produced)?|finnish|finland|home[- ]?grown|kotimai\w*`;
const ORIGIN_FI = new RegExp(
  String.raw`\b(?:(?:only|just|exclusively|all|must be|nothing\s+(?:from\s+)?outside(?:\s+of)?)\s+)?(?:(?:from|made in|produced in|grown in|sourced (?:in|from))\s+)?(?:${FI_WORDS})(?:\s+(?:products?|produce|food|ingredients?|goods|origin|stuff))?(?:\s+only)?\b`,
  'i'
);
// Other countries need an explicit restriction ("only Swedish", "nothing from Germany"): "Italian salad" is a product.
const OTHER = COUNTRY_WORDS.filter(([, c]) => c !== 'FI')
  .map(([re]) => re.source.replace(/^\\b/, '').replace(/\\b$/, ''))
  .join('|');
const ORIGIN_ONLY = new RegExp(String.raw`\b(?:only|just|exclusively)\s+(?:from\s+)?(?:${OTHER})\b(?:\s+products?)?(?:\s+only)?|\b(?:from\s+)?(?:${OTHER})\s+(?:products?\s+)?only\b`, 'i');
const ORIGIN_NOT = new RegExp(String.raw`\b(?:no|nothing|not|avoid|never)\s+(?:\w+\s+)?(?:from\s+)?(?:${OTHER})\b(?:\s+products?)?`, 'i');

const LACTOSE = /\b(?:lactose[- ]?free|no lactose|without lactose|laktoositon\w*)\b/i;

const ALLERGEN = String.raw`gluten|soy(?:a|beans?)?|milk protein|eggs?|fish|peanuts?|(?:tree )?nuts|sesame|celery|mustard|lupine?|sul(?:ph|f)ites?|crustaceans?|shellfish|mollus(?:c|k)s?`;
const ALLERGEN_LIST = new RegExp(String.raw`\b(?:no|without|free (?:of|from)|avoid(?:ing)?|exclude|excluding|nothing (?:with|containing))\s+(?:${ALLERGEN})(?:\s*(?:,|and|or|&|\/|nor)\s*(?:no\s+)?(?:${ALLERGEN}))*\b`, 'i');
const ALLERGEN_FREE = /\b(gluten|soy|soya|nut|nuts|peanut|egg|fish|sesame|celery|mustard|lupin|dairy|milk)[- ]free\b/i;
const FREE_CODES: Record<string, string> = { gluten: 'AW', soy: 'AY', soya: 'AY', nut: 'AN', nuts: 'AN', peanut: 'AP', egg: 'AE', fish: 'AF', sesame: 'AS', celery: 'BC', mustard: 'BM', lupin: 'NL', dairy: 'AM', milk: 'AM' };

/** Words that can make a clause without a product a rule; anything else is left to product matching. */
const SIGNAL = /\b(only|no|not|never|nothing|without|under|below|over|above|max\w*|min\w*|at most|at least|less than|more than|per|must|ask|approv\w*|limit|budget|avoid|exclude\w*|substitut\w*|reliab\w*|co2|co₂|carbon)\b/i;

/** Leftovers of a clause once its rule is taken out ("ask me if", "it's") — not products. */
const FILLER_WORDS = new Set(
  'only just and or but if when it its it\'s is be must should please keep make sure stay all the a an me us my our order orders total spend spending everything anything products product stuff goods ask check confirm with from also plus then that this so'.split(' ')
);
export const isFiller = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter(Boolean)
    .every((w) => FILLER_WORDS.has(w));

const toNum = (s: string) => Number(s);

/** One clause's spend limit, or null. */
const moneyLimit = (clause: string): { hit: ConstraintHit; span: [number, number] } | null => {
  const m = MONEY_LIMIT.exec(clause);
  if (!m) return null;
  // A price per litre / kg is a product rule, not a spend limit.
  if (/^\s*(?:per|\/|a)\s*(?:litre|liter|l|kg|kilo)\b/i.test(clause.slice(m.index + m[0].length))) return null;
  const amount = toNum(m[2] ?? m[3] ?? m[5] ?? m[6]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const period = (m[4] ?? m[8] ?? (/\bweekly\b|\ba week\b|\bper week\b/i.test(clause) ? 'week' : 'order')).toLowerCase();
  // Asking someone (or "over €X" said with an ask) is a person deciding; a plain limit blocks.
  const soft = ASK_BEFORE.test(clause);
  let start = m.index;
  const ask = clause.slice(0, m.index).search(ASK_BEFORE);
  if (ask >= 0) start = ask;
  const words = clause.slice(start, m.index + m[0].length).trim();
  return {
    hit: { raw: { type: period === 'week' ? 'limit.perWeek' : 'limit.perOrder', max: amount, over: soft ? 'needs_approval' : 'block' }, words },
    span: [start, m.index + m[0].length],
  };
};

type Finder = (clause: string) => { hit: ConstraintHit; span: [number, number] } | null;

const at = (re: RegExp, clause: string) => {
  const m = re.exec(clause);
  return m ? { m, span: [m.index, m.index + m[0].length] as [number, number] } : null;
};

const origin: Finder = (clause) => {
  const fi = at(ORIGIN_FI, clause);
  if (fi) return { hit: { raw: { type: 'product.attribute', attribute: 'origin', operator: '=', value: 'FI', hard: !isSoft(clause), onMissing: 'needs_approval' }, words: fi.m[0].trim() }, span: fi.span };
  const only = at(ORIGIN_ONLY, clause);
  if (only) {
    const c = countryIn(only.m[0]);
    if (c) return { hit: { raw: { type: 'product.attribute', attribute: 'origin', operator: '=', value: c, hard: !isSoft(clause), onMissing: 'needs_approval' }, words: only.m[0].trim() }, span: only.span };
  }
  const not = at(ORIGIN_NOT, clause);
  if (not) {
    const c = countryIn(not.m[0]);
    if (c) return { hit: { raw: { type: 'product.attribute', attribute: 'origin', operator: '!=', value: c, hard: !isSoft(clause), onMissing: 'needs_approval' }, words: not.m[0].trim() }, span: not.span };
  }
  return null;
};

const lactose: Finder = (clause) => {
  const l = at(LACTOSE, clause);
  if (!l) return null;
  // "lactose-free milk": the words stay in the product phrase (they pick the product too).
  return { hit: { raw: { type: 'nutrition', hard: !isSoft(clause), nutrient: 'LACS', operator: '=', value: 0 }, words: l.m[0].trim(), keepInPhrase: /free|laktoositon/i.test(l.m[0]) }, span: l.span };
};

const allergenFree: Finder = (clause) => {
  const f = at(ALLERGEN_FREE, clause);
  if (!f) return null;
  const code = FREE_CODES[f.m[1].toLowerCase()];
  // "gluten-free pasta" names products too; "nut-free" doesn't.
  return { hit: { raw: { type: 'allergen.exclude', allergens: [code], hard: !isSoft(clause) }, words: f.m[0].trim(), keepInPhrase: code === 'AW' }, span: f.span };
};

const allergenCodes = (words: string) => {
  const codes = ALLERGEN_WORDS.filter(([re]) => re.test(words)).map(([, c]) => c);
  // "nuts" and "peanuts" both match the nut words; "milk protein" is the only milk here.
  return [...new Set(codes.filter((c) => c !== 'AM' || /milk protein/i.test(words)))];
};

/** "no soy, nuts or sesame" — may span "and"/commas, so it runs on the whole text first. */
const allergenLists = (text: string) => {
  const hits: ConstraintHit[] = [];
  const rest = text.replace(new RegExp(ALLERGEN_LIST.source, 'gi'), (words) => {
    const codes = allergenCodes(words);
    if (codes.length) hits.push({ raw: { type: 'allergen.exclude', allergens: codes, hard: !isSoft(text) }, words: words.trim() });
    return codes.length ? ' ; ' : words;
  });
  return { rest, hits };
};

const FINDERS: Finder[] = [moneyLimit, origin, lactose, allergenFree];

/** Splits like the item splitter (commas, semicolons, "and", "+", newlines; thousands separators survive). */
const clauses = (text: string) => text.split(/(\s*(?:[,;\n+&]|\band\b|\bplus\b|\balso\b|\bbut\b)\s*)/i);

/**
 * Takes the constraint words out of `text`. Returns what's left (products, quantities, the
 * date — joined with commas so the item splitter sees the same items) and the hits in order.
 */
export const extractConstraints = (input: string): { rest: string; hits: ConstraintHit[] } => {
  const text = input.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2');
  const lists = allergenLists(text);
  const hits: ConstraintHit[] = [...lists.hits];
  const parts = clauses(lists.rest);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    let clause = parts[i];
    const found: ConstraintHit[] = [];
    // Words that stay in the product phrase ("lactose-free milk") are masked while the other finders run.
    const kept: string[] = [];
    for (const find of FINDERS) {
      for (let n = 0; n < 3; n++) {
        const r = find(clause);
        if (!r) break;
        found.push(r.hit);
        const [a, b] = r.span;
        const middle = r.hit.keepInPhrase ? `\u0001${kept.push(clause.slice(a, b)) - 1}\u0001` : ' ';
        clause = `${clause.slice(0, a)} ${middle} ${clause.slice(b)}`;
      }
    }
    clause = clause.replace(/\u0001(\d+)\u0001/g, (_m, n) => kept[Number(n)]);
    const left = clause.replace(/\s+/g, ' ').trim();
    // A clause with no product left: anything the single-rule parser understands ("price under €3 per kg").
    if (!found.length && left && !/\d+\s*(?:l|kg|pcs|x)\b/i.test(left) && SIGNAL.test(left)) {
      const raw = parseRuleText(left);
      if (raw && raw.type !== 'category.allow') {
        hits.push({ raw, words: left });
        continue;
      }
    }
    const product = left && !isFiller(left.replace(/[.!?:]/g, ' ')) ? left : '';
    for (const h of found) hits.push(product && h.keepInPhrase ? { ...h, item: product } : h);
    if (product) out.push(product);
  }
  // Products joined with commas: the item splitter sees exactly these items.
  return { rest: out.join(', '), hits };
};

// --- Hits → rules -----------------------------------------------------------------------

/** Like describeRule, with origin in words people say: "Only products from Finland — otherwise blocked". */
const sentenceOf = (r: PolicyRule) => {
  if (r.type !== 'product.attribute' || r.attribute !== 'origin' || r.scope || (r.operator !== '=' && r.operator !== '!=')) return describeRule(r);
  const where = countryName(String(r.value));
  return `${r.operator === '=' ? 'Only products from' : 'Never products from'} ${where} — ${r.hard === false ? 'otherwise a person approves' : 'otherwise blocked'}`;
};

const identity = (r: Record<string, unknown>) => {
  const { key: _k, label: _l, ...rest } = r;
  return JSON.stringify(rest, Object.keys(rest).sort());
};

/**
 * Validated rules with unique keys, in the order they were said; the same rule said twice
 * appears once. `scopes`: categories a lactose rule said inside a product phrase covers.
 */
export const rulesFromHits = (hits: (ConstraintHit & { scope?: string[] })[], facts: CatalogFacts, taken: string[] = []): RequestRule[] => {
  const out: RequestRule[] = [];
  const seen = new Set<string>();
  const keys = [...taken];
  for (const h of hits) {
    const raw = h.scope?.length ? { ...h.raw, scope: { categories: h.scope } } : h.raw;
    const v = validateRule(raw, facts);
    if (!v.rule) continue;
    const id = identity(v.rule);
    if (seen.has(id)) continue;
    seen.add(id);
    const key = uniqueKey(baseKey(v.rule), keys);
    keys.push(key);
    const rule = { ...v.rule, key } as PolicyRule;
    out.push({ rule, sentence: sentenceOf(rule), words: h.words });
  }
  // An unscoped rule covers a scoped one of the same kind ("lactose-free milk … all lactose-free").
  return out.filter((r) => !(r.rule.scope && out.some((o) => o !== r && !o.rule.scope && o.rule.type === r.rule.type && o.rule.nutrient === r.rule.nutrient)));
};

/** Does `p` meet every product-level rule (no break, no missing data)? Spend limits don't apply to a product. */
export const meetsRules = (rules: PolicyRule[], p: Product | RuleProduct) => {
  const product = rules.filter((r) => r.type === 'product.attribute' || r.type === 'nutrition' || r.type === 'allergen.exclude');
  if (!product.length) return true;
  const v = checkProduct({ rules: product } as PolicyDocument, p as RuleProduct);
  return !v.hard.length && !v.soft.length && !v.missing.length;
};
