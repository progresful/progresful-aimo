import type { Allergen, BaseUnit, MeasureSource, Product } from './gateway.products.ts';
import { deriveCategories, productCategory } from './gateway.categories.ts';
import { GS1_ALLERGENS } from './policy.describe.ts';

// Valio's product file (valio_aimo_junction26_product_data.json, see its
// schema) → the gateway's Product. Pure: the loader in gateway.products.ts
// reads the files. Mapping decisions:
//
//  • Units. `salesUnit` / `baseUnit` are SAP codes (KI, ST, KG, PAK…);
//    `units[]` says how many base units each holds. Litres or kg per sales
//    unit = content of one base unit × the sales unit's sizeInBaseUnits.
//    Content of one base unit, in order of trust:
//      1. base unit KG → 1 kg (also variable-weight goods);
//      2. synkka unitConversions BASE_UNIT_OR_EACH volume / netWeight of the
//         consumer unit (the unit whose GTIN is synkkaData.gtin), divided by
//         that unit's sizeInBaseUnits;
//      3. the size in the product name ("1 l", "e900 g", "2x2kg", "3,3 dl")
//         for the consumer unit.
//    The name's dimension (l vs kg) picks volume or weight when both exist;
//    else weight. Nothing usable → base 'pcs' (1 per sales unit) and
//    measure.source 'none' — litre / kg requests are then refused (422).
//  • Allergens. classifications "allergen": CONTAINS → allergens;
//    MAY_CONTAIN → mayContain AND allergens (fail safe for exclusion rules);
//    UNDECLARED ignored. No allergen values at all → null (fails closed).
//  • Nutrition per 100 g / ml from nutritionalContent (scaled when the basis
//    isn't 100), else the nutritionFact classification. LACS → `lacs`.
//  • Category: semantic code by majority vote per numeric category (see
//    gateway.categories.ts); the numeric code is kept as categoryId.
//  • Temperature: temperatureCondition codes have no names; by the products'
//    storage ranges 1–5 = chilled, 6 = cool, 7 = frozen, 8 = ambient.

export type ValioExtras = { reliability: Map<string, number>; carbon: Map<string, number> };

const TEMPERATURE: Record<string, string> = { '1': 'chilled', '2': 'chilled', '3': 'chilled', '4': 'chilled', '5': 'chilled', '6': 'cool', '7': 'frozen', '8': 'ambient' };

const VOLUME_L: Record<string, number> = { LTR: 1, MLT: 0.001, CLT: 0.01, DLT: 0.1, MTQ: 1000 };
const WEIGHT_KG: Record<string, number> = { KGM: 1, GRM: 0.001, MGM: 0.000001 };
const NAME_UNIT: Record<string, [BaseUnit, number]> = { l: ['l', 1], ltr: ['l', 1], lt: ['l', 1], dl: ['l', 0.1], cl: ['l', 0.01], ml: ['l', 0.001], kg: ['kg', 1], g: ['kg', 0.001], gr: ['kg', 0.001] };

const CASE_UNITS = ['KI', 'KRT', 'CS', 'LTK'];

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const num = (s: string) => Number(s.replace(',', '.'));

export const nameIn = (r: any, lang: string): string | null => {
  const hit = (r.synkkaData?.names ?? []).find((n: any) => n.language === lang && typeof n.value === 'string' && n.value.trim());
  return hit ? String(hit.value).replace(/\s+/g, ' ').trim() : null;
};

const UNIT_RE = '(kg|gr|g|ltr|lt|l|dl|cl|ml)(?![a-zäö])';
const AMOUNT_RE = '(\\d+(?:[.,]\\d+)?)';

/**
 * Size in a product name: item size (litres / kg) and how many items, when
 * the name says so. "1 l" → 1 l; "e900 g" → 0.9 kg; "8x500g" / "6 x … 265/150 g"
 * / "48pcs 100g" → 8 × 0.5 kg …; "265/150 g" (net / drained) → 0.265 kg.
 */
export const sizeFromName = (name: string): { base: BaseUnit; amount: number; count: number | null } | null => {
  const n = name.toLowerCase().replace(/(\d)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)\b/g, '$1$3'); // "265/150 g" → "265g"
  const multi = new RegExp(`(?:^|[\\s(/])(\\d+)\\s*[x×]\\s*e?${AMOUNT_RE}\\s*${UNIT_RE}`).exec(n);
  if (multi) {
    const [base, factor] = NAME_UNIT[multi[3]];
    const amount = round(num(multi[2]) * factor, 6);
    return amount > 0 ? { base, amount, count: Number(multi[1]) } : null;
  }
  const single = new RegExp(`(?:^|[\\s(/~á])(?:e|n\\.?|ca\\.?|app?r?\\.?\\s?|about\\s)?${AMOUNT_RE}\\s*${UNIT_RE}`).exec(n);
  if (!single) return null;
  const [base, factor] = NAME_UNIT[single[2]];
  const amount = round(num(single[1]) * factor, 6);
  if (!(amount > 0)) return null;
  // "12 x Abba … 1 kg", "75x JEPO … 6kg", "Croissant 48pcs 100g", "250x2,5g" handled above.
  const count = /^\s*(\d+)\s*[x×]\s/.exec(n) ?? /\b(\d+)\s*(?:pcs|pc|kpl|pieces|portions?)\b/.exec(n);
  return { base, amount, count: count && Number(count[1]) > 1 ? Number(count[1]) : null };
};

type Measure = { base: BaseUnit; perBaseUnit: number; source: MeasureSource } | null;

/**
 * Litres or kg in ONE base unit of the product. A name with a count ("8x500g")
 * describes a unit holding that many base units when one exists (→ 500 g per
 * base unit), else the sales unit as a whole.
 */
const measureOf = (r: any, nameEn: string, nameFi: string, salesInBase: number): Measure => {
  const units: any[] = r.units ?? [];
  if (r.baseUnit === 'KG') return { base: 'kg', perBaseUnit: 1, source: 'unit' };
  const synkka = r.synkkaData ?? {};
  const hint = sizeFromName(nameEn) ?? sizeFromName(nameFi);
  const consumerUnit = units.find((u) => u.gtin && u.gtin === synkka.gtin);
  const consumerSize = Number(consumerUnit?.sizeInBaseUnits) > 0 ? Number(consumerUnit.sizeInBaseUnits) : 1;
  let fromName: number | null = null;
  if (hint) {
    if (!hint.count) fromName = hint.amount / consumerSize;
    else if (hint.count === salesInBase || units.some((u) => Number(u.sizeInBaseUnits) === hint.count)) fromName = hint.amount;
    else fromName = (hint.amount * hint.count) / salesInBase;
  }
  const each = (synkka.unitConversions ?? []).find((u: any) => u.synkkaPackagingType === 'BASE_UNIT_OR_EACH');
  const volume = each?.volume && VOLUME_L[each.volume.unit] && each.volume.value > 0 ? each.volume.value * VOLUME_L[each.volume.unit] : null;
  const weight = each?.netWeight && WEIGHT_KG[each.netWeight.unit] && each.netWeight.value > 0 ? each.netWeight.value * WEIGHT_KG[each.netWeight.unit] : null;
  const want: BaseUnit | null = hint?.base ?? null;
  const raw = want === 'l' ? volume : want === 'kg' ? weight : (weight ?? volume);
  const fromSynkka = raw ? raw / consumerSize : null;
  // Synkka wins unless the name disagrees by more than 3× (unit slips like 1 kg filed as 1000 kg).
  if (fromSynkka && (!fromName || (fromSynkka / fromName < 3 && fromName / fromSynkka < 3))) return { base: want ?? (weight ? 'kg' : 'l'), perBaseUnit: round(fromSynkka, 6), source: 'synkka' };
  if (fromName && hint) return { base: hint.base, perBaseUnit: round(fromName, 6), source: 'name' };
  return null;
};

const sizeOfUnit = (r: any, unitId: string) => {
  if (unitId === r.baseUnit) return 1;
  const u = (r.units ?? []).find((x: any) => x.unitId === unitId);
  return Number(u?.sizeInBaseUnits) > 0 ? Number(u.sizeInBaseUnits) : null;
};

const classification = (r: any, name: string): any[] => (r.synkkaData?.classifications ?? []).find((c: any) => c.name === name)?.values ?? [];

const allergenLabel = (code: string, may = false) => `${GS1_ALLERGENS[code] ? GS1_ALLERGENS[code].replace(/ \(.*\)$/, '') : code}${may ? ' (may contain)' : ''}`;

const allergensOf = (r: any) => {
  const values = classification(r, 'allergen').filter((v) => v.id && (v.unit === 'CONTAINS' || v.unit === 'MAY_CONTAIN'));
  if (!values.length) return { allergens: null, contains: null, mayContain: null };
  const contains = [...new Set(values.filter((v) => v.unit === 'CONTAINS').map((v) => String(v.id).toUpperCase()))];
  const may = [...new Set(values.filter((v) => v.unit === 'MAY_CONTAIN').map((v) => String(v.id).toUpperCase()))].filter((c) => !contains.includes(c));
  const allergens: Allergen[] = [...contains.map((code) => ({ code, label: allergenLabel(code) })), ...may.map((code) => ({ code, label: allergenLabel(code, true), mayContain: true }))];
  return { allergens, contains, mayContain: may };
};

const BASIS_UNITS = new Set(['GRM', 'MLT']);

const nutritionOf = (r: any): Record<string, number> | null => {
  const out: Record<string, number> = {};
  for (const n of r.synkkaData?.nutritionalContent ?? []) {
    if (!n?.id || typeof n.value !== 'number' || !BASIS_UNITS.has(n.basisQuantityUnit) || !(n.basisQuantity > 0)) continue;
    out[String(n.id)] = round((n.value * 100) / n.basisQuantity, 4);
  }
  if (!Object.keys(out).length) {
    for (const v of classification(r, 'nutritionFact')) if (v?.id && typeof v.value === 'number') out[String(v.id)] = v.value;
  }
  return Object.keys(out).length ? out : null;
};

const titleVendor = (v: string) => v.replace(/\s+/g, ' ').trim();

/** Maps every record; categories are derived across the whole file. */
export const mapValioRecords = (records: any[], extras: ValioExtras): Product[] => {
  const rows = records.filter((r) => r && r.id && r.deleted !== true);
  const names = rows.map((r) => ({ en: nameIn(r, 'en'), fi: nameIn(r, 'fi'), sv: nameIn(r, 'sv') }));
  const { categories, tags } = deriveCategories(rows.map((r, i) => ({ categoryId: String(r.category ?? ''), en: names[i].en ?? '', fi: names[i].fi ?? '' })));
  return rows.map((r, i): Product => {
    const code = String(r.id);
    const { en, fi, sv } = names[i];
    const name = en ?? fi ?? sv ?? code;
    const categoryId = String(r.category ?? '');
    const categoryCode = productCategory(categories.get(categoryId)?.code ?? 'other.unknown', tags[i], name);
    const salesInBase = sizeOfUnit(r, r.salesUnit) ?? 1;
    const measure = measureOf(r, en ?? '', fi ?? '', salesInBase);
    const size = measure ? round(measure.perBaseUnit * salesInBase, 4) : 1;
    const caseUnit = CASE_UNITS.includes(r.salesUnit) ? null : (r.units ?? []).filter((u: any) => CASE_UNITS.includes(u.unitId) && u.sizeInBaseUnits > salesInBase).sort((a: any, b: any) => a.sizeInBaseUnits - b.sizeInBaseUnits)[0];
    const pallet = (r.units ?? []).find((u: any) => u.unitId === 'PAL');
    const nutrition = nutritionOf(r);
    const lacs = nutrition && typeof nutrition.LACS === 'number' ? nutrition.LACS : null;
    if (nutrition) delete nutrition.LACS;
    const { allergens, contains, mayContain } = allergensOf(r);
    const subs = (r.substitutions ?? []).filter((s: any) => s?.substituteProduct && String(s.product ?? code) === code).map((s: any) => String(s.substituteProduct));
    return {
      code,
      name,
      nameFi: fi,
      nameSv: sv,
      brand: r.synkkaData?.brand ? String(r.synkkaData.brand) : null,
      category: categories.get(categoryId)?.label ?? categoryCode,
      categoryId,
      categoryCode,
      group: categoryCode,
      vendor: titleVendor(String(r.vendorName ?? '')),
      origin: r.countryOfOrigin ? String(r.countryOfOrigin).toUpperCase() : '',
      temperature: TEMPERATURE[String(r.temperatureCondition)] ?? '',
      temperatureCode: r.temperatureCondition === undefined ? null : String(r.temperatureCondition),
      salesUnit: { name: String(r.salesUnit), size: measure && size > 0 ? size : 1, base: measure && size > 0 ? measure.base : 'pcs' },
      baseUnitCode: String(r.baseUnit ?? r.salesUnit),
      baseUnitsPerSalesUnit: salesInBase,
      measure: { source: measure && size > 0 ? measure.source : 'none', perBaseUnit: measure?.perBaseUnit ?? null, variableWeight: r.synkkaData?.variableUnit === true || r.salesUnit === 'KG' },
      units: (r.units ?? []).map((u: any) => ({ unit: String(u.unitId), baseUnits: Number(u.sizeInBaseUnits) })),
      allowedLotSize: typeof r.allowedLotSize === 'number' ? r.allowedLotSize : null,
      perCase: caseUnit ? Math.max(1, Math.round(caseUnit.sizeInBaseUnits / salesInBase)) : 1,
      perPallet: pallet ? Math.max(1, Math.round(pallet.sizeInBaseUnits / salesInBase)) : null,
      price: 0,
      lacs,
      nutrition,
      allergens,
      allergensContain: contains,
      allergensMayContain: mayContain,
      substitutes: [...new Set(subs)] as string[],
      reliability: extras.reliability.get(code) ?? null,
      co2eKgPerKg: extras.carbon.get(code) ?? null,
      sample: false,
    };
  });
};
