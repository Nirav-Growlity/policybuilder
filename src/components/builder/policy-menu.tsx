"use client";

import * as React from "react";
import { DropdownMenu } from "radix-ui";
import { Building2, Ellipsis, FileUp, RotateCcw, X } from "lucide-react";
import { useBuilder } from "@/lib/store";
import styles from "./policy-menu.module.css";

type PolicyMenuProps = {
  contextFileName: string | null;
  onChooseContext: () => void;
  onRemoveContext: () => void;
  onCompanyDetails?: () => void;
};

// One place for policy-level actions that used to sit in the toolbar and rail
// footer. The handlers are supplied by the builder so the file input, company
// warning modal and autosave wiring stay where they were.
export function PolicyMenu({ contextFileName, onChooseContext, onRemoveContext, onCompanyDetails }: PolicyMenuProps) {
  const reset = useBuilder((state) => state.reset);
  const contextId = React.useId();
  // The company warning is a dialog. Radix would otherwise return focus to the
  // trigger after the menu closes and race the dialog's own focus.
  const openingDialog = React.useRef(false);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-describedby={contextFileName ? contextId : undefined}>
        <span>Policy</span>
        <Ellipsis size={16} aria-hidden="true" />
        {contextFileName ? <span className={styles.contextDot} aria-hidden="true" /> : null}
      </DropdownMenu.Trigger>
      {contextFileName ? <span id={contextId} className="sr-only">Policy context attached: {contextFileName}</span> : null}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={`pc-ui pc-builder-authoring ${styles.menu}`}
          align="end"
          sideOffset={8}
          collisionPadding={12}
          onCloseAutoFocus={(event) => {
            if (!openingDialog.current) return;
            openingDialog.current = false;
            event.preventDefault();
          }}
        >
          {contextFileName ? (
            <>
              <DropdownMenu.Label className={styles.label}>Policy context</DropdownMenu.Label>
              <div className={styles.fileName} title={contextFileName}>{contextFileName}</div>
              <DropdownMenu.Item className={styles.item} onSelect={onChooseContext}>
                <FileUp size={16} aria-hidden="true" />Replace policy context
              </DropdownMenu.Item>
              <DropdownMenu.Item className={styles.item} onSelect={onRemoveContext}>
                <X size={16} aria-hidden="true" />Remove policy context
              </DropdownMenu.Item>
            </>
          ) : (
            <DropdownMenu.Item className={styles.item} onSelect={onChooseContext}>
              <FileUp size={16} aria-hidden="true" />Add policy context (.docx)
            </DropdownMenu.Item>
          )}
          {onCompanyDetails ? (
            <DropdownMenu.Item
              className={styles.item}
              onSelect={() => {
                openingDialog.current = true;
                onCompanyDetails();
              }}
            >
              <Building2 size={16} aria-hidden="true" />Company details
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Item
            className={styles.item}
            onSelect={() => {
              if (window.confirm("Reset all fields and start over?")) reset();
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />Reset all fields
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
