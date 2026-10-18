import { useCallback, useEffect, useReducer } from "react";
import type { TreeIndex } from "./core/tree";
import { decodeBuild, encodeBuild } from "./core/encoding";
import { normalize } from "./core/rules";

const STORAGE_KEY = "nagash-calc:build";
const HISTORY_LIMIT = 200;

interface History {
  allocated: string[];
  past: string[][];
  future: string[][];
}

type Action = { type: "set"; allocated: string[] } | { type: "undo" } | { type: "redo" };

function reducer(state: History, action: Action): History {
  switch (action.type) {
    case "set":
      if (action.allocated.length === state.allocated.length && action.allocated.every((k, i) => k === state.allocated[i])) return state;
      return { allocated: action.allocated, past: [...state.past.slice(-HISTORY_LIMIT), state.allocated], future: [] };
    case "undo":
      if (!state.past.length) return state;
      return { allocated: state.past.at(-1)!, past: state.past.slice(0, -1), future: [state.allocated, ...state.future] };
    case "redo":
      if (!state.future.length) return state;
      return { allocated: state.future[0], past: [...state.past, state.allocated], future: state.future.slice(1) };
  }
}

function loadSaved(index: TreeIndex): string[] {
  const hash = new URLSearchParams(location.hash.slice(1)).get("b");
  if (hash) {
    const fromLink = decodeBuild(index, hash);
    if (fromLink) return fromLink;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return decodeBuild(index, saved) ?? [];
  } catch {
    // storage unavailable; start empty
  }
  return [];
}

// Saved or shared builds may predate the gateway rules (or be hand-edited), so clean them on load.
const loadInitial = (index: TreeIndex) => normalize(index, loadSaved(index));

/** Allocation state with undo/redo, mirrored to the URL hash (share link) and localStorage. */
export function useBuild(index: TreeIndex) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ allocated: loadInitial(index), past: [], future: [] }));

  useEffect(() => {
    const encoded = encodeBuild(index, state.allocated);
    const url = state.allocated.length ? `#b=${encoded}` : location.pathname + location.search;
    history.replaceState(null, "", url);
    try {
      localStorage.setItem(STORAGE_KEY, encoded);
    } catch {
      // ignore
    }
  }, [index, state.allocated]);

  return {
    allocated: state.allocated,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set: useCallback((allocated: string[]) => dispatch({ type: "set", allocated }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
  };
}
