import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TreeIndex } from "../core/tree";
import type { Tier, TreeNode } from "../core/types";
import type { Hover } from "../App";

// Game UI coordinate space; the panel background is 2x this size.
const WIDTH = 1600;
const HEIGHT = 1200;
const BACKGROUND = "assets/skin/bg_nag_black_pyramid.png";
const LOCK = "assets/skin/chained_lock.png";

const SIZE: Record<Tier, number> = { start: 26, gateway: 26, notable: 25, small: 17, connector: 10 };
const FRAME = {
  base: { start: "key", gateway: "gate", notable: "key", small: "major", connector: "minor" },
  active: { start: "key_chosen.bg", gateway: "gate_complete_bg", notable: "key_chosen.bg", small: "major_chosen.bg", connector: "minor_selected" },
  preview: { start: "key_selected", gateway: "gate_selected", notable: "key_selected", small: "major_selected", connector: "minor_selected" },
} as const;
const frameUrl = (name: string) => `assets/skin/nag_pyramid_node_${name}.png`;
const activeIcon = (icon: string) => icon.replace(/\.png$/, "_active.png");

type NodeState = "base" | "active" | "preview" | "remove";

interface View {
  k: number;
  tx: number;
  ty: number;
}

interface Props {
  index: TreeIndex;
  /** Width covered by the floating side panel; fitting keeps the tree clear of it. */
  rightInset: number;
  active: Set<string>;
  /** Unallocated gateways that are still locked. */
  closed: Set<string>;
  /** Nodes behind a locked gateway. */
  locked: Set<string>;
  previewAdd: string[];
  previewRemove: string[];
  matches: Set<string> | null;
  highlight: string[] | null;
  focus: { key: string; n: number } | null;
  onHover: (h: Hover | null) => void;
  onClick: (key: string) => void;
}

export function TreeView({ index, rightInset, active, closed, locked, previewAdd, previewRemove, matches, highlight, focus, onHover, onClick }: Props) {
  const insetRef = useRef(rightInset);
  insetRef.current = rightInset;
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const minK = useRef(0.1);

  // Fit the whole tree into the part of the window not covered by the side panel.
  const fit = useCallback(() => {
    const r = svgRef.current!.getBoundingClientRect();
    const w = Math.max(200, r.width - insetRef.current);
    const k = Math.min(w / WIDTH, r.height / HEIGHT);
    minK.current = k * 0.8;
    setView({ k, tx: (w - WIDTH * k) / 2, ty: (r.height - HEIGHT * k) / 2 });
  }, []);

  useLayoutEffect(() => {
    fit();
    // Keep the same point of the tree in the middle when the area resizes (e.g. the side panel is hidden or shown).
    let size = svgRef.current!.getBoundingClientRect();
    const ro = new ResizeObserver(() => {
      const next = svgRef.current!.getBoundingClientRect();
      const dw = next.width - size.width;
      const dh = next.height - size.height;
      size = next;
      if (!viewRef.current) fit();
      else if (dw || dh) setView((v) => v && { ...v, tx: v.tx + dw / 2, ty: v.ty + dh / 2 });
    });
    ro.observe(svgRef.current!);
    return () => ro.disconnect();
  }, [fit]);

  // Wheel zoom around the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (!v) return;
      const r = svg.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const k = Math.min(8, Math.max(minK.current, v.k * Math.exp(-e.deltaY * 0.0015)));
      setView({ k, tx: cx - ((cx - v.tx) * k) / v.k, ty: cy - ((cy - v.ty) * k) / v.k });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // Center on a node when the sidebar asks for it.
  useEffect(() => {
    if (!focus || !viewRef.current) return;
    const node = index.byKey.get(focus.key)!;
    const r = svgRef.current!.getBoundingClientRect();
    const k = Math.max(viewRef.current.k, 2.5);
    setView({ k, tx: r.width / 2 - node.x * k, ty: r.height / 2 - node.y * k });
  }, [focus, index]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !view) return;
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !(e.buttons & 1)) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      svgRef.current!.setPointerCapture(e.pointerId);
      onHover(null);
    }
    if (d.moved) setView((v) => v && { ...v, tx: d.tx + dx, ty: d.ty + dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const key = (e.target as Element).closest<SVGGElement>("[data-key]")?.dataset.key;
    if (key) onClick(key);
  };

  const nodeEvents = useMemo(
    () => ({
      onEnter: (key: string, e: React.PointerEvent) => !drag.current?.moved && onHover({ key, x: e.clientX, y: e.clientY }),
      onMove: (key: string, e: React.PointerEvent) => !drag.current?.moved && onHover({ key, x: e.clientX, y: e.clientY }),
      onLeave: () => onHover(null),
    }),
    [onHover],
  );

  const addSet = useMemo(() => new Set(previewAdd), [previewAdd]);
  const removeSet = useMemo(() => new Set(previewRemove), [previewRemove]);
  const highlightSet = useMemo(() => new Set(highlight ?? []), [highlight]);

  const stateOf = (key: string): NodeState =>
    removeSet.has(key) ? "remove" : active.has(key) ? "active" : addSet.has(key) ? "preview" : "base";

  return (
    <svg
      ref={svgRef}
      className={`tree${drag.current?.moved ? " dragging" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={fit}
    >
      {view && (
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          <image href={BACKGROUND} x={0} y={0} width={WIDTH} height={HEIGHT} />
          <g className="edges">
            {index.data.edges.map(([a, b]) => {
              const na = index.byKey.get(a)!;
              const nb = index.byKey.get(b)!;
              const sa = stateOf(a);
              const sb = stateOf(b);
              const cls =
                sa === "remove" || sb === "remove"
                  ? (sa === "remove" || active.has(a)) && (sb === "remove" || active.has(b))
                    ? "remove"
                    : ""
                  : sa === "active" && sb === "active"
                    ? "active"
                    : (sa === "preview" || sa === "active") && (sb === "preview" || sb === "active")
                      ? "preview"
                      : "";
              const dim = !cls && (locked.has(a) || locked.has(b)) ? "locked" : cls;
              return <line key={`${a}|${b}`} className={dim} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} />;
            })}
          </g>
          <g className={`nodes${matches ? " searching" : ""}`}>
            {index.nodes.map((n) => (
              <NodeView
                key={n.key}
                node={n}
                state={stateOf(n.key)}
                locked={locked.has(n.key)}
                closed={closed.has(n.key)}
                match={matches?.has(n.key) ?? false}
                highlighted={highlightSet.has(n.key)}
                events={nodeEvents}
              />
            ))}
          </g>
        </g>
      )}
    </svg>
  );
}

interface NodeProps {
  node: TreeNode;
  state: NodeState;
  locked: boolean;
  closed: boolean;
  match: boolean;
  highlighted: boolean;
  events: {
    onEnter: (key: string, e: React.PointerEvent) => void;
    onMove: (key: string, e: React.PointerEvent) => void;
    onLeave: () => void;
  };
}

const NodeView = memo(function NodeView({ node, state, locked, closed, match, highlighted, events }: NodeProps) {
  const s = SIZE[node.tier];
  const frame = FRAME[state === "active" ? "active" : state === "preview" ? "preview" : "base"][node.tier];
  const iconSize = s * (node.tier === "gateway" ? 0.5 : 0.62);
  const lit = state === "active" || state === "remove";
  return (
    <g
      data-key={node.key}
      className={`node ${node.tier} ${state}${locked ? " locked" : ""}${closed ? " closed" : ""}${match ? " match" : ""}${highlighted ? " highlighted" : ""}`}
      transform={`translate(${node.x} ${node.y})`}
      onPointerEnter={(e) => events.onEnter(node.key, e)}
      onPointerMove={(e) => events.onMove(node.key, e)}
      onPointerLeave={events.onLeave}
    >
      <circle className="hit" r={s / 2} />
      {(match || highlighted) && <circle className="ring" r={s / 2 + 2.5} />}
      <image href={frameUrl(frame)} x={-s / 2} y={-s / 2} width={s} height={s} />
      {node.icon && (
        <image
          href={lit ? activeIcon(node.icon) : node.icon}
          x={-iconSize / 2}
          y={-iconSize / 2}
          width={iconSize}
          height={iconSize}
        />
      )}
      {closed && <image className="lock" href={LOCK} x={-s * 0.6} y={-s * 0.6} width={s * 1.2} height={s * 1.2} />}
      {state === "remove" && <circle className="remove-mark" r={s / 2} />}
    </g>
  );
});
