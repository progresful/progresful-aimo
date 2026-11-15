import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraft, checkProduct, describeRule, draftLine, evaluate, policyAllowedPart, rankSubstitutes } from '../policy.engine.ts';
import type { PolicyDocument, PolicyRule, RuleProduct } from '../policy.engine.ts';
import { catalogFacts, draftRuleFromText, parseRuleText, validateRule, validateRuleList } from '../policy.rules.ts';
import { parseIntent, rulesFromIntent } from '../policy.compiler.ts';
import { P, dairyPolicy } from './fixtures.ts';

const DATE = '2026-11-16'; // Monday
const SATURDAY = '2026-11-21';
const failing = (checks: { rule: string; passed: boolean }[]) => checks.filter((c) => !c.passed).map((c) => c.rule).sort();

const cheese = (code: string, extra: Partial<RuleProduct> = {}): RuleProduct => ({
  code,
  name: `Cheese ${code}`,
  categoryCode: 'dairy.cheese',
  salesUnit: { name: 'pack', size: 1, base: 'kg' },
  price: 11.9,
  lacs: 0,
  nutrition: { fat: 25 },
  allergens: [{ code: 'AM' }],
  substitutes: [],
  reliability: 0.93,
  vendor: 'Valio Oy',
  origin: 'FI',
  temperature: 'chilled',
  group: 'cheese',
  co2eKgPerKg: 8.6,
  ...extra,
});

const C = {
  fi: cheese('900627'),
  de: cheese('900999', { origin: 'DE', vendor: 'Käserei GmbH' }),
  unknown: cheese('900730', { origin: '' }),
};
const milkFi = { ...P.eila, vendor: 'Valio Oy', origin: 'FI', temperature: 'ambient', co2eKgPerKg: 1.2 } as RuleProduct;
const products = new Map<string, RuleProduct>([...Object.values(C), milkFi, P.eila3].map((p) => [p.code, p]));
const facts = catalogFacts([...products.values()].map((p) => ({ ...p })));

const base: PolicyDocument = { ...dairyPolicy, rules: dairyPolicy.rules.filter((r) => r.type === 'approval') };
const withRules = (...rules: PolicyRule[]): PolicyDocument => ({ ...base, rules: [...base.rules, ...rules] });
const line = (p: RuleProduct, units: number, price = p.price, date = DATE, role: 'requested' | 'substitute' = 'requested') => draftLine(p, units, price, date, role);

const origin: PolicyRule = { key: 'product.attribute.origin', type: 'product.attribute', attribute: 'origin', operator: '=', value: 'fi', hard: true };

test('product.attribute: pass, fail (hard → block), case-insensitive, plain-language detail', () => {
  const ok = evaluate(withRules(origin), buildDraft([line(C.fi, 10)], DATE), { weekSpend: 0, products });
  assert.equal(ok.decision, 'execute');
  const bad = evaluate(withRules(origin), buildDraft([line(C.fi, 10), line(C.de, 5)], DATE), { weekSpend: 0, products });
  assert.equal(bad.decision, 'block');
  assert.deepEqual(failing(bad.checks), ['product.attribute.origin']);
  const check = bad.checks.find((c) => c.rule === 'product.attribute.origin')!;
  assert.equal(check.title, 'Origin must be fi');
  assert.match(check.detail, /Origin must be fi — Cheese 900999 is from DE/);
});

test('product.attribute: soft rule needs approval; missing data fails closed / blocks / is ignored', () => {
  const soft = { ...origin, hard: false };
  assert.equal(evaluate(withRules(soft), buildDraft([line(C.de, 5)], DATE), { weekSpend: 0, products }).decision, 'needs_approval');
  const draft = buildDraft([line(C.unknown, 5)], DATE);
  const missing = evaluate(withRules(origin), draft, { weekSpend: 0, products });
  assert.equal(missing.decision, 'needs_approval');
  assert.match(missing.checks.find((c) => c.rule === origin.key)!.detail, /Valio has no origin info for Cheese 900730 — a person decides/);
  assert.equal(evaluate(withRules({ ...origin, onMissing: 'block' }), draft, { weekSpend: 0, products }).decision, 'block');
  assert.equal(evaluate(withRules({ ...origin, onMissing: 'ignore' }), draft, { weekSpend: 0, products }).decision, 'execute');
});

test('product.attribute: scope, numeric operators, in / not_in, pricePerBase uses the quoted price', () => {
  const vendor: PolicyRule = { key: 'v', type: 'product.attribute', attribute: 'vendor', operator: '=', value: 'valio oy', scope: { categories: ['dairy.cheese'] }, hard: true };
  // milk is outside the cheese scope, so a non-Valio milk would pass; the German cheese does not.
  assert.equal(evaluate(withRules(vendor), buildDraft([line({ ...milkFi, vendor: 'Arla' }, 10)], DATE), { weekSpend: 0, products: new Map([[milkFi.code, { ...milkFi, vendor: 'Arla' }]]) }).decision, 'execute');
  assert.equal(evaluate(withRules(vendor), buildDraft([line(C.de, 1)], DATE), { weekSpend: 0, products }).decision, 'block');
  const byCode = { ...vendor, scope: { codes: ['900627'] } };
  assert.equal(evaluate(withRules(byCode), buildDraft([line(C.de, 1)], DATE), { weekSpend: 0, products }).decision, 'execute');

  const co2: PolicyRule = { key: 'co2', type: 'product.attribute', attribute: 'co2eKgPerKg', operator: '<=', value: 3, hard: true };
  assert.deepEqual(failing(evaluate(withRules(co2), buildDraft([line(milkFi, 10), line(C.fi, 1)], DATE), { weekSpend: 0, products }).checks), ['co2']);

  const notIn: PolicyRule = { key: 'o', type: 'product.attribute', attribute: 'origin', operator: 'not_in', value: ['DE', 'NL'], hard: true };
  assert.equal(evaluate(withRules(notIn), buildDraft([line(C.de, 1)], DATE), { weekSpend: 0, products }).decision, 'block');
  const inCat: PolicyRule = { key: 'c', type: 'product.attribute', attribute: 'categoryCode', operator: 'in', value: ['dairy'], hard: true };
  assert.equal(evaluate(withRules(inCat), buildDraft([line(C.fi, 1)], DATE), { weekSpend: 0, products }).decision, 'execute');

  const price: PolicyRule = { key: 'p', type: 'product.attribute', attribute: 'pricePerBase', operator: '<=', value: 4, hard: false };
  // catalog price 11.9 €/kg but quoted 3.5 → passes on the quoted price
  assert.equal(evaluate(withRules(price), buildDraft([line(C.fi, 1, 3.5)], DATE), { weekSpend: 0, products }).decision, 'execute');
  assert.equal(evaluate(withRules(price), buildDraft([line(C.fi, 1)], DATE), { weekSpend: 0, products }).decision, 'needs_approval');
  const nutr: PolicyRule = { key: 'n', type: 'product.attribute', attribute: 'nutrition.fat', operator: '<', value: 20, hard: true };
  assert.equal(evaluate(withRules(nutr), buildDraft([line(C.fi, 1)], DATE), { weekSpend: 0, products }).decision, 'block');
});

test('substitute candidates respect product.attribute (hard → blocked, soft → needs_approval, missing → missing_data)', () => {
  const inputs = [C.de, C.unknown, cheese('900833', { reliability: 0.95 })].map((p) => ({ product: p, unitPrice: p.price, availableUnits: 100, earliestDelivery: DATE }));
  const ranked = rankSubstitutes(withRules(origin), C.fi, inputs, DATE);
  assert.deepEqual(
    ranked.map((c) => [c.code, c.verdict]),
    [
      ['900833', 'eligible'],
      ['900730', 'missing_data'],
      ['900999', 'blocked'],
    ]
  );
  assert.match(ranked[2].reason, /900999 is from DE/);
  const soft = rankSubstitutes(withRules({ ...origin, hard: false }), C.fi, inputs, DATE);
  assert.equal(soft.find((c) => c.code === '900999')!.verdict, 'needs_approval');
  assert.deepEqual(checkProduct(withRules(origin), C.unknown).missing, ['origin']);
});

test('policyAllowedPart drops lines that break a soft product rule', () => {
  const soft = withRules({ ...origin, hard: false });
  const draft = buildDraft([line(C.fi, 2), line(C.de, 2)], DATE);
  assert.deepEqual(policyAllowedPart(soft, draft, { weekSpend: 0, products }).map((l) => l.code), ['900627']);
});

test('limit.perLine: base units, € totals, scope, block vs approval', () => {
  const kg: PolicyRule = { key: 'limit.perLine.dairy.cheese', type: 'limit.perLine', max: 50, unit: 'kg', scope: { categories: ['dairy.cheese'] }, over: 'needs_approval' };
  assert.equal(evaluate(withRules(kg), buildDraft([line(C.fi, 50)], DATE), { weekSpend: 0, products }).decision, 'execute');
  const over = evaluate(withRules(kg), buildDraft([line(C.fi, 60)], DATE), { weekSpend: 0, products });
  assert.equal(over.decision, 'needs_approval');
  assert.match(over.checks.find((c) => c.rule === kg.key)!.detail, /900627: 60 kg — over the 50 kg per-line limit/);
  // litre lines and lines outside the scope don't count
  assert.equal(evaluate(withRules(kg), buildDraft([line(milkFi, 500)], DATE), { weekSpend: 0, products }).decision, 'execute');
  const litres: PolicyRule = { key: 'l', type: 'limit.perLine', max: 200, unit: 'l', over: 'block' };
  assert.equal(evaluate(withRules(litres), buildDraft([line(milkFi, 201)], DATE), { weekSpend: 0, products }).decision, 'block');
  const euros: PolicyRule = { key: 'e', type: 'limit.perLine', max: 100, unit: 'EUR', over: 'needs_approval' };
  assert.deepEqual(failing(evaluate(withRules(euros), buildDraft([line(C.fi, 9), line(C.fi, 10)], DATE), { weekSpend: 0, products }).checks), ['e']);
  const pcs: PolicyRule = { key: 'p', type: 'limit.perLine', max: 5, unit: 'pcs', over: 'block' };
  assert.equal(evaluate(withRules(pcs), buildDraft([line(C.fi, 6)], DATE), { weekSpend: 0, products }).decision, 'block');
});

test('delivery.days: the requested weekday must be allowed', () => {
  const days: PolicyRule = { key: 'delivery.days', type: 'delivery.days', days: [1, 2, 3, 4, 5], over: 'block' };
  assert.equal(evaluate(withRules(days), buildDraft([line(C.fi, 1)], DATE), { weekSpend: 0, products }).decision, 'execute');
  const sat = evaluate(withRules(days), buildDraft([line(C.fi, 1, C.fi.price, SATURDAY)], SATURDAY), { weekSpend: 0, products });
  assert.equal(sat.decision, 'block');
  const c = sat.checks.find((x) => x.rule === 'delivery.days')!;
  assert.equal(c.title, 'Deliveries Mon–Fri');
  assert.match(c.detail, /Saturday 21 Nov — deliveries allowed Mon–Fri only/);
  assert.equal(evaluate(withRules({ ...days, over: 'needs_approval' }), buildDraft([line(C.fi, 1, C.fi.price, SATURDAY)], SATURDAY), { weekSpend: 0, products }).decision, 'needs_approval');
});

test('describeRule: a plain sentence for every rule type', () => {
  const sentences = [...dairyPolicy.rules, { key: 'schedule.frequency', type: 'schedule.frequency', maxOrders: 1 }, { key: 'nutrition.ALCOHOL', type: 'nutrition', nutrient: 'ALCOHOL', operator: '=', value: 0, hard: true }].map(describeRule);
  assert.deepEqual(sentences, [
    'Orders over €1,200 need approval',
    'Spending over €6,000 a week needs approval',
    'Only milk, yoghurt, cheese, butter, cream — anything else is blocked',
    'Lactose-free only (LACS = 0 g/100 g) — otherwise blocked',
    'If LACS data or allergens data is missing, a person decides',
    'Substitutes need approval',
    "Pick substitutes by Valio's own substitutes, then delivery reliability, then unit price — only ones that arrive in time",
    'Exceptions go to Mikko Laine (Head chef), who has 30 min to decide',
    'At most 1 order a week',
    'Never alcohol — otherwise blocked',
  ]);
  assert.equal(describeRule(origin), 'Origin must be fi — otherwise blocked');
  assert.equal(describeRule({ key: 'v', type: 'product.attribute', attribute: 'vendor', operator: '=', value: 'Valio Oy', scope: { categories: ['dairy.cheese'] }, hard: true }), 'Cheese: vendor must be Valio Oy — otherwise blocked');
  assert.equal(describeRule({ key: 'p', type: 'product.attribute', attribute: 'pricePerBase', operator: '<=', value: 4, hard: false }), 'Price must be at most €4.00 per l/kg — otherwise a person approves');
  assert.equal(describeRule({ key: 'l', type: 'limit.perLine', max: 50, unit: 'kg', scope: { categories: ['dairy.cheese'] }, over: 'needs_approval' }), 'Any single line of cheese over 50 kg needs approval');
  assert.equal(describeRule({ key: 'd', type: 'delivery.days', days: [1, 2, 3, 4, 5], over: 'block' }), 'Deliveries only on Mon–Fri — otherwise blocked');
  assert.equal(describeRule({ key: 'a', type: 'allergen.exclude', allergens: ['AW'], hard: true }), 'Never products containing gluten (AW) — otherwise blocked');
  assert.match(describeRule({ key: 'x', type: 'carbon.cap' }), /can't be checked automatically/);
});

test('rule-based drafter: the common phrasings', async () => {
  const draft = async (text: string) => (await draftRuleFromText(text, [], { useGemini: false, facts })).rule;
  assert.deepEqual(await draft('Nothing from outside Finland'), { key: 'product.attribute.origin', type: 'product.attribute', attribute: 'origin', operator: '=', value: 'FI', hard: true, onMissing: 'needs_approval' });
  assert.equal((await draft('Only Finnish products'))!.value, 'FI');
  // "local" means Finnish origin (the kitchen is in Finland)
  for (const words of ['local only', 'Local', 'only local products', 'Finnish only', 'made in Finland', 'Local produce only']) {
    const r = (await draft(words))!;
    assert.deepEqual([words, r?.type, r?.attribute, r?.operator, r?.value, r?.hard], [words, 'product.attribute', 'origin', '=', 'FI', true]);
  }
  assert.deepEqual([(await draft('Nothing from Germany'))!.operator, (await draft('Nothing from Germany'))!.value], ['!=', 'DE']);
  assert.deepEqual((await draft('No gluten'))!.allergens, ['AW']);
  assert.deepEqual((await draft('gluten-free'))!.allergens, ['AW']);
  assert.deepEqual((await draft('No soy'))!.allergens, ['AY']);
  assert.deepEqual(await draft('More than 50 kg of cheese needs approval'), { key: 'limit.perLine.dairy.cheese', type: 'limit.perLine', max: 50, unit: 'kg', scope: { categories: ['dairy.cheese'] }, over: 'needs_approval' });
  assert.deepEqual((await draft('Deliveries only on weekdays'))!.days, [1, 2, 3, 4, 5]);
  assert.deepEqual((await draft('Deliveries Monday to Friday only'))!.days, [1, 2, 3, 4, 5]);
  assert.deepEqual((await draft('No deliveries on Sunday'))!.days, [1, 2, 3, 4, 5, 6]);
  const rel = (await draft('Reliability at least 0.9'))!;
  assert.deepEqual([rel.attribute, rel.operator, rel.value], ['deliveryReliability', '>=', 0.9]);
  const price = (await draft('Max €3 per litre'))!;
  assert.deepEqual([price.attribute, price.operator, price.value, price.hard], ['pricePerBase', '<=', 3, true]);
  const ask = (await draft('Ask me if a product costs more than €4 per litre'))!;
  assert.deepEqual([ask.attribute, ask.value, ask.hard], ['pricePerBase', 4, false]);
  const chilled = (await draft('Only chilled products'))!;
  assert.deepEqual([chilled.attribute, chilled.operator, chilled.value], ['temperatureClass', '=', 'chilled']);
  const co2 = (await draft('Block anything with CO2 above 3 kg per kg'))!;
  assert.deepEqual([co2.attribute, co2.operator, co2.value, co2.hard], ['co2eKgPerKg', '<=', 3, true]);
  const valio = (await draft('Cheese only from Valio'))!;
  assert.deepEqual([valio.key, valio.value, valio.scope], ['product.attribute.vendor.dairy.cheese', 'Valio Oy', { categories: ['dairy.cheese'] }]);
  const line200 = (await draft('No single line over 200 litres without Mikko'))!;
  assert.deepEqual([line200.type, line200.max, line200.unit, line200.over], ['limit.perLine', 200, 'l', 'needs_approval']);
});

test('drafter: unsupported sentences, unique keys, duplicates', async () => {
  const none = await draftRuleFromText('Only organic products', [], { useGemini: false, facts });
  assert.equal(none.supported, false);
  assert.equal(none.rule, null);
  assert.match(none.notes.join(' '), /Rules can check/);
  // The first note is shown as is: plain and short, no jargon.
  assert.ok(none.notes[0].length < 120 && !/ISO|expressible|attribute/i.test(none.notes[0]), none.notes[0]);
  const existing: PolicyRule[] = [{ key: 'allergen.exclude.AW', type: 'allergen.exclude', allergens: ['AW'], hard: true }];
  const dup = await draftRuleFromText('No gluten', existing, { useGemini: false, facts });
  assert.equal(dup.rule!.key, 'allergen.exclude.AW.2');
  assert.match(dup.warnings.join(' '), /already has this rule/);
  assert.equal(dup.sentence, 'Never products containing gluten (AW) — otherwise blocked');
});

test('validation rejects unknown types, attributes, operators, categories and codes', () => {
  const ok = { key: 'k', type: 'product.attribute', attribute: 'origin', operator: '=', value: 'FI', hard: true };
  assert.deepEqual(validateRule(ok, facts).errors, []);
  assert.match(validateRule({ ...ok, type: 'carbon.cap' }, facts).errors[0], /Unknown or unsupported rule type/);
  assert.match(validateRule({ ...ok, attribute: 'organic' }, facts).errors[0], /Unknown attribute "organic"/);
  assert.match(validateRule({ ...ok, attribute: 'nutrition.unobtainium' }, facts).errors[0], /Unknown nutrient/);
  assert.match(validateRule({ ...ok, operator: '~' }, facts).errors.join(), /Unknown operator/);
  assert.match(validateRule({ ...ok, attribute: 'co2eKgPerKg', value: 'lots' }, facts).errors.join(), /numeric value/);
  assert.match(validateRule({ ...ok, operator: '<' }, facts).errors.join(), /is text/);
  assert.match(validateRule({ ...ok, scope: { categories: ['dairy.unicorn'] } }, facts).errors.join(), /Unknown category/);
  assert.match(validateRule({ ...ok, scope: { codes: ['000000'] } }, facts).errors.join(), /Unknown product code/);
  assert.match(validateRule({ ...ok, hard: 'yes' }, facts).errors.join(), /hard must be/);
  assert.match(validateRule({ key: 'l', type: 'limit.perLine', max: -1, unit: 'kg' }, facts).errors.join(), /positive/);
  assert.match(validateRule({ key: 'l', type: 'limit.perLine', max: 1, unit: 'tons' }, facts).errors.join(), /unit must be/);
  assert.match(validateRule({ key: 'd', type: 'delivery.days', days: [0, 8] }, facts).errors.join(), /weekdays/);
  assert.match(validateRule({ key: 'a', type: 'allergen.exclude', allergens: ['ZZ'] }, facts).errors.join(), /Unknown GS1/);
  // snaps values onto the catalog spelling
  assert.equal(validateRule({ ...ok, attribute: 'vendor', value: 'valio' }, facts).rule!.value, 'Valio Oy');
  assert.equal(validateRule({ ...ok, value: 'Finland' }, facts).rule!.value, 'FI');
  // PATCH: only the new types are checked strictly; old unknown types still fail closed at run time
  assert.deepEqual(validateRuleList([...dairyPolicy.rules, { key: 'x', type: 'carbon.cap' }], facts), []);
  assert.equal(validateRuleList([{ key: 'p', type: 'product.attribute', attribute: 'organic', operator: '=', value: 'yes', hard: true }], facts).length, 1);
});

test('plain-language compile: origin / per-line / delivery days when stated; existing policies unchanged', () => {
  const seeded = [
    'Order dairy for the ward kitchen. Everything must be lactose-free. Auto-order up to €1,200 per order and €6,000 a week; anything above, or any substitute, goes to the head chef.',
    'Snacks and drinks for the Friday staff coffee. Up to €250 per order, one order a week, delivered on Friday. Pastries, coffee, juice and fruit only — never alcohol. Anything else goes to the ward manager.',
    'Order dry goods (flour, oats, pasta, rice) for the ward kitchen. Anything for the coeliac menu shelf must be gluten-free. Auto-order up to €600 per order and €2,000 a week; anything above, or any product we have not ordered before, goes to the head chef.',
  ];
  const approver = { name: 'Mikko Laine', role: 'Head chef', windowMinutes: 30, fallback: 'x' };
  for (const text of seeded) {
    const types = rulesFromIntent(parseIntent(text), approver).map((r) => r.type);
    assert.ok(!types.some((t) => ['product.attribute', 'limit.perLine', 'delivery.days'].includes(t)), text);
  }
  const rules = rulesFromIntent(parseIntent('Only Finnish products. No single line over 200 litres. Deliveries Monday to Friday only.'), approver);
  assert.deepEqual(
    rules.filter((r) => ['product.attribute', 'limit.perLine', 'delivery.days'].includes(r.type)).map((r) => r.key),
    ['product.attribute.origin', 'limit.perLine', 'delivery.days']
  );
  assert.equal(parseRuleText('Never products with soy', facts)!.type, 'allergen.exclude');
});

test('parseRuleText: spend limits in everyday words', () => {
  assert.deepEqual(parseRuleText('above 1200 euro approve', facts), { type: 'limit.perOrder', max: 1200, over: 'needs_approval' });
  assert.deepEqual(parseRuleText('orders over €300 ask me', facts), { type: 'limit.perOrder', max: 300, over: 'needs_approval' });
  assert.equal(parseRuleText('max €500 a week', facts)!.type, 'limit.perWeek');
  assert.equal(parseRuleText('No single line over €500', facts)!.type, 'limit.perLine');
});
