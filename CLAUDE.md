# CLAUDE.md

A web planner for the **Black Pyramid of Nagash** research tree (*Total War: Warhammer III*, Nagash DLC, patch 9.0.4),
in the style of PoEPlanner. It's a working app: Vite + React + TypeScript, with tree data extracted straight from the
game files. Start with [README.md](README.md).

## Read before working
- **[docs/decisions.md](docs/decisions.md)**: what the user asked for and why things behave as they do (search rules,
  free refunds, enforced gateways, unit grouping, …). **Don't change these without asking.**
- [docs/architecture.md](docs/architecture.md): code layout and how the core logic works.
- [docs/game-mechanics.md](docs/game-mechanics.md): game rules and findings, tagged by source. Check **Open questions** before writing rules logic.
- [docs/data-model.md](docs/data-model.md): extraction pipeline, DB tables and joins, unit targeting, tree JSON schema, URL format.
- [docs/dev-notes.md](docs/dev-notes.md): environment, pipeline gotchas, how to test in a headless browser.
- [docs/features.md](docs/features.md) and [docs/roadmap.md](docs/roadmap.md): spec and what's left.

## Commands
- `npm run dev` (http://localhost:5173), `npm test` (Vitest, core logic on the real data), `npm run build` (`tsc` + Vite into `dist/`).
- `node tools/extract-game-files.mjs`: copy and extract from the WH3 install into `game_files/` (default path
  `/mnt/c/Program Files (x86)/Steam/steamapps/common/Total War WARHAMMER III`).
- `node tools/build-tree.mjs 9.0.4`: build `public/data/black-pyramid.9.0.4.json` and `public/assets/`. It validates the
  graph and fails loudly. It also prints any per-unit texts still naming units, and any units without an icon.

## Deployment
- GitHub: `git@github.com:Kirill-lesnikh/nagash-planner.git` (remote `origin`, pushed over SSH; the `gh` CLI is not installed).
- Pushing to `main` runs `.github/workflows/deploy.yml`: `npm ci`, `npm test`, `npm run build`, then publish `dist/` to
  GitHub Pages at https://kirill-lesnikh.github.io/nagash-planner/. Pages must be enabled once in the repo settings
  (Source: GitHub Actions). Pages on a private repo needs a paid GitHub plan.
- Pushing publishes code and game art publicly. Push only when the user asks.

## Rules
- **Never invent node data.** Everything about nodes comes from the generated `public/data/black-pyramid.<ver>.json`. To
  change it, fix the extractor or builder, not the JSON.
- When you learn a new game fact, add it to `docs/game-mechanics.md` with a tag (**[G]** game files, **[V]** official,
  **[C]** community/inferred, **[?]** open) and any source to `docs/sources.md`.
- When the user makes a product decision or corrects behaviour, record it in `docs/decisions.md`.
- Keep project context **in this repo** (this file and `docs/`), not in global memory. The user asked for that.
- `game_files/` holds raw game files and is git-ignored. Never commit it.
- Keep `src/core/` free of React and side effects: pure functions over the tree index and allocation list, tested in
  `src/core/core.test.ts` against the real data.
- Node identity is the initiative key. Never use array indices outside the URL encoder's versioned index table.
- Unit targeting goes through `node.effects[].target` → `effectTargets`, never by effect key alone (the same effect key
  can have different targets per scope).
- Verify UI changes in a real browser (see dev-notes) before reporting them done. Commit only when asked.
- Keep the docs current: architecture, roadmap checkboxes, decisions.
