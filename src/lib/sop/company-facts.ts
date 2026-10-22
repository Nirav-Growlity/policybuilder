/**
 * Readers for the optional company facts on a manual (profile, certifications,
 * laws and regulators, key contacts). Manuals saved before the facts existed
 * have none, and writers keep blank lines and half-filled rows while typing,
 * so every consumer (AI context, render model, readiness) reads them here.
 */
import type { SopCompanyFacts, SopContact, SopManual } from "./types";

/** Contact purposes the reference manuals list most often, offered in order when a row is added. */
export const SUGGESTED_CONTACT_PURPOSES = [
  "Ethics & compliance",
  "Grievance",
  "EHS / emergency",
  "Data protection",
  "Customer helpline",
] as const;

export function createEmptyCompanyFacts(): SopCompanyFacts {
  return { profile: "", certifications: [], regulations: [], contacts: [] };
}

const tidy = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** One item per entry; list markers a writer typed ("- ", "1. ") are dropped, blanks and repeats removed. */
function tidyList(items: readonly string[] | undefined) {
  const out: string[] = [];
  for (const item of items ?? []) {
    const text = tidy(item).replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/** The manual's facts with blanks removed; empty facts for a manual that has none. */
export function companyFacts(manual: Pick<SopManual, "facts">): SopCompanyFacts {
  const facts = manual.facts;
  if (!facts) return createEmptyCompanyFacts();
  return {
    profile: tidy(facts.profile).replace(/\r\n/g, "\n"),
    certifications: tidyList(facts.certifications),
    regulations: tidyList(facts.regulations),
    contacts: (facts.contacts ?? [])
      .map((contact): SopContact => ({ purpose: tidy(contact.purpose), name: tidy(contact.name), phone: tidy(contact.phone), email: tidy(contact.email) }))
      .filter((contact) => contact.purpose || contact.name || contact.phone || contact.email),
  };
}

export function hasCompanyFacts(facts: SopCompanyFacts): boolean {
  return Boolean(facts.profile || facts.certifications.length || facts.regulations.length || facts.contacts.length);
}

/** Contacts someone can actually reach: they have a phone number or an email address. */
export function reachableContacts(facts: SopCompanyFacts): SopContact[] {
  return facts.contacts.filter((contact) => contact.phone || contact.email);
}
