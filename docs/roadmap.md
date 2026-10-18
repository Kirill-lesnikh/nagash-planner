# Roadmap

## M0: Docs and research ✅
- [x] Project docs, game-mechanics research, reference screenshots and icons.

## M1: Data discovery ✅
- [x] Find the tables for nodes, links, gateways, costs and positions (`ui_graph_*`, `initiatives`, `campaign_effect_list*`).
- [x] Positions come from `ui_graph_nodes.x_pos/y_pos`, so no layout tracer is needed.
- [x] Answer the open questions about edges (undirected), gateways (10/50/100, segments), costs (1) and disempowering (individual, costs Dark Magic).
- [x] Document the tables, joins and loc keys in `docs/data-model.md`.
- [x] `tools/extract-game-files.mjs` and `tools/build-tree.mjs` (with built-in validation). They produce `public/data/black-pyramid.9.0.4.json` and the art.
- [ ] Remaining: the Dark Magic disempower cost, and the exact segment-counting rule (see [open questions](game-mechanics.md#open-questions)). Confirm in game.

## M2: Core logic ✅
- [x] Scaffold Vite + React + TS + Vitest.
- [x] `core/types.ts`, plus the tree index with gateway segments.
- [x] Pathing, allocate, refund (free and instant; disconnected Sigils and under-threshold gateways go too), gateway locking, build cleanup on load. Unit tests run on the real data.
- [x] Build encoding and decoding, with tests.

## M3: MVP UI ✅
- [x] SVG tree on the game background, using the game's node frames and icons; pan, wheel zoom, double-click to fit.
- [x] Tooltip with effects and path cost. Click to empower along a path; click an empowered Sigil to refund it (with a red preview of what goes).
- [x] Sigil counter, including gateway shortfalls.
- [x] Search with highlight, result list, and click to jump.
- [x] Combined bonuses grouped by section (supercluster). Effects are summed; hovering a line highlights its source nodes.
- [x] URL share, localStorage autosave, undo/redo, reset.

## M3.5: Bonuses per unit ✅
- [x] Extract the roster, unit sets and effect→unit links; resolve them in `build-tree`, including scripted Grave Call unlocks.
- [x] "By unit" summary: per-unit sums, with units merged when their bonuses are identical.

## M4: Polish and ship
- [ ] Touch pinch-zoom; a mobile layout check.
- [ ] Convert the images to webp if size matters.
- [ ] Deploy to GitHub Pages.

## M5: Planning extras (P1)
- [ ] Sigil budget calculator.
- [ ] Allocation-order build guides.
- [ ] Multiple saved builds, and category filters.

## Later (P2)
- Compare builds, text export, mod tree support, localisation, PWA.
