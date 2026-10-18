// Shape of public/data/black-pyramid.<version>.json, produced by tools/build-tree.mjs. See docs/data-model.md.

export type Tier = "start" | "gateway" | "notable" | "small" | "connector";

export interface Effect {
  key: string;
  text: string;
  value: number;
  scope?: string;
  /** Army-level condition, e.g. "Nagash's army" or "armies led by a Tomb Kings Lord or Nagash". */
  condition?: string;
  /** Key into TreeData.effectTargets when the effect applies to specific units (after scope narrowing). */
  target?: string;
  icon?: string;
}

export interface TreeNode {
  key: string;
  graphNode: string;
  name: string;
  description?: string;
  tier: Tier;
  cost: number;
  x: number;
  y: number;
  icon?: string;
  cluster?: string;
  effects: Effect[];
}

export interface Cluster {
  key: string;
  name: string;
  description: string;
  supercluster: string;
  icon?: string;
  sortOrder: number;
}

export interface Supercluster {
  key: string;
  name: string;
  sortOrder: number;
}

export interface Gateway {
  node: string;
  threshold: number;
}

export interface Unit {
  key: string;
  name: string;
  caste: string;
  culture: string;
  icon?: string;
}

export interface TreeData {
  schemaVersion: 1;
  gameVersion: string;
  source: string;
  startNode: string;
  superclusters: Supercluster[];
  clusters: Cluster[];
  gateways: Gateway[];
  nodes: TreeNode[];
  edges: [string, string][];
  effectTemplates: Record<string, string>;
  /** Roster units that at least one node effect applies to. */
  units: Unit[];
  /** Target key (effect key, or "effect@scope" when a character scope narrows it) -> unit keys. */
  effectTargets: Record<string, string[]>;
  /** Effect key -> text template without the "for <units> units" part, for per-unit display. */
  unitEffectTemplates: Record<string, string>;
}
