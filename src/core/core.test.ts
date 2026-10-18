import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "./tree";
import { activeSet, allocate, closedGates, gatewayStatus, lockReason, normalize, pathTo, reachable, refund, refundSet } from "./rules";
import { renderTemplate, summarize, summarizeByUnit } from "./summary";
import { buildSearch, termScore } from "./search";
import { searchUnits, unitBonuses } from "./units";
import { decodeBuild, encodeBuild } from "./encoding";
import type { TreeData } from "./types";

const data: TreeData = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../public/data/black-pyramid.9.0.4.json"), "utf8"),
);
const index = buildIndex(data);
const ARCHERS_3 = "wh3_dlc29_black_pyramid_archers_3"; // Sun-Scorched, Sand-Blistered
const GATE_1A = "wh3_dlc29_black_pyramid_lock_1_a";
const segment0 = data.nodes.filter((n) => index.segment.get(n.key) === 0 && n.key !== index.start).map((n) => n.key);
// The segment-0 node furthest from the start (reachable without any gateway).
const FAR = segment0.reduce((best, k) =>
  pathTo(index, activeSet(index, []), k).length > pathTo(index, activeSet(index, []), best).length ? k : best,
);
// Allocate segment-0 nodes one by one (each click adds its path) until `count` sigils are spent there.
function fillSegment0(count: number) {
  let allocated: string[] = [];
  for (const k of segment0) {
    if (allocated.length >= count) break;
    const next = allocate(index, allocated, k);
    if (next.length <= count) allocated = next;
  }
  return allocated;
}

describe("tree index", () => {
  it("splits the tree into gateway segments", () => {
    const counts = [0, 0, 0, 0];
    for (const s of index.segment.values()) counts[s]++;
    expect(counts).toEqual([36, 216, 180, 84]);
    expect(index.segment.size).toBe(data.nodes.length);
    expect(index.gateways.get(GATE_1A)).toEqual({ tier: 1, threshold: 10 });
  });
});

describe("allocation", () => {
  it("allocates the shortest connected path, ending with the target", () => {
    const path = pathTo(index, activeSet(index, []), FAR);
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toBe(FAR);
    // every node on the path touches the start or an earlier node
    const seen = new Set([index.start]);
    for (const k of path) {
      expect(index.adjacency.get(k)!.some((n) => seen.has(n))).toBe(true);
      seen.add(k);
    }
  });

  it("does nothing for an already allocated node", () => {
    const allocated = allocate(index, [], FAR);
    expect(allocate(index, allocated, FAR)).toEqual(allocated);
  });

  it("refunds a node and everything cut off by it", () => {
    const allocated = allocate(index, [], FAR);
    const first = allocated[0];
    expect(refundSet(index, activeSet(index, allocated), first).sort()).toEqual([...allocated].sort());
    expect(refund(index, allocated, first)).toEqual([]);
    // refunding the leaf only removes the leaf
    expect(refund(index, allocated, FAR)).toEqual(allocated.slice(0, -1));
  });

  it("never refunds the start node", () => {
    const allocated = allocate(index, [], FAR);
    expect(refund(index, allocated, index.start)).toEqual(allocated);
  });
});

describe("gateways", () => {
  it("keeps a gateway closed until enough sigils are empowered before it", () => {
    expect(allocate(index, [], GATE_1A)).toEqual([]);
    expect(allocate(index, [], ARCHERS_3)).toEqual([]); // the archers sit behind Gateway I
    expect(closedGates(index, activeSet(index, [])).has(GATE_1A)).toBe(true);
    expect(reachable(index, activeSet(index, [])).has(ARCHERS_3)).toBe(false);
    expect(lockReason(index, activeSet(index, []), ARCHERS_3).map((g) => g.tier)).toEqual([1]);

    const nine = fillSegment0(9);
    expect(nine).toHaveLength(9);
    // the gateway's own path adds sigils before it, so this may already pass; at 10 it must
    const ten = fillSegment0(10);
    expect(gatewayStatus(index, activeSet(index, ten))[0].open).toBe(true);
    const withGate = allocate(index, ten, GATE_1A);
    expect(withGate.at(-1)).toBe(GATE_1A);
  });

  it("never crosses a locked gateway on the way to a target", () => {
    const ten = fillSegment0(10);
    const gate2 = "wh3_dlc29_black_pyramid_lock_2_b";
    const path = pathTo(index, activeSet(index, ten), gate2);
    expect(path).toEqual([]); // 50 needed before Gateway II
  });

  it("refunding below a threshold also refunds the gateway and what lies behind it", () => {
    let current = allocate(index, allocate(index, fillSegment0(10), GATE_1A), ARCHERS_3);
    expect(current).toContain(ARCHERS_3);
    expect(normalize(index, current)).toEqual(current);
    // Refund segment-0 leaves (nodes whose removal disconnects nothing) until the gateway goes.
    for (;;) {
      const active = activeSet(index, current);
      const leaf = current.find(
        (k) => index.segment.get(k) === 0 && index.adjacency.get(k)!.filter((n) => active.has(n)).length === 1,
      )!;
      const next = refund(index, current, leaf);
      if (!next.includes(GATE_1A)) {
        // It goes exactly when the count before Gateway I drops from 10 to 9, taking everything behind it.
        expect(gatewayStatus(index, active)[0].before).toBe(10);
        expect(next).toHaveLength(9);
        expect(next.every((k) => index.segment.get(k) === 0)).toBe(true);
        // An imported build missing that leaf is cleaned up the same way.
        expect(normalize(index, current.filter((k) => k !== leaf))).toEqual(next);
        break;
      }
      expect(next).toHaveLength(current.length - 1);
      current = next;
    }
  });
});

describe("summary", () => {
  it("renders templates with signs", () => {
    expect(renderTemplate("Speed: %+n% for X", 10)).toBe("Speed: +10% for X");
    expect(renderTemplate("Upkeep: %+n%", -20)).toBe("Upkeep: -20%");
  });

  it("sums identical effects across nodes", () => {
    // all connectors are "Pathways to Eternity" and share effects, so taking several should sum them
    const connectors = data.nodes.filter((n) => n.tier === "connector").slice(0, 60).map((n) => n.key);
    const active = activeSet(index, connectors);
    const section = summarize(index, active).find((s) => s.key === "pathways")!;
    expect(section.sigils).toBe(connectors.length);
    const multi = section.lines.find((l) => l.sources.length > 1)!;
    expect(multi).toBeDefined();
    expect(multi.text).not.toMatch(/%\+?n/);
  });

  it("groups effects into the game's sections", () => {
    const active = activeSet(index, allocate(index, allocate(index, fillSegment0(10), GATE_1A), ARCHERS_3));
    const missiles = summarize(index, active).find((s) => s.name === "Missiles")!;
    expect(missiles.lines.some((l) => l.text.includes("flaming attacks"))).toBe(true);
  });
});

describe("bonuses per unit", () => {
  // Gateway I + the whole archer cluster, then everything else reachable in segments 0-1 for a broad build.
  const archers = data.nodes.filter((n) => n.cluster === "black_pyramid_archers").map((n) => n.key);
  let build = allocate(index, fillSegment0(10), GATE_1A);
  for (const k of archers) build = allocate(index, build, k);

  it("gives every targeted unit its own summed bonuses and merges identical units", () => {
    const { groups } = summarizeByUnit(index, activeSet(index, build));
    expect(groups.length).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (const g of groups) {
      expect(g.units.length).toBeGreaterThan(0);
      expect(g.lines.length).toBeGreaterThan(0);
      for (const u of g.units) {
        expect(seen.has(u.key)).toBe(false); // each unit appears in exactly one group
        seen.add(u.key);
      }
      for (const l of g.lines) expect(l.text).not.toMatch(/%\+?n/);
    }
    // groups have distinct bonus lists
    const signatures = groups.map((g) => g.lines.map((l) => l.text + l.scope).join("|"));
    expect(new Set(signatures).size).toBe(groups.length);
  });

  it("splits a group when one bonus applies to only some of its units", () => {
    const active = activeSet(index, build);
    const groupOf = (unit: string, a: Set<string>) => summarizeByUnit(index, a).groups.find((g) => g.units.some((u) => u.key === unit))!;
    // Find a group with 2+ units and an unallocated reachable node whose effects target only some of them.
    for (const g of summarizeByUnit(index, active).groups.filter((g) => g.units.length > 1)) {
      const keys = g.units.map((u) => u.key);
      const candidate = data.nodes.find(
        (n) =>
          !active.has(n.key) &&
          pathTo(index, active, n.key).length === 1 &&
          n.effects.some((e) => {
            const t = (e.target && data.effectTargets[e.target]) || [];
            return keys.some((k) => t.includes(k)) && keys.some((k) => !t.includes(k));
          }),
      );
      if (!candidate) continue;
      const after = activeSet(index, [...build, candidate.key]);
      const first = groupOf(keys[0], after).units.map((u) => u.key);
      expect(keys.every((k) => first.includes(k))).toBe(false);
      return;
    }
    throw new Error("no splittable group found");
  });

  it("lists army-level bonuses under their condition without splitting groups", () => {
    // Nodes whose unit effects are all army-conditional and reach only some units
    // (Nagash's-army bonuses reach every unit and go to "All units" instead; tested below).
    const candidates = [
      "wh3_dlc29_black_pyramid_tmb_I_5", // Dread Sentinels: Upkeep -10% (armies led by a Tomb Kings Lord or Nagash)
      "wh3_dlc29_black_pyramid_vmp_I_5",
      "wh3_dlc29_black_pyramid_cst_I_5",
    ];
    // The summary doesn't require a legal build, so add the node directly (it may sit behind a later gateway).
    const target = candidates[0];
    const withNode = [...build, target];
    const without = build;
    const groupsOf = (alloc: string[]) =>
      summarizeByUnit(index, activeSet(index, alloc))
        .groups.filter((g) => g.lines.length)
        .map((g) => g.units.map((u) => u.key).join())
        .sort();
    expect(groupsOf(withNode)).toEqual(groupsOf(without));

    const condition = data.nodes.find((n) => n.key === target)!.effects.find((e) => e.condition && e.target)!.condition!;
    const blocks = summarizeByUnit(index, activeSet(index, withNode)).groups.flatMap((g) => g.conditional);
    const block = blocks.find((b) => b.condition === condition)!;
    expect(block).toBeDefined();
    expect(block.lines.some((l) => l.text.startsWith("Upkeep: -10%"))).toBe(true);
    expect(block.lines.every((l) => !l.scope)).toBe(true); // the condition is the heading, not repeated per line
  });

  it("shows bonuses every unit gets once, under All units", () => {
    // Nagash's-army upkeep applies to every unit: it belongs in "All units", not in each group.
    const alloc = [...build, "wh3_dlc29_black_pyramid_nagash_early_2"];
    const { everyone, groups } = summarizeByUnit(index, activeSet(index, alloc));
    const block = everyone?.conditional.find((c) => c.condition === "Nagash's army");
    expect(block?.lines.some((l) => l.text === "Upkeep: -10%")).toBe(true);
    for (const g of groups)
      for (const c of g.conditional) if (c.condition === "Nagash's army") expect(c.lines.some((l) => l.text === "Upkeep: -10%" && !l.units)).toBe(false);
  });

  it("keeps non-unit effects in the general sections", () => {
    const { general } = summarizeByUnit(index, activeSet(index, build));
    const targeted = new Set(data.nodes.flatMap((n) => n.effects.filter((e) => e.target).map((e) => `${e.key}|${e.scope ?? ""}`)));
    for (const s of general) for (const l of s.lines) expect(targeted.has(l.id)).toBe(false);
  });
});

describe("search", () => {
  const search = buildSearch(index);
  const fields = (k: string) => [index.byKey.get(k)!.name, ...index.byKey.get(k)!.effects.map((e) => e.text)].map((f) => f.toLowerCase());

  it("matches each word as an unbroken piece, best matches first", () => {
    expect(termScore("vla", "vlad")).toBeGreaterThan(-1);
    expect(termScore("vla", "somevlathing")).toBeGreaterThan(-1); // mid-word is fine
    expect(termScore("vla", "somev djdjdjdj lafjfjf")).toBe(-1); // pieces split by spaces don't count
    expect(termScore("vla", "vxlxa")).toBe(-1); // skipped letters don't count
    expect(termScore("vlad", "vlad von")).toBeGreaterThan(termScore("vla", "somevlathing")); // whole word ranks first
    expect(search("sun-scorched")[0]).toBe(ARCHERS_3);
    expect(search("scorch")).toContain(ARCHERS_3);
    expect(search("snscrchd")).toEqual([]);
    // the top result for a word contains it verbatim
    expect(fields(search("ushabti")[0]).some((f) => f.includes("ushabti"))).toBe(true);
    expect(search("")).toEqual([]);
  });

  it("matches within the name or a single effect line, never across them", () => {
    expect(search("ushabti flaming")).toContain(ARCHERS_3); // both words in one effect line
    expect(search("flaming ushabti")).toContain(ARCHERS_3); // terms in any order
    expect(search("sun-scorched")).toContain(ARCHERS_3); // name only (the effect lines have no hyphen)
    expect(search("flaming")).toContain(ARCHERS_3); // effect only
    expect(search("sun-scorched flaming")).not.toContain(ARCHERS_3); // name + effect combined doesn't count
    // Two of its effects: "Enables flaming attacks for …" and "Missile strength: +5% for …".
    expect(search("flaming")).toContain(ARCHERS_3);
    expect(search("missile strength")).toContain(ARCHERS_3);
    expect(search("flaming strength")).not.toContain(ARCHERS_3); // one term per effect doesn't count
    expect(search("flaming missile")).not.toContain(ARCHERS_3);
  });

  it("finds Vlad's healing cap through the effect's scope, and nothing scattered", () => {
    const hits = search("heal cap vlad");
    expect(hits.length).toBeGreaterThan(0);
    for (const k of hits) {
      const lines = index.byKey.get(k)!.effects.map((e) => `${e.text} ${e.scope ?? ""}`.toLowerCase());
      expect(lines.some((l) => l.includes("healing cap") && l.includes("vlad"))).toBe(true);
    }
  });

  it("does not match gateways for 'he cap'", () => {
    const hits = search("he cap");
    expect(hits.length).toBeGreaterThan(0);
    for (const k of hits) expect(index.byKey.get(k)!.tier).not.toBe("gateway");
  });

  it("leaves out Pathways to Eternity connectors", () => {
    for (const q of ["pathways to eternity", "nagash", "barrier"])
      for (const k of search(q)) expect(index.byKey.get(k)!.tier).not.toBe("connector");
  });
});

describe("unit lookup", () => {
  it("lists every Sigil whose effects reach a unit, unit-specific ones first", () => {
    const krell = unitBonuses(index, "wh3_dlc29_vmp_cha_krell");
    expect(krell.length).toBeGreaterThan(0);
    // Krell's own Sigils (scope "(Krell)") are included and come before all-unit bonuses
    expect(krell.some((b) => b.lines.some((l) => l.scope === "(Krell)"))).toBe(true);
    const firstShared = krell.findIndex((b) => b.allUnits);
    if (firstShared >= 0) expect(krell.slice(firstShared).every((b) => b.allUnits)).toBe(true);
    // every listed Sigil really targets Krell
    for (const b of krell) expect(b.node.effects.some((e) => e.target && data.effectTargets[e.target].includes("wh3_dlc29_vmp_cha_krell"))).toBe(true);
    // and no Sigil targeting Krell is missed
    const expected = data.nodes.filter((n) => n.effects.some((e) => e.target && data.effectTargets[e.target].includes("wh3_dlc29_vmp_cha_krell")));
    expect(krell.length).toBe(expected.length);
  });

  it("words bonuses for the unit and includes Grave Call unlocks", () => {
    const horseArchers = unitBonuses(index, "wh2_dlc09_tmb_cav_skeleton_horsemen_archers_0");
    const lines = horseArchers.flatMap((b) => b.lines.map((l) => l.text));
    expect(lines).toContain("Grave Call recruitment unlocked");
    expect(lines.some((l) => /^Speed: \+\d+%$/.test(l))).toBe(true);
  });

  it("searches units by unbroken name pieces", () => {
    expect(searchUnits(index, "krel").map((u) => u.key)).toContain("wh3_dlc29_vmp_cha_krell");
    expect(searchUnits(index, "grave guard").every((u) => /grave guard/i.test(u.name))).toBe(true);
    expect(searchUnits(index, "").length).toBe(index.units.size);
  });
});

describe("share links", () => {
  it("round-trips a build", () => {
    const allocated = allocate(index, allocate(index, fillSegment0(10), GATE_1A), ARCHERS_3);
    const encoded = encodeBuild(index, allocated);
    expect(encoded.startsWith("904.")).toBe(true);
    expect(decodeBuild(index, encoded)).toEqual(allocated);
  });

  it("rejects other data versions and garbage", () => {
    expect(decodeBuild(index, "903.AQ")).toBeNull();
    expect(decodeBuild(index, "904.!!!")).toBeNull();
  });
});
