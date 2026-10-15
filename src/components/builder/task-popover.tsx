"use client";

import * as React from "react";
import { Popover } from "radix-ui";
import { AlertCircle, Check, ClipboardList, Loader2 } from "lucide-react";
import styles from "./task-popover.module.css";

type TaskPopoverProps = {
  state: "loading" | "error" | "ready";
  complete: boolean;
  percentage: number;
  children: React.ReactNode;
};

// Compact manager task chip. The popover body is the existing assignment
// summary, so its controls, copy and completion modal are unchanged.
export function TaskPopover({ state, complete, percentage, children }: TaskPopoverProps) {
  const Icon = state === "error" ? AlertCircle : state === "loading" ? Loader2 : complete ? Check : ClipboardList;
  const value = state === "ready" ? `${Math.round(Math.max(0, Math.min(100, percentage)))}%` : state === "loading" ? "Loading" : "Unavailable";
  return (
    <Popover.Root>
      <Popover.Trigger className={styles.trigger}>
        <Icon size={15} aria-hidden="true" className={state === "loading" ? "animate-spin motion-reduce:animate-none" : undefined} />
        <span>Task</span>
        <span className={styles.value}>{value}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={`pc-ui pc-builder-authoring ${styles.content}`} aria-label="Task details" align="end" sideOffset={8} collisionPadding={12}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
