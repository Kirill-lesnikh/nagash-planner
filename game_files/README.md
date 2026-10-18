# game_files/

Raw data copied and extracted from a local *Total War: Warhammer III* install. **Git-ignored.** These are Creative Assembly / Games Workshop files and must not be redistributed. Regenerate with:

```sh
node tools/extract-game-files.mjs ["/path/to/Total War WARHAMMER III"]
```

| Path | Contents |
|---|---|
| `packs/` | Copies of `db.pack`, `local_en.pack`, `data_script.pack`. The UI packs (1–2 GB) are read in place, not copied. |
| `schema/schema_wh3.ron` | RPFM table definitions used to decode DB tables |
| `extracted/db/*.json` | Decoded DB tables (Black Pyramid rows only, for large shared tables) |
| `extracted/loc/en.json` | English text needed by the tree, with `{{tr:}}` references followed |
| `extracted/script/*.lua` | Pyramid, Mortarch, endgame and Books of Nagash campaign scripts |
| `extracted/ui/layout/` | Panel layouts (`*.twui.xml`) |
| `extracted/ui/skin/` | Panel art: background, node frames, cluster icons |
| `extracted/ui/effect_icons/` | Icons referenced by node effects |
| `manifest.json` | Steam build id, pack dates, extraction time |

The planner's data is built from here by `node tools/build-tree.mjs <gameVersion>`. See [docs/data-model.md](../docs/data-model.md).
