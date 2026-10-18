import type { TreeIndex } from "./tree";
import type { Effect, Unit } from "./types";

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
export function summarize(index: TreeIndex, active: Set<string>, include: (effect: Effect) => boolean = () => true): SummarySection[] {
  const sections = new Map<string, Omit<SummarySection, "lines"> & { acc: Map<string, Accumulated> }>();
  for (const node of index.nodes) {
    if (!active.has(node.key) || node.tier === "start") continue;
    const s = sectionOf(index, node.key);
    let section = sections.get(s.key);
    if (!section) sections.set(s.key, (section = { ...s, sigils: 0, acc: new Map() }));
    section.sigils += node.cost;
    for (const e of node.effects) {
      if (!include(e)) continue;
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
  /** Units that receive exactly the same unconditional bonuses. */
  units: Unit[];
  lines: SummaryLine[];
  /** Army-level bonuses, by condition; they don't affect grouping. */
  conditional: ConditionalBlock[];
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
export const unitOrder = (a: Unit, b: Unit) => casteRank(a) - casteRank(b) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key);

/** A bonus that only applies in certain armies, with the units of the group that get it (undefined = all of them). */
export interface ConditionalLine extends SummaryLine {
  units?: Unit[];
}

export interface ConditionalBlock {
  condition: string;
  lines: ConditionalLine[];
}

/** Bonuses that every unit receives with the same value (shown once instead of in each group). */
export interface SharedBonuses {
  lines: SummaryLine[];
  conditional: ConditionalBlock[];
}

/**
 * Bonuses per unit: every unit-targeted effect is applied to each unit it targets and summed per unit
 * (identical bonus text + scope add up, even across different effects).
 * Units whose unconditional bonus lists are exactly the same are merged into one group; a single differing
 * bonus or value splits them. Army-level bonuses (only in Nagash's army, armies led by a given lord, ...)
 * don't affect grouping: they are listed per group under their condition, naming the units when only some get them.
 * Effects that reach every unit are summed into `everyone` instead (so a unit's own lines exclude them),
 * and units with nothing beyond those don't appear in any group.
 */
export function summarizeByUnit(
  index: TreeIndex,
  active: Set<string>,
): { everyone: SharedBonuses | null; groups: UnitGroup[]; general: SummarySection[] } {
  const { effectTargets, unitEffectTemplates } = index.data;
  const perUnit = new Map<string, Map<string, Accumulated & { condition?: string }>>();
  // Effects that reach every unit don't tell units apart: they are summed once into "All units" instead of per unit.
  const shared = new Map<string, Accumulated & { condition?: string }>();
  for (const node of index.nodes) {
    if (!active.has(node.key) || node.tier === "start") continue;
    for (const e of node.effects) {
      const targets = e.target && effectTargets[e.target];
      if (!targets) continue;
      const template = unitEffectTemplates[e.key];
      // Conditional lines carry their condition instead of the scope text (shown as the block heading).
      const scope = e.condition ? undefined : e.scope;
      const id = `${template}|${cleanScope(scope) ?? ""}|${e.condition ?? ""}`;
      const value = isNumeric(template) ? e.value : 0;
      const accs = targets.length >= index.units.size ? [shared] : targets.map((unit) => {
        let acc = perUnit.get(unit);
        if (!acc) perUnit.set(unit, (acc = new Map()));
        return acc;
      });
      for (const acc of accs) {
        add(acc, id, template, value, node.key, scope, e.icon);
        if (e.condition) acc.get(id)!.condition = e.condition;
      }
    }
  }

  const sharedLines = [...shared.values()];
  const everyone: SharedBonuses | null = sharedLines.length
    ? {
        lines: sharedLines.filter((l) => !l.condition).map(finish).sort(lineOrder),
        conditional: [...new Set(sharedLines.map((l) => l.condition).filter((c): c is string => !!c))].sort().map((condition) => ({
          condition,
          lines: sharedLines.filter((l) => l.condition === condition).map(finish).sort(lineOrder),
        })),
      }
    : null;

  const groups = new Map<string, { units: Unit[]; perUnit: Map<Unit, Map<string, Accumulated & { condition?: string }>> }>();
  for (const [unitKey, acc] of perUnit) {
    const unit = index.units.get(unitKey);
    if (!unit) continue;
    // Signature = the unit's unconditional bonus list (text with summed values + scope).
    // Units with only army-level bonuses would otherwise all share one meaningless group, so those are
    // grouped by their army-level bonuses instead.
    const sig = (conditional: boolean) =>
      [...acc.values()]
        .filter((l) => !!l.condition === conditional)
        .map((l) => ({ ...finish(l), condition: l.condition }))
        .sort(lineOrder)
        .map((l) => `${l.condition ?? ""}|${l.text}|${l.scope ?? ""}`)
        .join("\n");
    const signature = sig(false) || `army-only\n${sig(true)}`;
    let group = groups.get(signature);
    if (!group) groups.set(signature, (group = { units: [], perUnit: new Map() }));
    group.units.push(unit);
    group.perUnit.set(unit, acc);
  }

  const result: UnitGroup[] = [...groups.values()].map(({ units, perUnit: accs }) => {
    units.sort(unitOrder);
    const lines = new Map<string, SummaryLine>();
    // Conditional lines: keyed by condition + rendered text, collecting which units get exactly that value.
    const conditional = new Map<string, Map<string, ConditionalLine & { unitSet: Unit[] }>>();
    for (const unit of units) {
      for (const [id, acc] of accs.get(unit)!) {
        const line = finish(acc);
        if (!acc.condition) {
          const existing = lines.get(id);
          // Same bonuses can come from different nodes for different units; highlight all of them.
          if (existing) for (const s of line.sources) !existing.sources.includes(s) && existing.sources.push(s);
          else lines.set(id, line);
          continue;
        }
        let block = conditional.get(acc.condition);
        if (!block) conditional.set(acc.condition, (block = new Map()));
        const key = `${id}|${line.text}`;
        const existing = block.get(key);
        if (existing) {
          existing.unitSet.push(unit);
          for (const s of line.sources) !existing.sources.includes(s) && existing.sources.push(s);
        } else {
          block.set(key, { ...line, id: key, unitSet: [unit] });
        }
      }
    }
    return {
      units,
      lines: [...lines.values()].sort(lineOrder),
      conditional: [...conditional]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([condition, block]) => ({
          condition,
          lines: [...block.values()]
            .map(({ unitSet, ...l }) => (unitSet.length === units.length ? l : { ...l, units: unitSet }))
            .sort(lineOrder),
        })),
    };
  });

  return {
    everyone,
    groups: result.sort((a, b) => unitOrder(a.units[0], b.units[0])),
    general: summarize(index, active, (e) => !e.target).filter((s) => s.lines.length),
  };
}
