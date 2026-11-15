import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UnitMismatchError,
  buildDraft,
  draftLine,
  evaluate,
  pickSubstitutes,
  policyAllowedPart,
  rankSubstitutes,
  toSalesUnits,
} from '../policy.engine.ts';
import { P, dairyPolicy, products } from './fixtures.ts';

const DATE = '2026-11-16';
const failing = (checks: { rule: string; passed: boolean }[]) => checks.filter((c) => !c.passed).map((c) => c.rule).sort();

test('unit conversion rounds up to whole sales units', () => {
  assert.equal(toSalesUnits(1000, 'l', P.eila), 1000);
  assert.equal(toSalesUnits(120, 'l', P.eilaBox), 12);
  assert.equal(toSalesUnits(125, 'l', P.eilaBox), 13);
  assert.equal(toSalesUnits(7.2, 'pcs', P.eila), 8);
  assert.throws(() => toSalesUnits(10, 'kg', P.eila), UnitMismatchError);
});

test('routine: 400 l at €1.39 executes inside every rule', () => {
  const draft = buildDraft([draftLine(P.eila, 400, 1.39, DATE, 'requested')], DATE);
  const { decision, checks } = evaluate(dairyPolicy, draft, { weekSpend: 2828, products });
  assert.equal(draft.total, 556);
  assert.equal(decision, 'execute');
  assert.deepEqual(failing(checks), []);
});

test('stock-out: 600 l + 400 l substitute = €1,482 needs the head chef (per-order limit + substitute)', () => {
  const draft = buildDraft([draftLine(P.eila, 600, 1.39, DATE, 'requested'), draftLine(P.eila3, 400, 1.62, DATE, 'substitute', '464398')], DATE);
  const { decision, checks } = evaluate(dairyPolicy, draft, { weekSpend: 2828, products });
  assert.equal(draft.total, 1482);
  assert.equal(decision, 'needs_approval');
  assert.deepEqual(failing(checks), ['limit.perOrder', 'substitution.requiresApproval']);
});

test('timeout fallback: only the requested, in-stock part — 600 l, €834', () => {
  const draft = buildDraft([draftLine(P.eila, 600, 1.39, DATE, 'requested'), draftLine(P.eila3, 400, 1.62, DATE, 'substitute', '464398')], DATE);
  const part = policyAllowedPart(dairyPolicy, draft, { weekSpend: 2828, products });
  assert.deepEqual(
    part.map((l) => [l.code, l.salesUnits, l.total]),
    [['464398', 600, 834]]
  );
  // …and nothing at all if even that part would break the weekly cap.
  assert.deepEqual(policyAllowedPart(dairyPolicy, draft, { weekSpend: 5500, products }), []);
});

test('weekly cap: spend so far + order over €6,000 needs approval', () => {
  const draft = buildDraft([draftLine(P.eila, 400, 1.39, DATE, 'requested')], DATE);
  const { decision, checks } = evaluate(dairyPolicy, draft, { weekSpend: 5500, products });
  assert.equal(decision, 'needs_approval');
  assert.deepEqual(failing(checks), ['limit.perWeek']);
});

test('lactose is read from LACS: 4.8 g/100 g is a hard block', () => {
  const { decision, checks } = evaluate(dairyPolicy, buildDraft([draftLine(P.regular, 100, 1.09, DATE, 'requested')], DATE), { weekSpend: 0, products });
  assert.equal(decision, 'block');
  assert.deepEqual(failing(checks), ['nutrition.LACS']);
});

test('missing LACS / allergen data fails closed to a person', () => {
  const { decision, checks } = evaluate(dairyPolicy, buildDraft([draftLine(P.buttermilk, 10, 1.15, DATE, 'requested')], DATE), { weekSpend: 0, products });
  assert.equal(decision, 'needs_approval');
  assert.deepEqual(failing(checks), ['data.missing']);
});

test('categories outside the policy are blocked', () => {
  const { decision, checks } = evaluate(dairyPolicy, buildDraft([draftLine(P.oat, 10, 2.35, DATE, 'requested')], DATE), { weekSpend: 0, products });
  assert.equal(decision, 'block');
  assert.deepEqual(failing(checks), ['category.allow']);
});

test('uncovered shortfall and unknown rule types go to a person; unknown codes block', () => {
  const short = buildDraft([draftLine(P.eila, 600, 1.39, DATE, 'requested')], DATE, [{ code: '464398', quantity: 400, unit: 'l' }]);
  assert.equal(evaluate(dairyPolicy, short, { weekSpend: 0, products }).decision, 'needs_approval');
  const strange = { ...dairyPolicy, rules: [...dairyPolicy.rules, { key: 'x.carbon', type: 'carbon.cap', max: 1 }] };
  const ok = buildDraft([draftLine(P.eila, 10, 1.39, DATE, 'requested')], DATE);
  assert.deepEqual(failing(evaluate(strange, ok, { weekSpend: 0, products }).checks), ['x.carbon']);
  assert.equal(evaluate(dairyPolicy, buildDraft([], DATE, [], ['999999']), { weekSpend: 0, products }).decision, 'block');
});

test('substitutes: Valio-defined first, then reliability, then price; late and lactose-containing ones excluded', () => {
  const inputs = [
    { product: P.regular, unitPrice: 1.09, availableUnits: 5000, earliestDelivery: DATE },
    { product: P.eilaBox, unitPrice: 12.1, availableUnits: 0, earliestDelivery: '2026-11-18' },
    { product: P.eila3, unitPrice: 1.62, availableUnits: 5000, earliestDelivery: DATE },
    { product: P.buttermilk, unitPrice: 1.15, availableUnits: 5000, earliestDelivery: DATE },
  ];
  const ranked = rankSubstitutes(dairyPolicy, P.eila, inputs, DATE);
  assert.deepEqual(
    ranked.map((c) => [c.code, c.verdict]),
    [
      ['463335', 'eligible'],
      ['463359', 'blocked'],
      ['901657', 'missing_data'],
      ['463038', 'late'],
    ]
  );
  const { picks, remaining } = pickSubstitutes(ranked, 400, products);
  assert.deepEqual(
    picks.map((p) => [p.candidate.code, p.salesUnits]),
    [['463335', 400]]
  );
  assert.equal(remaining, 0);
  assert.equal(ranked[0].verdict, 'picked');
});

test('reliability outranks price among equally-defined substitutes', () => {
  const a = { ...P.eila3, code: 'A', reliability: 0.9, price: 1.0 };
  const b = { ...P.eila3, code: 'B', reliability: 0.95, price: 2.0 };
  const ranked = rankSubstitutes(dairyPolicy, { ...P.eila, substitutes: [] }, [
    { product: a, unitPrice: 1.0, availableUnits: 10, earliestDelivery: DATE },
    { product: b, unitPrice: 2.0, availableUnits: 10, earliestDelivery: DATE },
  ], DATE);
  assert.deepEqual(ranked.map((c) => c.code), ['B', 'A']);
});

test('allergen.exclude blocks products that contain a banned allergen, and can be softened to approval', () => {
  const noMilk = { ...dairyPolicy, rules: [...dairyPolicy.rules, { key: 'allergen.exclude', type: 'allergen.exclude', allergens: ['AM'], hard: true }] };
  const draft = buildDraft([draftLine(P.eila, 100, 1.39, DATE, 'requested')], DATE);
  const hard = evaluate(noMilk, draft, { weekSpend: 0, products });
  assert.equal(hard.decision, 'block');
  assert.deepEqual(failing(hard.checks), ['allergen.exclude']);

  const soft = { ...noMilk, rules: noMilk.rules.map((r) => (r.type === 'allergen.exclude' ? { ...r, hard: false } : r)) };
  assert.equal(evaluate(soft, draft, { weekSpend: 0, products }).decision, 'needs_approval');
});
