import fs from 'node:fs';
import path from 'node:path';
import __dirname from '../../utils/dirname.ts';
import logger from '../../services/logger.ts';
import { buildSearchIndex, type SearchIndex } from './gateway.search.ts';
import { mapValioRecords } from './gateway.valio-file.ts';

// Product catalog. Default source: server/data/products.sample.json (4 real
// Valio products + 16 invented samples). With VALIO_PRODUCTS_FILE set, Valio's
// full product JSON (17.5k products; licence: Junction 2026 only, never commit
// it) is loaded once at startup and mapped by gateway.valio-file.ts, with
// VALIO_RELIABILITY_FILE and VALIO_CARBON_FILE (CSV) merged in. Relative paths
// resolve against the working directory, then against server/.

export type BaseUnit = 'l' | 'kg';
/** 'pcs' = no litre / kg content known: one sales unit counts as one piece. */
export type MeasureUnit = BaseUnit | 'pcs';
export type MeasureSource = 'sample' | 'unit' | 'synkka' | 'name' | 'valio-price' | 'none';
export type Allergen = { code: string; label: string; mayContain?: boolean };

export type Product = {
  code: string;
  name: string; // English (falls back to Finnish / Swedish)
  nameFi?: string | null;
  nameSv?: string | null;
  brand?: string | null;
  category: string;
  categoryId?: string | null; // Valio's numeric category
  categoryCode: string; // policy taxonomy, e.g. dairy.milk
  group: string; // interchangeable-product group used for the substitute pool
  vendor: string;
  origin: string;
  temperature: string;
  temperatureCode?: string | null;
  /** size = litres / kg in ONE sales unit (1 when base is pcs). */
  salesUnit: { name: string; size: number; base: MeasureUnit };
  baseUnitCode?: string;
  baseUnitsPerSalesUnit?: number;
  /** How size was found; verified = matches Valio's live comparison price. */
  measure?: { source: MeasureSource; perBaseUnit: number | null; variableWeight: boolean; verified?: boolean };
  units?: { unit: string; baseUnits: number }[];
  allowedLotSize?: number | null;
  perCase: number; // sales units per case
  perPallet: number | null;
  price: number; // simulated list price per sales unit (sample catalog); 0 = unknown, fetched live
  lacs: number | null; // lactose g/100 g; null = unknown
  nutrition: Record<string, number> | null;
  /** Everything the product contains OR may contain (exclusion rules treat traces as present). null = no data → fails closed. */
  allergens: Allergen[] | null;
  allergensContain?: string[] | null;
  allergensMayContain?: string[] | null;
  substitutes: string[]; // Valio-defined substitutes
  reliability: number | null; // delivery reliability 0–1; null = no data
  co2eKgPerKg: number | null;
  sample: boolean;
};

const CATEGORY_CODES: Record<string, string> = {
  Milk: 'dairy.milk',
  Cream: 'dairy.cream',
  'Yoghurt & quark': 'dairy.yoghurt',
  Cheese: 'dairy.cheese',
  'Butter & spreads': 'dairy.butter',
  'Plant-based': 'plant.drinks',
  Desserts: 'dairy.desserts',
};

export const categoryCodeFor = (category: string) =>
  CATEGORY_CODES[category] ?? `other.${category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

const SERVER_DIR = path.resolve(__dirname, '..', '..'); // src/utils → server
const SAMPLE_FILE = path.join(SERVER_DIR, 'data', 'products.sample.json');

/** Absolute path for an env file setting: as given, else relative to server/. */
export const resolveDataFile = (file: string | undefined) => {
  if (!file) return null;
  const candidates = path.isAbsolute(file) ? [file] : [path.resolve(process.cwd(), file), path.resolve(SERVER_DIR, file)];
  return candidates.find((f) => fs.existsSync(f)) ?? null;
};

const fromSampleRecord = (p: any): Product => ({
  code: String(p.code),
  name: p.name,
  category: p.category,
  categoryCode: categoryCodeFor(p.category),
  group: p.group ?? p.category,
  vendor: p.vendor,
  origin: p.origin,
  temperature: p.temperature,
  salesUnit: p.salesUnit,
  measure: { source: 'sample', perBaseUnit: null, variableWeight: false },
  perCase: p.perCase,
  perPallet: p.perPallet ?? null,
  price: p.price,
  lacs: p.lacs,
  nutrition: p.nutrition,
  allergens: p.allergens,
  allergensContain: p.allergens ? p.allergens.map((a: Allergen) => a.code) : null,
  allergensMayContain: p.allergens ? [] : null,
  substitutes: p.substitutes ?? [],
  reliability: p.reliability ?? null,
  co2eKgPerKg: p.co2eKgPerKg ?? null,
  sample: p.sample === true,
});

/** `productId,<number>` CSV (header row skipped) → Map. */
export const loadCsvNumbers = (file: string | null) => {
  const map = new Map<string, number>();
  if (!file) return map;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(1)) {
    const [code, value] = line.split(/[;,]/);
    if (code && value !== undefined && value.trim() !== '' && Number.isFinite(Number(value))) map.set(code.trim(), Number(value));
  }
  return map;
};

let source: 'valio-file' | 'sample' = 'sample';

const loadProducts = (): Product[] => {
  const setting = process.env.VALIO_PRODUCTS_FILE;
  if (setting) {
    const file = resolveDataFile(setting);
    try {
      if (!file) throw new Error('file not found');
      const started = Date.now();
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const records = Array.isArray(raw) ? raw : (raw.products ?? raw.items ?? raw.data ?? []);
      const reliability = loadCsvNumbers(resolveDataFile(process.env.VALIO_RELIABILITY_FILE));
      const carbon = loadCsvNumbers(resolveDataFile(process.env.VALIO_CARBON_FILE));
      const products = mapValioRecords(records, { reliability, carbon });
      source = 'valio-file';
      const mem = Math.round(process.memoryUsage().heapUsed / 1e6);
      logger.info(`Gateway: loaded ${products.length} products from ${path.basename(file)} in ${Date.now() - started} ms (reliability ${reliability.size}, CO2e ${carbon.size}; heap ${mem} MB)`);
      return products;
    } catch (err) {
      logger.error(`Gateway: failed to read VALIO_PRODUCTS_FILE (${setting}), falling back to the sample catalog: ${(err as Error).message}`);
    }
  }
  source = 'sample';
  return JSON.parse(fs.readFileSync(SAMPLE_FILE, 'utf8')).products.map(fromSampleRecord);
};

let catalog: { list: Product[]; byCode: Map<string, Product>; index: SearchIndex } | null = null;
const load = () => {
  if (!catalog) {
    const list = loadProducts();
    const started = Date.now();
    const index = buildSearchIndex(list);
    if (list.length > 1000) logger.info(`Gateway: search index over ${list.length} products in ${Date.now() - started} ms`);
    catalog = { list, byCode: new Map(list.map((p) => [p.code, p])), index };
  }
  return catalog;
};

/** Loads the catalog now (startup) instead of on the first request. */
export const warmCatalog = () => load().list.length;
export const catalogSource = () => (load(), source);
export const allProducts = () => load().list;
export const productByCode = (code: string) => load().byCode.get(code) ?? null;
export const searchIndex = () => load().index;

/** Products whose rules can be checked automatically (the data the rules read exists). */
export const autoSelectable = (p: Product) => p.allergens !== null && p.lacs !== null;

/** Price per base unit (l, kg or piece). */
export const pricePerBase = (p: Product, unitPrice = p.price) => (unitPrice > 0 && p.salesUnit.size > 0 ? unitPrice / p.salesUnit.size : 0);

const POOL_MAX = 12;
const isValio = (p: Product) => /valio/i.test(p.vendor) || /valio/i.test(p.brand ?? '');

/**
 * Substitute pool for `p`: Valio-defined substitutes first, then products of
 * the same category sold by the same measure (l / kg / pcs), most similar
 * first (same lactose-free status, shared name words, same brand), capped so
 * a quote never asks Valio for hundreds of codes.
 */
export const substitutePool = (p: Product) => {
  const pool = new Map<string, Product>();
  for (const code of p.substitutes) {
    const s = productByCode(code);
    if (s && s.code !== p.code) pool.set(code, s);
  }
  const words = searchIndex().wordsOf(p);
  const similar = allProducts()
    .filter((s) => s.code !== p.code && !pool.has(s.code) && s.group === p.group && s.salesUnit.base === p.salesUnit.base)
    .map((s) => {
      const own = searchIndex().wordsOf(s);
      const shared = [...words].filter((w) => own.has(w) && !/^\d/.test(w)).length;
      const lf = p.lacs === 0 ? (s.lacs === 0 ? 3 : s.lacs === null ? -1 : -3) : 0;
      const sameCat = p.categoryId && s.categoryId === p.categoryId ? 1 : 0;
      return { s, score: shared + lf + sameCat + (isValio(s) === isValio(p) ? 0.5 : 0) + (s.brand && s.brand === p.brand ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score || a.s.code.localeCompare(b.s.code));
  for (const { s } of similar) {
    if (pool.size >= POOL_MAX) break;
    pool.set(s.code, s);
  }
  return [...pool.values()];
};

export type ProductFilter = {
  q?: string;
  category?: string;
  lactoseFree?: boolean;
  missingAllergens?: boolean;
  hasSubstitute?: boolean;
  limit?: number;
  offset?: number;
};

export const DEFAULT_PAGE = 50;
export const MAX_PAGE = 200;

const categoryMatches = (p: Product, category: string) => {
  const c = category.toLowerCase();
  return p.category.toLowerCase() === c || p.categoryCode === c || p.categoryCode.startsWith(`${c}.`) || p.categoryId === category;
};

/** Ranked search (see gateway.search.ts), filtered, paged. `total` counts every match. */
export const searchProducts = (f: ProductFilter) => {
  const q = f.q?.trim();
  const ranked = q ? searchIndex().search(q) : allProducts();
  const matches = ranked
    .filter((p) => !f.category || categoryMatches(p, f.category))
    .filter((p) => f.lactoseFree === undefined || (f.lactoseFree ? p.lacs === 0 : p.lacs !== null && p.lacs > 0))
    .filter((p) => f.missingAllergens === undefined || (p.allergens === null) === f.missingAllergens)
    .filter((p) => f.hasSubstitute === undefined || (p.substitutes.length > 0) === f.hasSubstitute);
  const limit = Math.min(f.limit ?? DEFAULT_PAGE, MAX_PAGE);
  const offset = f.offset ?? 0;
  const counts = new Map<string, number>();
  for (const p of matches) counts.set(p.categoryCode, (counts.get(p.categoryCode) ?? 0) + 1);
  return {
    products: matches.slice(offset, offset + limit),
    total: matches.length,
    offset,
    limit,
    nextOffset: offset + limit < matches.length ? offset + limit : null,
    categories: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code, count]) => ({ code, count })),
  };
};

export type ListPrice = { amount: number | null; currency: 'EUR'; per: string; perBaseUnit: number | null; baseUnit: MeasureUnit; source: 'live' | 'simulator' | 'unknown'; simulated: boolean; fetchedAt?: string | null };

/** The product exactly as agents (and the catalog page) see it. `listPrice` comes from gateway.prices.ts. */
export const productView = (p: Product, listPrice?: ListPrice) => {
  const price: ListPrice = listPrice ?? {
    amount: p.price > 0 ? p.price : null,
    currency: 'EUR',
    per: p.salesUnit.name,
    perBaseUnit: p.price > 0 ? Math.round(pricePerBase(p) * 1000) / 1000 : null,
    baseUnit: p.salesUnit.base,
    source: p.price > 0 ? 'simulator' : 'unknown',
    simulated: p.price > 0,
  };
  const contains = p.allergensContain ?? (p.allergens ? p.allergens.filter((a) => !a.mayContain).map((a) => a.code) : null);
  const may = p.allergensMayContain ?? (p.allergens ? p.allergens.filter((a) => a.mayContain).map((a) => a.code) : null);
  const label = (code: string) => p.allergens?.find((a) => a.code === code)?.label.replace(/ \(may contain\)$/, '') ?? code;
  return {
    code: p.code,
    name: p.name,
    names: { en: p.name, fi: p.nameFi ?? null, sv: p.nameSv ?? null },
    brand: p.brand ?? null,
    category: p.category,
    categoryId: p.categoryId ?? null,
    categoryCode: p.categoryCode,
    group: p.group,
    vendor: p.vendor,
    origin: p.origin,
    temperatureClass: p.temperature,
    temperatureCode: p.temperatureCode ?? null,
    salesUnit: {
      unit: p.salesUnit.name,
      contains: p.salesUnit.size,
      baseUnit: p.salesUnit.base,
      measureSource: p.measure?.source ?? 'sample',
      measureVerified: p.measure?.verified ?? false, // matches Valio's live comparison price (l / kg)
      variableWeight: p.measure?.variableWeight ?? false,
      baseUnitCode: p.baseUnitCode ?? null,
      baseUnitsPerSalesUnit: p.baseUnitsPerSalesUnit ?? null,
      allowedLotSize: p.allowedLotSize ?? null,
    },
    packaging: { perCase: p.perCase, perPallet: p.perPallet, units: p.units ?? null },
    listPrice: price,
    nutritionPer100g: p.nutrition ? { ...p.nutrition, LACS: p.lacs } : p.lacs === null ? null : { LACS: p.lacs },
    allergens: contains,
    allergenLabels: contains ? contains.map(label) : null,
    mayContain: may,
    mayContainLabels: may ? may.map(label) : null,
    allergenDetails: p.allergens ? p.allergens.map((a) => ({ code: a.code, label: label(a.code), level: a.mayContain ? 'MAY_CONTAIN' : 'CONTAINS' })) : null,
    valioSubstitutes: p.substitutes,
    deliveryReliability: p.reliability,
    co2eKgPerKg: p.co2eKgPerKg,
    sample: p.sample,
    flags: {
      lactoseFree: p.lacs === null ? null : p.lacs === 0,
      autoSelectable: autoSelectable(p),
      ...(autoSelectable(p)
        ? {}
        : { reason: `${p.lacs === null && p.allergens === null ? 'Lactose content and allergen data' : p.lacs === null ? 'Lactose content' : 'Allergen data'} missing — a person decides` }),
      ...(p.salesUnit.base === 'pcs' ? { measure: 'no litre / kg content known — order in pieces (sales units)' } : {}),
    },
  };
};
