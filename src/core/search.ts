import type { TreeIndex } from "./tree";

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/**
 * Score of one query term (lowercase) in `text` (lowercase): the term must appear as one unbroken piece — anywhere,
 * even mid-word ("vla" matches "vlad" and "somevlathing"), but never with letters skipped or across spaces.
 * Matches at a word start, and whole-word matches, rank higher. -1 = no match.
 */
export function termScore(term: string, text: string): number {
  if (!term) return -1;
  let best = -1;
  for (let pos = text.indexOf(term); pos !== -1; pos = text.indexOf(term, pos + 1)) {
    const wordStart = !isWordChar(text[pos - 1]);
    const wordEnd = !isWordChar(text[pos + term.length]);
    best = Math.max(best, 100 + (wordStart ? 20 : 0) + (wordStart && wordEnd ? 10 : 0));
  }
  return best;
}

/** Score of all query terms within one field (any order), or -1 if any term is missing. */
function fieldScore(terms: string[], field: string): number {
  let total = 0;
  for (const t of terms) {
    const s = termScore(t, field);
    if (s < 0) return -1;
    total += s;
  }
  return total;
}

/**
 * Returns a matcher over node names and effect lines (connectors excluded), best matches first.
 * Space-separated terms each match as an unbroken substring, in any order, and all of them must match within the same
 * field — the node name or one effect line (with its scope), never across the name and effects or across two effects.
 */
export function buildSearch(index: TreeIndex): (query: string) => string[] {
  // "Pathways to Eternity" connectors are all alike and would flood the results.
  const docs = index.nodes
    .filter((n) => n.tier !== "connector")
    .map((n) => ({
      key: n.key,
      name: n.name,
      // An effect line includes its scope, as displayed: "Battle healing cap: +20% (Vlad von Carstein)".
      fields: [n.name, ...n.effects.map((e) => (e.scope ? `${e.text} ${e.scope}` : e.text))].map((f) => f.toLowerCase()),
    }));
  return (query) => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return docs
      .map((d) => ({ d, score: Math.max(...d.fields.map((f) => fieldScore(terms, f))) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score || a.d.name.localeCompare(b.d.name))
      .map((r) => r.d.key);
  };
}
