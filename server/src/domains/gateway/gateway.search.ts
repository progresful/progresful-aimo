import type { Product } from './gateway.products.ts';
import { tagOf } from './gateway.categories.ts';

// Token index over the catalog (English + Finnish + Swedish names, brand,
// code) for GET /products?q= and the request parser. Built once (~17.5k
// products → a few hundred ms). Ranking, highest first:
//   product code typed exactly › whole query phrase inside a name › every
//   query word found › some words found; per word an exact word beats a word
//   that starts with it beats one that contains it (Finnish compounds:
//   "kerma" finds "kuohukerma"). "lactose-free" / "laktoositon" in the query
//   becomes a preference for LACS = 0 instead of words to find; a query that
//   names a kind of product ("milk", "voi", "whipping cream") lifts that
//   category; Valio-made breaks ties.

export const LACTOSE_FREE_RE = /\blactose[- ]?free\b|\blactosefree\b|\blaktoositon\w*|\blaktosfri\b|\blf\b/gi;

const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'for', 'with', 'in', 'on', 'ja', 'och', 'x']);

export const normText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[®™©]/g, ' ')
    .replace(/[‐-―]/g, '-')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)\s*%/g, '$1%')
    .replace(/\s+/g, ' ')
    .trim();

const stem = (t: string) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !/\d/.test(t) ? t.slice(0, -1) : t);

/** Words of a text as the index sees them. */
export const wordsIn = (s: string) =>
  normText(s)
    .split(/[^a-z0-9äöåéèüß%.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t && !STOP.has(t))
    .map(stem);

export type SearchIndex = {
  /** Every product matching `q`, best first. */
  search: (q: string) => Product[];
  /** Products sharing at least one word (exact, prefix or infix) with `words`. */
  candidates: (words: string[]) => Product[];
  /** Index words of one product (names + brand). */
  wordsOf: (p: Product) => Set<string>;
};

const isValio = (p: Product) => /valio/i.test(p.vendor) || /valio/i.test(p.brand ?? '');

export const buildSearchIndex = (products: Product[]): SearchIndex => {
  const words: Set<string>[] = [];
  const brands: Set<string>[] = [];
  const phrases: string[] = [];
  const postings = new Map<string, number[]>();
  const position = new Map<string, number>();
  products.forEach((p, i) => {
    position.set(p.code, i);
    const own = new Set([...wordsIn(p.name), ...wordsIn(p.nameFi ?? ''), ...wordsIn(p.nameSv ?? '')]);
    const brand = new Set(wordsIn(p.brand ?? ''));
    words.push(own);
    brands.push(brand);
    phrases.push(` ${[p.name, p.nameFi ?? '', p.nameSv ?? ''].map((n) => normText(n).replace(/[^a-z0-9äöåéèüß%.]+/g, ' ')).join(' | ')} `);
    for (const w of new Set([...own, ...brand])) {
      const list = postings.get(w);
      if (list) list.push(i);
      else postings.set(w, [i]);
    }
  });
  const vocab = [...postings.keys()];

  /** product index → best score for one query word (10 exact, 8 brand, 6 prefix, 4 infix). */
  const hitsFor = (q: string) => {
    const hits = new Map<number, number>();
    const add = (list: number[] | undefined, score: number) => {
      for (const i of list ?? []) if ((hits.get(i) ?? 0) < score) hits.set(i, score);
    };
    if (/^\d+(\.\d+)?%?$/.test(q) || q.length < 2) {
      add(postings.get(q), 10);
      return hits;
    }
    for (const v of vocab) {
      if (v === q) continue;
      if (v.startsWith(q)) add(postings.get(v), 6);
      else if (q.length >= 4 && v.includes(q)) add(postings.get(v), 4);
    }
    for (const i of postings.get(q) ?? []) hits.set(i, words[i].has(q) ? 10 : 8);
    return hits;
  };

  const search = (raw: string): Product[] => {
    const exact = products[position.get(raw.trim()) ?? -1];
    const lactoseFree = new RegExp(LACTOSE_FREE_RE.source, 'i').test(raw);
    const text = normText(raw.replace(LACTOSE_FREE_RE, ' '));
    const qWords = [...new Set(wordsIn(text))];
    const phrase = text.replace(/[^a-z0-9äöåéèüß%.]+/g, ' ').trim();
    const category = tagOf(text);
    if (!qWords.length && !lactoseFree) return exact ? [exact] : [];
    const perWord = qWords.map(hitsFor);
    const scores = new Map<number, number>();
    const matched = new Map<number, number>();
    perWord.forEach((hits) => {
      for (const [i, s] of hits) {
        scores.set(i, (scores.get(i) ?? 0) + s);
        matched.set(i, (matched.get(i) ?? 0) + 1);
      }
    });
    if (!qWords.length) products.forEach((p, i) => p.lacs === 0 && scores.set(i, 0));
    const ranked = [...scores.entries()].map(([i, s]) => {
      const p = products[i];
      let score = s;
      if (qWords.length && matched.get(i) === qWords.length) score += 30;
      if (phrase.length > 2 && qWords.length > 1 && phrases[i].includes(` ${phrase} `)) score += 40;
      if (category && p.categoryCode === category) score += 15;
      if (lactoseFree) score += p.lacs === 0 ? 20 : p.lacs === null ? 0 : -15;
      if (isValio(p)) score += 1;
      score -= Math.min(p.name.length, 120) / 1000; // shorter (more generic) names first among equals
      return { i, score };
    });
    ranked.sort((a, b) => b.score - a.score || a.i - b.i);
    const out = ranked.map((r) => products[r.i]);
    return exact ? [exact, ...out.filter((p) => p !== exact)] : out;
  };

  const candidates = (qWords: string[]) => {
    const seen = new Set<number>();
    for (const w of qWords) for (const i of hitsFor(stem(w.toLowerCase())).keys()) seen.add(i);
    return [...seen].sort((a, b) => a - b).map((i) => products[i]);
  };

  return { search, candidates, wordsOf: (p) => words[position.get(p.code) ?? -1] ?? new Set(wordsIn(p.name)) };
};
