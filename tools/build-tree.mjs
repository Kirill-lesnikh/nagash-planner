#!/usr/bin/env node
// Builds the planner's tree data from game_files/extracted (see tools/extract-game-files.mjs).
// Writes public/data/black-pyramid.<gameVersion>.json, its index table, and copies the images the tree uses.
//
// Usage: node tools/build-tree.mjs <gameVersion>     e.g. node tools/build-tree.mjs 9.0.4
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "game_files", "extracted");
const PUBLIC = path.join(ROOT, "public");
const gameVersion = process.argv[2];
if (!gameVersion) {
  console.error("usage: node tools/build-tree.mjs <gameVersion>");
  process.exit(1);
}

const table = (t) => JSON.parse(fs.readFileSync(path.join(SRC, "db", `${t}.json`), "utf8")).rows;
const loc = JSON.parse(fs.readFileSync(path.join(SRC, "loc", "en.json"), "utf8"));

// ---------- text ----------

const UI_TEXT_PREFIX = "ui_text_replacements_localised_text_";

function resolveLoc(text, depth = 0) {
  if (depth > 10) return text;
  return text.replace(/\{\{tr:([^}]+)\}\}/g, (_, k) => {
    const v = loc[k] ?? loc[UI_TEXT_PREFIX + k];
    return v === undefined ? `{{tr:${k}}}` : resolveLoc(v, depth + 1);
  });
}

// Game markup: [[img:x]][[/img]] inline icons, [[col:x]]..[[/col]] colours, [[sl:x]]..[[/sl]] help links, [[i]], [[b]], [[url:x]].
function stripMarkup(text) {
  return text
    .replace(/\[\[img:bullet_point[^\]]*\]\](\[\[\/img\]\])?/g, "• ")
    .replace(/\[\[img:[^\]]*\]\](\[\[\/img\]\])?/g, "")
    .replace(/\[\[\/?[a-z]+(:[^\]]*)?\]\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const text = (key) => {
  const v = loc[key];
  return v === undefined ? "" : stripMarkup(resolveLoc(v));
};

function formatNumber(v) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

function renderEffect(template, value) {
  return template
    .replace(/%\+n/g, (value >= 0 ? "+" : "") + formatNumber(value))
    .replace(/%n/g, formatNumber(value));
}

// ---------- images ----------

const copied = new Set();
function copyImage(gamePath, subdir) {
  if (!gamePath) return undefined;
  const base = gamePath.replaceAll("\\", "/").split("/").pop().toLowerCase();
  const rel = `assets/${subdir}/${base}`;
  if (!copied.has(rel)) {
    const candidates = [path.join(SRC, "ui", "skin", "icons", base), path.join(SRC, "ui", "skin", base), path.join(SRC, "ui", "effect_icons", base)];
    const src = candidates.find((c) => fs.existsSync(c));
    if (!src) {
      console.warn(`  missing image ${gamePath}`);
      return undefined;
    }
    fs.mkdirSync(path.join(PUBLIC, "assets", subdir), { recursive: true });
    fs.copyFileSync(src, path.join(PUBLIC, rel));
    copied.add(rel);
  }
  return rel;
}

function copyNodeIcon(gamePath) {
  const rel = copyImage(gamePath, "nodes");
  if (rel) copyImage(gamePath.replace(/\.png$/i, "_active.png"), "nodes");
  return rel;
}

// ---------- tree ----------

const TIER = { minor: "connector", major: "small", key: "notable", gate: "gateway" };

const graph = table("ui_graphs")[0];
const graphNodes = table("ui_graph_nodes");
const initiativeByNode = Object.fromEntries(table("initiative_to_ui_graph_node_junctions").map((r) => [r.ui_graph_node, r.initiative]));
const initiatives = Object.fromEntries(table("initiatives").map((r) => [r.key, r]));
const effectsByList = {};
for (const r of table("campaign_effect_list_effect_junctions")) (effectsByList[r.effect_list] ??= []).push(r);
const effectRows = Object.fromEntries(table("effects").map((r) => [r.effect, r]));
const clusterRows = table("ui_graph_node_clusters");
const keyOf = (graphNode) => initiativeByNode[graphNode];

const superclusters = table("ui_graph_node_superclusters")
  .map((r) => ({
    key: r.key,
    name: text(`ui_graph_node_superclusters_localised_title_${r.key}`),
    sortOrder: r.sort_order,
  }))
  .sort((a, b) => a.sortOrder - b.sortOrder);

const clusters = clusterRows
  .map((r) => ({
    key: r.key,
    name: text(`ui_graph_node_clusters_localised_title_${r.key}`),
    description: text(`ui_graph_node_clusters_localised_description_${r.key}`),
    supercluster: r.supercluster,
    icon: copyNodeIcon(r.image_path),
    sortOrder: r.sort_order,
  }))
  .sort((a, b) => a.supercluster.localeCompare(b.supercluster) || a.sortOrder - b.sortOrder);

let hiddenEffects = 0;
// Effect text templates (with %+n / %n placeholders) so the app can re-render summed values.
const effectTemplates = {};
const nodes = graphNodes.map((g) => {
  const key = keyOf(g.key);
  const ini = initiatives[key];
  const effects = [];
  for (const e of effectsByList[ini.effects] ?? []) {
    const template = text(`effects_description_${e.effect}`);
    if (!template || template.includes("[STATUS: HIDDEN]")) {
      hiddenEffects++;
      continue;
    }
    const scope = text(`campaign_effect_scopes_localised_text_${e.scope}`);
    effectTemplates[e.effect] = template;
    effects.push({
      key: e.effect,
      text: renderEffect(template, e.value),
      value: e.value,
      ...(scope && { scope }),
      icon: copyImage(effectRows[e.effect]?.icon, "effects"),
    });
  }
  const isStart = g.key === graph.origin_node;
  return {
    key,
    graphNode: g.key,
    name: text(`initiatives_localised_name_${key}`),
    ...(text(`initiatives_localised_description_${key}`) && { description: text(`initiatives_localised_description_${key}`) }),
    tier: isStart ? "start" : TIER[g.type],
    cost: ini.point_cost,
    x: g.x_pos,
    y: g.y_pos,
    icon: copyNodeIcon(ini.image_path),
    ...(g.cluster && { cluster: g.cluster }),
    effects,
  };
});

// Links are stored parent -> child, but the graph is only fully connected when treated as undirected
// (following child links from the origin reaches a fraction of the nodes), so edges are emitted undirected.
const edgeSet = new Set();
const edges = [];
for (const l of table("ui_graph_node_links")) {
  const a = keyOf(l.parent_node);
  const b = keyOf(l.child_node);
  const id = [a, b].sort().join("|");
  if (edgeSet.has(id)) continue;
  edgeSet.add(id);
  edges.push([a, b]);
}

const gateways = table("ui_graph_node_unlock_thresholds")
  .map((r) => ({ node: keyOf(r.ui_graph_node), threshold: r.unlock_threshold }))
  .sort((a, b) => a.threshold - b.threshold || a.node.localeCompare(b.node));

const tree = {
  schemaVersion: 1,
  gameVersion,
  source: "game-extract",
  startNode: keyOf(graph.origin_node),
  superclusters,
  clusters,
  gateways,
  nodes: nodes.sort((a, b) => a.key.localeCompare(b.key)),
  edges,
  effectTemplates: Object.fromEntries(Object.entries(effectTemplates).sort(([a], [b]) => a.localeCompare(b))),
};

// ---------- validation ----------

const errors = [];
const byKey = new Map(tree.nodes.map((n) => [n.key, n]));
const adj = new Map(tree.nodes.map((n) => [n.key, []]));
for (const [a, b] of edges) {
  if (!byKey.has(a) || !byKey.has(b)) errors.push(`dangling edge ${a} - ${b}`);
  else adj.get(a).push(b), adj.get(b).push(a);
}
const seen = new Set([tree.startNode]);
const queue = [tree.startNode];
while (queue.length) for (const n of adj.get(queue.shift())) if (!seen.has(n)) seen.add(n), queue.push(n);
if (seen.size !== tree.nodes.length) errors.push(`${tree.nodes.length - seen.size} nodes unreachable from the start`);
for (const g of gateways) if (byKey.get(g.node)?.tier !== "gateway") errors.push(`threshold on non-gateway ${g.node}`);
if (tree.nodes.filter((n) => n.tier === "gateway").length !== gateways.length) errors.push("gateway without threshold");
for (const n of tree.nodes) {
  if (!n.name || n.name.includes("{{tr:")) errors.push(`unresolved name for ${n.key}`);
  for (const e of n.effects) if (/\{\{tr:|%[+]?[nd]/.test(e.text)) errors.push(`unresolved effect text on ${n.key}: ${e.text}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

// ---------- output ----------

const dataDir = path.join(PUBLIC, "data");
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, `black-pyramid.${gameVersion}.json`), JSON.stringify(tree, null, 1) + "\n");
// Stable index table for URL encoding: position = node index in share links for this data version.
fs.writeFileSync(path.join(dataDir, `black-pyramid.${gameVersion}.index.json`), JSON.stringify(tree.nodes.map((n) => n.key)) + "\n");

// Panel art used to render the tree like the game (background, node frames, gateway lock, sigil icon).
for (const f of [
  "bg_nag_black_pyramid.png",
  "connection_inactive.png",
  "chained_lock.png",
  "icon_mystic_sigil.png",
  ...fs.readdirSync(path.join(SRC, "ui", "skin")).filter((f) => /^nag_pyramid_(node|progress)_/.test(f)),
]) copyImage(f, "skin");

const count = (f) => tree.nodes.reduce((m, n) => ((m[f(n)] = (m[f(n)] ?? 0) + 1), m), {});
console.log(`black-pyramid.${gameVersion}.json:`);
console.log(`  nodes: ${tree.nodes.length}`, count((n) => n.tier));
console.log(`  edges: ${edges.length}, clusters: ${clusters.length}, superclusters: ${superclusters.length}`);
console.log(`  gateways:`, gateways.map((g) => g.threshold).join(", "));
console.log(`  effects: ${tree.nodes.reduce((s, n) => s + n.effects.length, 0)} shown, ${hiddenEffects} hidden`);
console.log(`  images copied: ${copied.size}`);
