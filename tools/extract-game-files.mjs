#!/usr/bin/env node
// Copies the needed packs from a Total War: Warhammer III install into game_files/packs/,
// then extracts everything the Black Pyramid planner needs into game_files/extracted/.
//
// Usage: node tools/extract-game-files.mjs [path/to/Total War WARHAMMER III]
//   or set WH3_DIR. Defaults to the standard Steam location under WSL.
import fs from "node:fs";
import path from "node:path";
import { Pack } from "./lib/pack.mjs";
import { loadSchema } from "./lib/schema.mjs";
import { decodeTable, decodeLoc } from "./lib/db.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const GAME_DIR =
  process.argv[2] ?? process.env.WH3_DIR ?? "/mnt/c/Program Files (x86)/Steam/steamapps/common/Total War WARHAMMER III";
const OUT = path.join(ROOT, "game_files");
const PACKS_OUT = path.join(OUT, "packs");
const EXTRACTED = path.join(OUT, "extracted");
const SCHEMA_PATH = path.join(OUT, "schema", "schema_wh3.ron");
const SCHEMA_URL = "https://raw.githubusercontent.com/Frodo45127/rpfm-schemas/master/schema_wh3.ron";

// Small packs are copied whole. The UI packs are 1-2 GB, so only the needed files are extracted from them in place.
const COPIED_PACKS = ["db.pack", "local_en.pack", "data_script.pack"];
const UI_PACKS = ["ui.pack", "ui2.pack", "ui3.pack"];

// Tables exported in full (all rows belong to the Black Pyramid, or they are tiny lookups).
const FULL_TABLES = [
  "ui_graphs",
  "ui_graph_node_types",
  "ui_graph_node_unlock_thresholds",
  "ui_graph_node_superclusters",
  "ui_graph_node_clusters",
  "ui_graph_nodes",
  "ui_graph_node_links",
  "initiative_to_ui_graph_node_junctions",
  "initiative_set_categories",
];

const SCRIPTS = [
  "script/campaign/wh3_dlc29_nag_black_pyramid.lua",
  "script/campaign/main_warhammer/wh3_dlc29_nag_mortarchs.lua",
  "script/campaign/main_warhammer/episodes/episode_nagash_endgame.lua",
  "script/campaign/wh2_dlc09_books_of_nagash.lua",
];

const UI_LAYOUT_PATTERN = /^ui\/campaign ui\/(dlc29_nag_black_pyramid.*|tooltip_dlc29_nag_pyramid_initiative_effects)\.twui\.xml$/i;
const UI_SKIN_PATTERN = /^ui\/skins\/default\/dlc29_nag_black_pyramid\//i;

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
}

function writeFile(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

function copyPacks() {
  fs.mkdirSync(PACKS_OUT, { recursive: true });
  for (const name of COPIED_PACKS) {
    const src = path.join(GAME_DIR, "data", name);
    const dst = path.join(PACKS_OUT, name);
    const s = fs.statSync(src);
    if (fs.existsSync(dst)) {
      const d = fs.statSync(dst);
      if (d.size === s.size && d.mtimeMs === s.mtimeMs) {
        console.log(`  ${name}: up to date`);
        continue;
      }
    }
    fs.copyFileSync(src, dst);
    fs.utimesSync(dst, s.atime, s.mtime);
    console.log(`  ${name}: copied (${(s.size / 1e6).toFixed(1)} MB)`);
  }
}

async function ensureSchema() {
  if (fs.existsSync(SCHEMA_PATH)) return;
  console.log(`  downloading ${SCHEMA_URL}`);
  const res = await fetch(SCHEMA_URL);
  if (!res.ok) throw new Error(`schema download failed: ${res.status}`);
  writeFile(SCHEMA_PATH, Buffer.from(await res.arrayBuffer()));
}

function extractDb(defs) {
  const db = new Pack(path.join(PACKS_OUT, "db.pack"));
  const read = (t) => decodeTable(db.read(`db/${t}_tables/data__`), `${t}_tables`, defs);
  const out = {};
  const save = (t, table, rows = table.rows) => {
    out[t] = rows;
    writeJson(path.join(EXTRACTED, "db", `${t}.json`), { table: `${t}_tables`, version: table.version, fields: table.fields, rows });
    console.log(`  ${t}: ${rows.length} rows`);
  };

  for (const t of FULL_TABLES) save(t, read(t));

  const initiativeKeys = new Set(out.initiative_to_ui_graph_node_junctions.map((r) => r.initiative));

  const initiatives = read("initiatives");
  save("initiatives", initiatives, initiatives.rows.filter((r) => initiativeKeys.has(r.key)));

  const setItems = read("initiative_set_items");
  const pyramidSetItems = setItems.rows.filter((r) => initiativeKeys.has(r.item));
  save("initiative_set_items", setItems, pyramidSetItems);
  const setKeys = new Set(pyramidSetItems.map((r) => r.set));
  const sets = read("initiative_sets");
  save("initiative_sets", sets, sets.rows.filter((r) => setKeys.has(r.key)));

  const effectListKeys = new Set(out.initiatives.map((r) => r.effects));
  const lists = read("campaign_effect_lists");
  save("campaign_effect_lists", lists, lists.rows.filter((r) => effectListKeys.has(r.key)));
  const listJunctions = read("campaign_effect_list_effect_junctions");
  save("campaign_effect_list_effect_junctions", listJunctions, listJunctions.rows.filter((r) => effectListKeys.has(r.effect_list)));

  const effectKeys = new Set(out.campaign_effect_list_effect_junctions.map((r) => r.effect));
  const effects = read("effects");
  save("effects", effects, effects.rows.filter((r) => effectKeys.has(r.effect)));
  const scopeKeys = new Set(out.campaign_effect_list_effect_junctions.map((r) => r.scope));
  const scopes = read("campaign_effect_scopes");
  save("campaign_effect_scopes", scopes, scopes.rows.filter((r) => scopeKeys.has(r.key)));

  db.close();
  return out;
}

// Collects every loc entry the tree needs, then follows {{tr:key}} references so the text can be fully resolved offline.
function extractLoc(db) {
  const lp = new Pack(path.join(PACKS_OUT, "local_en.pack"));
  const all = new Map();
  for (const f of lp.list((n) => n.endsWith(".loc"))) for (const [k, v] of decodeLoc(lp.read(f.name))) all.set(k, v);
  lp.close();

  const wanted = new Set();
  for (const r of db.initiatives) {
    wanted.add(`initiatives_localised_name_${r.key}`);
    wanted.add(`initiatives_localised_description_${r.key}`);
  }
  for (const r of db.ui_graph_node_clusters) {
    wanted.add(`ui_graph_node_clusters_localised_title_${r.key}`);
    wanted.add(`ui_graph_node_clusters_localised_description_${r.key}`);
  }
  for (const r of db.ui_graph_node_superclusters) {
    wanted.add(`ui_graph_node_superclusters_localised_title_${r.key}`);
    wanted.add(`ui_graph_node_superclusters_localised_description_${r.key}`);
  }
  for (const r of db.effects) wanted.add(`effects_description_${r.effect}`);
  for (const r of db.campaign_effect_scopes) wanted.add(`campaign_effect_scopes_localised_text_${r.key}`);
  // UI strings of the panel itself (titles, gateway tooltips, etc.)
  for (const k of all.keys()) if (/black_pyramid|mystic_sigil|nag_sigil/i.test(k)) wanted.add(k);

  // {{tr:x}} names either a full loc key or a ui_text_replacements key without its table prefix.
  const out = {};
  const queue = [...wanted];
  while (queue.length) {
    const k = queue.pop();
    if (k in out || !all.has(k)) continue;
    const v = all.get(k);
    out[k] = v;
    for (const m of v.matchAll(/\{\{tr:([^}]+)\}\}/g)) queue.push(m[1], `ui_text_replacements_localised_text_${m[1]}`);
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  writeJson(path.join(EXTRACTED, "loc", "en.json"), sorted);
  console.log(`  loc: ${Object.keys(sorted).length} entries (of ${all.size})`);
}

function extractScripts() {
  const sp = new Pack(path.join(PACKS_OUT, "data_script.pack"));
  for (const s of SCRIPTS) {
    writeFile(path.join(EXTRACTED, "script", path.basename(s)), sp.read(s));
    console.log(`  ${s}`);
  }
  sp.close();
}

function extractUi(db) {
  const effectIcons = new Set(db.effects.flatMap((r) => [r.icon, r.icon_negative]).map((i) => i.toLowerCase()));
  let layouts = 0, skins = 0, icons = 0;
  for (const name of UI_PACKS) {
    const pk = new Pack(path.join(GAME_DIR, "data", name));
    for (const f of pk.list()) {
      const n = f.name;
      let dst = null;
      if (UI_LAYOUT_PATTERN.test(n)) { dst = path.join("ui", "layout", path.basename(n)); layouts++; }
      else if (UI_SKIN_PATTERN.test(n)) { dst = path.join("ui", "skin", n.replace(UI_SKIN_PATTERN, "")); skins++; }
      else if (/^ui\/campaign ui\/effect_bundles\//i.test(n) && effectIcons.has(path.basename(n).toLowerCase())) {
        dst = path.join("ui", "effect_icons", path.basename(n).toLowerCase()); icons++;
      }
      if (dst) writeFile(path.join(EXTRACTED, dst), pk.read(n));
    }
    pk.close();
  }
  console.log(`  layouts: ${layouts}, skin images: ${skins}, effect icons: ${icons} (of ${effectIcons.size} referenced)`);
}

function steamBuild() {
  const acf = path.join(GAME_DIR, "..", "..", "appmanifest_1142710.acf");
  if (!fs.existsSync(acf)) return null;
  const text = fs.readFileSync(acf, "utf8");
  return {
    buildid: /"buildid"\s+"(\d+)"/.exec(text)?.[1] ?? null,
    lastUpdated: new Date(Number(/"LastUpdated"\s+"(\d+)"/.exec(text)?.[1] ?? 0) * 1000).toISOString(),
  };
}

async function main() {
  if (!fs.existsSync(path.join(GAME_DIR, "data", "db.pack"))) throw new Error(`WH3 install not found at ${GAME_DIR}`);
  console.log(`Game: ${GAME_DIR}`);
  fs.rmSync(EXTRACTED, { recursive: true, force: true });

  console.log("Copying packs");
  copyPacks();
  console.log("Schema");
  await ensureSchema();
  const defs = loadSchema(SCHEMA_PATH);
  console.log("DB tables");
  const db = extractDb(defs);
  console.log("Localisation");
  extractLoc(db);
  console.log("Scripts");
  extractScripts();
  console.log("UI files");
  extractUi(db);

  writeJson(path.join(OUT, "manifest.json"), {
    extractedAt: new Date().toISOString(),
    gameDir: GAME_DIR,
    steam: steamBuild(),
    packs: Object.fromEntries(
      [...COPIED_PACKS, ...UI_PACKS].map((p) => {
        const s = fs.statSync(path.join(GAME_DIR, "data", p));
        return [p, { size: s.size, modified: s.mtime.toISOString() }];
      }),
    ),
    schema: SCHEMA_URL,
  });
  console.log("Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
