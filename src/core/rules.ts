import type { TreeIndex } from "./tree";

/** The start node is always active, so it is never stored in a build's allocation list. */
export function activeSet(index: TreeIndex, allocated: Iterable<string>): Set<string> {
  return new Set([index.start, ...allocated]);
}

export function sigilCost(index: TreeIndex, keys: Iterable<string>): number {
  let total = 0;
  for (const k of keys) total += index.byKey.get(k)!.cost;
  return total;
}

export interface GatewayTierStatus {
  tier: number;
  threshold: number;
  /** Sigils empowered in segments before this tier. */
  before: number;
  /** Enough sigils are empowered before this tier, so its gateways can be empowered. */
  open: boolean;
  /** A gateway of this tier is empowered. */
  used: boolean;
}

/**
 * In game, a gateway unlocks once enough sigils are empowered "before this point":
 * here, allocated sigils in segments lower than the gateway's tier (earlier gateways included).
 */
export function gatewayStatus(index: TreeIndex, active: Set<string>): GatewayTierStatus[] {
  return index.thresholds.map((threshold, i) => {
    const tier = i + 1;
    let before = 0;
    let used = false;
    for (const key of active) {
      if (index.segment.get(key)! < tier) before += index.byKey.get(key)!.cost;
      if (index.gateways.get(key)?.tier === tier) used = true;
    }
    return { tier, threshold, before, open: before >= threshold, used };
  });
}

/** Unallocated gateways that are still locked. */
export function closedGates(index: TreeIndex, active: Set<string>): Set<string> {
  const status = gatewayStatus(index, active);
  const closed = new Set<string>();
  for (const [key, gate] of index.gateways) if (!active.has(key) && !status[gate.tier - 1].open) closed.add(key);
  return closed;
}

function isValid(index: TreeIndex, active: Set<string>): boolean {
  return gatewayStatus(index, active).every((g) => !g.used || g.open);
}

/** Shortest chain of nodes from the active set to `target` (target included, in allocation order), avoiding `blocked`. */
function shortestPath(index: TreeIndex, active: Set<string>, target: string, blocked: Set<string>): string[] {
  // Multi-source BFS from every active node at once; all nodes cost the same, so BFS gives the cheapest path.
  const prev = new Map<string, string | null>();
  const queue: string[] = [];
  for (const key of active) {
    prev.set(key, null);
    queue.push(key);
  }
  while (queue.length) {
    const key = queue.shift()!;
    if (key === target) break;
    for (const next of index.adjacency.get(key)!) {
      if (prev.has(next) || blocked.has(next)) continue;
      prev.set(next, key);
      queue.push(next);
    }
  }
  if (!prev.has(target)) return [];
  const path: string[] = [];
  for (let k: string | null = target; k !== null && !active.has(k); k = prev.get(k)!) path.push(k);
  return path.reverse();
}

/**
 * The cheapest valid path to `target`: it may only cross a gateway if the plan, including the path's own sigils,
 * has enough sigils before it. Returns [] if the target is already active or cannot be reached yet.
 */
export function pathTo(index: TreeIndex, active: Set<string>, target: string): string[] {
  if (active.has(target)) return [];
  const direct = shortestPath(index, active, target, new Set());
  if (direct.length && isValid(index, new Set([...active, ...direct]))) return direct;
  // Otherwise go around locked gateways (adding nodes never closes an open gateway, so this path is valid).
  return shortestPath(index, active, target, closedGates(index, active));
}

/** Why `target` can't be reached: gateway tiers on its shortest path that would still be locked. */
export function lockReason(index: TreeIndex, active: Set<string>, target: string): GatewayTierStatus[] {
  const path = shortestPath(index, active, target, new Set());
  const after = new Set([...active, ...path]);
  const tiers = new Set(path.map((k) => index.gateways.get(k)?.tier).filter((t) => t !== undefined));
  return gatewayStatus(index, after).filter((g) => tiers.has(g.tier) && !g.open);
}

/** Nodes that can currently be allocated or already are: everything not behind a locked gateway. */
export function reachable(index: TreeIndex, active: Set<string>): Set<string> {
  const closed = closedGates(index, active);
  const seen = new Set(active);
  const queue = [...active];
  while (queue.length) {
    for (const next of index.adjacency.get(queue.shift()!)!) {
      if (seen.has(next) || closed.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/** Keeps only what is still connected to the start and passes its gateways; failing gateways drop with everything behind them. */
function prune(index: TreeIndex, active: Set<string>): Set<string> {
  let current = active;
  for (;;) {
    const seen = new Set([index.start]);
    const queue = [index.start];
    while (queue.length) {
      for (const next of index.adjacency.get(queue.shift()!)!) {
        if (seen.has(next) || !current.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    const failing = new Set(
      gatewayStatus(index, seen)
        .filter((g) => g.used && !g.open)
        .map((g) => g.tier),
    );
    if (!failing.size) return seen;
    current = new Set([...seen].filter((k) => !failing.has(index.gateways.get(k)?.tier ?? -1)));
  }
}

/** Nodes removed when refunding `key`: the node, everything cut off from the start, and gateways left short of sigils (with what lies behind them). */
export function refundSet(index: TreeIndex, active: Set<string>, key: string): string[] {
  if (key === index.start || !active.has(key)) return [];
  const kept = prune(index, new Set([...active].filter((k) => k !== key)));
  return [...active].filter((k) => !kept.has(k));
}

export function allocate(index: TreeIndex, allocated: string[], target: string): string[] {
  return [...allocated, ...pathTo(index, activeSet(index, allocated), target)];
}

export function refund(index: TreeIndex, allocated: string[], key: string): string[] {
  const removed = new Set(refundSet(index, activeSet(index, allocated), key));
  return allocated.filter((k) => !removed.has(k));
}

/** Drops anything an imported build couldn't legally have (disconnected nodes, gateways without enough sigils). */
export function normalize(index: TreeIndex, allocated: string[]): string[] {
  const kept = prune(index, activeSet(index, allocated));
  return allocated.filter((k) => kept.has(k));
}
