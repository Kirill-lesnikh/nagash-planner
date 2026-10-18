# Decisions

Product decisions made with the user, with the reasoning. **Don't change these without asking.** They were explicit
requests, often corrections of an earlier implementation. Newest last. All dates are 2026-10-18 unless noted.

## Scope of the planner

- **Core features the user cares about:** search Sigils, allocate them, see the combined bonuses divided into sections,
  and count the Sigils needed. Everything else is secondary.
- **Refunds are free and instant.** Clicking an allocated Sigil refunds it. There's no Dark Magic cost and no
  confirmation dialog ("ignore the cost and confirmation dialogs"). Reset has no confirmation either; undo covers it.
- **Gateways are enforced** like in game. A gateway stays closed (chained-lock art) until enough Sigils are empowered
  before it. Nodes behind it are dimmed and can't be allocated. A refund that leaves a gateway short also refunds the
  gateway and everything behind it. An earlier version only warned; the user rejected that ("gateways have no closed
  state, i can allocate tier 2 or 3 sigil without spending enough sigil").

## Search (Sigils tab)

The user iterated on this several times. Current rule:

- Each space-separated word must appear as **one unbroken piece**, anywhere, even mid-word. "vla" matches "vlad" and
  "someVLAthing", but not "someV djdjdjdj LAfjfjf". No skipped letters, no spanning spaces.
- **All words must match within one field:** the node name, *or* a single effect line. Never the name plus an effect,
  and never across two effects of the same node.
- A word order doesn't matter.
- The effect line includes its **scope text**, as shown on screen. This is how "heal cap vlad" finds "Battle healing cap:
  +20% (Vlad von Carstein)".
- **"Pathways to Eternity" connectors are excluded** from search results and tree highlights.
- There's an **× button** in the field to clear it (the browser's native one is hidden). Esc also clears.
- Results are ranked (whole-word and word-start matches first).

Rejected along the way, in order:

1. substring anywhere across all text joined together ("he cap" matched gateways through "t**he**" + "**cap**acities");
2. word-prefix only;
3. subsequence fuzzy;
4. Fuse.js defaults (93 hits for "ushabti", bad ranking);
5. fuzzy with a gap limit.

## Search result tooltips

- Hovering a search result (or a Units-tab row) shows **the same tooltip as hovering the node** on the tree, plus the
  path preview. It opens to the left of the sidebar so it doesn't cover the list.

## Combined bonuses

- Two views, **By section** and **By unit**. The choice is remembered in localStorage.
- **By unit:**
  - Each unit gets its bonuses summed.
  - Units are **combined when all their bonuses are identical**, and **split if at least one bonus differs** (value
    or presence).
  - **Army-level bonuses don't split groups** (user chose "Don't split groups" over "add to every unit"). They are
    listed inside each group under "Only in <condition>". When only some units of the group get them, the line names
    those units (max 8 names, the rest on hover).
  - Units that have *only* army-level bonuses are grouped by those, rather than all landing in one giant group (that
    produced a ~70-name list).
  - **Character scopes narrow targets.** A bonus scoped "(Nagash)" goes to Nagash only, not to every unit in its unit
    set. The user reported this ("gives bonuses to nagash only but mention all units").
  - Effects reaching **every** unit are shown once in an **"All units"** card at the top, not repeated per group. A unit's
    own lines exclude them, so Nagash shows Upkeep −40% in his group and the shared −10% under All units.

## Units tab

- A second search tab: search a unit, pick it, and **highlight all Sigils whose bonuses may apply to it**. The list shows
  those bonuses worded for the unit; unit-specific Sigils come first, then "Bonuses for every unit".

## Assets

- Every unit should have an image ("check for missing unit icons, nagash is missing"). Lords and heroes use their
  custom-battle portrait.

## Working preferences

- Save context and findings **in the project folder** (CLAUDE.md, docs/), **not** in global memory.
- The user explicitly asked for git saves ("save the progress"). Don't commit unprompted; offer it instead.
