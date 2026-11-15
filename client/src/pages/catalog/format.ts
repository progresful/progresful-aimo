import { Product } from '@/api/gateway';

/** Known facts about the full Valio product file (not the sample the gateway may serve). */
export const PRODUCT_FILE = { total: 17_546, withoutAllergens: 0.59, withValioSubstitutes: 189 };

export const eur = (n: number) => `€${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** LACS (lactose g/100 g) from the nutrition block; null when the product file has no value. */
export const lacsOf = (p: Product): number | null => {
  const v = p.nutritionPer100g?.LACS;
  return typeof v === 'number' ? v : null;
};

/** "Butter & spreads" stays; a code like "other.coffee-filters" reads "Other · coffee filters". */
export const categoryLabel = (c: string) => {
  if (!c) return 'Uncategorised';
  if (/^[a-z]+$/.test(c)) return c.charAt(0).toUpperCase() + c.slice(1);
  if (!/^[a-z]+(\.[a-z0-9-]+)+$/.test(c)) return c;
  const [head, ...rest] = c.split('.');
  const tail = rest.join(' ').replace(/-/g, ' ');
  return `${head.charAt(0).toUpperCase()}${head.slice(1)} · ${tail}`;
};

const BASE: Record<string, string> = { l: 'l', kg: 'kg', pcs: 'pcs' };

/** Valio's (Finnish) unit codes in words. Unknown codes are shown as they are. */
const UNIT_WORDS: Record<string, string> = {
  KI: 'case',
  KRT: 'carton',
  BAG: 'bag',
  BOX: 'box',
  PCS: 'piece',
  CS: 'case',
  LTK: 'case',
  PAK: 'pack',
  KPL: 'piece',
  ST: 'piece',
  PCE: 'piece',
  PS: 'bag',
  PSS: 'bag',
  PLO: 'bottle',
  TLK: 'can',
  RS: 'box',
  RAS: 'box',
  PRK: 'tub',
  SÄK: 'sack',
  SK: 'sack',
  ASK: 'carton',
  TK: 'carton',
  KG: 'kg',
  L: 'l',
  LTR: 'l',
};

/** "KI" → "case"; already-friendly names pass through. */
export const unitWord = (u: string | null | undefined) => (u ? (UNIT_WORDS[u.toUpperCase()] ?? u) : '');

/** "carton · 1 l", "box · 10 l", "pack · 0.5 kg" — the sales unit and what it holds. */
export const salesUnitText = (p: Product) => {
  const su = p.salesUnit;
  if (!su) return '—';
  const n = su.contains;
  const amount =
    typeof n === 'number' && n > 0
      ? `${n.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${BASE[su.baseUnit] ?? su.baseUnit}`
      : null;
  const inner =
    su.baseUnitsPerSalesUnit && su.baseUnitsPerSalesUnit > 1 && su.baseUnitCode
      ? `${su.baseUnitsPerSalesUnit} × ${unitWord(su.baseUnitCode)}`
      : null;
  return [unitWord(su.unit), inner, amount].filter(Boolean).join(' · ');
};

/** List price, honest about where it came from: live from Valio, on quote, or simulated (sample). */
export type PriceSource = 'live' | 'unknown' | 'simulated' | 'listed' | 'not-fetched';

export const priceOf = (p: Product): { amount: number | null; per: string; perBase: number | null; source: PriceSource } => {
  const lp = p.listPrice;
  const amount = lp && typeof lp.amount === 'number' ? lp.amount : null;
  // No amount and no verdict yet: the price is asked from Valio when the product is opened.
  const source: PriceSource =
    lp?.source === 'unknown'
      ? 'unknown'
      : amount === null
        ? 'not-fetched'
        : lp?.source === 'live'
          ? 'live'
          : lp?.simulated
            ? 'simulated'
            : 'listed';
  return {
    amount,
    per: unitWord(lp?.per ?? p.salesUnit?.unit ?? ''),
    perBase: lp && typeof lp.perBaseUnit === 'number' ? lp.perBaseUnit : null,
    source,
  };
};
