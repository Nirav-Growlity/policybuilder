import { cloneCoverComposition, normalizeCoverComposition, COVER_HEIGHT_MM, COVER_WIDTH_MM } from "@/lib/cover-composition";
import type { CoverComposition, CoverElement } from "@/lib/types";

export type CoverEditorState = {
  draft: CoverComposition;
  history: CoverComposition[];
  future: CoverComposition[];
};

export type CoverEditorAction =
  | { type: "apply"; draft: CoverComposition }
  | { type: "transient"; draft: CoverComposition }
  | { type: "commit"; before: CoverComposition; draft: CoverComposition }
  | { type: "reset"; draft: CoverComposition }
  | { type: "undo" }
  | { type: "redo" };

export type CoverEditorDispatch = (action: CoverEditorAction) => void;

const sameComposition = (left: CoverComposition, right: CoverComposition) => JSON.stringify(left) === JSON.stringify(right);

export function createCoverEditorState(composition: CoverComposition): CoverEditorState {
  return { draft: cloneCoverComposition(composition), history: [], future: [] };
}

export function normalizeCoverForSave(composition: CoverComposition): CoverComposition {
  const normalized = normalizeCoverComposition(composition);
  if (!normalized) throw new Error("Cover composition could not be saved");
  return normalized;
}

export function coverEditorReducer(state: CoverEditorState, action: CoverEditorAction): CoverEditorState {
  switch (action.type) {
    case "apply":
      return sameComposition(state.draft, action.draft) ? state : { draft: action.draft, history: [...state.history.slice(-49), cloneCoverComposition(state.draft)], future: [] };
    case "transient":
      return { ...state, draft: action.draft };
    case "commit":
      return sameComposition(action.before, action.draft) ? { ...state, draft: action.draft } : { draft: action.draft, history: [...state.history.slice(-49), cloneCoverComposition(action.before)], future: [] };
    case "reset":
      return { draft: cloneCoverComposition(action.draft), history: [], future: [] };
    case "undo": {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return { draft: cloneCoverComposition(previous), history: state.history.slice(0, -1), future: [cloneCoverComposition(state.draft), ...state.future] };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { draft: cloneCoverComposition(next), history: [...state.history, cloneCoverComposition(state.draft)], future: state.future.slice(1) };
    }
  }
}

export function updateCoverElement(composition: CoverComposition, id: string, patch: Partial<CoverElement>): CoverComposition {
  return normalizeCoverComposition({
    ...composition,
    elements: composition.elements.map((element) => element.id === id ? { ...element, ...patch } : element),
  }) || composition;
}

export function alignCoverElement(composition: CoverComposition, id: string, horizontal?: "left" | "center" | "right", vertical?: "top" | "middle" | "bottom"): CoverComposition {
  const element = composition.elements.find((candidate) => candidate.id === id);
  if (!element) return composition;
  const patch: Partial<CoverElement> = {};
  if (horizontal) patch.x = horizontal === "left" ? 0 : horizontal === "right" ? COVER_WIDTH_MM - element.width : (COVER_WIDTH_MM - element.width) / 2;
  if (vertical) patch.y = vertical === "top" ? 0 : vertical === "bottom" ? COVER_HEIGHT_MM - element.height : (COVER_HEIGHT_MM - element.height) / 2;
  return Object.keys(patch).length ? updateCoverElement(composition, id, patch) : composition;
}

/** Apply a complete geometry update while preserving media aspect ratio when requested. */
export function resizeCoverElement(composition: CoverComposition, id: string, next: Pick<CoverElement, "x" | "y" | "width" | "height">): CoverComposition {
  const element = composition.elements.find((candidate) => candidate.id === id);
  if (!element) return composition;
  let width = Math.max(1, next.width);
  let height = Math.max(1, next.height);
  if (element.aspectLocked) {
    const ratio = element.width / Math.max(1, element.height);
    const widthChange = Math.abs(width / Math.max(1, element.width) - 1);
    const heightChange = Math.abs(height / Math.max(1, element.height) - 1);
    if (widthChange >= heightChange) height = width / ratio;
    else width = height * ratio;
  }
  width = Math.min(COVER_WIDTH_MM, width);
  height = Math.min(COVER_HEIGHT_MM, height);
  const x = Math.min(COVER_WIDTH_MM - width, Math.max(0, next.x));
  const y = Math.min(COVER_HEIGHT_MM - height, Math.max(0, next.y));
  return updateCoverElement(composition, id, { x, y, width, height });
}

export function detachCoverText(composition: CoverComposition, id: string, value: string): CoverComposition {
  const element = composition.elements.find((candidate) => candidate.id === id);
  if (!element || element.type !== "text" || element.content.kind !== "binding") return composition;
  return updateCoverElement(composition, id, { content: { kind: "literal", text: value } });
}

export function removeCoverElement(composition: CoverComposition, id: string): CoverComposition {
  return { ...composition, elements: composition.elements.filter((element) => element.id !== id) };
}

export function reorderCoverElement(composition: CoverComposition, id: string, direction: -1 | 1): CoverComposition {
  const ordered = [...composition.elements].sort((left, right) => left.zIndex - right.zIndex);
  const index = ordered.findIndex((element) => element.id === id);
  const target = ordered[index + direction];
  if (!ordered[index] || !target) return composition;
  return updateCoverElement(updateCoverElement(composition, id, { zIndex: target.zIndex }), target.id, { zIndex: ordered[index].zIndex });
}

export function moveCoverElementRelative(composition: CoverComposition, sourceId: string, targetId: string): CoverComposition {
  if (sourceId === targetId) return composition;
  const ordered = [...composition.elements].sort((left, right) => left.zIndex - right.zIndex);
  const sourceIndex = ordered.findIndex((element) => element.id === sourceId);
  const targetIndex = ordered.findIndex((element) => element.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return composition;
  const [source] = ordered.splice(sourceIndex, 1);
  ordered.splice(Math.max(0, Math.min(ordered.length, targetIndex)), 0, source);
  return { ...composition, elements: ordered.map((element, index) => ({ ...element, zIndex: index })) };
}

export function moveCoverElementToEdge(composition: CoverComposition, id: string, edge: "back" | "front"): CoverComposition {
  const selected = composition.elements.find((element) => element.id === id);
  if (!selected) return composition;
  const ordered = [...composition.elements].sort((left, right) => left.zIndex - right.zIndex).filter((element) => element.id !== id);
  const next = edge === "back" ? [selected, ...ordered] : [...ordered, selected];
  return { ...composition, elements: next.map((element, index) => ({ ...element, zIndex: index })) };
}

export function duplicateCoverElement(composition: CoverComposition, id: string, newId: string): CoverComposition {
  const selected = composition.elements.find((element) => element.id === id);
  if (!selected) return composition;
  const copy = { ...selected, id: newId, x: Math.min(COVER_WIDTH_MM - selected.width, selected.x + 5), y: Math.min(COVER_HEIGHT_MM - selected.height, selected.y + 5), zIndex: composition.elements.length + 10 } as CoverElement;
  return { ...composition, elements: [...composition.elements, copy] };
}

export function screenToCover(point: { x: number; y: number }, viewport: { left: number; top: number; scale: number }): { x: number; y: number } {
  return { x: (point.x - viewport.left) / viewport.scale, y: (point.y - viewport.top) / viewport.scale };
}

export function coverToScreen(point: { x: number; y: number }, viewport: { left: number; top: number; scale: number }): { x: number; y: number } {
  return { x: viewport.left + point.x * viewport.scale, y: viewport.top + point.y * viewport.scale };
}

/** Convert persisted point typography to pixels at the current A4 canvas scale. */
export function coverPointSizeToPixels(pointSize: number, pixelsPerMillimetre: number): number {
  return pointSize * (25.4 / 72) * pixelsPerMillimetre;
}

export function fitA4ToViewport(width: number, height: number, padding = 48): number {
  return Math.max(0.5, Math.min((width - padding * 2) / COVER_WIDTH_MM, (height - padding * 2) / COVER_HEIGHT_MM));
}

export function snapValue(value: number, guides: number[], threshold: number): { value: number; guide?: number } {
  const nearest = guides.reduce<{ value: number; distance: number; guide?: number } | null>((best, guide) => {
    const distance = Math.abs(value - guide);
    return !best || distance < best.distance ? { value: guide, distance, guide } : best;
  }, null);
  return nearest && nearest.distance <= threshold ? nearest : { value };
}

export function snapElementPosition(composition: CoverComposition, element: CoverElement, next: { x: number; y: number }, threshold = 2): { x: number; y: number; guides: { axis: "x" | "y"; value: number }[] } {
  const others = composition.elements.filter((candidate) => candidate.id !== element.id && candidate.visible);
  const xGuides = [0, COVER_WIDTH_MM / 2, COVER_WIDTH_MM, ...others.flatMap((candidate) => [candidate.x, candidate.x + candidate.width / 2, candidate.x + candidate.width])];
  const yGuides = [0, COVER_HEIGHT_MM / 2, COVER_HEIGHT_MM, ...others.flatMap((candidate) => [candidate.y, candidate.y + candidate.height / 2, candidate.y + candidate.height])];
  const xMatches = [{ value: next.x, offset: 0 }, { value: next.x + element.width / 2, offset: element.width / 2 }, { value: next.x + element.width, offset: element.width }].map((candidate) => ({ ...snapValue(candidate.value, xGuides, threshold), offset: candidate.offset }));
  const yMatches = [{ value: next.y, offset: 0 }, { value: next.y + element.height / 2, offset: element.height / 2 }, { value: next.y + element.height, offset: element.height }].map((candidate) => ({ ...snapValue(candidate.value, yGuides, threshold), offset: candidate.offset }));
  const xMatch = xMatches.find((match) => match.guide !== undefined);
  const yMatch = yMatches.find((match) => match.guide !== undefined);
  const x = Math.min(COVER_WIDTH_MM - element.width, Math.max(0, xMatch ? xMatch.value - xMatch.offset : next.x));
  const y = Math.min(COVER_HEIGHT_MM - element.height, Math.max(0, yMatch ? yMatch.value - yMatch.offset : next.y));
  return { x, y, guides: [...(xMatch?.guide === undefined ? [] : [{ axis: "x" as const, value: xMatch.guide }]), ...(yMatch?.guide === undefined ? [] : [{ axis: "y" as const, value: yMatch.guide }])] };
}
