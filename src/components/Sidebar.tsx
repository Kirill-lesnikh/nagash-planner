import { useMemo, useState } from "react";
import type { TreeIndex } from "../core/tree";
import { gatewayStatus, sigilCost } from "../core/rules";
import { summarize } from "../core/summary";
import type { useBuild } from "../state";

interface Props {
  index: TreeIndex;
  build: ReturnType<typeof useBuild>;
  active: Set<string>;
  query: string;
  onQuery: (q: string) => void;
  matches: Set<string> | null;
  onHighlight: (keys: string[] | null) => void;
  onFocus: (key: string) => void;
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];

export function Sidebar({ index, build, active, query, onQuery, matches, onHighlight, onFocus }: Props) {
  return (
    <aside className="sidebar">
      <SigilPanel index={index} build={build} active={active} />
      <SearchPanel index={index} query={query} onQuery={onQuery} matches={matches} active={active} onFocus={onFocus} onHighlight={onHighlight} />
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
}: Pick<Props, "index" | "query" | "onQuery" | "matches" | "active" | "onFocus" | "onHighlight">) {
  const results = useMemo(() => (matches ? index.nodes.filter((n) => matches.has(n.key)) : []), [index, matches]);
  return (
    <section className="panel search">
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
                  onClick={() => onFocus(n.key)}
                  onMouseEnter={() => onHighlight([n.key])}
                  onMouseLeave={() => onHighlight(null)}
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
    </section>
  );
}

function SummaryPanel({ index, active, onHighlight }: Pick<Props, "index" | "active" | "onHighlight">) {
  const sections = useMemo(() => summarize(index, active), [index, active]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <section className="panel summary">
      <h2>Combined bonuses</h2>
      {!sections.length && <p className="empty">Empower Sigils on the Pyramid to see their combined effects here.</p>}
      {sections.map((s) => (
        <div key={s.key} className="section">
          <button className="section-head" onClick={() => toggle(s.key)}>
            <span className="chev">{collapsed.has(s.key) ? "▸" : "▾"}</span>
            <span className="section-name">{s.name}</span>
            <span className="section-sigils">
              {s.sigils} <img src="assets/skin/icon_mystic_sigil.png" alt="Sigils" />
            </span>
          </button>
          {!collapsed.has(s.key) && (
            <ul className="effects">
              {s.lines.map((l) => (
                <li key={l.id} onMouseEnter={() => onHighlight(l.sources)} onMouseLeave={() => onHighlight(null)}>
                  {l.icon && <img src={l.icon} alt="" />}
                  <span>
                    {l.text}
                    {l.scope && <span className="scope"> {l.scope}</span>}
                    {l.sources.length > 1 && <span className="sources"> ×{l.sources.length}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
