import net from 'node:net';
import { AppError } from '../../utils/AppError.ts';
import { productByCode } from './gateway.products.ts';
import { addDays } from './gateway.time.ts';

// Valio Aimo upstream: POST /api/price and POST /api/availability with body
// { customer, requestedDate, products: [codes] } and an X-API-Key header.
// Real HTTP when VALIO_API_URL + VALIO_API_KEY are set; otherwise a
// deterministic simulator that reproduces the demo story. Both are normalised
// into the shapes below.

export type PriceInfo = {
  code: string;
  currency: 'EUR';
  catalogPrice: number | null;
  listPrice: number; // per sales unit, before tax
  priceWithTax: number | null;
  taxPercent: number | null;
  comparisonPrice: number | null; // per base unit (l / kg)
  comparisonUnit: string | null;
  validFrom: string | null;
  validTo: string | null;
};

export type DeliveryLine = { date: string; amount: number; salesUnit: string };

export type AvailabilityInfo = {
  code: string;
  salesBlock: string | null; // null = can be sold
  closingTime: string | null; // order cut-off for the requested date (ISO from Valio, "14:00" in the simulator)
  /** The cut-off has passed: nothing can be ordered for the requested date any more. */
  cutoffPassed: boolean;
  logisticModel: string | null; // Valio: "Stock" (own warehouse) or "Terminal" (ordered in from the producer)
  deliveries: DeliveryLine[];
  /** Set when a demo scenario capped this product's stock (Valio's mock API never runs out). */
  simulatedCap?: number;
};

export type ValioMode = 'live' | 'simulator';

const BATCH = 1000;
const API_URL = () => process.env.VALIO_API_URL?.replace(/\/$/, '');
const API_KEY = () => process.env.VALIO_API_KEY;
const CUSTOMER = () => process.env.VALIO_CUSTOMER || 'DEMO-HUS-W4';

export const valioMode = (): ValioMode => (API_URL() && API_KEY() ? 'live' : 'simulator');

const chunks = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

// --- Live HTTP ----------------------------------------------------------------

// Node tries each of the host's addresses for only 250 ms by default; on a slow network every
// attempt times out ("fetch failed … ETIMEDOUT" in about half a second). Give each one longer.
net.setDefaultAutoSelectFamilyAttemptTimeout(2_000);

/** Valio didn't answer (network down, timeout, or a 5xx). 503 with a plain message. */
export class ValioUnavailable extends AppError {
  constructor(cause: string) {
    super('Valio Aimo isn’t answering right now — try again in a moment', 503, { cause });
  }
}

const once = async (path: string, body: unknown) => {
  const res = await fetch(`${API_URL()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-Key': API_KEY()! },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status >= 500) throw new ValioUnavailable(`${path} → HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Valio ${path} → HTTP ${res.status}`);
  return res.json();
};

/** After Valio failed to answer, calls fail fast for this long instead of waiting on timeouts again. */
const DOWN_FOR_MS = 30_000;
let downUntil = 0;

/** One retry when Valio can't be reached; then ValioUnavailable (and fail fast for a while). */
const post = async (path: string, body: unknown) => {
  if (Date.now() < downUntil) throw new ValioUnavailable(`${path}: not answering (retrying after ${new Date(downUntil).toISOString()})`);
  for (let attempt = 1; ; attempt++) {
    try {
      const json = await once(path, body);
      downUntil = 0;
      return json;
    } catch (err) {
      const unreachable = err instanceof ValioUnavailable || (err as Error).name === 'TimeoutError' || (err as Error).message === 'fetch failed';
      if (!unreachable) throw err;
      if (attempt >= 2) {
        downUntil = Date.now() + DOWN_FOR_MS;
        throw err instanceof ValioUnavailable ? err : new ValioUnavailable(`${path}: ${(err as Error).cause ?? (err as Error).message}`);
      }
    }
  }
};

// The ONLY place that knows Valio's response shape — everything else uses
// PriceInfo / AvailabilityInfo. Field names verified against live responses
// (2026-11-14): price rows carry { productId, catalogPrice, listPrice,
// priceWithTax, comparisonPrice: { value, valueWithTax, validFrom, validTo },
// comparisonUnit, tax: { taxRate }, error }; availability rows carry
// { productId, closingTime, salesBlock, logisticModel, scheduleLines:
// [{ salesBlock, availableAmount, availableDate, salesUnit }] }.
const value = (o: any) => (typeof o?.value === 'number' ? o.value : null);
const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : null);

export const mapValioResponses = {
  price: (json: any): PriceInfo[] =>
    (json?.products ?? [])
      .filter((r: any) => !r.error)
      .map((r: any) => {
        const valid = r.catalogPrice ?? r.listPrice;
        return {
          code: String(r.productId),
          currency: 'EUR',
          catalogPrice: value(r.catalogPrice),
          listPrice: value(r.listPrice) ?? value(r.catalogPrice) ?? 0,
          priceWithTax: value(r.priceWithTax),
          taxPercent: typeof r.tax?.taxRate === 'number' ? r.tax.taxRate : null,
          comparisonPrice: value(r.comparisonPrice),
          comparisonUnit: r.comparisonUnit ? String(r.comparisonUnit).toLowerCase() : null,
          validFrom: dateOnly(valid?.validFrom),
          validTo: dateOnly(valid?.validTo),
        };
      }),
  availability: (json: any, now = Date.now()): AvailabilityInfo[] =>
    (json?.products ?? []).map((r: any) => ({
      code: String(r.productId),
      salesBlock: r.salesBlock ? 'Sales block' : null,
      closingTime: r.closingTime ?? null,
      cutoffPassed: !!r.closingTime && Date.parse(r.closingTime) < now,
      logisticModel: r.logisticModel ?? null,
      deliveries: (r.scheduleLines ?? [])
        .filter((d: any) => !d.salesBlock)
        .map((d: any) => ({ date: dateOnly(d.availableDate)!, amount: Number(d.availableAmount ?? 0), salesUnit: String(d.salesUnit ?? '') })),
    })),
};

/** What the buyer pays per sales unit: the customer's net catalog price, else the list price. */
export const chargedPrice = (p: PriceInfo | undefined) => (p ? (p.catalogPrice ?? p.listPrice) : undefined);

/** Caps deliverable stock per product (demo disruption on top of live data). */
export const applyStockCaps = (items: AvailabilityInfo[], caps: Record<string, number> = {}) =>
  items.map((a) => {
    const cap = caps[a.code];
    if (cap === undefined) return a;
    let left = cap;
    const deliveries = a.deliveries.map((d) => {
      const amount = Math.min(d.amount, left);
      left -= amount;
      return { ...d, amount };
    });
    return { ...a, deliveries, simulatedCap: cap };
  });

/** Last price Valio's live API quoted per code (feeds the simulator; see simPrice). */
const lastLive = new Map<string, number>();

const live = {
  price: async (codes: string[], requestedDate: string) => {
    const out: PriceInfo[] = [];
    for (const batch of chunks(codes, BATCH)) out.push(...mapValioResponses.price(await post('/api/price', { customer: CUSTOMER(), requestedDate, products: batch })));
    for (const p of out) {
      const amount = chargedPrice(p);
      if (amount && amount > 0) lastLive.set(p.code, amount);
    }
    return out;
  },
  availability: async (codes: string[], requestedDate: string) => {
    const out: AvailabilityInfo[] = [];
    for (const batch of chunks(codes, BATCH))
      out.push(...mapValioResponses.availability(await post('/api/availability', { customer: CUSTOMER(), requestedDate, products: batch })));
    return out;
  },
  ping: async () => {
    const started = Date.now();
    const res = await fetch(`${API_URL()}/api/ping`, { headers: { 'X-API-Key': API_KEY()! }, signal: AbortSignal.timeout(5000) });
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - started };
  },
};

// --- Simulator ----------------------------------------------------------------
// Stock per delivery day, in sales units. "Plenty" unless listed. 464398 has
// 600 cartons per day (the stock-out story); the 10 l box 463038 only delivers
// from Wed 18 Nov 2026; 464128 (whipping vanilla sauce 9 % 1 l) is
// sales-blocked to show that path.

const PLENTY = 5000;
const SIM_STOCK: Record<string, { perDay?: number; from?: string; salesBlock?: string }> = {
  '464398': { perDay: 600 },
  '463038': { from: '2026-11-18' },
  '464128': { salesBlock: 'Temporarily delisted (simulated)' },
};
const VAT = 14; // Finnish food VAT %, 2026

// Simulator prices (EUR per SALES unit), first match wins:
// 1. the sample catalog's own price;
// 2. lastLive: the price Valio's live API last quoted for the code here
//    (the seed prices the whole catalog live before backfilling history);
// 3. REFERENCE_PRICES — Valio's live prices of 2026-11-14 for the real
//    products the demo seed uses (real catalog without an API key);
// 4. a per-category default per litre / kg / piece × the sales unit's size.
const REFERENCE_PRICES: Record<string, number> = {
  '464398': 1.65, // Eila semi-skimmed 1 l (ST)
  '463335': 1.4, // Eila 3 % 1 l (ST)
  '463038': 31.31, // Eila semi-skimmed 10 l novobox (KI = 2 × 10 l)
  '463359': 4.72, // semi-skimmed milk 1 l (KI = 5 × 1 l)
  '464249': 2.63, // cooking cream 15 % 1 l lactose free (ST)
  '464194': 3.91, // whipping cream 1 l lactose free (ST)
  '476824': 2.15, // A+ natural yoghurt 1 kg lactose free (ST)
  '476578': 0.74, // Bulgarian yoghurt 200 g (ST)
  '477044': 16.03, // quark 5 kg lactose free (ST)
  '462616': 8.57, // Edam 17 % e1 kg slices (ST)
  '462584': 11.01, // Oltermanni e900 g slices (ST)
  '469671': 27.34, // Castelli Parmigiano Reggiano shavings 1 kg (ST, no allergen / LACS data)
  '471715': 2.05, // Flora lactose & dairy free spread 400 g (ST, no allergen / LACS data)
  '468465': 1.17, // Oddlygood oat drink 1 l (ST)
  '470832': 41.09, // Pehmo soft ice cream mix (KI = 10 × 1 l)
};

/** EUR per litre / kg / piece when nothing better is known. */
const CATEGORY_DEFAULTS: [prefix: string, perBase: number][] = [
  ['dairy.milk', 1.5],
  ['dairy.cream', 4],
  ['dairy.yoghurt', 3],
  ['dairy.cheese', 12],
  ['dairy.butter', 9],
  ['dairy.desserts', 5],
  ['plant.', 2.5],
  ['', 6],
];

const simPrice = (code: string) => {
  const p = productByCode(code);
  if (!p) return null;
  if (p.price > 0) return p.price;
  const known = lastLive.get(code) ?? REFERENCE_PRICES[code];
  if (known !== undefined) return known;
  const perBase = CATEGORY_DEFAULTS.find(([prefix]) => p.categoryCode.startsWith(prefix))![1];
  return Math.round(perBase * p.salesUnit.size * 100) / 100;
};

const simulator = {
  price: async (codes: string[], requestedDate: string): Promise<PriceInfo[]> =>
    codes.flatMap((code) => {
      const p = productByCode(code);
      const price = simPrice(code);
      if (!p || price === null) return [];
      return [
        {
          code,
          currency: 'EUR',
          catalogPrice: price,
          listPrice: price,
          priceWithTax: Math.round(price * (100 + VAT)) / 100,
          taxPercent: VAT,
          comparisonPrice: Math.round((price / p.salesUnit.size) * 100) / 100,
          comparisonUnit: p.salesUnit.base,
          validFrom: addDays(requestedDate, -30),
          validTo: addDays(requestedDate, 60),
        },
      ];
    }),
  availability: async (codes: string[], requestedDate: string): Promise<AvailabilityInfo[]> =>
    codes.flatMap((code) => {
      const p = productByCode(code);
      if (!p) return [];
      const rule = SIM_STOCK[code] ?? {};
      const date = rule.from && rule.from > requestedDate ? rule.from : requestedDate;
      return [
        {
          code,
          salesBlock: rule.salesBlock ?? null,
          closingTime: '14:00',
          cutoffPassed: false,
          logisticModel: 'Stock',
          deliveries: rule.salesBlock ? [] : [{ date, amount: rule.perDay ?? PLENTY, salesUnit: p.salesUnit.name }],
        },
      ];
    }),
  ping: async () => ({ ok: true, status: 200, latencyMs: 0 }),
};

const client = (mode: ValioMode = valioMode()) => (mode === 'live' ? live : simulator);

// `mode` lets backfilled history use the simulator: past dates can't be re-quoted live.
export const fetchPrices = (codes: string[], requestedDate: string, mode?: ValioMode) => client(mode).price([...new Set(codes)], requestedDate);
export const fetchAvailability = (codes: string[], requestedDate: string, mode?: ValioMode) => client(mode).availability([...new Set(codes)], requestedDate);
export const pingValio = async () => {
  try {
    return { mode: valioMode(), ...(await client().ping()) };
  } catch (err) {
    return { mode: valioMode(), ok: false, status: 0, latencyMs: null, error: (err as Error).message };
  }
};

const orderable = (a: AvailabilityInfo | undefined): a is AvailabilityInfo => !!a && !a.salesBlock && !a.cutoffPassed;

/** Sales units deliverable on or before `date` (0 once the order cut-off has passed). */
export const availableBy = (a: AvailabilityInfo | undefined, date: string) =>
  orderable(a) ? a.deliveries.filter((d) => d.date <= date).reduce((s, d) => s + d.amount, 0) : 0;

/** Earliest delivery date with any stock, or null. */
export const earliestDelivery = (a: AvailabilityInfo | undefined) =>
  orderable(a) ? (a.deliveries.filter((d) => d.amount > 0).map((d) => d.date).sort()[0] ?? null) : null;

/** The passed order cut-off (ISO), when that's why a product can't make the requested date. */
export const passedCutoff = (a: AvailabilityInfo | undefined) => (a?.cutoffPassed ? a.closingTime : null);
