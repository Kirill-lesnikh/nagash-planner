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
                                                     public/assets/{nodes,effects,skin}/*.png
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
  effects: { key: string; text: string; value: number; scope?: string; icon?: string }[];
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
