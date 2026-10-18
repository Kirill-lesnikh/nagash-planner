# Data model and data pipeline

## Principles

1. **Game data is the source of truth.** Node names, effects, costs, links and positions are extracted from the game files. They are never hand-written.
2. **One JSON file per game patch**: `public/data/black-pyramid.<gameVersion>.json`. Old files are kept so that old share links keep working.
3. **Stable node keys** use the game's initiative key (e.g. `wh3_dlc29_black_pyramid_archers_1`), never array positions.

## Pipeline

```
WH3 install ──tools/extract-game-files.mjs──▶ game_files/          (git-ignored, raw game data)
                                                  ├─ packs/        db.pack, local_en.pack, data_script.pack (copied)
                                                  ├─ schema/       schema_wh3.ron (RPFM table definitions)
                                                  ├─ extracted/    decoded tables, loc, scripts, UI files
                                                  └─ manifest.json Steam build, pack dates
game_files/extracted ──tools/build-tree.mjs <ver>──▶ public/data/black-pyramid.<ver>.json
                                                     public/data/black-pyramid.<ver>.index.json
                                                     public/assets/{nodes,effects,skin,units}/*.png
```

After a game patch:

```sh
node tools/extract-game-files.mjs          # optional arg: game dir (default: Steam path under WSL), or env WH3_DIR
node tools/build-tree.mjs 9.0.4            # validates the graph; exits non-zero on any problem
```

Requirements:

- **Node ≥ 23.8**, for the built-in `zlib.zstdDecompressSync` (the packs are zstd-compressed). Developed on Node 24.
- An internet connection the first time, to download the [RPFM schema](https://github.com/Frodo45127/rpfm-schemas). After a game patch, delete `game_files/schema/` to fetch a fresh schema.
- No other dependencies. The pack, DB and loc readers live in `tools/lib/`.

### Source files in the game

| What | Pack | Path |
|---|---|---|
| DB tables | `db.pack` | `db/<table>_tables/data__` |
| English text | `local_en.pack` | `text/db/*.loc` |
| Pyramid campaign script | `data_script.pack` | `script/campaign/wh3_dlc29_nag_black_pyramid.lua` |
| Panel layout | `ui3.pack` | `ui/campaign ui/dlc29_nag_black_pyramid.twui.xml` (+ side panel, topbar, tooltip) |
| Node icons, frames, background | `ui2.pack` | `ui/skins/default/dlc29_nag_black_pyramid/` (`icons/` holds the cluster icons, each with an `_active` variant) |
| Effect icons | `ui.pack` | `ui/campaign ui/effect_bundles/*.png` |
| Unit icons | `ui.pack` | `ui/units/icons/*.png`, then `ui/units/minspec_portholes/*.png`, then character portraits `ui/portraits/portholes/no_culture/*.png` |

### DB tables and how they join

```
ui_graphs (key=black_pyramid, origin_node)
ui_graph_nodes (key, graph, x_pos, y_pos, type ∈ gate|key|major|minor, cluster)
  ├─ ui_graph_node_links (parent_node, child_node)        → edges
  ├─ ui_graph_node_unlock_thresholds (ui_graph_node, unlock_threshold) → gateways
  ├─ ui_graph_node_clusters (key, supercluster, image_path) → ui_graph_node_superclusters (key, sort_order)
  └─ initiative_to_ui_graph_node_junctions (ui_graph_node, initiative)
       └─ initiatives (key, effects, point_cost, image_path, …)
            ├─ initiative_set_items (item, set) → initiative_sets (wh3_dlc29_pyramid_initiative_set)
            └─ campaign_effect_lists (key = initiatives.effects)
                 └─ campaign_effect_list_effect_junctions (effect, effect_list, scope, value)
                      ├─ effects (effect, icon, priority, is_positive_value_good)
                      └─ campaign_effect_scopes (key)
```

### Which units an effect applies to

```
factions (wh3_dlc29_nag_host_of_nagash).military_group
  └─ units_to_groupings_military_permissions (unit, military_group)        → the roster (150 units)
     + EXTRA_CHARACTER_UNITS in extract-game-files.mjs (Nagash, Arkhan, Mannfred, Vlad, Luthor, Neferata:
       named in effect scopes but not recruitable)                         → 156 units
       └─ main_units (unit, caste, land_unit) → land_units (key, category, class)

effect ─┬─ effect_bonus_value_ids_unit_sets (effect, unit_set)                       → unit set
        ├─ effect_bonus_value_unit_record_junctions (effect, unit_record_key)        → one unit
        ├─ effect_bonus_value_unit_set_unit_ability_junctions (unit_set_ability)     → unit_set_unit_ability_junctions.unit_set
        ├─ effect_bonus_value_unit_set_unit_attribute_junctions (unit_set_attribute) → unit_set_unit_attribute_junctions.unit_set
        └─ effect_bonus_value_unit_set_special_ability_phase_junctions (…)           → unit_set_special_ability_phase_junctions.unit_set
unit set → unit_set_to_unit_junctions (unit_set, unit_record, unit_caste, unit_category, unit_class, exclude)
```

**Set membership:**

- A roster unit is in a set if it matches at least one include row and no exclude row.
- A row matches when every field it fills in (unit, caste, category, class) equals the unit's value.
- Some sets only apply from a given rank (`unit_sets.use_unit_exp_level_range`). The effect text already says "(Rank 7 and above)".

**Scope narrowing (important):** the unit set only says which units an effect *could* reach. The scope of the
`campaign_effect_list_effect_junctions` row narrows it. Generic character stat effects (e.g.
`wh_main_effect_character_stat_melee_attack`) target a set of **every** unit, and the same effect key is reused with
different scopes. `build-tree.mjs` (`narrowByScope`) applies:

| Scope | Units kept |
|---|---|
| target `character_if_faction_leader` (`faction_to_faction_leader_alt_nagash`) | Nagash (`*_cha_nagash`) |
| `faction_to_character_<krell\|dieter\|walach\|luthor\|arkhan\|mannfred\|vlad\|neferata>` | that character's units |
| `…heroes_only` | caste `hero` |
| target `character_when_commanding` (`faction_to_lords_own`) | caste `lord` |
| other target `character` (all characters) | castes `lord` + `hero` |
| force / army / region scopes | unchanged |

Because of this, targets are stored **per effect and scope**. The key is the effect key, or `effect@scopeKey` when the
scope narrows the set. Each node effect carries `target` pointing at its key.

**Army-level conditions:** see `armyCondition` in `build-tree.mjs` and [game-mechanics.md §4](game-mechanics.md#4-node-effects).
Effects with a condition get `condition` (and a visible `scope` even when the game's scope text is empty).

**Grave Call unlocks:** these are scripted. `build-tree` reads the `gravecall.initiatives` table in `wh3_dlc29_nag_black_pyramid.lua` (node → unit keys) and assigns those units to the node's `*gravecall_unlock*` effect.

**What stays general:** effects aimed at abilities, the faction or the campaign (lore spell cooldowns, recruitment
capacity, army abilities, …). Four ability-specific effects name a unit in their text (e.g. "Gaze of Dust" cooldown for
the Khemric Titan) but target an ability, not a unit set; `land_units_to_unit_abilites_junctions` doesn't link them to
roster units, so they stay general.

**Unit images** (all 156 units have one), in this order:

1. `ui/units/icons/<unit>.png`: card icons, newer units only.
2. `ui/units/minspec_portholes/<unit>.png`: the game's static fallback portraits.
3. Lords and heroes: `units_custom_battle_permissions.general_portrait`, preferring the Host of Nagash row. Variants
   without a row borrow the closest relative's portrait (stem after `_cha_`, trailing parts dropped). The extractor
   writes this as the derived table `extracted/db/unit_portraits.json` and copies the images to `extracted/ui/character_portraits/`.

### Localisation keys

| Text | Key |
|---|---|
| Node name / description | `initiatives_localised_name_<initiative>` / `initiatives_localised_description_<initiative>` |
| Cluster | `ui_graph_node_clusters_localised_title_<key>` / `…_description_<key>` |
| Supercluster | `ui_graph_node_superclusters_localised_title_<key>` |
| Effect template | `effects_description_<effect>`. `%+n` means a signed value, `%n` a plain value |
| Scope suffix | `campaign_effect_scopes_localised_text_<scope>`, e.g. `\n(all armies)` |
| Panel strings | `ui_text_replacements_localised_text_wh3_dlc29_nag_black_pyramid_*` |

Text markup:

- `{{tr:<key>}}` includes another loc entry. The key is either a full key, or a `ui_text_replacements` key without its `ui_text_replacements_localised_text_` prefix.
- `[[img:x]][[/img]]` is an inline icon.
- `[[col:x]]…[[/col]]` is colour.
- `[[sl:x]]…[[/sl]]` is a help link.

`build-tree` resolves the includes, turns bullet icons into "• ", and strips the rest of the markup.

## Tree data (`public/data/black-pyramid.<ver>.json`)

```ts
interface TreeData {
  schemaVersion: 1;
  gameVersion: string;            // "9.0.4"
  source: "game-extract" | "sample" | `mod:${string}`;
  startNode: string;              // "wh3_dlc29_black_pyramid_start"
  superclusters: { key: string; name: string; sortOrder: number }[];
  clusters: { key: string; name: string; description: string; supercluster: string; icon?: string; sortOrder: number }[];
  gateways: { node: string; threshold: number }[];
  nodes: TreeNode[];              // sorted by key
  edges: [string, string][];      // undirected, deduplicated
  effectTemplates: Record<string, string>;      // effect key -> text with %+n / %n, for summing values
  units: { key: string; name: string; caste: string; culture: string; icon?: string }[];  // units some effect targets (156)
  effectTargets: Record<string, string[]>;      // target key ("effect" or "effect@scope") -> unit keys
  unitEffectTemplates: Record<string, string>;  // effect key -> text without "for <units> units" / "when led by …" (per-unit display)
}

interface TreeNode {
  key: string;                    // initiative key
  graphNode: string;              // ui_graph_nodes key, e.g. "wh3_dlc29_r0-c5-cell4-2"
  name: string;
  description?: string;
  tier: "start" | "gateway" | "notable" | "small" | "connector";   // from game type: key|gate|key|major|minor
  cost: number;                   // 1 (start: 0)
  x: number; y: number;           // game UI coordinates (x 110–1471, y 100–1100); background image is 2× this space
  icon?: string;                  // "assets/nodes/icon_node_archer.png" (active variant: same name + "_active"); connectors have none
  cluster?: string;               // connectors and gateways have no cluster
  // condition: army-level limit derived from the scope, e.g. "Nagash's army" (scope target force_if_commanded_by_faction_leader)
  // or "armies led by a Tomb Kings Lord or Nagash" (scope keys *_force_own_{tmb,vmp,cst}[_nag]_unseen, which have no text)
  // target: key into effectTargets when the effect applies to specific units (after scope narrowing)
  effects: { key: string; text: string; value: number; scope?: string; condition?: string; target?: string; icon?: string }[];
}
```

Node frames by tier and state are in `public/assets/skin/nag_pyramid_node_<minor|major|key|gate>[_selected|_chosen…].png`.

## Build state

```ts
interface Build {
  gameVersion: string;
  allocated: string[];            // node keys in allocation order (feeds the build-guide feature)
  name?: string;
  notes?: string;
}
```

## Build encoding

Share links have the form `#b=<v>.<payload>`.

- `v`: a short **data version id** that maps to a game-data file (e.g. `904`).
- `payload`: **base64url** of
  - byte 0: encoding version,
  - then the allocated nodes as **16-bit indices** into `black-pyramid.<ver>.index.json` (keys sorted alphabetically, committed with each data file), in allocation order.

About 150 nodes take roughly 400 characters. If links turn out too long, an alternative is a bitset (516 bits = 65 bytes ≈ 88 chars) plus an optional order section.

Migration: when a link's data version is older than the current one, its keys are mapped from the old index table to the new data. Unknown keys are dropped and the user is told.

## Sample data

UI work that needs a fake tree should use `source: "sample"`. Now that real data exists, prefer the real file.
