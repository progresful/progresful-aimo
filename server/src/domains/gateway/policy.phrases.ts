// Shared plain-language phrase detectors (rule-based, no I/O). Used by the
// policy compiler (whole policy text) and the single-rule drafter.

export const DAIRY = ['dairy.milk', 'dairy.yoghurt', 'dairy.cheese', 'dairy.butter', 'dairy.cream'];

export const CATEGORY_WORDS: [RegExp, string[]][] = [
  [/\bdairy\b/i, DAIRY],
  [/\bmilk\b/i, ['dairy.milk']],
  [/\bcream\b/i, ['dairy.cream']],
  [/\b(yoghurt|yogurt|quark)\b/i, ['dairy.yoghurt']],
  [/\bcheese\b/i, ['dairy.cheese']],
  [/\b(butter|spreads?)\b/i, ['dairy.butter']],
  [/\bdesserts?\b|ice cream/i, ['dairy.desserts']],
  [/\b(plant-based|oat drink)\b/i, ['plant.drinks']],
  [/\bflour\b/i, ['dry.flour']],
  [/\b(oats|cereals?)\b/i, ['dry.cereals']],
  [/\bpasta\b/i, ['dry.pasta']],
  [/\brice\b/i, ['dry.rice']],
  [/\bpastr(y|ies)\b/i, ['bakery.pastries']],
  [/\b(coffee|tea)\b/i, ['beverages.coffee']],
  [/\bjuices?\b/i, ['beverages.juice']],
  [/\bfruit\b/i, ['produce.fruit']],
  [/\bbread\b/i, ['bakery.bread']],
  [/\b(vegetables?|veg)\b/i, ['produce.vegetables']],
  [/\bmeat\b/i, ['meat']],
];

export const TAXONOMY = [...new Set(CATEGORY_WORDS.flatMap(([, c]) => c))];

export const categoriesIn = (text: string) => [...new Set(CATEGORY_WORDS.filter(([re]) => re.test(text)).flatMap(([, codes]) => codes))];

// Country names / adjectives → ISO 3166-1 alpha-2.
export const COUNTRY_WORDS: [RegExp, string][] = [
  // The kitchen is in Finland: "local" / "domestic" / "home-grown" mean Finnish origin.
  [/\b(finland|finnish|domestic|local(?:ly)?|home[- ]?grown|kotimai\w*)\b/i, 'FI'],
  [/\b(sweden|swedish)\b/i, 'SE'],
  [/\b(norway|norwegian)\b/i, 'NO'],
  [/\b(denmark|danish)\b/i, 'DK'],
  [/\b(estonia|estonian)\b/i, 'EE'],
  [/\b(germany|german)\b/i, 'DE'],
  [/\b(netherlands|dutch|holland)\b/i, 'NL'],
  [/\b(france|french)\b/i, 'FR'],
  [/\b(italy|italian)\b/i, 'IT'],
  [/\b(spain|spanish)\b/i, 'ES'],
  [/\b(poland|polish)\b/i, 'PL'],
  [/\b(lithuania|lithuanian)\b/i, 'LT'],
  [/\b(latvia|latvian)\b/i, 'LV'],
];

export const countryIn = (text: string) => COUNTRY_WORDS.find(([re]) => re.test(text))?.[1] ?? null;

export const sentences = (text: string) => text.split(/(?<=[.;!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/** "ask me", "needs approval", "without Mikko" → a person decides rather than a block. */
export const SOFT_WORDS = /\b(ask|approv\w*|check with|confirm\w*|without (?!data\b)[a-z]+|sign[- ]?off|ok from|flag)\b/i;
export const isSoft = (text: string) => SOFT_WORDS.test(text);

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const toNum = (s: string) => Number(s.replace(',', '.'));

/** Origin restriction: "nothing from outside Finland", "only Finnish products", "nothing from Germany". */
export const detectOrigin = (text: string): { operator: '=' | '!='; value: string } | null => {
  const country = countryIn(text);
  if (!country) return null;
  if (/\boutside\b|\bonly\b|\bmust be (?:from|made)|\bexclusively\b|\bjust\b/i.test(text)) return { operator: '=', value: country };
  if (/\b(no|nothing|never|not|avoid|exclude)\b/i.test(text)) return { operator: '!=', value: country };
  // "made in Finland", or a bare "local" / "Finnish products" — a requirement.
  if (/\b(made|produced|grown|sourced)\s+(in|from)\b/i.test(text) || text.trim().split(/\s+/).length <= 3) return { operator: '=', value: country };
  return null;
};

const UNIT_WORDS: [RegExp, 'l' | 'kg' | 'pcs' | 'EUR'][] = [
  [/^(l|ltrs?|lit(?:re|er)s?)$/i, 'l'],
  [/^(kg|kgs|kilos?|kilograms?)$/i, 'kg'],
  [/^(pcs|pieces?|units?|packs?|cartons?|boxes?)$/i, 'pcs'],
  [/^(€|eur|euros?)$/i, 'EUR'],
];
const unitOf = (word: string | undefined) => (word ? (UNIT_WORDS.find(([re]) => re.test(word.trim()))?.[1] ?? null) : null);

/** "more than 50 kg of cheese", "no single line over 200 litres", "any line above €500". */
export const detectPerLine = (text: string, requireLineWord = false): { max: number; unit: 'l' | 'kg' | 'pcs' | 'EUR'; categories: string[] } | null => {
  if (requireLineWord && !/\b(line|single)\b/i.test(text)) return null;
  const re = new RegExp(String.raw`(?:over|more than|above|exceed\w*|greater than|>)\s*(€\s?)?${NUM}\s*(€|eur(?:os?)?|l\b|ltrs?\b|lit(?:re|er)s?|kgs?\b|kilo(?:gram)?s?|pcs\b|pieces?|units?|packs?|cartons?|boxes)?`, 'i');
  const m = text.match(re);
  if (!m) return null;
  const unit = m[1] ? 'EUR' : unitOf(m[3]);
  if (!unit) return null;
  // Spend per order / week isn't per line.
  if (unit === 'EUR' && !/\bline\b/i.test(text)) return null;
  if (/\bper (litre|liter|kg|kilo)\b/i.test(text)) return null;
  return { max: toNum(m[2]), unit, categories: categoriesIn(text.replace(/\bline\b/gi, '')) };
};

const DAY_WORDS: [RegExp, number][] = [
  [/\bmon(day)?s?\b/i, 1],
  [/\btue(s|sday)?s?\b/i, 2],
  [/\bwed(nesday)?s?\b/i, 3],
  [/\bthu(rs|rsday)?s?\b/i, 4],
  [/\bfri(day)?s?\b/i, 5],
  [/\bsat(urday)?s?\b/i, 6],
  [/\bsun(day)?s?\b/i, 7],
];
const DAY_NAME = String.raw`(mon|tue|wed|thu|fri|sat|sun)[a-z]*`;
const DAY_INDEX: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

/**
 * Which weekdays deliveries may arrive on. Needs a restriction ("only",
 * "never", "no … on") so "delivered on Friday" alone doesn't become a rule.
 */
export const detectDeliveryDays = (text: string): number[] | null => {
  if (!/\bdeliver/i.test(text)) return null;
  const negated = /\b(no|never|not|don't|avoid)\b/i.test(text);
  if (!negated && !/\bonly\b|\bjust\b|\bexclusively\b|\bmust\b/i.test(text)) return null;
  let days: number[] = [];
  const range = text.match(new RegExp(String.raw`\b${DAY_NAME}\s*(?:to|-|–|through|thru|until|till)\s*${DAY_NAME}`, 'i'));
  if (/\bweekdays?\b|working days?|business days?/i.test(text)) days = [1, 2, 3, 4, 5];
  else if (/\bweekends?\b/i.test(text)) days = [6, 7];
  else if (range) {
    const a = DAY_INDEX[range[1].toLowerCase()];
    const b = DAY_INDEX[range[2].toLowerCase()];
    for (let d = a; ; d = (d % 7) + 1) {
      days.push(d);
      if (d === b || days.length > 7) break;
    }
  } else days = DAY_WORDS.filter(([re]) => re.test(text)).map(([, d]) => d);
  if (!days.length) return null;
  if (negated) days = [1, 2, 3, 4, 5, 6, 7].filter((d) => !days.includes(d));
  return [...new Set(days)].sort((a, b) => a - b);
};

export const ALLERGEN_WORDS: [RegExp, string][] = [
  [/\bgluten\b/i, 'AW'],
  [/\bsoy(a|beans?)?\b/i, 'AY'],
  [/\b(milk protein|milk allergen|milk)\b/i, 'AM'],
  [/\beggs?\b/i, 'AE'],
  [/\bfish\b/i, 'AF'],
  [/\bpeanuts?\b/i, 'AP'],
  [/\b(tree )?nuts\b/i, 'AN'],
  [/\bsesame\b/i, 'AS'],
  [/\bcelery\b/i, 'BC'],
  [/\bmustard\b/i, 'BM'],
  [/\blupin[e]?\b/i, 'NL'],
  [/\bsul(ph|f)ites?\b/i, 'AU'],
  [/\b(crustaceans?|shellfish)\b/i, 'AC'],
  [/\bmollus(c|k)s?\b/i, 'UM'],
];

const MONEY = String.raw`(?:€\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:€|eur(?:os?)?\b))`;
const LIMIT_WORDS = String.raw`over|above|more than|exceeds?|exceeding|beyond|under|below|less than|max(?:imum)?|at most|up to|no more than|not more than|within|budget(?:\s+of)?|limit(?:\s+of)?|cap(?:ped at)?`;
/** A spend limit: "over €300", "above 1200 euro", "max €500 a week", "€300 tops". */
export const MONEY_LIMIT = new RegExp(
  String.raw`(?:\b(?:ask|check with|confirm with|approval|approve|ok from|sign[- ]?off)\b[^€\d]*?)?\b(${LIMIT_WORDS})\s*:?\s*(?:of\s+)?${MONEY}(?:\s*(?:per|an?|each|\/|a)\s*(order|week))?|${MONEY}\s*(max(?:imum)?|tops|limit|budget|or less)\b(?:\s*(?:per|an?|each|\/)\s*(order|week))?`,
  'i'
);
/** Words that turn a limit into "a person decides". */
export const ASK_BEFORE = /\b(ask|check with|confirm with|approv\w*|ok from|sign[- ]?off)\b/i;

export { NUM, toNum };
