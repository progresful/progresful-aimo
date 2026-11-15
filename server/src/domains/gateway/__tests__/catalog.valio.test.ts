import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import __dirname from '../../../utils/dirname.ts';
import { loadCsvNumbers } from '../gateway.products.ts';
import type { Product } from '../gateway.products.ts';
import { mapValioRecords, sizeFromName } from '../gateway.valio-file.ts';
import { buildSearchIndex } from '../gateway.search.ts';
import { calibrate, roundest } from '../gateway.prices.ts';
import { parseRules } from '../gateway.parse.ts';
import { toSalesUnits } from '../policy.engine.ts';
import { tagOf } from '../gateway.categories.ts';

// Valio's real product file lives in the git-ignored ../data/ (Junction 2026
// licence — never committed). The tests that need it skip when it's absent.

const DATA = path.resolve(__dirname, '..', '..', '..', 'data');
const FILE = path.join(DATA, 'valio_aimo_junction26_product_data.json');
const hasData = fs.existsSync(FILE);
const skip = hasData ? false : 'Valio product file not present (../data/ is git-ignored)';

let cached: { products: Product[]; by: Map<string, Product> } | null = null;
const catalog = () => {
  if (!cached) {
    const records = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const reliability = loadCsvNumbers(path.join(DATA, 'valio_aimo_junction26_delivery_reliability.csv'));
    const carbon = loadCsvNumbers(path.join(DATA, 'valio_aimo_junction26_carbon_footprint.csv'));
    const products = mapValioRecords(records, { reliability, carbon });
    cached = { products, by: new Map(products.map((p) => [p.code, p])) };
  }
  return cached;
};
const get = (code: string) => catalog().by.get(code)!;

// --- Pure helpers (no data file needed) --------------------------------------------

test('sizeFromName reads consumer sizes, multipacks and net/drained weights', () => {
  assert.deepEqual(sizeFromName('Valio semi skimmed milk 1 l'), { base: 'l', amount: 1, count: null });
  assert.deepEqual(sizeFromName('Valio Oltermanni® e900 g slices'), { base: 'kg', amount: 0.9, count: null });
  assert.deepEqual(sizeFromName('Valio Keittiön whipping cream 3,3 dl lactose free'), { base: 'l', amount: 0.33, count: null });
  assert.deepEqual(sizeFromName('Paulig Juhla Mokka coffee beans 8x500g'), { base: 'kg', amount: 0.5, count: 8 });
  assert.deepEqual(sizeFromName('6 x Arla Apetina 265/150 g salad cheese cubes'), { base: 'kg', amount: 0.265, count: 6 });
  assert.equal(sizeFromName('Valio Eila® 3 % milk drink'), null);
});

test('category keywords: English and Finnish, specific before generic', () => {
  assert.equal(tagOf('valio whipping cream 1 l | valio kuohukerma 1 l'), 'dairy.cream');
  assert.equal(tagOf('vanilla ice cream'), 'dairy.desserts');
  assert.equal(tagOf('cream cheese'), 'dairy.cheese');
  assert.equal(tagOf('valio voi 500 g'), 'dairy.butter');
  assert.equal(tagOf('peanut butter'), 'pantry.spreads');
  assert.equal(tagOf('oat drink'), 'plant.drinks');
  assert.equal(tagOf('fermented milk'), 'dairy.yoghurt');
});

test('calibration: Valio comparison price confirms or corrects litres / kg per sales unit', () => {
  assert.equal(roundest(4.72 / 0.945, 4.72 / 0.935), 5);
  const price = (catalogPrice: number, comparisonPrice: number, unit: string) => ({
    code: 'x', currency: 'EUR' as const, catalogPrice, listPrice: catalogPrice, priceWithTax: null, taxPercent: null, comparisonPrice, comparisonUnit: unit, validFrom: null, validTo: null,
  });
  const p = { code: 'x', salesUnit: { name: 'KI', size: 5, base: 'l' }, measure: { source: 'name', perBaseUnit: 1, variableWeight: false } } as unknown as Product;
  assert.equal(calibrate(p, price(4.72, 0.94, 'l')), 'verified');
  const wrong = { code: 'y', salesUnit: { name: 'KI', size: 0.01, base: 'kg' }, measure: { source: 'name', perBaseUnit: 0.01, variableWeight: false } } as unknown as Product;
  assert.equal(calibrate(wrong, price(23.42, 11.15, 'kg')), 'corrected');
  assert.deepEqual(wrong.salesUnit, { name: 'KI', size: 2.1, base: 'kg' });
  assert.equal(wrong.measure?.source, 'valio-price');
});

// --- The real file ---------------------------------------------------------------

test('loader: the four known milks — units, litres per sales unit, LACS, allergens, substitutes', { skip }, () => {
  const { products } = catalog();
  assert.ok(products.length > 17_000);
  const regular = get('463359');
  assert.equal(regular.name, 'Valio semi skimmed milk 1 l');
  assert.deepEqual(regular.salesUnit, { name: 'KI', size: 5, base: 'l' }); // KI = 5 × ST of 1 l
  assert.equal(regular.baseUnitCode, 'ST');
  assert.equal(regular.baseUnitsPerSalesUnit, 5);
  assert.equal(regular.lacs, 4.8);
  assert.equal(regular.categoryId, '10400');
  assert.equal(regular.categoryCode, 'dairy.milk');
  assert.equal(regular.origin, 'FI');
  assert.equal(regular.vendor, 'VALIO OY TUORE');
  assert.equal(regular.temperature, 'chilled');

  const eila = get('464398');
  assert.deepEqual(eila.salesUnit, { name: 'ST', size: 1, base: 'l' });
  assert.equal(eila.measure?.source, 'synkka'); // consumer-unit volume 1 LTR
  assert.equal(eila.lacs, 0);
  assert.equal(eila.temperature, 'ambient'); // UHT
  assert.equal(eila.perCase, 10);
  assert.equal(eila.perPallet, 600);

  assert.deepEqual(get('463335').salesUnit, { name: 'ST', size: 1, base: 'l' });
  assert.equal(get('463335').lacs, 0);
  assert.deepEqual(get('463038').salesUnit, { name: 'KI', size: 20, base: 'l' }); // KI = 2 × 10 l novobox
  assert.equal(get('463038').lacs, 0);

  for (const code of ['463359', '464398', '463335', '463038']) {
    const p = get(code);
    assert.deepEqual(p.allergens, [{ code: 'AM', label: 'milk' }]);
    assert.deepEqual(p.allergensContain, ['AM']);
    assert.deepEqual(p.allergensMayContain, []);
    assert.deepEqual(p.substitutes, []); // the file lists no substitutions for these four
    assert.equal(p.brand, 'Valio');
  }
});

test('loader: MAY_CONTAIN counts as present for exclusion rules, but is recorded separately', { skip }, () => {
  const p = get('464240'); // Valio Danish pastry base: CONTAINS AE AM AW UW, MAY_CONTAIN AY SA
  assert.deepEqual(p.allergensContain, ['AE', 'AM', 'AW', 'UW']);
  assert.deepEqual(p.allergensMayContain, ['AY', 'SA']);
  assert.deepEqual(p.allergens!.map((a) => a.code).sort(), ['AE', 'AM', 'AW', 'AY', 'SA', 'UW']);
  assert.ok(p.allergens!.find((a) => a.code === 'AY')!.mayContain);
});

test('loader: missing data stays null (fails closed)', { skip }, () => {
  const p = get('463924'); // AIMO Edam slices: no allergen or nutrition data in the file
  assert.equal(p.allergens, null);
  assert.equal(p.lacs, null);
  const share = catalog().products.filter((x) => x.allergens === null).length / catalog().products.length;
  assert.ok(share > 0.5 && share < 0.7, `share without allergen data ${share}`);
});

test('categories: majority vote per numeric category; dairy stays dairy', { skip }, () => {
  const codeOf = (categoryId: string) => catalog().products.find((p) => p.categoryId === categoryId)!.categoryCode;
  assert.equal(codeOf('10400'), 'dairy.milk');
  assert.equal(codeOf('10412'), 'dairy.yoghurt');
  assert.equal(codeOf('10401'), 'dairy.cream');
  assert.equal(codeOf('10500'), 'dairy.butter');
  assert.equal(codeOf('10602'), 'dairy.cheese');
  assert.equal(codeOf('41800'), 'dairy.desserts');
  assert.equal(codeOf('21380'), 'dry.pasta');
  assert.equal(codeOf('22300'), 'beverages.coffee');
  assert.equal(codeOf('41710'), 'meat');
  assert.equal(get('460684').categoryCode, 'pantry.oils'); // Keiju margarine filed with butter
  // Every lactose-free Valio milk / yoghurt / cream / cheese / butter is in dairy.*.
  const core = /\b(milk|yoghurt|quark|cream|cheese|butter)\b/i;
  const outside = catalog().products.filter(
    (p) => p.lacs === 0 && /valio/i.test(p.vendor) && core.test(p.name) && /^Valio (Eila®? )?(semi skimmed|skimmed|whole|A\+™ natural|quark|whipping|cooking|Edam|butter|Oltermanni|Polar)/i.test(p.name) && !p.categoryCode.startsWith('dairy.')
  );
  assert.deepEqual(outside.map((p) => `${p.code} ${p.name} ${p.categoryCode}`), []);
});

test('search: ranking over 17.5k products', { skip }, () => {
  const index = buildSearchIndex(catalog().products);
  const top = (q: string, n = 5) => index.search(q).slice(0, n);

  const lf = top('lactose free milk');
  assert.ok(lf.every((p) => p.categoryCode === 'dairy.milk' && p.lacs === 0), lf.map((p) => p.name).join(' / '));
  assert.equal(top('Eila 3%', 1)[0].code, '463335');
  assert.equal(top('voi', 1)[0].categoryCode, 'dairy.butter');
  assert.ok(top('kerma', 3).every((p) => p.categoryCode === 'dairy.cream'));
  const whipping = top('whipping cream');
  assert.ok(whipping.every((p) => p.categoryCode === 'dairy.cream' && /whipping/i.test(p.name)), whipping.map((p) => p.name).join(' / '));
  assert.equal(top('463359', 1)[0].code, '463359');

  const started = Date.now();
  for (let i = 0; i < 20; i++) index.search('lactose free whipping cream');
  assert.ok((Date.now() - started) / 20 < 50, 'search is fast');
});

test('conversion: 1,000 l of 463359 = 200 KI (5 l each)', { skip }, () => {
  assert.equal(toSalesUnits(1000, 'l', get('463359')), 200);
  const r = parseRules('1,000 l of 463359 for Monday', '2026-11-14', catalog().products);
  assert.deepEqual(r.lines.map((l) => [l.code, l.quantity, l.unit, l.salesUnits]), [['463359', 1000, 'l', 200]]);
  assert.equal(r.lines[0].salesUnit, 'KI (5 l)');
});

test('parse against the real catalog', { skip }, () => {
  const lines = (text: string) => parseRules(text, '2026-11-14', catalog().products).lines;
  const [butter, cream] = lines('20 kg butter and 10 l whipping cream for Friday');
  assert.equal(butter.unit, 'kg');
  assert.equal(get(butter.code).categoryCode, 'dairy.butter');
  assert.equal(cream.unit, 'l');
  assert.match(cream.name, /whipping cream/i);
  const [yoghurt] = lines('lactose free yoghurt 30 kg for Wednesday');
  assert.equal(get(yoghurt.code).lacs, 0);
  assert.match(yoghurt.name, /natural yoghurt/i);
  const [milk] = lines('1000 l lactose-free milk for Monday');
  assert.equal(get(milk.code).categoryCode, 'dairy.milk');
  assert.equal(get(milk.code).lacs, 0);
  assert.match(milk.name, /semi skimmed/i);
  assert.equal(milk.salesUnits, 1000 / get(milk.code).salesUnit.size);
});
