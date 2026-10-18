import type { Cluster, Supercluster, TreeData, TreeNode, Unit } from "./types";

/** Precomputed lookups over the tree data. Built once per data file. */
export interface TreeIndex {
  data: TreeData;
  nodes: TreeNode[];
  byKey: Map<string, TreeNode>;
  /** Position of each key in data.nodes; this is the node index used in share links. */
  position: Map<string, number>;
  adjacency: Map<string, string[]>;
  start: string;
  clusters: Map<string, Cluster>;
  superclusters: Map<string, Supercluster>;
  /** Gateway tier (1 = first threshold, 2 = second, ...) and threshold, keyed by gateway node. */
  gateways: Map<string, { tier: number; threshold: number }>;
  /** Thresholds by tier: thresholds[tier - 1]. */
  thresholds: number[];
  /**
   * Segment of every node: 0 = reachable without passing any gateway, k = reachable once gateways of tier <= k are open.
   * A gateway of tier k is itself in segment k.
   */
  segment: Map<string, number>;
  units: Map<string, Unit>;
}

export function buildIndex(data: TreeData): TreeIndex {
  const byKey = new Map(data.nodes.map((n) => [n.key, n]));
  const position = new Map(data.nodes.map((n, i) => [n.key, i]));
  const adjacency = new Map<string, string[]>(data.nodes.map((n) => [n.key, []]));
  for (const [a, b] of data.edges) {
    adjacency.get(a)!.push(b);
    adjacency.get(b)!.push(a);
  }

  const thresholds = [...new Set(data.gateways.map((g) => g.threshold))].sort((a, b) => a - b);
  const gateways = new Map(
    data.gateways.map((g) => [g.node, { tier: thresholds.indexOf(g.threshold) + 1, threshold: g.threshold }]),
  );

  const segment = new Map<string, number>();
  for (let k = 0; k <= thresholds.length; k++) {
    // Reachable from the start when only gateways of tier <= k can be crossed.
    const seen = new Set([data.startNode]);
    const queue = [data.startNode];
    while (queue.length) {
      for (const next of adjacency.get(queue.shift()!)!) {
        if (seen.has(next)) continue;
        const gate = gateways.get(next);
        if (gate && gate.tier > k) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    for (const key of seen) if (!segment.has(key)) segment.set(key, k);
  }

  return {
    data,
    nodes: data.nodes,
    byKey,
    position,
    adjacency,
    start: data.startNode,
    clusters: new Map(data.clusters.map((c) => [c.key, c])),
    superclusters: new Map(data.superclusters.map((s) => [s.key, s])),
    gateways,
    thresholds,
    segment,
    units: new Map(data.units.map((u) => [u.key, u])),
  };
}
