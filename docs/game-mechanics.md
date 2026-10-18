# The Black Pyramid of Nagash: game mechanics reference

What is known about the Black Pyramid tree in *Total War: Warhammer III* (DLC *Nagash – Lords of the End Times*, released Sept 2026). The data is current as of patch **9.0.4** (Steam build 25961564, 15 Oct 2026). The planner must reproduce these rules.

Every fact here is tagged:

- **[G]** extracted from the game files (DB tables, localisation, scripts). This is authoritative. See [data-model.md](data-model.md).
- **[V]** verified from official patch notes, the CA blog, or the wiki.
- **[C]** community-reported or inferred. Probably right, but unconfirmed.
- **[?]** open question.

Sources are listed in [sources.md](sources.md).

---

## 1. What the Black Pyramid is

- It is the **research tree of the Undead Legions** (playable faction `wh3_dlc29_nag_host_of_nagash`), and it replaces the normal technology tree. **[V]**
- Internally it is an **initiative set**, `wh3_dlc29_pyramid_initiative_set` (category `DLC29_BLACK_PYRAMID`), drawn as the UI graph `black_pyramid`. Each node is one **initiative**. **[G]**
- Nodes are called **Sigils** in the UI. Empowering one takes effect immediately; there are no research turns. **[V]**
- The currency is **Empowered Sigils** ("mystic sigils" in the files). Each source of sigils raises the set's point limit through the effect `wh3_dlc29_effect_initiative_set_point_increase_black_pyramid`. **[G]**
- The panel uses **select, then confirm**. You select Sigils (shown as "Selected Sigils: N" with "Selected Sigil Effects"), then confirm the change. **[G]**
- Other panel features:
  - a **Search** box (since 9.0.4 it also matches unit names) **[V]**
  - a **Sigil Browser**, a category list that highlights matching nodes on hover **[G]**
  - an "active effects" filter per cluster **[G]**
- The panel is locked while Nagash does not own the Black Pyramid region. **[V]**

## 2. Allocation rules

All of these come from game data or in-game text. **[G]**

1. **Connectivity.** "Sigils can be empowered by selecting them, and only when connected to already Empowered Sigils."
   - The start node, *The Beginning of the End* (`wh3_dlc29_black_pyramid_start`), costs 0 and is active by default (`origin_active_by_default`).
2. **Links are undirected in practice.** The DB stores links as `parent_node → child_node`, but following child links from the origin reaches only 61 of 516 nodes. Treated as undirected, the graph is fully connected. The planner treats edges as undirected. (The direction may only matter for drawing.) **[G]** data, **[C]** interpretation.
3. **Cost.** Every node costs **1 sigil**, except the start node (0). There are no other costs: `required_cost` and `expended_cost` are empty.
4. **No exclusive choices.** The set has no `exclusive_group`. No set items are `initially_locked`. Nothing in `mutually_exclusive_initiative_set_categories` is linked to the pyramid.
5. **Gateways.** There are 8 gateway nodes in 3 tiers. Each costs 1 sigil and **has its own effects**.

   | Gateway | Nodes | Threshold | Position (x,y) |
   |---|---|---|---|
   | Gateway I | `lock_1_a`, `lock_1_b` | **10** | (705,930), (875,930) |
   | Gateway II | `lock_2_a`, `lock_2_b`, `lock_2_c`, `lock_2_d` | **50** | (280,887), (556,674), (1024,674), (1301,887) |
   | Gateway III | `lock_3_a`, `lock_3_b` | **100** | (514,547), (1067,547) |

   The in-game texts:
   - Gateway description: "You must empower N Sigils **before this point** in order to unlock this Sigil"
   - Node tooltip: "Empowered Sigils required to reach this node: %d"
   - When confirming: "Empower %d more Sigils before this point or Disempower all Empowered Sigils after this point to be able to confirm your changes"
   - Elsewhere: "Your selection does not meet the requirements for one or more gateway Sigils"
6. **Segments.** The gateways split the tree into nested segments. This was computed from the graph by blocking all gates of a tier and above. **[G]**

   | Segment | Reached after | Nodes (cumulative) |
   |---|---|---|
   | 0 | start | 36 |
   | 1 | Gateway I (10) | 252 |
   | 2 | Gateway II (50) | 432 |
   | 3 | Gateway III (100) | 516 |

   **Planner model [C]:** a gateway of tier *k* can be empowered when the sigils "before" it number at least its
   threshold. "Before" means: empowered sigils reachable from the start **through empowered sigils**, without passing
   through any gateway of tier ≥ *k* (earlier gateways included). This is counted on the actual allocation, not on the
   static segments. Some spots behind a gateway can also be reached by a longer route around it (e.g. *Tides of the
   Abyss*: its shortest path crosses Gateway II, but it is in segment 1), and sigils allocated *through* the gateway
   must not count towards it. A change is invalid if it leaves any empowered gateway short. The planner enforces this:
   locked gateways block allocation (paths go around them), and refunds cascade through gateways that fall short.
7. **Disempowering (re-allocation).** You can disempower **individual Sigils** or **all active Sigils** at once. It **costs Dark Magic** (the faction's gold). You cannot confirm without enough Dark Magic, or if the change would leave a segment without enough sigils to keep a required gateway unlocked. **[G]**
   - **[?]** The Dark Magic refund formula (it is not in the initiative tables; probably script/code). *The planner deliberately ignores refund costs (user decision), so this doesn't block anything.*
   - **[?]** Does disempowering a node strand its now-disconnected descendants? The planner should simply require the result to stay connected.

## 3. Tree size and layout

**[G]**, from `ui_graph_nodes`. Coordinates range over x 110–1471 and y 100–1100. The start node is at (790,1100), bottom centre. The panel background `bg_nag_black_pyramid.png` is 3200×2400, which is about twice the coordinate space.

| Game node type | Planner tier | Count | What it looks like |
|---|---|---|---|
| `key` | notable (one of them is the start node) | 136 | large node with a cluster icon |
| `major` | small | 271 | regular node |
| `minor` | connector | 101 | small dot on the "roads". All are named **"Pathways to Eternity"** (`transit_N`) and give small Nagash buffs (e.g. "Barrier hit points: +15 (Nagash)") |
| `gate` | gateway | 8 | gold ring with chains |

- **516 nodes** in total and **554 unique links** (555 rows, one pair is stored in both directions).
- **51 clusters** grouped into **9 superclusters**. Superclusters, in UI sort order:
  1. Nagash
  2. Infantry
  3. Missiles
  4. Cavalry & Chariots
  5. Monsters & Beasts
  6. Artillery & War Machines
  7. Mortarchs
  8. Winds of Magic
  9. Other
- Clusters include, among others: Skeletons, Zombies, Guards, Archers, Guns, Knights, Morghast, the Lores of Magic (Undeath, Death, Vampires, Shadows, Nehekhara, the Deep, Light), one per Mortarch (Arkhan, Mannfred, Vlad, Neferata, Luthor, Krell, Dieter, Walach, The Nameless), Shambling Hordes, Infernal Legions, Settlements, Recruitment, Dead Rise Again, Battles, and the three rosters (Tomb Kings, Vampire Counts, Vampire Coast). The full list is in the generated data.

## 4. Node effects

- Each node's effects come from a `campaign_effect_list` (516 nodes, 411 distinct lists), rendered with the game's own effect text and scope text. **[G]**
- Effect types include:
  - unit stat buffs
  - attributes and abilities
  - **Grave Call recruitment unlocks**
  - campaign/economy modifiers
  - Necropolis cap
  - spells
- Some node behaviour lives in the campaign script `script/campaign/wh3_dlc29_nag_black_pyramid.lua`. **[G]**

  | Node | Script behaviour |
  |---|---|
  | `nagash_mid_8` *Omnipresent Darkness* | Opens fast-travel between the Black Pyramid and Nagashizzar for Nagash's army |
  | `nagash_late_13` | Unlocks Rush Construction |
  | `nagash_early_5`, `nagash_mid_5` | Raise the Necropolis cap |
  | `nagash_late_16` *The Way of All Flesh* | Army ability "Ashes & Dust" for 2 turns after a Ritual of Undeath |
  | `nagash_shambling_horde_1..8` | Summoned-army feature: size 5–8, raised by later nodes; lord upgrade on `_4` |
  | `nagash_transported_army_1..8` and `arkhan_3` | Transported-army feature: size and duration |
  | Grave Call nodes | The lua table `gravecall.initiatives` maps each node to unit keys per roster (tmb / cst / vmp) |

  The effect text already describes these behaviours, so the planner needs no extra handling.

### Who an effect applies to [G]

- **Unit set first, scope second.** An effect reaches units through a unit set (or a direct unit link). The scope of the
  node's effect row then narrows it. The generic character stat effects (`wh_main_effect_character_stat_*`) use a unit
  set of *every* unit. Only the scope ("(Nagash)", "(Krell)", "(all Heroes)", "(all Lords)", "(all characters)")
  says who really gets them. The same effect key appears with several different scopes across nodes.
- **Army-level conditions.** Some unit bonuses only apply in certain armies:
  - "Nagash's army": scope target `force_if_commanded_by_faction_leader`. For example Upkeep −10% / −15%, Recruit rank +1 and
    The Dead Rise Again, all reaching every unit.
  - "Armies led by a Tomb Kings / Vampire Counts / Vampire Coast Lord or Nagash": scopes
    `faction_to_force_own_{tmb,vmp,cst}_nag_unseen`. These have **no display text in game**; the meaning comes from the key
    name plus the 9.0.3 patch note ("only applies to units led by a matching lord type, or by Nagash himself"). They are
    the −10% upkeep nodes *Dread Sentinels*, *The Horrors Underneath* and *Hunger's Icy Depths*. **[G]** + **[V]**
  - `…_{tmb,vmp,cst}_unseen` (without `_nag`): only armies led by that lord type (army abilities such as "Ryze: Ushabti").
- **Nagash's own bonuses.** Nagash is not in the recruitable roster (`units_to_groupings_military_permissions`), nor
  are Arkhan, Mannfred, Vlad, Luthor or Neferata. They are the faction leader and Legendary Lord Mortarchs. Several nodes
  give Nagash extra copies of army bonuses. For example *No Winds Shall Sway Him* gives Upkeep −10% (Nagash's army) **and**
  −40% (scope "(Nagash)").
- **Unit roster.** 150 recruitable units: 13 lords, 30 heroes and 107 regular units. TMB and VMP versions of the same unit
  (e.g. Skeleton Warriors) are separate units with different bonuses.

## 5. Sigil sources

These feed the planner's budget calculator. Values are current as of patch 9.0.3 and later.

| Source | Sigils | Tag |
|---|---|---|
| Black Pyramid of Nagash settlement, tiers 1–5 | 3 / 6 / 9 / 12 / 15 | [V] |
| Nagashizzar settlement, tiers 1–5 | 3 / 6 / 9 / 12 / 15 | [V] |
| Standard Necropolis, tiers 1–5 | 2 / 3 / 4 / 5 / 8 | [V] |
| Necropolis sigils need the province *devastated* (Ritual of Undeath) | condition on the building effect | [C] (twdb.io) |
| *Nagash's Sigiled Study* landmark | 6 | [V] |
| Legendary Lord Mortarch subjugated (5) | 10 each | [V] |
| Legendary Hero / Nameless Mortarch subjugated (4) | 5 each | [V] |
| Each Book of Nagash | 5 | [V]. [?] 8 or 9 books |
| Short victory reward | 5 | [V] |
| Long victory reward | 10 | [V] |
| Necromancy: spending Necromantic Energy on unit capacity | +1 sigil per threshold; threshold starts at **100** energy and grows by **100** after each sigil | [G] (`necromancy_sigils.target_growth = 100`, `current_target = 100`) |
| Debug cheat | ±50 (`pyramid_cheat:grant_sigils`) | [G], not a gameplay source |

The in-game tooltip lists the sources as: the Necromancy Panel, Necropolises, Books of Nagash, and subjugating Mortarchs. **[G]**

## 6. Related systems (context only)

- **Necromantic Energy**: pays for unit caps, Necropolis buildings, Grave Call and the Ritual of Undeath.
- **Land of the Dead**: provinces with a Necropolis capital.
- **Mortarchs**: 9 characters.
  - 5 Legendary Lords: Arkhan, Neferata, Luthor Harkon, Vlad, Mannfred.
  - 3 Legendary Heroes: Dieter Helsnicht, Walach Harkon, Krell.
  - The Nameless.
- **Books of Nagash**: a separate initiative set per book slot (`wh3_dlc29_book_of_nagash_slot_N`). Not part of the pyramid.

## Open questions

1. The Dark Magic cost of disempowering, and its formula.
2. Exact segment counting: are gateway nodes themselves counted "before" the next tier? (The planner model assumes yes.)
3. Whether disempowering is blocked when it would disconnect empowered nodes, or whether those nodes are removed too.
4. Book count (8 or 9) for the budget calculator.
