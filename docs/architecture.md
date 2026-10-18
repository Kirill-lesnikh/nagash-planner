# Architecture

> Status: **proposed**. Nothing is built yet. Change this file when decisions change.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Typed tree data and graph logic. |
| Build | Vite | Fast dev server, static output. |
| UI | React 18 | Panels, search and summary are standard UI work. |
| Tree rendering | **SVG** in one `<svg>` with a transformed `<g>` | About 600 nodes and 700 edges is fine for SVG. It gives hit-testing, CSS states and crisp icons for free. Move to Canvas/PixiJS only if profiling shows a need. |
| Pan/zoom | `d3-zoom` (only this d3 module) | Mature wheel, pinch and drag handling. |
| State | Zustand | Small, with no boilerplate. Undo/redo through a history middleware. |
| Tests | Vitest | Unit tests for the core logic (pathing, encoding, validation). |
| Data tools | Plain Node ESM scripts in `tools/` (no dependencies; Node ≥ 23.8 for zstd) | **Built.** See [data-model.md](data-model.md#pipeline). |
| Hosting | GitHub Pages (static) | Free; there is no backend. |

## Layout

```
nagash_calc/
├── docs/                    project documentation (this folder)
│   └── reference/           screenshots and icons gathered during research
├── game_files/              raw game packs and extracts (git-ignored, see game_files/README.md)
├── public/
│   ├── data/                generated tree JSON per game version, plus index tables
│   └── assets/              nodes/ (cluster icons), effects/ (effect icons), skin/ (background, node frames)
├── src/
│   ├── core/                framework-free logic: NO React imports
│   │   ├── types.ts         TreeData / Build types (see docs/data-model.md)
│   │   ├── graph.ts         adjacency, reachability from the start, orphan detection
│   │   ├── pathing.ts       shortest path from the allocated set to a target (multi-source BFS, weighted by cost)
│   │   ├── rules.ts         allocate / deallocate / gateway validation
│   │   ├── summary.ts       aggregate effects across allocated nodes
│   │   ├── encoding.ts      build ↔ URL hash, version migration
│   │   └── search.ts        text index over names, effects, unit names
│   ├── state/               Zustand store, history (undo/redo), URL sync, localStorage
│   ├── components/
│   │   ├── tree/            TreeCanvas, NodeView, EdgeView, Tooltip
│   │   ├── panels/          SummaryPanel, SearchBar, SigilCounter, BudgetCalculator
│   │   └── layout/          app shell, toolbar
│   └── main.tsx
├── tools/
│   ├── lib/                 pack.mjs (PFH5 reader), schema.mjs (RPFM schema), db.mjs (DB tables + .loc)
│   ├── extract-game-files.mjs
│   └── build-tree.mjs
└── tests/
```

## Core logic notes

- **Allocation path**: run a multi-source BFS from every allocated node at once (Dijkstra if costs ever differ from 1) to the target. Walk only unallocated nodes whose gateway is satisfied. The search runs on hover for the path preview, which is cheap at this size.
- **Deallocation**: remove the node, then run a BFS from the start over what is still allocated. Anything not reached gets removed too. Then re-check the gateway thresholds against the new count.
- **Gateway check**: precompute each node's **segment** (0–3) by blocking every gateway of tier ≥ k and running a BFS from the start. A gateway of tier k can be allocated when the allocated nodes in segments < k number at least its threshold. A deallocation is invalid if any allocated gateway then fails this check. See [game-mechanics.md §2](game-mechanics.md#2-allocation-rules).
- **Pure functions**: `core/` functions take `(tree, build)` and return a new build or a result. They have no side effects, which makes undo/redo trivial and keeps them testable.

## Rendering notes

- Draw in this order: background (an optional faint pyramid shape) → edges → nodes → highlights → labels.
- Node state is shown with CSS classes on the `<g>` of each node, not with re-renders. React memoises `NodeView` by `(key, state)`.
- Level of detail: hide labels and connector icons below a zoom threshold.
- Icons are referenced through `<image href>`. Preload them all; the total is small.
