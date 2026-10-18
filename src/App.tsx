import { useEffect, useMemo, useState } from "react";
import { buildIndex, type TreeIndex } from "./core/tree";
import type { TreeData } from "./core/types";
import { activeSet, allocate, closedGates, pathTo, reachable, refund, refundSet } from "./core/rules";
import { buildSearch } from "./core/search";
import { unitBonuses } from "./core/units";
import { useBuild } from "./state";
import { TreeView } from "./components/TreeView";
import { Tooltip } from "./components/Tooltip";
import { Sidebar } from "./components/Sidebar";

export const DATA_FILE = "data/black-pyramid.9.0.4.json";
const SIDEBAR_KEY = "nagash-calc:sidebar";

export function App() {
  const [index, setIndex] = useState<TreeIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(DATA_FILE)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then((data: TreeData) => setIndex(buildIndex(data)))
      .catch((e) => setError(`Could not load ${DATA_FILE}: ${e.message}`));
  }, []);

  if (error) return <div className="loading">{error}</div>;
  if (!index) return <div className="loading">Loading the Black Pyramid…</div>;
  return <Planner index={index} />;
}

export type SearchTab = "sigils" | "units";

export interface Hover {
  key: string;
  x: number;
  y: number;
  /** Open the tooltip to the left of (x, y), e.g. when hovering a row in the sidebar. Default: next to the cursor. */
  side?: "left";
}

function Planner({ index }: { index: TreeIndex }) {
  const build = useBuild(index);
  const active = useMemo(() => activeSet(index, build.allocated), [index, build.allocated]);
  const closed = useMemo(() => closedGates(index, active), [index, active]);
  // Nodes behind a locked gateway (drawn dimmed; clicking them does nothing).
  const locked = useMemo(() => {
    const open = reachable(index, active);
    return new Set(index.nodes.filter((n) => !open.has(n.key)).map((n) => n.key));
  }, [index, active]);
  const [hover, setHover] = useState<Hover | null>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<string[] | null>(null);
  const [focus, setFocus] = useState<{ key: string; n: number } | null>(null);

  // Right panel can be hidden to give the tree the whole window; remembered per browser.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) !== "closed";
    } catch {
      return true;
    }
  });
  const toggleSidebar = () =>
    setSidebarOpen((open) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, open ? "closed" : "open");
      } catch {
        // ignore
      }
      return !open;
    });

  const search = useMemo(() => buildSearch(index), [index]);
  const matches = useMemo(() => (query.trim() ? new Set(search(query)) : null), [search, query]);

  // "Units" tab: pick a unit and highlight every Sigil whose bonuses can apply to it.
  const [searchTab, setSearchTab] = useState<SearchTab>("sigils");
  const [unitQuery, setUnitQuery] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const unitNodes = useMemo(() => (selectedUnit ? unitBonuses(index, selectedUnit) : null), [index, selectedUnit]);
  const treeMatches = useMemo(
    () => (searchTab === "sigils" ? matches : unitNodes ? new Set(unitNodes.map((b) => b.node.key)) : null),
    [searchTab, matches, unitNodes],
  );

  // Hover preview: what a click would add (path) or remove (refund).
  const preview = useMemo(() => {
    if (!hover) return { add: [] as string[], remove: [] as string[] };
    return active.has(hover.key)
      ? { add: [], remove: refundSet(index, active, hover.key) }
      : { add: pathTo(index, active, hover.key), remove: [] };
  }, [index, active, hover]);

  const onNodeClick = (key: string) => {
    build.set(active.has(key) ? refund(index, build.allocated, key) : allocate(index, build.allocated, key));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).tagName === "INPUT";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) build.redo();
        else build.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        build.redo();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        document.getElementById("search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [build]);

  return (
    <div className="app">
      <main className="tree-pane">
        <TreeView
          index={index}
          rightInset={sidebarOpen && window.innerWidth > 800 ? 400 : 0}
          active={active}
          closed={closed}
          locked={locked}
          previewAdd={preview.add}
          previewRemove={preview.remove}
          matches={treeMatches}
          highlight={highlight}
          focus={focus}
          onHover={setHover}
          onClick={onNodeClick}
        />
        <div className="hint">Click a Sigil to empower it and the path to it · click an empowered Sigil to refund it · scroll to zoom · drag to pan</div>
      </main>
      <div className={`sidebar-wrap${sidebarOpen ? "" : " collapsed"}`}>
        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? "Hide panel" : "Show panel"}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? "Hide panel" : "Show panel"}
        >
          {sidebarOpen ? "›" : "‹"}
        </button>
        {/* Slides off-screen when collapsed but stays mounted, so panel state survives. */}
        <div className="sidebar-inner" aria-hidden={!sidebarOpen}>
          <Sidebar
            index={index}
            build={build}
            active={active}
            query={query}
            onQuery={setQuery}
            matches={matches}
            searchTab={searchTab}
            onSearchTab={setSearchTab}
            unitQuery={unitQuery}
            onUnitQuery={setUnitQuery}
            selectedUnit={selectedUnit}
            onSelectUnit={setSelectedUnit}
            unitNodes={unitNodes}
            onHighlight={setHighlight}
            onHover={setHover}
            onFocus={(key) => setFocus((f) => ({ key, n: (f?.n ?? 0) + 1 }))}
          />
        </div>
      </div>
      {hover && <Tooltip index={index} active={active} hover={hover} preview={preview} />}
    </div>
  );
}
