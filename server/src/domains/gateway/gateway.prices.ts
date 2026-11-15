import logger from '../../services/logger.ts';
import type { ListPrice, Product } from './gateway.products.ts';
import { allProducts, pricePerBase, productByCode } from './gateway.products.ts';
import { addDays, localDay } from './gateway.time.ts';
import type { PriceInfo } from './valio.client.ts';
import { chargedPrice, fetchPrices, valioMode } from './valio.client.ts';

// Catalog list prices. Valio's product file has no prices, so the catalog
// shows Valio's live price for the products on screen: fetched on demand in
// one batch, cached 10 min per product (per sales unit, the unit Valio prices
// in). Quotes never use this cache — they always ask Valio afresh.
//
// Unit calibration: Valio's price API also returns a comparison price per L
// or KG, so `price ÷ comparison price` = litres / kg in one sales unit, by
// Valio's own reckoning. At startup (live mode) the whole catalog is priced
// once (≈18 requests) and every product's litres-or-kg per sales unit is
// checked against it; where the file-derived size disagrees (or is unknown),
// Valio's figure wins (measure.source = 'valio-price').

const TTL_MS = 10 * 60_000;
const FAIL_TTL_MS = 60_000;

type Entry = { at: number; price: PriceInfo | null };
const cache = new Map<string, Entry>();

const priceDate = () => addDays(localDay(), 1);

const remember = (codes: string[], prices: PriceInfo[], at = Date.now()) => {
  const by = new Map(prices.map((p) => [p.code, p]));
  for (const code of codes) cache.set(code, { at, price: by.get(code) ?? null });
};

const fresh = (e: Entry | undefined, now: number) => !!e && now - e.at < (e.price ? TTL_MS : FAIL_TTL_MS);

/** Live (or cached) list prices for `codes` — simulator prices without an API key; never throws (unknown on failure). */
export const listPrices = async (codes: string[]): Promise<Map<string, ListPrice>> => {
  const now = Date.now();
  const out = new Map<string, ListPrice>();
  if (valioMode() !== 'live') {
    const sim = new Map((await fetchPrices(codes, priceDate(), 'simulator')).map((p) => [p.code, p]));
    for (const code of codes) {
      const p = productByCode(code);
      if (p) out.set(code, listPriceOf(p, sim.get(code) ?? null, null, 'simulator'));
    }
    return out;
  }
  const missing = [...new Set(codes)].filter((c) => !fresh(cache.get(c), now) && productByCode(c));
  if (missing.length) {
    try {
      remember(missing, await fetchPrices(missing, priceDate(), 'live'));
    } catch (err) {
      logger.warn(`Gateway: list prices unavailable (${(err as Error).message})`);
      for (const c of missing) cache.set(c, { at: now - TTL_MS + FAIL_TTL_MS, price: null });
    }
  }
  for (const code of codes) {
    const p = productByCode(code);
    const e = cache.get(code);
    if (p) out.set(code, listPriceOf(p, e?.price ?? null, e ? new Date(e.at).toISOString() : null, 'live'));
  }
  return out;
};

export const listPriceOf = (p: Product, price: PriceInfo | null, fetchedAt: string | null, source: 'live' | 'simulator'): ListPrice => {
  const amount = chargedPrice(price ?? undefined) ?? null;
  if (amount !== null && amount > 0)
    return { amount, currency: 'EUR', per: p.salesUnit.name, perBaseUnit: Math.round(pricePerBase(p, amount) * 1000) / 1000, baseUnit: p.salesUnit.base, source, simulated: source === 'simulator', fetchedAt };
  return { amount: null, currency: 'EUR', per: p.salesUnit.name, perBaseUnit: null, baseUnit: p.salesUnit.base, source: 'unknown', simulated: false, fetchedAt };
};

// --- Unit calibration --------------------------------------------------------------

/** The roundest number inside [lo, hi] (comparison prices are rounded to cents). */
export const roundest = (lo: number, hi: number) => {
  for (const step of [10, 5, 1, 0.5, 0.25, 0.1, 0.05, 0.01, 0.005, 0.001]) {
    const v = Math.ceil(lo / step - 1e-9) * step;
    if (v <= hi + 1e-9 && v > 0) return Math.round(v * 1000) / 1000;
  }
  return Math.round(((lo + hi) / 2) * 1000) / 1000;
};

/** Litres / kg per sales unit implied by a Valio price row, or null. */
export const impliedSize = (price: PriceInfo) => {
  const amount = chargedPrice(price);
  const cmp = price.comparisonPrice;
  const unit = price.comparisonUnit === 'l' ? 'l' : price.comparisonUnit === 'kg' ? 'kg' : null;
  if (!unit || !amount || !cmp || cmp <= 0.005) return null;
  return { base: unit as 'l' | 'kg', lo: amount / (cmp + 0.005), hi: amount / (cmp - 0.005), mid: amount / cmp };
};

/** Checks one product's size against Valio's comparison price; corrects it when it's off. Returns what happened. */
export const calibrate = (p: Product, price: PriceInfo): 'verified' | 'corrected' | 'skipped' => {
  const implied = impliedSize(price);
  if (!implied) return 'skipped';
  const { base, lo, hi } = implied;
  if (p.salesUnit.base === base && p.salesUnit.size >= lo * 0.97 && p.salesUnit.size <= hi * 1.03) {
    if (p.measure) p.measure.verified = true;
    return 'verified';
  }
  p.salesUnit = { ...p.salesUnit, base, size: roundest(lo, hi) };
  p.measure = { source: 'valio-price', perBaseUnit: null, variableWeight: p.measure?.variableWeight ?? false, verified: true };
  return 'corrected';
};

let calibration: Promise<{ verified: number; corrected: number; skipped: number; priced: number }> | null = null;

/** Prices the whole catalog once (live mode only) and calibrates units. Safe to call repeatedly. */
export const calibrateCatalog = () =>
  (calibration ??= (async () => {
    const stats = { verified: 0, corrected: 0, skipped: 0, priced: 0 };
    const products = allProducts();
    if (valioMode() !== 'live' || products.every((p) => p.sample || p.price > 0)) return stats;
    const started = Date.now();
    const codes = products.map((p) => p.code);
    const BATCH = 1000;
    const batches = Array.from({ length: Math.ceil(codes.length / BATCH) }, (_, i) => codes.slice(i * BATCH, (i + 1) * BATCH));
    const at = Date.now();
    for (let i = 0; i < batches.length; i += 4) {
      const results = await Promise.all(batches.slice(i, i + 4).map((b) => fetchPrices(b, priceDate(), 'live').catch(() => [] as PriceInfo[])));
      results.forEach((prices, j) => {
        remember(batches[i + j], prices, at);
        for (const price of prices) {
          const p = productByCode(price.code);
          if (!p) continue;
          stats.priced++;
          stats[calibrate(p, price)]++;
        }
      });
    }
    logger.info(`Gateway: priced ${stats.priced} products live in ${Date.now() - started} ms — units verified ${stats.verified}, corrected ${stats.corrected}, no comparison unit ${stats.skipped}`);
    return stats;
  })().catch((err) => {
    logger.warn(`Gateway: unit calibration failed (${(err as Error).message})`);
    calibration = null;
    return { verified: 0, corrected: 0, skipped: 0, priced: 0 };
  }));
