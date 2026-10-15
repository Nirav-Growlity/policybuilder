"use client";

import { createContext, useContext, type AriaAttributes } from "react";

export const FieldAccessibilityContext = createContext<{labelId?: string; descriptionId?: string; invalid?: boolean}>({});

export function useFieldAccessibility(props: {"aria-label"?: string; "aria-labelledby"?: string; "aria-describedby"?: string; "aria-invalid"?: AriaAttributes["aria-invalid"]}) {
  const field = useContext(FieldAccessibilityContext);
  return {
    "aria-labelledby": props["aria-labelledby"] || (props["aria-label"] ? undefined : field.labelId),
    "aria-describedby": [props["aria-describedby"], field.descriptionId].filter(Boolean).join(" ") || undefined,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}
