import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDate, parseRules, splitItems } from '../gateway.parse.ts';

// Today = Sat 14 Nov 2026 (Helsinki). Catalog = server/data/products.sample.json.
const TODAY = '2026-11-14';
const lines = (text: string) => parseRules(text, TODAY).lines.map((l) => [l.code, l.quantity, l.unit]);

test('"1,000 l lactose-free milk for Monday"', () => {
  const r = parseRules('1,000 l lactose-free milk for Monday', TODAY);
  assert.deepEqual(lines(r.text), [['464398', 1000, 'l']]);
  assert.equal(r.requestedDate, '2026-11-16');
  assert.equal(r.dateText, 'Monday');
  assert.equal(r.parser, 'rules');
  assert.deepEqual(r.unmatched, []);
  assert.equal(r.lines[0].salesUnits, 1000);
});

test('"60 kg lactose free yoghurt and 12 l cream for Friday"', () => {
  const r = parseRules('60 kg lactose free yoghurt and 12 l cream for Friday', TODAY);
  assert.deepEqual(lines(r.text), [
    ['900318', 60, 'kg'],
    ['900112', 12, 'l'],
  ]);
  assert.equal(r.requestedDate, '2026-11-20');
  // every match is lactose-free, the cream offers the other lactose-free cream as an alternative
  assert.ok(r.lines[1].alternatives.some((a) => a.code === '901142'));
});

test('"2 cases Eila 3% tomorrow" converts cases via packaging', () => {
  const r = parseRules('2 cases Eila 3% tomorrow', TODAY);
  assert.deepEqual(lines(r.text), [['463335', 24, 'l']]);
  assert.equal(r.requestedDate, '2026-11-15');
  assert.ok(r.notes.some((n) => /2 cases/.test(n)));
});

test('quantities, units and item separators', () => {
  assert.deepEqual(lines('1000 litres semi-skimmed milk, 24 pcs butter; quark 10 kg\nEdam cheese 5 kg'), [
    ['464398', 1000, 'l'],
    ['900421', 24, 'pcs'],
    ['900936', 10, 'kg'],
    ['900627', 5, 'kg'],
  ]);
  assert.deepEqual(splitItems('1,000 l milk and 60 kg yoghurt'), ['1000 l milk', '60 kg yoghurt']);
});

test('dates resolve in Helsinki to the next matching day on or after tomorrow', () => {
  const d = (t: string, today = TODAY) => findDate(t, today)?.date ?? null;
  assert.equal(d('for Monday'), '2026-11-16');
  assert.equal(d('next Monday'), '2026-11-16');
  assert.equal(d('Saturday'), '2026-11-21'); // today is Saturday → next week
  assert.equal(d('Sunday'), '2026-11-15');
  assert.equal(d('tomorrow'), '2026-11-15');
  assert.equal(d('Fri 20 Nov'), '2026-11-20');
  assert.equal(d('20.11.'), '2026-11-20');
  assert.equal(d('2026-11-20'), '2026-11-20');
  assert.equal(d('10.1.'), '2027-01-10'); // already past this year
  assert.equal(d('3% milk'), null);
});

test('unknown products are reported, not guessed', () => {
  const r = parseRules('5 kg caviar for Monday', TODAY);
  assert.deepEqual(r.lines, []);
  assert.deepEqual(r.unmatched, ['5 kg caviar']);
});
