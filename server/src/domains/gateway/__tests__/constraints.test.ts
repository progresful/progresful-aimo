import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import __dirname from '../../../utils/dirname.ts';
import { extractConstraints } from '../gateway.constraints.ts';
import { loadCsvNumbers, resolveDataFile, type Product } from '../gateway.products.ts';
import { matchProduct, parseRules } from '../gateway.parse.ts';
import { mapValioRecords } from '../gateway.valio-file.ts';
import type { PolicyRule } from '../policy.engine.ts';

// The rules a request states, next to its products. Catalog = server/data/products.sample.json
// unless a test builds its own; the real Valio file (git-ignored ../data/) is used when present.

const TODAY = '2026-11-14';
const rulesOf = (text: string, products?: Product[]) => parseRules(text, TODAY, products).rules;
const types = (text: string) => rulesOf(text).map((r) => r.rule.type);

// --- (a) constraint extraction ----------------------------------------------------------

test('"20kg pasta, local only" → one origin = FI rule, no category rule', () => {
  const rules = rulesOf('20kg pasta, local only');
  assert.equal(rules.length, 1);
  const [r] = rules;
  assert.equal(r.rule.type, 'product.attribute');
  assert.equal(r.rule.attribute, 'origin');
  assert.equal(r.rule.operator, '=');
  assert.equal(r.rule.value, 'FI');
  assert.equal(r.rule.hard, true);
  assert.equal(r.words, 'local only');
  assert.ok(r.sentence.length > 0);
  assert.ok(!rules.some((x) => x.rule.type === 'category.allow'));
});

test('"400 l lactose-free milk for Monday" → a lactose rule; the date is not a rule; the milk is still matched', () => {
  const r = parseRules('400 l lactose-free milk for Monday', TODAY);
  assert.deepEqual(
    r.rules.map((x) => [x.rule.type, x.rule.nutrient, x.rule.value]),
    [['nutrition', 'LACS', 0]]
  );
  assert.equal(r.rules[0].words, 'lactose-free');
  assert.equal(r.requestedDate, '2026-11-16');
  assert.deepEqual(
    r.lines.map((l) => [l.code, l.quantity]),
    [['464398', 400]]
  );
});

test('"10 kg gluten-free pasta under €300" → allergen AW excluded + €300 per order', () => {
  const rules = rulesOf('10 kg gluten-free pasta under €300');
  const allergen = rules.find((r) => r.rule.type === 'allergen.exclude');
  const limit = rules.find((r) => r.rule.type === 'limit.perOrder');
  assert.deepEqual(allergen?.rule.allergens, ['AW']);
  assert.equal(limit?.rule.max, 300);
  assert.equal(limit?.rule.over, 'block');
  assert.equal(limit?.words, 'under €300');
  assert.equal(rules.length, 2);
});

test('"20 kg butter for Friday" → no rules', () => {
  const r = parseRules('20 kg butter for Friday', TODAY);
  assert.deepEqual(r.rules, []);
  assert.equal(r.lines.length, 1);
  assert.equal(r.requestedDate, '2026-11-20');
});

test('plain product words and quantities are never rules', () => {
  for (const t of ['20 kg pasta', '1,000 l semi-skimmed milk and 24 pcs butter', 'Edam cheese 5 kg tomorrow', '60 kg yoghurt, deliver Friday']) assert.deepEqual(types(t), [], t);
});

test('spend: "ask me if over €200" asks a person, "max 300 €" blocks, "… per week" is weekly', () => {
  const ask = rulesOf('200 l milk, ask me if over €200');
  assert.deepEqual(
    ask.map((r) => [r.rule.type, r.rule.max, r.rule.over]),
    [['limit.perOrder', 200, 'needs_approval']]
  );
  assert.deepEqual(
    rulesOf('100 l milk, max 300 €').map((r) => [r.rule.type, r.rule.max, r.rule.over]),
    [['limit.perOrder', 300, 'block']]
  );
  assert.deepEqual(
    rulesOf('1,000 l milk, under €1,000 per week').map((r) => [r.rule.type, r.rule.max]),
    [['limit.perWeek', 1000]]
  );
});

test('allergen lists, other origins, and the words they came from', () => {
  const r = rulesOf('milk 100 l, no soy, nuts or sesame');
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].rule.allergens, ['AY', 'AN', 'AS']);
  assert.equal(r[0].words, 'no soy, nuts or sesame');
  assert.deepEqual(
    rulesOf('20 kg cheese, nothing from Germany').map((x) => [x.rule.operator, x.rule.value]),
    [['!=', 'DE']]
  );
  // "Finnish" inside a product phrase is a rule too; "Italian salad" isn't.
  assert.deepEqual(
    rulesOf('10 kg Finnish butter').map((x) => x.rule.value),
    ['FI']
  );
  assert.deepEqual(types('5 kg Italian salad'), []);
});

test('rule words come out of the product phrase; "lactose-free" stays in it', () => {
  const { rest, hits } = extractConstraints('20 kg local pasta and 10 l lactose-free cream, ask me if over €500');
  assert.equal(rest, '20 kg pasta, 10 l lactose-free cream');
  assert.deepEqual(
    hits.map((h) => h.words),
    ['local', 'lactose-free', 'ask me if over €500']
  );
});

test('the same rule said twice is one rule', () => {
  assert.equal(rulesOf('10 kg butter, local only, Finnish products').length, 1);
});

// --- (b) matching respects the request's rules ------------------------------------------

const pasta = (code: string, name: string, origin: string): Product => ({
  code,
  name,
  category: 'Pasta',
  categoryCode: 'dry.pasta',
  group: 'dry.pasta',
  vendor: 'Wholesale',
  origin,
  temperature: 'ambient',
  salesUnit: { name: 'bag', size: 5, base: 'kg' },
  perCase: 1,
  perPallet: null,
  price: 10,
  lacs: 0,
  nutrition: null,
  allergens: [{ code: 'AW', label: 'Gluten' }],
  substitutes: [],
  reliability: null,
  co2eKgPerKg: null,
  sample: true,
});

const ITALIAN = pasta('800001', 'Pasta 5 kg', 'IT');
const FINNISH = pasta('800002', 'Torino macaroni pasta 5 kg', 'FI');
const fixtures = [ITALIAN, FINNISH];
const local: PolicyRule = { key: 'o', type: 'product.attribute', attribute: 'origin', operator: '=', value: 'FI', hard: true, onMissing: 'needs_approval' };

test('matching: without rules the closest name wins; "local only" picks the Finnish pasta', () => {
  assert.equal(matchProduct('pasta', fixtures, 'kg', 20)?.product.code, ITALIAN.code);
  const m = matchProduct('pasta', fixtures, 'kg', 20, [local]);
  assert.equal(m?.product.code, FINNISH.code);
  assert.equal(m?.meetsRules, true);
  const r = parseRules('20kg pasta, local only', TODAY, fixtures);
  assert.deepEqual(
    r.lines.map((l) => l.code),
    [FINNISH.code]
  );
  assert.equal(r.lines[0].alternatives[0]?.code, ITALIAN.code);
});

test('matching: when nothing meets the rules the best match stays, and a note says the rules will stop it', () => {
  const r = parseRules('20kg pasta, local only', TODAY, [ITALIAN]);
  assert.deepEqual(
    r.lines.map((l) => l.code),
    [ITALIAN.code]
  );
  assert.ok(r.notes.some((n) => /meets the rules from your request/.test(n)));
  assert.equal(r.rules.length, 1);
});

const DATA = path.resolve(__dirname, '..', '..', '..', 'data');
const FILE = resolveDataFile(process.env.VALIO_PRODUCTS_FILE) ?? path.join(DATA, 'valio_aimo_junction26_product_data.json');
const hasData = fs.existsSync(FILE);

test('real catalog: "20kg pasta, local only" → Finnish dry pasta + origin rule', { skip: hasData ? false : 'Valio product file not present' }, () => {
  const products = mapValioRecords(JSON.parse(fs.readFileSync(FILE, 'utf8')), {
    reliability: loadCsvNumbers(path.join(DATA, 'valio_aimo_junction26_delivery_reliability.csv')),
    carbon: loadCsvNumbers(path.join(DATA, 'valio_aimo_junction26_carbon_footprint.csv')),
  });
  const r = parseRules('20kg pasta, local only', TODAY, products);
  assert.equal(r.lines.length, 1);
  const p = products.find((x) => x.code === r.lines[0].code)!;
  assert.equal(p.origin, 'FI', p.name);
  assert.equal(p.categoryCode, 'dry.pasta', p.name);
  assert.deepEqual(
    r.rules.map((x) => [x.rule.attribute, x.rule.value]),
    [['origin', 'FI']]
  );
  // Gluten-free pasta under a "local only" request: Finnish first when there's one, else the rule stops it.
  const gf = parseRules('10 kg gluten-free pasta, local only', TODAY, products);
  assert.equal(gf.rules.length, 2);
});
