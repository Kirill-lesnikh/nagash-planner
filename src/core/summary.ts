import type { TreeIndex } from "./tree";

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

const cleanScope = (scope?: string) => scope?.replace(/\s+/g, " ").trim() || undefined;

/**
 * Combined bonuses of the allocated nodes, grouped into sections (the game's superclusters, plus connectors and gateways).
 * Identical effects with the same scope are summed and re-rendered from the effect's text template.
 */
export function summarize(index: TreeIndex, active: Set<string>): SummarySection[] {
  const sections = new Map<string, SummarySection & { acc: Map<string, { value: number; numeric: boolean } & SummaryLine> }>();
  for (const node of index.nodes) {
    if (!active.has(node.key) || node.tier === "start") continue;
    const s = sectionOf(index, node.key);
    let section = sections.get(s.key);
    if (!section) sections.set(s.key, (section = { ...s, sigils: 0, lines: [], acc: new Map() }));
    section.sigils += node.cost;
    for (const e of node.effects) {
      const id = `${e.key}|${e.scope ?? ""}`;
      const template = index.data.effectTemplates[e.key] ?? e.text;
      const numeric = /%\+?n/.test(template);
      const line = section.acc.get(id);
      if (line) {
        line.value += e.value;
        line.sources.push(node.key);
      } else {
        section.acc.set(id, { id, text: "", scope: cleanScope(e.scope), icon: e.icon, sources: [node.key], value: e.value, numeric });
      }
    }
  }

  const order = (key: string) =>
    key === CONNECTOR_SECTION.key ? 1000 : key === GATEWAY_SECTION.key ? 1001 : (index.superclusters.get(key)?.sortOrder ?? 999);

  return [...sections.values()]
    .sort((a, b) => order(a.key) - order(b.key))
    .map(({ acc, ...section }) => ({
      ...section,
      lines: [...acc.values()].map(({ value, numeric, ...line }) => {
        const effectKey = line.id.split("|")[0];
        const template = index.data.effectTemplates[effectKey];
        return { ...line, text: numeric && template ? renderTemplate(template, value) : (template ?? "") };
      }),
    }));
}
