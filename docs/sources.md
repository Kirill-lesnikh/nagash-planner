# Sources

Research was done on 2026-10-18, against game patch 9.0.4.

## Official
- [CA blog: Lords of the End Times, Meet Nagash](https://community.creative-assembly.com/total-war/total-war-warhammer/blogs/104-total-war-warhammer-iii-lords-of-the-end-times-meet-nagash): mechanic overview and UI screenshots (images under `medias.community.creative-assembly.com/forums/ca-pingu-2295/_UI_IMG1_-1.jpg`, `_UI_IMG1.1_-2.jpg`, `_UI_IMG1.2_.jpg`).
- Patch notes on the wiki: [Patch 9.0.4](https://totalwarwarhammer.fandom.com/wiki/Patch_9.0.4), [Patch 9.0.3](https://totalwarwarhammer.fandom.com/wiki/Patch_9.0.3), [Hotfix 9.0.2](https://totalwarwarhammer.fandom.com/wiki/Hotfix_9.0.2). These name the nodes and give the sigil values.

## Wiki
The pages answer HTTP 402 to plain fetches. Use the MediaWiki API instead: `https://totalwarwarhammer.fandom.com/api.php?action=parse&page=<Page>&prop=wikitext&format=json`.

- [Host of Nagash](https://totalwarwarhammer.fandom.com/wiki/Host_of_Nagash): mechanics summary, sigil sources, victory conditions.
- [Host of Nagash/Strategy](https://totalwarwarhammer.fandom.com/wiki/Host_of_Nagash/Strategy)
- [Undead Legions/Technology Tree](https://totalwarwarhammer.fandom.com/wiki/Undead_Legions/Technology_Tree): a stub, but it hosts the full-tree screenshot.
- [File:The Black Pyramid of Nagash.jpg](https://totalwarwarhammer.fandom.com/wiki/File:The_Black_Pyramid_of_Nagash.jpg): 7911×5703 full-tree image (saved as [reference/black-pyramid-full.jpg](reference/black-pyramid-full.jpg)).
- [Books of Nagash](https://totalwarwarhammer.fandom.com/wiki/Books_of_Nagash), [Mortarchs](https://totalwarwarhammer.fandom.com/wiki/Mortarchs), and the *Black Pyramid of Nagash (Dormant…Exalted)* building pages.

## Game database mirrors
- [twdb.io](https://twdb.io/warhammer3/database/): building data, e.g. [Black Pyramid of Nagash (Mighty)](https://twdb.io/warhammer3/database/buildings/wh3_dlc29_special_settlement_pyramid_of_nagash_nag_4/). It has **no** Black Pyramid node data.

## Community
- [CA bug report 14951](https://community.creative-assembly.com/total-war/total-war-warhammer/bugs/14951-black-pyramid-rotting-prometheans-and-mournguls-grave-call-switchup): node keys, the lua script path, the effect junction table.
- [CA bug report 14774](https://community.creative-assembly.com/total-war/total-war-warhammer/bugs/bugs-redirect/14774-nagash-gains-too-much-intensity-from-black-pyramid-node): the Lore of Undeath +10% node.
- [Steam Workshop: Maximum Nagash Sigils](https://steamcommunity.com/sharedfiles/filedetails/?id=3809127916): ~573 nodes, 1 sigil each, gateways at 10/50/100 (now removed from Workshop).
- [Steam Workshop: Black Pyramid Mechanics Expansion](https://steamcommunity.com/workshop/filedetails/?id=3809283086): mod adding 78 nodes (a P2 mod-support target).
- [KeenGamer Nagash guide](https://www.keengamer.com/articles/guides/total-war-warhammer-iii-lords-of-the-end-times-nagash-faction-guide/): branch overview, screenshots (`/wp-content/uploads/2026/09/The-Black-Pyramid.jpg`, `Black-Pyramid-of-Nagash.jpg`).
- [PC Gamer: "Waiter, there's some Path of Exile in my Total War: Warhammer 3 DLC"](https://www.pcgamer.com/games/strategy/waiter-theres-some-path-of-exile-in-my-total-war-warhammer-3-dlc/)
- [Power Up Gaming Nagash guide](https://powerupgaming.co.uk/2026/09/25/total-war-warhammer-3-nagash-guide-lords-of-the-end-times/)
- YouTube: [NAGASH IS INSANE: Black Pyramid Overview](https://www.youtube.com/watch?v=jqKnUdB-qy4)

## Inspiration
- [PoEPlanner](https://poeplanner.com/): the main UX reference (allocating along a path, search highlight, stat summary, share links).
- [Total War Warhammer Planner](https://totalwarhammerplanner.com/): a skill-tree planner for WH3 characters. It does not cover the Black Pyramid.

## Game files (primary source)
- The local WH3 install, patch 9.0.4, Steam build 25961564. Extracted by `tools/extract-game-files.mjs`. See [data-model.md](data-model.md#pipeline).
- [rpfm-schemas: schema_wh3.ron](https://github.com/Frodo45127/rpfm-schemas): DB table definitions used to decode the tables (the commit used was dated 2026-10-15).
- [RPFM: Rusted PackFile Manager](https://github.com/Frodo45127/rpfm): a GUI for browsing the packs by hand. The pack format follows RPFM's implementation.
