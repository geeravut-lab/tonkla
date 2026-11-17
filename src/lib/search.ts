/**
 * Search for the idea library. Thai has no spaces between words, so text is split with Intl.Segmenter (word level),
 * and every token is also broken into trigrams so that spelling slips and partial words still match.
 * Pure functions: no database, easy to test.
 */
const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "word" }) : null;

export const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[่-๋]/g, "").trim(); // tone marks do not change which word it is

export function tokens(text: string): string[] {
  const n = normalize(text);
  if (!n) return [];
  if (!seg) return n.split(/[\s,.;:!?()"'/\\-]+/).filter(Boolean);
  return [...seg.segment(n)].filter((p) => p.isWordLike).map((p) => p.segment);
}

export function trigrams(word: string): Set<string> {
  const w = `  ${word} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3));
  return out;
}

const bag = (text: string): Set<string> => {
  const out = new Set<string>();
  for (const t of tokens(text)) for (const g of trigrams(t)) out.add(g);
  return out;
};

/** 0..1: how much of the query is found in the document (query-side recall of trigrams), with an exact-word bonus. */
export function score(query: string, doc: string): number {
  const q = tokens(query);
  if (q.length === 0) return 0;
  const dTokens = new Set(tokens(doc));
  const dGrams = bag(doc);
  let total = 0;
  for (const w of q) {
    const g = trigrams(w);
    let hit = 0;
    for (const x of g) if (dGrams.has(x)) hit++;
    const recall = hit / g.size;
    total += dTokens.has(w) ? Math.max(recall, 1) : recall;
  }
  return total / q.length;
}

export type Searchable = { title: string; body: string };

/** Best matches first; documents under the threshold are dropped. A hit in the title counts a little more than one in the body. */
export function rank<T extends Searchable>(query: string, docs: T[], threshold = 0.45): T[] {
  if (tokens(query).length === 0) return docs;
  return docs
    .map((d) => {
      const a = score(query, d.title);
      const b = score(query, d.body) * 0.9;
      return { d, s: Math.min(1, Math.max(a, b) + 0.1 * Math.min(a, b)) };
    })
    .filter((x) => x.s >= threshold)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.d);
}
