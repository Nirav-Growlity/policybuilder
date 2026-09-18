"use client";
import type { Policy } from "./types";

export const policyPreviewKey = (policy: Policy) => JSON.stringify(policy);
