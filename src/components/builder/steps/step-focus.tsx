"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar, Badge } from "@/components/ui/panel";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Target, Trash2, LockKeyhole } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { FocusAreaSelectionItem, Policy } from "@/lib/types";
import { getPolicyProfile } from "@/lib/constants";
import { pickSystemFocusAreaSynonym, getSystemFocusAreaSynonyms } from "@/lib/focus-area-synonyms";
import {
  getFocusAreaCatalogByKey,
  getCompanyFocusAreaCatalog,
  normalizeSubSector,
  policyFocusAreaCatalog,
  withFocusAreaCatalogSelection,
} from "@/lib/focus-area-catalog";
import { AutosizeTextarea, Checkmark, StepRoot, authoring as ui } from "./authoring-ui";

type PolicyDraft = ReturnType<typeof useBuilder.getState>["policy"];

function editableFocusAreaItems(policy: PolicyDraft, catalogIsApplied: boolean): FocusAreaSelectionItem[] {
  const selection = policy.focusAreaSelection;
  if (selection?.mode === "custom" && selection.focusAreaItems) return selection.focusAreaItems;
  if (selection?.mode === "catalog" && catalogIsApplied) {
    return selection.focusAreaItems ?? selection.manualAreas.map((label, index) => ({
      id: `manual-${index}`,
      label,
      selected: true,
    }));
  }
  return policy.focusAreas.map((label, index) => ({ id: `profile-${index}`, label, selected: true }));
}

function withEditableFocusAreaItems(policy: PolicyDraft, items: FocusAreaSelectionItem[]) {
  if (policy.focusAreaSelection?.mode === "catalog") {
    const catalog = getFocusAreaCatalogByKey(policy.focusAreaSelection.catalogKey);
    if (catalog) {
      return withFocusAreaCatalogSelection(
        catalog,
        policy.focusAreaSelection.selectedFixedAreaIds,
        items.filter((item) => item.selected).map((item) => item.label),
        items,
        policy.focusAreaSelection.fixedAreaLabelOverrides,
      );
    }
  }
  return {
    focusAreas: items.filter((item) => item.selected).map((item) => item.label.trim()).filter(Boolean),
    focusAreaSelection: { mode: "custom" as const, focusAreaItems: items },
  };
}

function renameAreaContent(policy: Policy, previousLabel: string, nextLabel: string): Partial<Policy> {
  const previousKey = normalizeSubSector(previousLabel);
  const nextKey = normalizeSubSector(nextLabel);
  if (!previousKey || previousKey === nextKey) return {};

  const matchingQualitativeKeys = Object.keys(policy.qualitative).filter((area) => normalizeSubSector(area) === previousKey);
  let qualitative = policy.qualitative;
  if (matchingQualitativeKeys.length > 0) {
    qualitative = { ...policy.qualitative };
    const movedObjectives = matchingQualitativeKeys.flatMap((area) => qualitative[area] || []);
    for (const area of matchingQualitativeKeys) delete qualitative[area];
    qualitative[nextLabel] = [...(qualitative[nextLabel] || []), ...movedObjectives];
  }

  const quantitative = policy.quantitative.map((area) =>
    normalizeSubSector(area.area) === previousKey ? { ...area, area: nextLabel } : area,
  );
  return {
    ...(matchingQualitativeKeys.length > 0 ? { qualitative } : {}),
    ...(quantitative.some((area, index) => area !== policy.quantitative[index]) ? { quantitative } : {}),
  };
}

function newFocusAreaItem(label: string): FocusAreaSelectionItem {
  return {
    id: `focus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    selected: true,
  };
}


export function StepFocus() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [newArea, setNewArea] = React.useState("");

  const selection = policy.focusAreaSelection;
  const catalog = policyFocusAreaCatalog(policy);
  const appliedCatalog = selection?.mode === "catalog"
    ? getFocusAreaCatalogByKey(selection.catalogKey)
    : null;
  const catalogIsApplied = Boolean(catalog && appliedCatalog?.key === catalog.key);
  const selectedFixedIds = catalogIsApplied && selection?.mode === "catalog"
    ? new Set(selection.selectedFixedAreaIds)
    : new Set<string>();
  const editableAreas = editableFocusAreaItems(policy, catalogIsApplied);
  const currentCompanyCatalog = getCompanyFocusAreaCatalog(policy.company, policy.policyType);
  const preservedOldCatalog = Boolean(appliedCatalog && currentCompanyCatalog?.key !== appliedCatalog.key);

  const refreshSynonym = (
    currentLabel: string,
    canonicalLabel: string,
    applyLabel: (label: string) => void,
  ) => {
    const activeLabels = policy.focusAreas.filter(
      (area) => normalizeSubSector(area) !== normalizeSubSector(currentLabel),
    );
    const nextLabel = pickSystemFocusAreaSynonym(canonicalLabel, currentLabel, activeLabels);
    if (!nextLabel) {
      push("No unused alternatives are available for this focus area", "info");
      return;
    }
    applyLabel(nextLabel);
  };

  const toggleFixedArea = (areaId: string, checked: boolean) => {
    if (!catalog) return;
    const priorSelected = catalogIsApplied && selection?.mode === "catalog"
      ? selection.selectedFixedAreaIds
      : [];
    const priorItems = editableFocusAreaItems(policy, catalogIsApplied);
    const nextSelected = checked
      ? [...priorSelected, areaId]
      : priorSelected.filter((id) => id !== areaId);
    updatePolicy(() => withFocusAreaCatalogSelection(
      catalog,
      nextSelected,
      priorItems.filter((item) => item.selected).map((item) => item.label),
      priorItems,
      catalogIsApplied && selection?.mode === "catalog" ? selection.fixedAreaLabelOverrides : undefined,
    ));
  };

  const updateFixedAreaLabel = (areaId: string, canonicalLabel: string, nextLabel: string) => {
    if (!catalog) return;
    updatePolicy((p) => {
      const currentSelection = p.focusAreaSelection?.mode === "catalog" && p.focusAreaSelection.catalogKey === catalog.key
        ? p.focusAreaSelection
        : undefined;
      const labelOverrides = { ...currentSelection?.fixedAreaLabelOverrides };
      const previousLabel = labelOverrides[areaId] ?? canonicalLabel;
      if (nextLabel === canonicalLabel) delete labelOverrides[areaId];
      else labelOverrides[areaId] = nextLabel;
      const items = editableFocusAreaItems(p, Boolean(currentSelection));
      const selectedIds = currentSelection?.selectedFixedAreaIds ?? [];
      const result = withFocusAreaCatalogSelection(
        catalog,
        selectedIds,
        items.filter((item) => item.selected).map((item) => item.label),
        items,
        labelOverrides,
      );
      return { ...result, ...renameAreaContent(p, previousLabel, nextLabel) };
    });
  };

  const add = () => {
    const value = newArea.trim();
    if (!value) return;

    if (catalog) {
      const matchingFixed = catalog.areas.find((area) => normalizeSubSector(area.label) === normalizeSubSector(value));
      const alreadyActive = policy.focusAreas.some((area) => normalizeSubSector(area) === normalizeSubSector(value));
      if (matchingFixed) {
        if (alreadyActive) {
          push("That focus area is already included", "info");
        } else {
          const selected = catalogIsApplied && selection?.mode === "catalog"
            ? selection.selectedFixedAreaIds
            : [];
          const currentItems = editableFocusAreaItems(policy, catalogIsApplied);
          updatePolicy(() => withFocusAreaCatalogSelection(
            catalog,
            [...selected, matchingFixed.id],
            currentItems.filter((item) => item.selected).map((item) => item.label),
            currentItems,
            catalogIsApplied && selection?.mode === "catalog" ? selection.fixedAreaLabelOverrides : undefined,
          ));
        }
        setNewArea("");
        return;
      }
    }

    if (editableAreas.some((area) => normalizeSubSector(area.label) === normalizeSubSector(value))) {
      push("That focus area is already included", "info");
      return;
    }

    updatePolicy((p) => {
      return withEditableFocusAreaItems(p, [...editableFocusAreaItems(p, catalogIsApplied), newFocusAreaItem(value)]);
    });
    setNewArea("");
  };

  const updateEditableArea = (id: string, value: string, previousLabel?: string) => {
    updatePolicy((p) => {
      const items = editableFocusAreaItems(p, catalogIsApplied).map((item) => {
        if (item.id !== id) return item;
        const isManualEdit = previousLabel === undefined && /^profile-\d+$/.test(item.id);
        return {
          ...item,
          ...(isManualEdit ? { id: newFocusAreaItem(value).id } : {}),
          label: value,
        };
      });
      return {
        ...withEditableFocusAreaItems(p, items),
        ...(previousLabel ? renameAreaContent(p, previousLabel, value) : {}),
      };
    });
  };

  const toggleEditableArea = (id: string, checked: boolean) => {
    updatePolicy((p) => {
      const items = editableFocusAreaItems(p, catalogIsApplied).map((item) => item.id === id ? { ...item, selected: checked } : item);
      return withEditableFocusAreaItems(p, items);
    });
  };

  const removeEditableArea = (id: string) => {
    updatePolicy((p) => {
      const items = editableFocusAreaItems(p, catalogIsApplied).filter((item) => item.id !== id);
      return withEditableFocusAreaItems(p, items);
    });
  };

  const selectedFixedCount = catalog ? catalog.areas.filter((area) => selectedFixedIds.has(area.id)).length : 0;
  const selectedEditableCount = editableAreas.filter((area) => area.selected).length;

  return (
    <StepRoot>
      <Panel
        title="Key focus areas"
        icon={<Target size={17} strokeWidth={1.8} />}
        actions={<Badge variant="muted">{policy.focusAreas.filter(Boolean).length} selected</Badge>}
      >
        {catalog ? (
          <section aria-labelledby="fixed-focus-areas-heading">
            <div className={ui.groupHead}>
              <h4 id="fixed-focus-areas-heading" className={ui.groupTitle}>
                Fixed areas for {catalog.subSector}
              </h4>
              <span className={ui.groupCount}>{selectedFixedCount} of {catalog.areas.length}</span>
            </div>
            {preservedOldCatalog ? (
              <div className="mb-3">
                <InfoBar variant="warn" icon={<LockKeyhole size={14} />}>
                  The company sub-sector has changed. This draft keeps the fixed set it was already using; changing company details does not replace saved focus areas.
                </InfoBar>
              </div>
            ) : null}
            {!catalogIsApplied && policy.focusAreaSelection?.mode !== "profile-default" ? (
              <div className="mb-3">
                <InfoBar>
                  Existing focus areas are preserved. Select any fixed areas you want to add to this draft.
                </InfoBar>
              </div>
            ) : null}
            <ul className={ui.itemList}>
              {catalog.areas.map((area) => {
                const checked = selectedFixedIds.has(area.id);
                const currentLabel = catalogIsApplied && selection?.mode === "catalog"
                  ? selection.fixedAreaLabelOverrides?.[area.id] ?? area.label
                  : area.label;
                return (
                  <li key={area.id} className={ui.itemRow} data-selected={checked || undefined}>
                    <label className={ui.itemLabel}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleFixedArea(area.id, event.target.checked)}
                        className="sr-only"
                        aria-label={`Include ${currentLabel}`}
                      />
                      <Checkmark checked={checked} />
                      <span className="min-w-0 flex-1">{currentLabel}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => refreshSynonym(
                        currentLabel,
                        area.label,
                        (nextLabel) => updateFixedAreaLabel(area.id, area.label, nextLabel),
                      )}
                      className={ui.iconButton}
                      data-tone="brand"
                      aria-label={`Show a random alternative for ${currentLabel}`}
                      title="Show a random alternative"
                    >
                      <RefreshCw size={15} className={ui.spin} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {editableAreas.length > 0 ? (
          <section aria-labelledby="custom-focus-areas-heading" className={catalog ? "mt-6" : undefined}>
            <div className={ui.groupHead}>
              <h4 id="custom-focus-areas-heading" className={ui.groupTitle}>
                {catalog ? "Your focus areas" : "Default focus areas"}
              </h4>
              <span className={ui.groupCount}>{selectedEditableCount} of {editableAreas.length}</span>
            </div>
            <ul className={ui.itemList}>
                {editableAreas.map((area, i) => {
                  const profileDefaultIndex = /^profile-(\d+)$/.exec(area.id);
                  const profileDefaultLabel = profileDefaultIndex
                    ? getPolicyProfile(policy.policyType).focusAreas[Number(profileDefaultIndex[1])]
                    : undefined;
                  const profileDefaultSynonyms = profileDefaultLabel
                    ? getSystemFocusAreaSynonyms(profileDefaultLabel)
                    : null;
                  const canRefresh = Boolean(profileDefaultLabel && profileDefaultSynonyms?.some(
                    (label) => normalizeSubSector(label) === normalizeSubSector(area.label),
                  )) || Boolean(profileDefaultLabel && normalizeSubSector(profileDefaultLabel) === normalizeSubSector(area.label));
                  return (
                    <li
                      key={area.id}
                      className={ui.itemRow}
                      data-selected={area.selected || undefined}
                    >
                      <label htmlFor={`focus-area-${area.id}`} className="grid shrink-0 cursor-pointer place-items-center">
                        <input
                          id={`focus-area-${area.id}`}
                          type="checkbox"
                          checked={area.selected}
                          onChange={(event) => toggleEditableArea(area.id, event.target.checked)}
                          className="sr-only"
                          aria-label={`Include ${area.label || `focus area ${i + 1}`}`}
                        />
                        <Checkmark checked={area.selected} />
                      </label>
                      <AutosizeTextarea
                        value={area.label}
                        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => updateEditableArea(area.id, event.target.value)}
                        aria-label={`Edit focus area ${i + 1}`}
                        className={`${ui.inline} ${ui.itemText}`}
                      />
                      <div className={ui.rowActions}>
                        {canRefresh ? (
                          <button
                            type="button"
                            onClick={() => refreshSynonym(
                              area.label,
                              profileDefaultLabel!,
                              (nextLabel) => updateEditableArea(area.id, nextLabel, area.label),
                            )}
                            className={ui.iconButton}
                            data-tone="brand"
                            aria-label={`Show a random alternative for ${area.label}`}
                            title="Show a random alternative"
                          >
                            <RefreshCw size={15} className={ui.spin} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeEditableArea(area.id)}
                          className={ui.iconButton}
                          data-tone="danger"
                          aria-label={`Remove focus area ${i + 1}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        ) : null}

        <hr className={ui.divider} />
        <Field label="Add your own focus area" className="min-w-0" htmlFor="focus-area-new">
          <div className={ui.composer}>
            <span className={ui.composerIcon} aria-hidden="true"><Plus size={16} /></span>
            <Input
              id="focus-area-new"
              value={newArea}
              onChange={(event) => setNewArea(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
              placeholder="Type a focus area and press Enter…"
              className={ui.composerInput}
            />
            <Button variant="primary" size="sm" onClick={add} disabled={!newArea.trim()} className={ui.composerAdd}>
              Add
            </Button>
          </div>
        </Field>
      </Panel>
    </StepRoot>
  );
}
