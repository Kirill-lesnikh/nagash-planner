# CLAUDE.md

A web planner for the **Black Pyramid of Nagash** research tree (*Total War: Warhammer III*, Nagash DLC), in the style of PoEPlanner. Start with [README.md](README.md). The docs in `docs/` are the spec.

## Read before working
- Game rules: [docs/game-mechanics.md](docs/game-mechanics.md). Check the **Open questions** section before writing rules logic.
- What to build: [docs/features.md](docs/features.md) (P0 = MVP).
- Data pipeline, schema and URL format: [docs/data-model.md](docs/data-model.md).
- Stack and folder layout: [docs/architecture.md](docs/architecture.md).

## Commands
- `npm run dev` (http://localhost:5173), `npm test` (Vitest, core logic on the real data), `npm run build` (`tsc` + Vite into `dist/`).
- `node tools/extract-game-files.mjs`: copy and extract from the WH3 install into `game_files/` (default path `/mnt/c/Program Files (x86)/Steam/steamapps/common/Total War WARHAMMER III`).
- `node tools/build-tree.mjs 9.0.4`: build `public/data/black-pyramid.9.0.4.json` and `public/assets/`. It validates the graph and fails loudly.

## Rules
- **Never invent node data.** Everything about nodes comes from the generated `public/data/black-pyramid.<ver>.json`. To change it, fix the extractor or builder, not the JSON.
- When you learn a new game fact, add it to `docs/game-mechanics.md` with a tag (**[G]** game files, **[V]** official, **[C]** community/inferred, **[?]** open) and add any source to `docs/sources.md`.
- `game_files/` holds raw game files and is git-ignored. Never commit it.
- Keep `src/core/` free of React and side effects. It is pure functions over `(tree, build)`, unit-tested with Vitest.
- Node identity is the initiative key. Never use array indices outside the URL encoder's versioned index table.
- Keep the docs current: update the roadmap checkboxes and architecture decisions when they change.

## Fetching wiki pages
totalwarwarhammer.fandom.com returns 402 to WebFetch. Use the API with curl:
`https://totalwarwarhammer.fandom.com/api.php?action=parse&page=<Page>&prop=wikitext&format=json`
