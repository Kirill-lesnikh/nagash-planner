import { useMemo, useState } from "react";
import type { TreeIndex } from "../core/tree";
import { gatewayStatus, sigilCost } from "../core/rules";
import { summarize, summarizeByUnit, type SummaryLine, type UnitGroup } from "../core/summary";
import type { Unit } from "../core/types";
import type { useBuild } from "../state";
import type { Hover, SearchTab } from "../App";
import { searchUnits, type UnitBonusNode } from "../core/units";

interface Props {
  index: TreeIndex;
  build: ReturnType<typeof useBuild>;
  active: Set<string>;
  query: string;
  onQuery: (q: string) => void;
  matches: Set<string> | null;
  searchTab: SearchTab;
  onSearchTab: (t: SearchTab) => void;
  unitQuery: string;
  onUnitQuery: (q: string) => void;
  selectedUnit: string | null;
  onSelectUnit: (unit: string | null) => void;
  /** Sigils that can give bonuses to the selected unit (null when none is selected). */
  unitNodes: UnitBonusNode[] | null;
  onHighlight: (keys: string[] | null) => void;
  /** Same hover as on the tree: shows the node tooltip and its path preview. */
  onHover: (h: Hover | null) => void;
  onFocus: (key: string) => void;
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];

export function Sidebar(props: Props) {
  const { index, build, active, onHighlight, searchTab, onSearchTab } = props;
  return (
    <aside className="sidebar">
      <SigilPanel index={index} build={build} active={active} />
      <section className="panel search">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={searchTab === "sigils"} className={searchTab === "sigils" ? "on" : ""} onClick={() => onSearchTab("sigils")}>
            Sigils
          </button>
          <button role="tab" aria-selected={searchTab === "units"} className={searchTab === "units" ? "on" : ""} onClick={() => onSearchTab("units")}>
            Units
          </button>
        </div>
        {searchTab === "sigils" ? <SearchPanel {...props} /> : <UnitsPanel {...props} />}
      </section>
      <SummaryPanel index={index} active={active} onHighlight={onHighlight} />
    </aside>
  );
}

function SigilPanel({ index, build, active }: Pick<Props, "index" | "build" | "active">) {
  const spent = sigilCost(index, active);
  const gates = gatewayStatus(index, active);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked; the URL bar has the link anyway
    }
  };

  return (
    <section className="panel sigils">
      <div className="sigil-count">
        <img src="assets/skin/icon_mystic_sigil.png" alt="" />
        <div>
          <div className="big">{spent}</div>
          <div className="label">Sigils needed</div>
        </div>
      </div>
      <ul className="gates">
        {gates.map((g) => (
          <li key={g.tier} className={g.used ? "used" : g.open ? "open" : "closed"}>
            <span className="gate-name">Gateway {ROMAN[g.tier]}</span>
            <span className="gate-req">
              {Math.min(g.before, g.threshold)} / {g.threshold} before
            </span>
            <span className="gate-state">{g.used ? "empowered" : g.open ? "unlocked" : `locked · ${g.threshold - g.before} more`}</span>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button onClick={build.undo} disabled={!build.canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onClick={build.redo} disabled={!build.canRedo} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <button onClick={() => build.set([])} disabled={!build.allocated.length}>
          Reset
        </button>
        <button onClick={copyLink}>{copied ? "Copied!" : "Copy link"}</button>
      </div>
    </section>
  );
}

function SearchPanel({
  index,
  query,
  onQuery,
  matches,
  active,
  onFocus,
  onHighlight,
  onHover,
}: Pick<Props, "index" | "query" | "onQuery" | "matches" | "active" | "onFocus" | "onHighlight" | "onHover">) {
  // `matches` keeps the search ranking (best first) in its insertion order.
  const results = useMemo(() => (matches ? [...matches].map((k) => index.byKey.get(k)!) : []), [index, matches]);
  return (
    <>
      <div className="search-box">
        <input
          id="search"
          type="search"
          placeholder="Search Sigils, effects, units…  ( / )"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onQuery("");
            if (e.key === "Enter" && results[0]) onFocus(results[0].key);
          }}
        />
        {query && (
          <button
            className="search-clear"
            aria-label="Clear search"
            title="Clear search (Esc)"
            onClick={() => {
              onQuery("");
              document.getElementById("search")?.focus();
            }}
          >
            ×
          </button>
        )}
      </div>
      {matches && (
        <>
          <div className="result-count">
            {results.length} match{results.length === 1 ? "" : "es"}
            {results.length > 0 && ` · ${results.filter((n) => active.has(n.key)).length} empowered`}
          </div>
          <ul className="results">
            {results.slice(0, 200).map((n) => {
              const cluster = n.cluster ? index.clusters.get(n.cluster) : undefined;
              return (
                <li
                  key={n.key}
                  className={active.has(n.key) ? "active" : ""}
                  {...nodeRowEvents(n.key, onHighlight, onHover, onFocus)}
                >
                  {n.icon ? <img src={n.icon} alt="" /> : <span className="dot" />}
                  <span className="r-name">{n.name}</span>
                  {cluster && <span className="r-cluster">{cluster.name}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * Row handlers shared by search results and unit lookup: same tooltip + highlight as hovering the node itself.
 * The tooltip is anchored at the row's left edge so it opens beside the sidebar instead of covering the list.
 */
function nodeRowEvents(key: string, onHighlight: Props["onHighlight"], onHover: Props["onHover"], onFocus: Props["onFocus"]) {
  return {
    onClick: () => onFocus(key),
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      onHighlight([key]);
      const r = e.currentTarget.getBoundingClientRect();
      onHover({ key, x: r.left, y: r.top, side: "left" as const });
    },
    onMouseLeave: () => {
      onHighlight(null);
      onHover(null);
    },
  };
}

function UnitsPanel({ index, active, unitQuery, onUnitQuery, selectedUnit, onSelectUnit, unitNodes, onHighlight, onHover, onFocus }: Props) {
  const units = useMemo(() => searchUnits(index, unitQuery), [index, unitQuery]);
  const unit = selectedUnit ? index.units.get(selectedUnit) : undefined;

  if (unit && unitNodes) {
    const specific = unitNodes.filter((b) => !b.allUnits);
    const shared = unitNodes.filter((b) => b.allUnits);
    const empowered = unitNodes.filter((b) => active.has(b.node.key)).length;
    const row = (b: UnitBonusNode) => {
      const cluster = b.node.cluster ? index.clusters.get(b.node.cluster) : undefined;
      return (
        <li key={b.node.key} className={`unit-node${active.has(b.node.key) ? " active" : ""}`} {...nodeRowEvents(b.node.key, onHighlight, onHover, onFocus)}>
          <div className="unit-node-head">
            {b.node.icon ? <img src={b.node.icon} alt="" /> : <span className="dot" />}
            <span className="r-name">{b.node.name}</span>
            {cluster && <span className="r-cluster">{cluster.name}</span>}
          </div>
          <ul className="unit-node-lines">
            {b.lines.map((l, i) => (
              <li key={i}>
                {l.text}
                {l.scope && <span className="scope"> {l.scope}</span>}
              </li>
            ))}
          </ul>
        </li>
      );
    };
    return (
      <>
        <div className="selected-unit">
          <UnitChip unit={unit} />
          <button className="search-clear static" aria-label="Choose another unit" title="Choose another unit" onClick={() => onSelectUnit(null)}>
            ×
          </button>
        </div>
        <div className="result-count">
          {unitNodes.length} Sigil{unitNodes.length === 1 ? "" : "s"} give bonuses to this unit · {empowered} empowered
        </div>
        <ul className="results unit-nodes">
          {specific.map(row)}
          {shared.length > 0 && <li className="results-heading">Bonuses for every unit</li>}
          {shared.map(row)}
        </ul>
      </>
    );
  }

  return (
    <>
      <div className="search-box">
        <input
          id="unit-search"
          type="search"
          placeholder="Search units…"
          value={unitQuery}
          onChange={(e) => onUnitQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onUnitQuery("");
            if (e.key === "Enter" && units[0]) onSelectUnit(units[0].key);
          }}
        />
        {unitQuery && (
          <button className="search-clear" aria-label="Clear search" title="Clear search (Esc)" onClick={() => onUnitQuery("")}>
            ×
          </button>
        )}
      </div>
      <div className="result-count">
        {units.length} unit{units.length === 1 ? "" : "s"} · pick one to highlight every Sigil that can give it bonuses
      </div>
      <ul className="results">
        {units.map((u) => (
          <li key={u.key} onClick={() => onSelectUnit(u.key)}>
            {u.icon ? <img className="unit-thumb" src={u.icon} alt="" /> : <span className="dot" />}
            <span className="r-name">{u.name}</span>
            {u.culture && <span className="r-cluster">{u.culture}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

type SummaryMode = "section" | "unit";
const MODE_KEY = "nagash-calc:summary-mode";

function SummaryPanel({ index, active, onHighlight }: Pick<Props, "index" | "active" | "onHighlight">) {
  const [mode, setMode] = useState<SummaryMode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === "unit" ? "unit" : "section";
    } catch {
      return "section";
    }
  });
  const choose = (m: SummaryMode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // ignore
    }
  };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const sections = useMemo(() => (mode === "section" ? summarize(index, active) : []), [index, active, mode]);
  const byUnit = useMemo(() => (mode === "unit" ? summarizeByUnit(index, active) : null), [index, active, mode]);
  const empty = active.size <= 1;

  return (
    <section className="panel summary">
      <div className="summary-head">
        <h2>Combined bonuses</h2>
        <div className="mode-switch" role="tablist">
          <button role="tab" aria-selected={mode === "section"} className={mode === "section" ? "on" : ""} onClick={() => choose("section")}>
            By section
          </button>
          <button role="tab" aria-selected={mode === "unit"} className={mode === "unit" ? "on" : ""} onClick={() => choose("unit")}>
            By unit
          </button>
        </div>
      </div>
      {empty && <p className="empty">Empower Sigils on the Pyramid to see their combined effects here.</p>}

      {mode === "section" &&
        sections.map((s) => (
          <Section key={s.key} id={s.key} title={s.name} sigils={s.sigils} lines={s.lines} collapsed={collapsed} toggle={toggle} onHighlight={onHighlight} />
        ))}

      {byUnit && !empty && (
        <>
          {!byUnit.groups.length && !byUnit.everyone && <p className="empty">No unit-specific bonuses yet.</p>}
          {byUnit.everyone && (
            <UnitGroupCard
              group={{ units: [], ...byUnit.everyone }}
              title="All units"
              onHighlight={onHighlight}
            />
          )}
          {byUnit.groups.map((g) => (
            <UnitGroupCard key={g.units.map((u) => u.key).join()} group={g} onHighlight={onHighlight} />
          ))}
          {byUnit.general.length > 0 && (
            <>
              <h3 className="general-title">Not unit-specific</h3>
              {byUnit.general.map((s) => (
                <Section key={s.key} id={`general:${s.key}`} title={s.name} lines={s.lines} collapsed={collapsed} toggle={toggle} onHighlight={onHighlight} />
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}

const CULTURE_SHORT: Record<string, string> = { "Tomb Kings": "TK", "Vampire Counts": "VC", "Vampire Coast": "VCo" };
const CHIP_LIMIT = 12;

function UnitChip({ unit }: { unit: Unit }) {
  return (
    <span className="unit-chip" title={`${unit.name}${unit.culture ? ` · ${unit.culture}` : ""}`}>
      {unit.icon ? <img src={unit.icon} alt="" /> : <span className="unit-noicon" />}
      <span className="unit-name">{unit.name}</span>
      {unit.culture && <span className="unit-culture">{CULTURE_SHORT[unit.culture] ?? unit.culture}</span>}
    </span>
  );
}

function UnitGroupCard({ group, title, onHighlight }: { group: UnitGroup; title?: string; onHighlight: Props["onHighlight"] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.units : group.units.slice(0, CHIP_LIMIT);
  return (
    <div className={`unit-group${title ? " everyone" : ""}`}>
      {title && <div className="unit-group-title">{title}</div>}
      <div className="unit-chips">
        {shown.map((u) => (
          <UnitChip key={u.key} unit={u} />
        ))}
        {group.units.length > CHIP_LIMIT && (
          <button className="chip-more" onClick={() => setExpanded(!expanded)}>
            {expanded ? "show less" : `+${group.units.length - CHIP_LIMIT} more`}
          </button>
        )}
      </div>
      {group.lines.length > 0 && <Lines lines={group.lines} onHighlight={onHighlight} />}
      {group.conditional.map((block) => (
        <div key={block.condition} className="conditional">
          <div className="conditional-title">Only in {block.condition}</div>
          <ul className="effects">
            {block.lines.map((l) => (
              <li key={l.id} onMouseEnter={() => onHighlight(l.sources)} onMouseLeave={() => onHighlight(null)}>
                {l.icon ? <img src={l.icon} alt="" /> : <span className="no-icon" />}
                <span>
                  {l.text}
                  {l.scope && <span className="scope"> {l.scope}</span>}
                  {l.units && (
                    <span className="only-units" title={l.units.map((u) => u.name).join(", ")}>
                      {" — "}
                      {l.units.slice(0, 8).map((u) => u.name).join(", ")}
                      {l.units.length > 8 && ` and ${l.units.length - 8} more`}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Section({
  id,
  title,
  sigils,
  lines,
  collapsed,
  toggle,
  onHighlight,
}: {
  id: string;
  title: string;
  sigils?: number;
  lines: SummaryLine[];
  collapsed: Set<string>;
  toggle: (id: string) => void;
  onHighlight: Props["onHighlight"];
}) {
  return (
    <div className="section">
      <button className="section-head" onClick={() => toggle(id)}>
        <span className="chev">{collapsed.has(id) ? "▸" : "▾"}</span>
        <span className="section-name">{title}</span>
        {sigils !== undefined && (
          <span className="section-sigils">
            {sigils} <img src="assets/skin/icon_mystic_sigil.png" alt="Sigils" />
          </span>
        )}
      </button>
      {!collapsed.has(id) && <Lines lines={lines} onHighlight={onHighlight} />}
    </div>
  );
}

function Lines({ lines, onHighlight }: { lines: SummaryLine[]; onHighlight: Props["onHighlight"] }) {
  return (
    <ul className="effects">
      {lines.map((l) => (
        <li key={l.id} onMouseEnter={() => onHighlight(l.sources)} onMouseLeave={() => onHighlight(null)}>
          {l.icon ? <img src={l.icon} alt="" /> : <span className="no-icon" />}
          <span>
            {l.text}
            {l.scope && <span className="scope"> {l.scope}</span>}
            {l.sources.length > 1 && <span className="sources"> ×{l.sources.length}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
