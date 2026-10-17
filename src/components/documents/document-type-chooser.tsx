"use client";

import { ArrowRight, BookUser, ListChecks } from "lucide-react";
import { Modal } from "@/components/ui/modal";
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
    meta: "Coming soon",
    icon: BookUser,
    available: false,
  },
] as const;

/** "New document": the document types, in the policy selector's card style. */
export function DocumentTypeChooser({ open, onClose, onChoose }: { open: boolean; onClose: () => void; onChoose: (type: "sop") => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New document" description="Choose what you want to build. Policies stay under Policies." width={680}>
      <ul className={styles.typeGrid}>
        {TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <li key={type.id} className="flex">
              <button
                type="button"
                disabled={!type.available}
                aria-describedby={`document-type-${type.id}-meta`}
                onClick={() => type.available && onChoose("sop")}
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
