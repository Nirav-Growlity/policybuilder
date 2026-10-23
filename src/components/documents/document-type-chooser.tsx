"use client";

import * as React from "react";
import { ArrowRight, BookUser, ListChecks } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu";
import styles from "./documents-hub.module.css";

const TYPES = [
  {
    id: "sop",
    title: "SOP manual",
    description: "Standard operating procedures for every department, written from your company profile and grouped by ESG pillar.",
    meta: "Ready in about a minute",
    icon: ListChecks,
    available: true,
  },
  {
    id: "handbook",
    title: "Employee handbook",
    description: "Workplace rules, benefits, conduct and leave in one handbook your teams can sign.",
    meta: "Ready in about a minute",
    icon: BookUser,
    available: true,
  },
] as const;

/** The document types offered in the chooser, in order. */
export const DOCUMENT_TYPES = TYPES;

/**
 * "New document": the document types, in the policy selector's card style.
 * With `organizations` (the all-organizations view, more than one to pick
 * from), the organization is chosen here first.
 */
export function DocumentTypeChooser({ open, organizations, onClose, onChoose }: {
  open: boolean;
  organizations?: SelectMenuOption[];
  onClose: () => void;
  onChoose: (type: "sop" | "handbook", organizationId?: number) => void;
}) {
  const askOrganization = Boolean(organizations && organizations.length > 1);
  const [chosen, setChosen] = React.useState("");
  const organizationId = askOrganization ? Number(chosen) || undefined : organizations?.length === 1 ? Number(organizations[0].value) : undefined;
  return (
    <Modal open={open} onClose={onClose} title="New document" description="Choose what you want to build. Policies stay under Policies." width={680}>
      {askOrganization ? (
        <label className={styles.chooserOrganization}>Organization
          <SelectMenu name="newDocumentOrganization" value={chosen} onValueChange={setChosen} options={organizations!} placeholder="Choose an organization" searchPlaceholder="Search organizations…" />
        </label>
      ) : null}
      <ul className={styles.typeGrid}>
        {TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <li key={type.id} className="flex">
              <button
                type="button"
                disabled={!type.available || (askOrganization && !organizationId)}
                aria-describedby={`document-type-${type.id}-meta`}
                onClick={() => type.available && onChoose(type.id, organizationId)}
                className={styles.typeCard}
              >
                <span className={styles.typeIcon}><Icon size={19} aria-hidden="true" /></span>
                <span className={styles.typeTitle}>{type.title}</span>
                <span className={styles.typeDescription}>{type.description}</span>
                <span className={styles.typeFoot}>
                  <span id={`document-type-${type.id}-meta`} className={styles.typeMeta}>{type.meta}</span>
                  {type.available ? <span className={styles.typeStart}>Start<ArrowRight size={14} aria-hidden="true" /></span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
