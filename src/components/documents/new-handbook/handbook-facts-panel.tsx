"use client";

import { BriefcaseBusiness } from "lucide-react";
import { Badge, Panel } from "@/components/ui/panel";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { HandbookFacts, HandbookLeaveRow } from "@/lib/handbook/types";
import { RowsTable } from "../builder/section-editors";

const newLeaveRow = (): HandbookLeaveRow => ({ type: "", days: "", notes: "" });

/**
 * Employment terms the AI writes from instead of leaving placeholders. Used by
 * the handbook wizard's details step; every field is optional.
 */
export function HandbookFactsPanel({ facts, onChange }: { facts: HandbookFacts; onChange: (patch: Partial<HandbookFacts>) => void }) {
  return (
    <Panel
      title="Employment terms"
      description="AI uses these instead of placeholders. Blank fields stay as [placeholders] in the chapters."
      icon={<BriefcaseBusiness size={17} strokeWidth={1.8} />}
      actions={<Badge>Optional</Badge>}
    >
      <Field label="Working hours and shifts" hint="Office hours and any plant shifts. Feeds Working Here.">
        <Textarea
          rows={3}
          value={facts.workingHours}
          onChange={(event) => onChange({ workingHours: event.target.value })}
          placeholder="9:30 am to 6:30 pm, Monday to Friday. Plant shifts: 6 am to 2 pm, 2 pm to 10 pm, 10 pm to 6 am."
        />
      </Field>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Weekly off">
          <Input value={facts.weeklyOff} onChange={(event) => onChange({ weeklyOff: event.target.value })} placeholder="Sunday, and the second and fourth Saturdays" />
        </Field>
        <Field label="Probation period">
          <Input value={facts.probation} onChange={(event) => onChange({ probation: event.target.value })} placeholder="6 months, extendable by 3 months" />
        </Field>
        <Field label="Notice period">
          <Input value={facts.noticePeriod} onChange={(event) => onChange({ noticePeriod: event.target.value })} placeholder="30 days for staff, 90 days for managers" />
        </Field>
        <Field label="Pay day">
          <Input value={facts.payday} onChange={(event) => onChange({ payday: event.target.value })} placeholder="Salary is credited by the 7th of each month" />
        </Field>
      </div>
      <Field className="mt-4" label="Leave entitlements" hint="One row per leave type. Printed as a table in Leave.">
        <RowsTable<HandbookLeaveRow>
          caption="Leave entitlements"
          rows={facts.leave}
          onChange={(leave) => onChange({ leave })}
          newRow={newLeaveRow}
          addLabel="Add leave type"
          emptyText="No leave types yet. Add casual, sick and earned leave."
          columns={[
            { key: "type", label: "Type", width: "34%", placeholder: "Casual leave" },
            { key: "days", label: "Days a year", width: "20%", placeholder: "12" },
            { key: "notes", label: "Notes", width: "auto", placeholder: "Credited on 1 January, up to 3 days carried forward" },
          ]}
        />
      </Field>
    </Panel>
  );
}
