# Dev notes

Practical notes for working on this repo, collected while building it.

## Environment

- WSL2 on Windows. The game is at `/mnt/c/Program Files (x86)/Steam/steamapps/common/Total War WARHAMMER III`
  (Steam app 1142710). Reading the 1–2 GB UI packs over `/mnt/c` takes a few seconds; that's fine.
- Node 24 (zstd built in), npm 11. `python3` has no pip/venv here; `ffmpeg` is available for image work (resizing, crops, montages).
- The installed game is **patch 9.0.4** (Steam build 25961564, 15 Oct 2026). The RPFM schema commit says "9.0.5", but the
  files match 9.0.4.

## Data pipeline gotchas

- Packs are PFH5. Compressed entries are `u32 size` + a **zstd** frame. The DB header markers are bytes `FD FE FC FF` (GUID) and
  `FC FD FE FF` (version), i.e. LE u32 `0xFFFCFEFD` / `0xFFFEFDFC`.
- DB tables need the RPFM schema (`game_files/schema/schema_wh3.ron`). After a game patch, delete it so it's re-downloaded,
  and re-run the extractor. `decodeTable` throws on trailing bytes, which catches schema mismatches.
- Loc `{{tr:x}}` may reference a `ui_text_replacements` key **without** its `ui_text_replacements_localised_text_` prefix.
- `effects_description_*` templates use `%+n` (signed) and `%n`. Some are hidden: `[STATUS: HIDDEN]`, `[HIDDEN …]`.
- Scope localisation (`campaign_effect_scopes_localised_text_*`) is empty for several important scopes. See `armyCondition` in `build-tree.mjs`.
- Lua scripts are in `data_script.pack`. The Grave Call unit mapping is the `gravecall = { … initiatives = { tmb/cst/vmp } }` block.
- To find which table references a key, decompress every table in `db.pack` and grep the raw bytes (latin1). That's how
  `campaign_effect_lists` and `units_custom_battle_permissions` were found.

## Testing in a browser

- `chromium-cli` is **not** installed. Playwright with headless Chromium is installed in the session scratchpad (not in the
  project) when needed: `npm install playwright@1.55.0 && npx playwright install chromium` in a scratch dir, then
  `chromium.launch({ args: ["--no-sandbox"] })`.
- Start the dev server with `npx vite --port 5173 --strictPort` (background), and poll until `curl -sf http://localhost:5173` works.
- Clicking out a big build node by node is slow (minutes). Instead, make a share link in a throwaway Vitest file
  (`allocate(...)` + `encodeBuild(...)`) and open `http://localhost:5173/#b=<link>`.
- A fresh browser context has empty localStorage, so pass the build in the URL.
- Don't wait on locators that may not exist (`.textContent()` waits 30 s). Check `.count()` first.
- Node positions: use `g[data-key="<initiative key>"] .hit` bounding boxes. Useful classes:
  `g.node.active|locked|closed|match`, `.unit-group`, `.conditional`, `.tooltip`, `ul.results li`.

## Useful one-off checks

- Inspect tree data: `node -e 'const t=require("./public/data/black-pyramid.9.0.4.json"); …'`.
- Run TypeScript core code ad hoc: put a temporary `src/core/zz_*.test.ts` that writes output to a file, run
  `npx vitest run <file>`, then delete it. There's no tsx/ts-node in the project.

## Wiki

- totalwarwarhammer.fandom.com returns 402 to WebFetch. Use the MediaWiki API with curl:
  `https://totalwarwarhammer.fandom.com/api.php?action=parse&page=<Page>&prop=wikitext&format=json`.
