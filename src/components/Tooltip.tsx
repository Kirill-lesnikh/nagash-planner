import { useLayoutEffect, useRef, useState } from "react";
import type { TreeIndex } from "../core/tree";
import { gatewayStatus, lockReason, sigilCost } from "../core/rules";
import type { Hover } from "../App";

interface Props {
  index: TreeIndex;
  active: Set<string>;
  hover: Hover;
  preview: { add: string[]; remove: string[] };
}

const TIER_LABEL = { start: "Start", gateway: "Gateway", notable: "Major Sigil", small: "Sigil", connector: "Pathway" };

export function Tooltip({ index, active, hover, preview }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: hover.x + 18, top: hover.y + 18 });
  const node = index.byKey.get(hover.key)!;
  const cluster = node.cluster ? index.clusters.get(node.cluster) : undefined;
  const section = cluster ? index.superclusters.get(cluster.supercluster) : undefined;
  const gate = index.gateways.get(node.key);

  // Keep the tooltip inside the window.
  useLayoutEffect(() => {
    const el = ref.current!;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = hover.x + 18;
    let top = hover.y + 18;
    if (left + w > window.innerWidth - 8) left = hover.x - w - 18;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setPos({ left: Math.max(8, left), top });
  }, [hover.x, hover.y, hover.key]);

  // Not reachable yet: explain which gateways are still locked, with current counts (same numbers as the sidebar).
  const current = gatewayStatus(index, active);
  const lockedBy =
    !active.has(node.key) && !preview.add.length ? lockReason(index, active, node.key).map((g) => current[g.tier - 1]) : [];

  return (
    <div ref={ref} className="tooltip" style={pos}>
      <div className="tt-head">
        {node.icon && <img src={node.icon} alt="" />}
        <div>
          <div className="tt-name">{node.name}</div>
          <div className="tt-sub">
            {TIER_LABEL[node.tier]}
            {cluster && ` · ${cluster.name}`}
            {section && ` · ${section.name}`}
          </div>
        </div>
      </div>
      {gate && <div className="tt-gate">Requires {gate.threshold} Sigils empowered before this point</div>}
      {node.description && <div className="tt-desc">{node.description}</div>}
      {node.effects.length > 0 && (
        <ul className="effects">
          {node.effects.map((e, i) => (
            <li key={i}>
              {e.icon && <img src={e.icon} alt="" />}
              <span>
                {e.text}
                {e.scope && <span className="scope"> {e.scope.trim()}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {lockedBy.length ? (
        lockedBy.map((g) => (
          <div key={g.tier} className="tt-locked">
            Locked by Gateway {"I".repeat(g.tier)}: needs {g.threshold} Sigils empowered before it (you have {g.before})
          </div>
        ))
      ) : (
        <div className="tt-action">
          {node.tier === "start"
            ? "Always empowered"
            : active.has(node.key)
              ? `Click to refund: −${sigilCost(index, preview.remove)} Sigil${sigilCost(index, preview.remove) === 1 ? "" : "s"}`
              : `Click to empower: +${sigilCost(index, preview.add)} Sigil${sigilCost(index, preview.add) === 1 ? "" : "s"}`}
        </div>
      )}
      {active.has(node.key) && preview.remove.length > 1 && (
        <div className="tt-warning">
          Also refunds {preview.remove.length - 1} Sigil{preview.remove.length > 2 ? "s" : ""} that would be disconnected or behind a gateway
          left without enough Sigils
        </div>
      )}
    </div>
  );
}
