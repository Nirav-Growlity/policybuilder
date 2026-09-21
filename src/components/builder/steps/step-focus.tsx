"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar, Badge } from "@/components/ui/panel";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Plus, Target, Trash2, LockKeyhole } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { FocusAreaSelectionItem } from "@/lib/types";
import {
  getFocusAreaCatalog,
  getFocusAreaCatalogByKey,
  normalizeSubSector,
  policyFocusAreaCatalog,
  withFocusAreaCatalogSelection,
} from "@/lib/focus-area-catalog";

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
      );
    }
  }
  return {
    focusAreas: items.filter((item) => item.selected).map((item) => item.label.trim()).filter(Boolean),
    focusAreaSelection: { mode: "custom" as const, focusAreaItems: items },
  };
}

function newFocusAreaItem(label: string): FocusAreaSelectionItem {
  return {
    id: `focus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    selected: true,
  };
}

function FocusAreaCheckmark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-forest)]/35 peer-focus-visible:ring-offset-2 ${checked
        ? "border-[var(--color-forest)] bg-[var(--color-forest)] text-white"
        : "border-[var(--color-line-2)] bg-[var(--color-paper)] text-transparent group-hover:border-[var(--color-forest)]"
      }`}
    >
      <Check size={12} strokeWidth={3} />
    </span>
  );
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
  const currentCompanyCatalog = getFocusAreaCatalog(policy.company.subCategory, policy.policyType);
  const preservedOldCatalog = Boolean(appliedCatalog && currentCompanyCatalog?.key !== appliedCatalog.key);

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
    ));
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

  const updateEditableArea = (id: string, value: string) => {
    updatePolicy((p) => {
      const items = editableFocusAreaItems(p, catalogIsApplied).map((item) => item.id === id ? { ...item, label: value } : item);
      return withEditableFocusAreaItems(p, items);
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

  return (
    <div className="space-y-6">
      <InfoBar icon={<Target size={16} className="text-[var(--color-forest)]" />}>
        {catalog
          ? "Select the areas to include in this policy. Workbook-defined areas can be checked or unchecked but cannot be renamed or removed. Add your own areas below."
          : "Select the policy areas to include. You can rename or remove the profile areas, and add your own below."}
      </InfoBar>

      <Panel
        title="Key focus areas"
        description={policy.company.subCategory ? `Policy coverage for ${policy.company.subCategory}.` : "Choose the themes this policy will cover."}
        icon={<Target size={17} strokeWidth={1.8} />}
        actions={<Badge variant="muted">{policy.focusAreas.filter(Boolean).length} selected</Badge>}
      >
        {catalog ? (
          <section aria-labelledby="fixed-focus-areas-heading" className="space-y-3">
            <div>
              <h4 id="fixed-focus-areas-heading" className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-2)]">
                Fixed areas for {catalog.subSector}
              </h4>
              <p className="mt-1 text-[12px] text-[var(--color-muted)]">These workbook-defined labels are fixed. Select the ones to include.</p>
            </div>
            {preservedOldCatalog ? (
              <InfoBar variant="warn" icon={<LockKeyhole size={14} />}>
                The company sub-sector has changed. This draft keeps the fixed set it was already using; changing company details does not replace saved focus areas.
              </InfoBar>
            ) : null}
            {!catalogIsApplied && policy.focusAreaSelection?.mode !== "profile-default" ? (
              <InfoBar>
                Existing focus areas are preserved. Select any fixed areas you want to add to this draft.
              </InfoBar>
            ) : null}
            <ul className="space-y-2">
              {catalog.areas.map((area) => {
                const checked = selectedFixedIds.has(area.id);
                return (
                  <li key={area.id}>
                    <label className={`group flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-150 ${checked
                      ? "border-[#c7ded1] bg-[var(--color-forest-soft)]/55"
                      : "border-[var(--color-line)] bg-[var(--color-cream-2)]/50 hover:border-[var(--color-line-2)] hover:bg-[var(--color-paper)]"
                    }`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleFixedArea(area.id, event.target.checked)}
                        className="peer sr-only"
                        aria-label={`Include ${area.label}`}
                      />
                      <FocusAreaCheckmark checked={checked} />
                      <span className="flex-1 text-[13.5px] leading-relaxed text-[var(--color-ink)]">{area.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {editableAreas.length > 0 ? (
          <section aria-labelledby="custom-focus-areas-heading" className="mt-5 space-y-3">
            <div>
              <div className="flex items-center justify-between gap-3">
                <h4 id="custom-focus-areas-heading" className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-2)]">
                  {catalog ? "Your focus areas" : "Default focus areas"}
                </h4>
                <span className="text-[11px] text-[var(--color-muted)]">Editable</span>
              </div>
              {!catalog ? (
                <p className="mt-1 text-[12px] text-[var(--color-muted)]">Choose which profile areas to include, or edit and remove them.</p>
              ) : null}
            </div>
            <ul className="space-y-2">
              {editableAreas.map((area, i) => (
                <li
                  key={area.id}
                  className={`group flex min-h-[52px] items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors duration-150 ${area.selected
                    ? "border-[#c7ded1] bg-[var(--color-forest-soft)]/55"
                    : "border-[var(--color-line)] bg-[var(--color-cream-2)]/50 hover:border-[var(--color-line-2)] hover:bg-[var(--color-paper)]"
                  }`}
                >
                  <label htmlFor={`focus-area-${area.id}`} className="grid shrink-0 cursor-pointer place-items-center">
                    <input
                      id={`focus-area-${area.id}`}
                      type="checkbox"
                      checked={area.selected}
                      onChange={(event) => toggleEditableArea(area.id, event.target.checked)}
                      className="peer sr-only"
                      aria-label={`Include ${area.label || `focus area ${i + 1}`}`}
                    />
                    <FocusAreaCheckmark checked={area.selected} />
                  </label>
                  <Textarea
                    rows={Math.max(1, Math.ceil((area.label || "").length / 72))}
                    value={area.label}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => updateEditableArea(area.id, event.target.value)}
                    aria-label={`Edit focus area ${i + 1}`}
                    className="min-w-0 flex-1 resize-y border-transparent bg-transparent px-2 text-[13.5px] hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeEditableArea(area.id)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[#fdecec] hover:text-[#9b2929] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b2929]/30"
                    aria-label={`Remove focus area ${i + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-6 border-t border-[var(--color-line)] pt-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Add your own focus area" className="min-w-0">
              <Input
                value={newArea}
                onChange={(event) => setNewArea(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    add();
                  }
                }}
                placeholder="Type a focus area and press Enter…"
              />
            </Field>
            <Button variant="primary" size="md" icon={<Plus size={15} />} onClick={add} disabled={!newArea.trim()} className="w-full sm:w-auto">
              Add
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
