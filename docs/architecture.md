# Architecture

> Status: **built**. This describes the code as it is. Update it when the code changes.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | `tsc` runs as part of `npm run build`. |
| Build / dev server | Vite 6 | `base: "./"`; bundles go to `dist/static/` (`public/assets/` holds the game art). |
| UI | React 18, no UI library | Plain components and CSS in `src/styles.css`. |
| Tree rendering | One SVG, with a `<g transform>` for pan/zoom | 516 nodes + 554 edges. Node frames and icons are `<image>` elements using the game's art. |
| Pan / zoom | Hand-written in `TreeView.tsx` | Wheel zoom around the cursor (non-passive listener), drag to pan (4 px threshold separates drag from click), double-click to fit. No touch pinch yet. |
| State | `useReducer` in `state.ts` | Allocation list + undo/redo history, mirrored to the URL hash and localStorage. Other UI state is `useState` in `App.tsx`. |
| Tests | Vitest | `src/core/core.test.ts` runs against the real `public/data/black-pyramid.9.0.4.json`. |
| Data tools | Plain Node ESM in `tools/`, no dependencies | Node ≥ 23.8 for `zlib.zstdDecompressSync`. See [data-model.md](data-model.md#pipeline). |
| Hosting | Static (planned: GitHub Pages) | No backend. |

## Layout

```
nagash_calc/
├── CLAUDE.md                instructions + context for AI sessions (start here)
├── docs/                    spec and findings (this folder)
│   ├── decisions.md         user decisions and why the planner behaves as it does
│   ├── dev-notes.md         how to work on this repo (testing in a browser, gotchas)
│   └── reference/           screenshots and icons gathered during research
├── game_files/              raw game packs and extracts (git-ignored, see game_files/README.md)
├── public/
│   ├── data/                black-pyramid.<ver>.json + .index.json (generated, committed)
│   └── assets/              nodes/, effects/, skin/, units/ images (generated from game files)
├── src/
│   ├── core/                framework-free logic: NO React imports, pure functions
│   │   ├── types.ts         TreeData and friends (mirrors docs/data-model.md)
│   │   ├── tree.ts          buildIndex: lookups, adjacency, gateway tiers, node segments, units
│   │   ├── rules.ts         pathTo, allocate, refund(Set), gatewayStatus, closedGates, reachable, lockReason, normalize
│   │   ├── summary.ts       summarize (by section), summarizeByUnit (per-unit groups, army conditions, "All units")
│   │   ├── units.ts         unitBonuses (Sigils that reach a unit), searchUnits
│   │   ├── search.ts        termScore + buildSearch (Sigil search)
│   │   ├── encoding.ts      build ↔ "#b=904.<base64url>" share string
│   │   └── core.test.ts     all unit tests
│   ├── state.ts             useBuild: allocation + undo/redo + URL/localStorage sync, cleanup on load
│   ├── App.tsx              data loading; Planner: hover/preview, search state, Units tab state, keyboard shortcuts
│   ├── components/
│   │   ├── TreeView.tsx     SVG tree, pan/zoom, node/edge states (active, preview, remove, locked, closed, match)
│   │   ├── Tooltip.tsx      node tooltip (effects, cost, lock reason, refund preview); used by tree, search and unit rows
│   │   └── Sidebar.tsx      Sigil counter + gateways, Sigils/Units search tabs, Combined bonuses (By section / By unit)
│   ├── styles.css
│   └── main.tsx
└── tools/
    ├── lib/                 pack.mjs (PFH5 reader), schema.mjs (RPFM .ron → defs), db.mjs (DB tables + .loc)
    ├── extract-game-files.mjs
    └── build-tree.mjs       joins tables → tree JSON, resolves unit targets, copies images, validates
```

## Core logic

- **Index** (`tree.ts`): adjacency lists, gateway tiers (from the sorted distinct thresholds 10/50/100), and each node's
  **segment** (0–3). The segment is the lowest k at which the node can be reached from the start when only gateways of
  tier ≤ k may be crossed.
- **Allocation** (`rules.pathTo`): a multi-source BFS from the active set to the target.
  - First it tries the unrestricted shortest path and accepts it if the result is valid (the path's own Sigils count
    towards thresholds).
  - Otherwise it goes around closed gateways.
  - It returns `[]` if the target can't be reached yet.
- **Refund** (`rules.refundSet`): remove the node, then `prune`. Prune keeps only what is connected to the start, drops
  every gateway whose tier now falls short, and repeats until stable. Saved and shared builds go through the same
  `normalize` on load.
- **Gateway status** (`rules.gatewayStatus`): for tier t, a BFS from the start over *allocated* nodes that never enters a
  gateway of tier ≥ t; the cost of what it reaches is counted against threshold t. "Open" means count ≥ threshold.
  Static segments are **not** used for this. Nodes behind a gateway can have a lower segment (reachable the long way
  round), and counting them let a click pass through a locked gateway (the Tides of the Abyss bug).
- **Summaries** (`summary.ts`):
  - **By section:** effects grouped by the node's supercluster (plus "Pathways to Eternity" and "Gateways"). Identical
    effect + scope are summed and re-rendered from `effectTemplates`.
  - **By unit:** each node effect with a `target` is added per unit, keyed by per-unit template + scope + condition.
    - Effects whose target covers every unit go to **"All units"** instead.
    - Units are grouped by their *unconditional* lines; units with only army-level lines are grouped by those.
    - Army-level lines appear per group under their condition, naming the units when only some of the group get them.
    - Untargeted effects go under "Not unit-specific".
- **Search** (`search.ts`): space-separated terms. Each term must appear as an unbroken substring (mid-word is fine).
  All terms must match within **one field**: the node name, or a single effect line with its scope. Terms can come in
  any order. Connectors are excluded. Results are ranked: word start +20, whole word +10.
- **Unit lookup** (`units.ts`): Sigils with any effect whose target contains the unit; unit-specific Sigils first, then
  "Bonuses for every unit". Connectors are excluded (all 101 give Nagash the same bonuses).

## Rendering notes

- Draw order: background `bg_nag_black_pyramid.png` (1600×1200 in tree coordinates, i.e. half its pixel size) → edges → nodes.
- Node frame image by tier and state:
  - default: `nag_pyramid_node_{key,major,minor,gate}.png`
  - allocated: `…_chosen.bg` / `gate_complete_bg`
  - path preview: `…_selected`

  Icons switch to their `_active.png` variant when allocated.
- Closed gateways get `chained_lock.png` on top. Nodes behind a closed gateway get the CSS class `locked` (dimmed). While
  searching, non-matching nodes dim and matches get a gold ring.
- `NodeView` is `memo`ised on its props, so hovering recomputes the preview sets but only re-renders the nodes that change.
- Layout: the tree pane fills the window (`position: absolute; inset: 0`). The side panel `.sidebar-wrap` floats over its
  right 400 px and slides out with `transform: translateX(100%)` when collapsed. The toggle button sits at `left: -22px`, so
  it stays visible at the window edge. The tree never resizes when toggling, so nothing moves. `TreeView`'s `fit()` takes
  a `rightInset` (400 when the panel is open) so the fitted tree isn't hidden under the panel. On window resize the view
  shifts by half the size change to keep its centre. Narrow screens (≤ 800 px) stack the panel below the tree instead.
- Tooltip opens next to the cursor on the tree. From sidebar rows it's anchored to the row's left edge
  (`Hover.side = "left"`) so it never covers the list.
