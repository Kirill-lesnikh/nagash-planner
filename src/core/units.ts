import type { TreeIndex } from "./tree";
import type { TreeNode, Unit } from "./types";
import { renderTemplate, unitOrder } from "./summary";
import { termScore } from "./search";

export interface UnitBonusLine {
  text: string;
  scope?: string;
  /** The effect reaches every unit (not specific to this one). */
  allUnits: boolean;
}

export interface UnitBonusNode {
  node: TreeNode;
  lines: UnitBonusLine[];
  /** Every line of this node is a bonus for all units. */
  allUnits: boolean;
}

/**
 * Every Sigil with at least one effect that applies to `unitKey`, with those effects worded for the unit
 * ("for <units> units" removed). Unit-specific Sigils come first, then Sigils whose bonuses reach every unit.
 */
export function unitBonuses(index: TreeIndex, unitKey: string): UnitBonusNode[] {
  const { effectTargets, unitEffectTemplates } = index.data;
  const result: UnitBonusNode[] = [];
  for (const node of index.nodes) {
    const lines: UnitBonusLine[] = [];
    for (const e of node.effects) {
      const targets = e.target ? effectTargets[e.target] : undefined;
      if (!targets?.includes(unitKey)) continue;
      const template = unitEffectTemplates[e.key] ?? e.text;
      lines.push({
        text: /%\+?n/.test(template) ? renderTemplate(template, e.value) : template,
        scope: e.scope?.replace(/\s+/g, " ").trim() || undefined,
        allUnits: targets.length >= index.units.size,
      });
    }
    if (lines.length) result.push({ node, lines, allUnits: lines.every((l) => l.allUnits) });
  }
  const clusterName = (n: TreeNode) => (n.cluster ? (index.clusters.get(n.cluster)?.name ?? "") : "");
  return result.sort(
    (a, b) =>
      Number(a.allUnits) - Number(b.allUnits) ||
      clusterName(a.node).localeCompare(clusterName(b.node)) ||
      a.node.name.localeCompare(b.node.name),
  );
}

/** Units whose name (or faction) contains every query word as an unbroken piece; all units for an empty query. */
export function searchUnits(index: TreeIndex, query: string): Unit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return [...index.units.values()]
    .filter((u) => {
      const text = `${u.name} ${u.culture}`.toLowerCase();
      return terms.every((t) => termScore(t, text) >= 0);
    })
    .sort(unitOrder);
}
