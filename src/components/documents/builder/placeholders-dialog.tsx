"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useSopBuilder } from "@/lib/sop/store";
import { placeholderGroups, replacePlaceholder, type ReadinessTarget } from "../manual-helpers";
import styles from "./builder.module.css";

/**
 * Lists the [placeholders] the AI left, one row per distinct text. A value
 * typed once replaces that placeholder everywhere in the manual.
 */
export function PlaceholdersDialog({ open, onClose, onGoTo }: { open: boolean; onClose: () => void; onGoTo: (target: ReadinessTarget, text: string) => void }) {
  const manual = useSopBuilder((state) => state.manual!);
  const setManual = useSopBuilder((state) => state.setManual);
  const { push } = useToast();
  const groups = placeholderGroups(manual);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const filled = groups.filter((group) => values[group.text]?.trim());
  const places = filled.reduce((total, group) => total + group.count, 0);

  const close = () => { setValues({}); onClose(); };
  const replace = () => {
    if (!filled.length) return;
    setManual((current) => filled.reduce((next, group) => replacePlaceholder(next, group.text, values[group.text]), current));
    push(`Replaced ${filled.length} ${filled.length === 1 ? "placeholder" : "placeholders"} in ${places} ${places === 1 ? "place" : "places"}.`, "success");
    setValues({});
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Fill placeholders"
      description="Type a value once and it replaces that placeholder everywhere in the manual. Leave a row empty to keep it."
      width={760}
      footer={(
        <>
          <Button variant="ghost" size="md" onClick={close}>Done</Button>
          <Button variant="primary" size="md" disabled={!filled.length} onClick={replace}>{filled.length ? `Replace ${filled.length}` : "Replace"}</Button>
        </>
      )}
    >
      {groups.length === 0 ? (
        <p className={styles.placeholderEmpty}>No placeholders left. Every value is filled in.</p>
      ) : (
        <ul className={styles.placeholderList}>
          {groups.map((group) => (
            <li key={group.text} className={styles.placeholderRow}>
              <div className={styles.placeholderText}>
                <span className={styles.placeholderName}>{group.text.slice(1, -1)}</span>
                <span className={styles.placeholderWhere}>{group.count === 1 ? "1 place" : `${group.count} places`}, first in {group.where}</span>
              </div>
              <Input
                value={values[group.text] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [group.text]: event.target.value }))}
                onKeyDown={(event) => { if (event.key === "Enter") replace(); }}
                placeholder="Value"
                aria-label={`Value for ${group.text}`}
              />
              <Button variant="ghost" size="sm" trailingIcon={<ArrowRight size={13} aria-hidden="true" />} onClick={() => { close(); onGoTo(group.target, group.text); }} aria-label={`Go to ${group.text} in ${group.where}`}>Go to</Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
