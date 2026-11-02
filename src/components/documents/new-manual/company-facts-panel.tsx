"use client";

import * as React from "react";
import { BookUser } from "lucide-react";
import { Badge, Panel } from "@/components/ui/panel";
import { Field, Textarea } from "@/components/ui/input";
import { SUGGESTED_CONTACT_PURPOSES } from "@/lib/sop/company-facts";
import type { SopCompanyFacts, SopContact } from "@/lib/sop/types";
import { LinesField, RowsTable } from "../builder/section-editors";
import builder from "../builder/builder.module.css";

/**
 * Optional facts the AI writes from instead of leaving [placeholders]: the
 * company profile, certifications, laws and regulators, and key contacts.
 * Used by the wizard's details step and the builder's details dialog.
 */
export function CompanyFactsPanel({ facts, onChange, itemNoun = "SOPs", showCertifications = true }: { facts: SopCompanyFacts; onChange: (patch: Partial<SopCompanyFacts>) => void; /** "SOPs" or "Chapters": what names the contacts as reporting channels. */ itemNoun?: string; showCertifications?: boolean }) {
  // A new row suggests the next common purpose that is not listed yet.
  const newContact = (): SopContact => {
    const used = new Set(facts.contacts.map((contact) => contact.purpose.trim().toLowerCase()));
    const purpose = SUGGESTED_CONTACT_PURPOSES.find((candidate) => !used.has(candidate.toLowerCase())) ?? "";
    return { purpose, name: "", phone: "", email: "" };
  };
  return (
    <Panel
      title="Facts for writing"
      description={showCertifications ? "AI uses these in place of placeholders. Contacts and certifications also print in the front matter." : "AI uses these in place of placeholders. Contacts also print on the opening pages."}
      icon={<BookUser size={17} strokeWidth={1.8} />}
      actions={<Badge>Optional</Badge>}
    >
      <Field label="Company profile" hint="Founded, products and services, markets, headcount. Feeds the introduction; not printed as written.">
        <Textarea
          rows={4}
          value={facts.profile}
          onChange={(event) => onChange({ profile: event.target.value })}
          placeholder="Founded in 1998, makes dyed and finished cotton fabric for export brands in Europe and the US. About 1,200 employees across two units."
        />
      </Field>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {showCertifications ? <Field label="Certifications held" hint="One per line. Printed in the front matter and cited in References.">
          <LinesField lines={facts.certifications} onChange={(certifications) => onChange({ certifications })} label="Certifications held" placeholder={"ISO 14001:2015\nSA8000:2014"} className={builder.linesWriting} />
        </Field> : null}
        <Field label="Laws and regulators that apply" hint="One per line. AI may name these in References and compliance text.">
          <LinesField lines={facts.regulations} onChange={(regulations) => onChange({ regulations })} label="Laws and regulators that apply" placeholder={"Factories Act, 1948\nState Pollution Control Board"} className={builder.linesWriting} />
        </Field>
      </div>
      <Field className="mt-4" label="Key contacts" hint={`Printed as a Key Contacts table. ${itemNoun} name them as reporting channels.`}>
        <RowsTable<SopContact>
          caption="Key contacts"
          rows={facts.contacts}
          onChange={(contacts) => onChange({ contacts })}
          newRow={newContact}
          addLabel="Add contact"
          emptyText="No contacts yet. Add who handles ethics, grievances and emergencies."
          columns={[
            { key: "purpose", label: "Purpose", width: "24%", placeholder: "Grievance" },
            { key: "name", label: "Name or role", width: "24%", placeholder: "HR Manager" },
            { key: "phone", label: "Phone", width: "20%" },
            { key: "email", label: "Email", width: "auto", placeholder: "grievance@company.com" },
          ]}
        />
      </Field>
    </Panel>
  );
}
