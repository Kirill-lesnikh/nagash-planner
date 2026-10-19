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
    const candidates = ["skin/icons", "skin", "effect_icons", "unit_icons", "unit_portholes", "character_portraits"].map((d) => path.join(SRC, "ui", d, base));
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

// Army-level conditions: effects whose scope limits them to certain armies rather than all of them.
const scopeRows = Object.fromEntries(table("campaign_effect_scopes").map((r) => [r.key, r]));
const LORD_CULTURE = { tmb: "Tomb Kings", vmp: "Vampire Counts", cst: "Vampire Coast" };
function armyCondition(scopeKey, scopeText) {
  const s = scopeRows[scopeKey];
  if (!s) return undefined;
  if (s.target === "force_if_commanded_by_faction_leader") return "Nagash's army";
  // These scopes have no display text; the key names the lord culture (and "_nag" adds Nagash, per patch 9.0.3 notes).
  const m = /force_own_(tmb|vmp|cst)(_nag)?_unseen$/.exec(scopeKey);
  if (m) return `armies led by a ${LORD_CULTURE[m[1]]} Lord${m[2] ? " or Nagash" : ""}`;
  if (s.target === "force" && /'s army\)$/.test(scopeText)) return scopeText.slice(1, -1); // e.g. "(Mannfred von Carstein's army)"
  return undefined;
}

let hiddenEffects = 0;
// Effect text templates (with %+n / %n placeholders) so the app can re-render summed values.
const effectTemplates = {};
const nodes = graphNodes.map((g) => {
  const key = keyOf(g.key);
  const ini = initiatives[key];
  const effects = [];
  for (const e of effectsByList[ini.effects] ?? []) {
    const template = text(`effects_description_${e.effect}`);
    if (!template || /\[STATUS: HIDDEN\]|\[HIDDEN/.test(template)) {
      hiddenEffects++;
      continue;
    }
    const scopeText = text(`campaign_effect_scopes_localised_text_${e.scope}`).replace(/\s+/g, " ").trim();
    const condition = armyCondition(e.scope, scopeText);
    // Hidden scopes still deserve a visible condition.
    const scope = scopeText || (condition ? `(${condition})` : "");
    effectTemplates[e.effect] = template;
    effects.push({
      key: e.effect,
      text: renderEffect(template, e.value),
      value: e.value,
      ...(scope && { scope }),
      ...(condition && { condition }),
      icon: copyImage(effectRows[e.effect]?.icon, "effects"),
      _scope: e.scope, // resolved into `target` once unit targets are known, then dropped
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

// ---------- units each effect applies to ----------

const mainUnits = new Map(table("main_units").map((r) => [r.unit, r]));
const landUnits = new Map(table("land_units").map((r) => [r.key, r]));
const unitSetRows = {};
for (const r of table("unit_set_to_unit_junctions")) (unitSetRows[r.unit_set] ??= []).push(r);

// A unit is in a set if it matches an include row and no exclude row; a row matches when every field it sets matches.
function rowMatches(row, unit) {
  const m = mainUnits.get(unit);
  const l = landUnits.get(m.land_unit) ?? {};
  return (
    (!row.unit_record || row.unit_record === unit) &&
    (!row.unit_caste || row.unit_caste === m.caste) &&
    (!row.unit_category || row.unit_category === l.category) &&
    (!row.unit_class || row.unit_class === l.class)
  );
}
const setCache = new Map();
function resolveSet(set) {
  if (!setCache.has(set)) {
    const rows = unitSetRows[set] ?? [];
    setCache.set(
      set,
      [...mainUnits.keys()].filter((u) => rows.some((r) => !r.exclude && rowMatches(r, u)) && !rows.some((r) => r.exclude && rowMatches(r, u))),
    );
  }
  return setCache.get(set);
}

const effectUnits = new Map();
const target = (effect, units) => {
  const set = effectUnits.get(effect) ?? new Set();
  for (const u of units) if (mainUnits.has(u)) set.add(u);
  effectUnits.set(effect, set);
};
for (const r of table("effect_bonus_value_ids_unit_sets")) target(r.effect, resolveSet(r.unit_set));
for (const r of table("effect_bonus_value_unit_record_junctions")) target(r.effect, [r.unit_record_key]);
for (const [junction, link, field] of [
  ["effect_bonus_value_unit_set_unit_ability_junctions", "unit_set_unit_ability_junctions", "unit_set_ability"],
  ["effect_bonus_value_unit_set_unit_attribute_junctions", "unit_set_unit_attribute_junctions", "unit_set_attribute"],
  ["effect_bonus_value_unit_set_special_ability_phase_junctions", "unit_set_special_ability_phase_junctions", "unit_set_special_ability_phase_junction"],
]) {
  const sets = new Map(table(link).map((r) => [r.key, r.unit_set]));
  for (const r of table(junction)) target(r.effect, resolveSet(sets.get(r[field])));
}

// Grave Call unlocks are scripted: the pyramid script maps each node to the units it unlocks.
const GRAVE_CALL_TEXT = "Grave Call recruitment unlocked";
const gravecallEffects = new Set();
{
  const lua = fs.readFileSync(path.join(SRC, "script", "wh3_dlc29_nag_black_pyramid.lua"), "utf8");
  const block = lua.slice(lua.indexOf("gravecall = {"), lua.indexOf("rituals = {"));
  for (const m of block.matchAll(/\["(wh3_dlc29_black_pyramid_[^"]+)"\]\s*=\s*\{([^}]*)\}/g)) {
    const units = [...m[2].matchAll(/"([^"]+)"/g)].map((u) => u[1]);
    for (const e of effectsByList[initiatives[m[1]]?.effects] ?? []) {
      if (!e.effect.includes("gravecall_unlock")) continue;
      target(e.effect, units);
      gravecallEffects.add(e.effect);
    }
  }
}

// The unit set says which units an effect can touch; a character scope narrows it further.
// E.g. generic character stat effects target a set of every unit, and "(Nagash)" / "(all Heroes)" picks who really gets it.
const NAMED_CHARACTER = {
  krell: /_cha_krell/,
  dieter: /_cha_dieter_helsnicht/,
  walach: /_cha_walach_harkon/,
  luthor: /_cha_luthor_harkon/,
  arkhan: /_cha_arkhan/,
  mannfred: /_cha_mannfred_von_carstein/,
  vlad: /_cha_vlad_von_carstein/,
  neferata: /_cha_neferata/,
};
// The character a scope names ("(Nagash)", "(Arkhan the Black)", …), as a unit key pattern; null for broader scopes.
function namedCharacter(scopeKey) {
  if (scopeRows[scopeKey]?.target === "character_if_faction_leader") return /_cha_nagash$/;
  return NAMED_CHARACTER[/^faction_to_character_([a-z]+)/.exec(scopeKey)?.[1]] ?? null;
}
function narrowByScope(units, scopeKey) {
  const s = scopeRows[scopeKey];
  if (!s) return units;
  const caste = (u) => mainUnits.get(u).caste;
  const named = namedCharacter(scopeKey);
  if (named) return units.filter((u) => named.test(u));
  if (scopeKey.includes("heroes_only")) return units.filter((u) => caste(u) === "hero");
  if (s.target === "character_when_commanding") return units.filter((u) => caste(u) === "lord");
  if (s.target === "character") return units.filter((u) => caste(u) === "lord" || caste(u) === "hero");
  return units;
}

// Per-unit text: drop the "for <unit list> units" part so the same bonus reads the same on every unit.
// Targets are keyed per effect, or per effect@scope when the scope narrows them; node effects point at their key.
const unitEffectTemplates = {};
const effectTargets = {};
for (const node of nodes) {
  for (const e of node.effects) {
    const scopeKey = e._scope;
    delete e._scope;
    // Effects with no unit set link (character stats, attributes, abilities via basic/attribute junctions) reach
    // whoever the scope picks. Only a scope naming one character says who that is.
    const linked = [...(effectUnits.get(e.key) ?? [])].sort();
    const all = linked.length || !namedCharacter(scopeKey) ? linked : [...mainUnits.keys()].sort();
    const units = narrowByScope(all, scopeKey);
    if (!units.length || !effectTemplates[e.key]) continue;
    const id = units.length === all.length ? e.key : `${e.key}@${scopeKey}`;
    e.target = id;
    effectTargets[id] = units;
  }
}
for (const effect of new Set(Object.keys(effectTargets).map((id) => id.split("@")[0]))) {
  // The army condition is shown separately, so "when led by …" goes too.
  unitEffectTemplates[effect] = gravecallEffects.has(effect)
    ? GRAVE_CALL_TEXT
    : effectTemplates[effect].replace(/ for .+? units?\b/, "").replace(/ when led by [^\n]+/, "").trim();
}

const CULTURE = [
  [/_tmb_/, "Tomb Kings"],
  [/_vmp_/, "Vampire Counts"],
  [/_cst_/, "Vampire Coast"],
];
const targetedUnits = new Set(Object.values(effectTargets).flat());
// Lords and heroes: portrait from the custom battle setup (see extract-game-files.mjs).
const portraitByUnit = new Map(table("unit_portraits").map((r) => [r.unit, path.basename(r.portrait)]));
const units = [...targetedUnits]
  .map((key) => {
    const m = mainUnits.get(key);
    const iconSrc =
      [m.unit, m.land_unit]
        .map((k) => k.toLowerCase() + ".png")
        .find((f) => ["unit_icons", "unit_portholes"].some((d) => fs.existsSync(path.join(SRC, "ui", d, f)))) ??
      [portraitByUnit.get(key)].find((f) => f && fs.existsSync(path.join(SRC, "ui", "character_portraits", f)));
    return {
      key,
      name: text(`land_units_onscreen_name_${m.land_unit}`) || key,
      caste: m.caste,
      culture: CULTURE.find(([re]) => re.test(key))?.[1] ?? "",
      ...(iconSrc && { icon: copyImage(iconSrc, "units") }),
    };
  })
  .sort((a, b) => a.key.localeCompare(b.key));

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
  units,
  effectTargets: Object.fromEntries(Object.entries(effectTargets).sort(([a], [b]) => a.localeCompare(b))),
  unitEffectTemplates: Object.fromEntries(Object.entries(unitEffectTemplates).sort(([a], [b]) => a.localeCompare(b))),
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
const leftover = Object.entries(unitEffectTemplates).filter(([, t]) => / units?\b/.test(t));
console.log(`  unit-targeted effects: ${Object.keys(effectTargets).length} over ${units.length} units (${gravecallEffects.size} Grave Call unlocks)`);
const noIcon = units.filter((u) => !u.icon);
console.log(`  units without icon: ${noIcon.length}`, noIcon.map((u) => u.key));
if (leftover.length) console.log(`  per-unit texts still naming units: ${leftover.length}`, leftover.slice(0, 5).map(([, t]) => t));
