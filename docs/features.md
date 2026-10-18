# Feature spec

A web planner for the Black Pyramid of Nagash, modelled on **[PoEPlanner](https://poeplanner.com/)** and the Path of Exile passive-tree planners. A player should be able to:

- lay out a full sigil route before (or during) a campaign,
- see what it adds up to,
- share it as a link.

Game rules this spec relies on are in [game-mechanics.md](game-mechanics.md).

Priorities:

- **P0**: MVP, must ship.
- **P1**: soon after.
- **P2**: later or nice to have.

---

## 1. Tree view (P0)

| Feature | Detail |
|---|---|
| Faithful layout | Pyramid shape and node positions match the in-game tree, so players can map plan → game. |
| Pan / zoom | Drag to pan, wheel or pinch to zoom, double-click to zoom in, "fit tree" button. Zoom levels show the right amount of detail (icons only when zoomed out, labels on notables when zoomed in). |
| Node states | Visually distinct states: **allocated**, **allocatable** (adjacent to an allocated node), **unreachable**, **locked by gateway**, **search match**, **path preview**. |
| Node tiers | Connector dot, small, notable, gateway and start, drawn at different sizes, as in game. |
| Edges | Drawn between nodes. Allocated paths are highlighted. |
| Tooltip | On hover: name, icon, effect lines, cost, tier/cluster. For an unallocated node, also **"N sigils to reach"** (path cost). |

## 2. Allocation (P0)

| Feature | Detail |
|---|---|
| Click to allocate, with path | Clicking any reachable node allocates the **shortest path** to it from the current allocation (PoEPlanner behaviour). Hovering previews that path. |
| Click to refund | Clicking an allocated node refunds it instantly, together with **every node that loses its connection to the start** and **any gateway left below its threshold (with everything behind it)**. There is no Dark Magic cost and no confirmation (by design). Hover previews what would be removed. |
| Gateway rules | Enforced, as in game. A gateway stays **locked** (drawn with the chained-lock art) until enough Sigils are empowered before it. Nodes behind a locked gateway are dimmed and can't be allocated; their tooltip names the gateway and the current count. A click whose own path brings the count up to the threshold is allowed. Builds loaded from links or storage are cleaned the same way. |
| Sigil counter | Always visible: **Sigils needed** for the plan, plus each gateway tier's count before it, and whether it is locked, unlocked or empowered. |
| Reset | Clear the whole plan. There is no confirmation; undo restores it. |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z over allocation changes. |

## 3. Search and filter (P0)

| Feature | Detail |
|---|---|
| Search box | Matches node names, effect text, **unit names**, and cluster names (as in game since 9.0.4). Matches glow on the tree, and the count is shown. |
| Jump to match | Enter or arrow keys cycle the camera through matches. |
| Category filters (P1) | Toggle chips such as *Tomb Kings*, *Vampire Counts*, *Vampire Coast*, *Nagash*, *Economy*, *Grave Call*, *Books*. Non-matching nodes are dimmed. |

## 4. Build summary (P0)

| Feature | Detail |
|---|---|
| Aggregated effects | A side panel sums every allocated effect, grouped by category: Nagash, Lords/Heroes, per roster, economy, campaign. Numeric effects with the same key are added up (e.g. "Upkeep −10%" + "Upkeep −10%" → "Upkeep −20%"). |
| Unlocks list | Units unlocked for recruitment or Grave Call, abilities gained, spells. |
| Click to locate | Clicking a summary line highlights the nodes that contribute to it. |

## 5. Sharing and persistence (P0)

| Feature | Detail |
|---|---|
| URL encoding | The whole plan is encoded in the URL, e.g. `/#b=<version>.<payload>`. Opening the link restores it. Format: see [data-model.md](data-model.md#build-encoding). |
| Data version | The link carries the game-data version. Opening an old link on newer data migrates what it can and warns about nodes that were removed or changed. |
| Local save | Autosave the current plan in `localStorage`. Named saved builds come in P1. |
| Copy link | One-click copy of the share link. |

## 6. Planning extras

| Feature | Priority | Detail |
|---|---|---|
| Sigil budget calculator | P1 | A checklist of sigil sources: Necropolis tiers per settlement, Black Pyramid / Nagashizzar tier, Mortarchs, Books, landmark, victory rewards, Necromancy thresholds. It produces the **available sigils** budget. Over-budget allocations are flagged. Values: [game-mechanics.md §7](game-mechanics.md#7-sigil-sources). |
| Allocation order / build guide | P1 | Record the order nodes were taken, and show numbered badges ("take these first"). Lets people publish early-, mid- and late-game routes. Reorder by drag. |
| Multiple builds | P1 | Named builds in local storage. Duplicate, rename, delete. |
| Compare builds | P2 | Overlay two builds on the tree and diff the summaries. |
| Text export | P2 | Plain-text / Markdown summary for Reddit and Steam guides. |
| Mod trees | P2 | Load alternative data files, e.g. the "Black Pyramid Mechanics Expansion" mod (+78 nodes). The data format must allow this from day one. |
| Localisation | P2 | Node text in the game's other languages (taken from `.loc` files). |

## 7. Non-functional

- **Static site**, with no backend. All data ships as a JSON file.
- **Fast**: interactions under 16 ms, about 600 nodes rendered smoothly.
- **Works offline** after the first load (P2: PWA).
- **Responsive**: usable on a phone (pan/zoom by touch, summary in a drawer).
- **Accessible**: keyboard navigation of nodes, readable contrast. The theme should be dark and close to the game's look.

## 8. Out of scope

- Simulating battles or campaign outcomes.
- Other factions' tech trees. Possible future spin-off.
- Account or cloud sync.
