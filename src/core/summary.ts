import type { TreeIndex } from "./tree";
import type { Unit } from "./types";

export interface SummaryLine {
  id: string;
  text: string;
  scope?: string;
  icon?: string;
  /** Allocated nodes contributing to this line. */
  sources: string[];
}

export interface SummarySection {
  key: string;
  name: string;
  sigils: number;
  lines: SummaryLine[];
}

const CONNECTOR_SECTION = { key: "pathways", name: "Pathways to Eternity" };
const GATEWAY_SECTION = { key: "gateways", name: "Gateways" };

function sectionOf(index: TreeIndex, key: string) {
  const node = index.byKey.get(key)!;
  if (node.tier === "connector") return CONNECTOR_SECTION;
  if (node.tier === "gateway") return GATEWAY_SECTION;
  const cluster = node.cluster && index.clusters.get(node.cluster);
  const sc = cluster && index.superclusters.get(cluster.supercluster);
  return sc ? { key: sc.key, name: sc.name } : { key: "other", name: "Other" };
}

function formatNumber(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

export function renderTemplate(template: string, value: number): string {
  return template.replace(/%\+n/g, (value >= 0 ? "+" : "") + formatNumber(value)).replace(/%n/g, formatNumber(value));
}

const isNumeric = (template: string) => /%\+?n/.test(template);
const cleanScope = (scope?: string) => scope?.replace(/\s+/g, " ").trim() || undefined;

interface Accumulated extends SummaryLine {
  template: string;
  value: number;
}

function add(acc: Map<string, Accumulated>, id: string, template: string, value: number, source: string, scope?: string, icon?: string) {
  const line = acc.get(id);
  if (line) {
    line.value += value;
    if (!line.sources.includes(source)) line.sources.push(source);
  } else {
    acc.set(id, { id, text: "", template, value, scope: cleanScope(scope), icon, sources: [source] });
  }
}

const finish = ({ template, value, ...line }: Accumulated): SummaryLine => ({
  ...line,
  text: isNumeric(template) ? renderTemplate(template, value) : template,
});

/**
 * Combined bonuses of the allocated nodes, grouped into sections (the game's superclusters, plus connectors and gateways).
 * Identical effects with the same scope are summed and re-rendered from the effect's text template.
 * `include` limits which effects are counted (used to keep unit-specific effects out of the general list).
 */
export function summarize(index: TreeIndex, active: Set<string>, include: (effectKey: string) => boolean = () => true): SummarySection[] {
  const sections = new Map<string, Omit<SummarySection, "lines"> & { acc: Map<string, Accumulated> }>();
  for (const node of index.nodes) {
    if (!active.has(node.key) || node.tier === "start") continue;
    const s = sectionOf(index, node.key);
    let section = sections.get(s.key);
    if (!section) sections.set(s.key, (section = { ...s, sigils: 0, acc: new Map() }));
    section.sigils += node.cost;
    for (const e of node.effects) {
      if (!include(e.key)) continue;
      add(section.acc, `${e.key}|${e.scope ?? ""}`, index.data.effectTemplates[e.key] ?? e.text, e.value, node.key, e.scope, e.icon);
    }
  }

  const order = (key: string) =>
    key === CONNECTOR_SECTION.key ? 1000 : key === GATEWAY_SECTION.key ? 1001 : (index.superclusters.get(key)?.sortOrder ?? 999);

  return [...sections.values()]
    .sort((a, b) => order(a.key) - order(b.key))
    .map(({ acc, ...section }) => ({ ...section, lines: [...acc.values()].map(finish) }));
}

export interface UnitGroup {
  /** Units that receive exactly the same bonuses. */
  units: Unit[];
  lines: SummaryLine[];
}

const CASTE_ORDER = [
  "lord",
  "hero",
  "melee_infantry",
  "missile_infantry",
  "monstrous_infantry",
  "melee_cavalry",
  "missile_cavalry",
  "monstrous_cavalry",
  "chariot",
  "war_beast",
  "monster",
  "warmachine",
];
const casteRank = (u: Unit) => {
  const i = CASTE_ORDER.indexOf(u.caste);
  return i < 0 ? CASTE_ORDER.length : i;
};
// Unlocks first (they decide whether the unit is usable at all), then bonuses alphabetically.
const lineOrder = (a: SummaryLine, b: SummaryLine) =>
  Number(!/unlocked/i.test(a.text)) - Number(!/unlocked/i.test(b.text)) ||
  a.text.localeCompare(b.text) ||
  (a.scope ?? "").localeCompare(b.scope ?? "");
const unitOrder = (a: Unit, b: Unit) => casteRank(a) - casteRank(b) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key);

/**
 * Bonuses per unit: every unit-targeted effect is applied to each unit it targets and summed per unit
 * (identical bonus text + scope add up, even across different effects). Units whose resulting bonus lists
 * are exactly the same are merged into one group; a single differing bonus or value splits them.
 */
export function summarizeByUnit(index: TreeIndex, active: Set<string>): { groups: UnitGroup[]; general: SummarySection[] } {
  const { effectTargets, unitEffectTemplates } = index.data;
  const perUnit = new Map<string, Map<string, Accumulated>>();
  for (const node of index.nodes) {
    if (!active.has(node.key) || node.tier === "start") continue;
    for (const e of node.effects) {
      const targets = effectTargets[e.key];
      if (!targets) continue;
      const template = unitEffectTemplates[e.key];
      const id = `${template}|${cleanScope(e.scope) ?? ""}`;
      for (const unit of targets) {
        let acc = perUnit.get(unit);
        if (!acc) perUnit.set(unit, (acc = new Map()));
        add(acc, id, template, isNumeric(template) ? e.value : 0, node.key, e.scope, e.icon);
      }
    }
  }

  // Signature = the unit's full bonus list (text with summed values + scope); equal signatures share a group.
  const groups = new Map<string, { units: Unit[]; lines: Map<string, Accumulated> }>();
  for (const [unitKey, acc] of perUnit) {
    const unit = index.units.get(unitKey);
    if (!unit) continue;
    const lines = [...acc.values()].map(finish).sort(lineOrder);
    const signature = lines.map((l) => `${l.text}|${l.scope ?? ""}`).join("\n");
    const group = groups.get(signature);
    if (!group) {
      groups.set(signature, { units: [unit], lines: new Map([...acc].map(([id, l]) => [id, { ...l, sources: [...l.sources] }])) });
    } else {
      group.units.push(unit);
      // Same bonuses can come from different nodes for different units; highlight all of them.
      for (const [id, l] of acc) for (const s of l.sources) if (!group.lines.get(id)!.sources.includes(s)) group.lines.get(id)!.sources.push(s);
    }
  }

  return {
    groups: [...groups.values()]
      .map((g) => ({
        units: g.units.sort(unitOrder),
        lines: [...g.lines.values()].map(finish).sort(lineOrder),
      }))
      .sort((a, b) => unitOrder(a.units[0], b.units[0])),
    general: summarize(index, active, (key) => !effectTargets[key]).filter((s) => s.lines.length),
  };
}
