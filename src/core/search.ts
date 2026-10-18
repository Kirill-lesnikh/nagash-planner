import type { TreeIndex } from "./tree";

/** Returns a matcher over node names, effect text (which includes unit names), cluster and section names. */
export function buildSearch(index: TreeIndex): (query: string) => string[] {
  const haystacks = index.nodes.map((n) => {
    const cluster = n.cluster ? index.clusters.get(n.cluster) : undefined;
    const section = cluster ? index.superclusters.get(cluster.supercluster) : undefined;
    const parts = [n.name, n.description, cluster?.name, section?.name, ...n.effects.map((e) => e.text)];
    return { key: n.key, text: parts.filter(Boolean).join("\n").toLowerCase() };
  });
  return (query) => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return haystacks.filter((h) => words.every((w) => h.text.includes(w))).map((h) => h.key);
  };
}
