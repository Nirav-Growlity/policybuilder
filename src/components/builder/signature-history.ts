import type { PointGroup } from "signature_pad";

export function recordSignatureHistoryEntry(
  history: PointGroup[][],
  cursor: number,
  liveData: PointGroup[],
): { history: PointGroup[][]; cursor: number } {
  const nextHistory = history.slice(0, cursor + 1);
  nextHistory.push(cloneSignaturePointGroups(liveData));
  return { history: nextHistory, cursor: nextHistory.length - 1 };
}

export function cloneSignaturePointGroups(pointGroups: PointGroup[]): PointGroup[] {
  return pointGroups.map((group) => ({
    ...group,
    points: group.points.map((point) => ({ ...point })),
  }));
}
