# Roadmap

## M0: Docs and research ✅
- [x] Project docs, game-mechanics research, reference screenshots and icons.

## M1: Data discovery ✅
- [x] Find the tables for nodes, links, gateways, costs and positions (`ui_graph_*`, `initiatives`, `campaign_effect_list*`).
- [x] Positions come from `ui_graph_nodes.x_pos/y_pos`, so no layout tracer is needed.
- [x] Answer the open questions about edges (undirected), gateways (10/50/100, segments), costs (1) and disempowering (individual, costs Dark Magic).
- [x] Document the tables, joins and loc keys in `docs/data-model.md`.
- [x] `tools/extract-game-files.mjs` and `tools/build-tree.mjs` (with built-in validation). They produce `public/data/black-pyramid.9.0.4.json` and the art.
- [ ] Confirm in game: the exact segment-counting rule (see [open questions](game-mechanics.md#open-questions)). The Dark Magic refund cost is irrelevant, because the planner ignores it (see [decisions.md](decisions.md)).

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
- [x] Army-level conditions (Nagash's army, armies led by a given lord) listed per group without splitting groups.
- [x] Character scopes narrow unit targets ("(Nagash)" goes to Nagash only); Nagash and the Legendary Lords added as units.
- [x] "All units" card for bonuses every unit gets.
- [x] Every unit has an image (unit card, fallback portrait, or custom-battle character portrait).

## M3.6: Search and lookup ✅
- [x] Search: unbroken-substring words, all within one field (name or one effect line with scope), connectors excluded, × clear button, ranked results.
- [x] Search results and Units-tab rows show the node tooltip on hover.
- [x] Units tab: pick a unit to highlight every Sigil that can give it bonuses.

## M4: Polish and ship
- [ ] Touch pinch-zoom; a mobile layout check.
- [ ] Shrink images in the build step: unit portraits are 164 px but shown at 22 px (`public/assets/units` ≈ 6 MB), and the background PNG is 6.5 MB.
- [ ] Possibly link the 4 ability-targeted effects (e.g. Khemric Titan "Gaze of Dust") to their units.
- [ ] Deploy to GitHub Pages.

## M5: Planning extras (P1)
- [ ] Sigil budget calculator.
- [ ] Allocation-order build guides.
- [ ] Multiple saved builds, and category filters.

## Later (P2)
- Compare builds, text export, mod tree support, localisation, PWA.
