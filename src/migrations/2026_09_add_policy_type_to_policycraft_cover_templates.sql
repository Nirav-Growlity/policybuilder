-- PolicyCraft cover templates were originally stored without the policy type.
-- Leave existing rows NULL: their policy association cannot be inferred safely
-- from the saved artwork. Assign those rows manually before exposing them in
-- an AI-cover library for a specific policy.
ALTER TABLE policycraft_cover_templates
  ADD COLUMN policy_type VARCHAR(64) NULL AFTER name;

CREATE INDEX idx_policycraft_cover_templates_policy_type
  ON policycraft_cover_templates (org_id, policy_type, archived_at, updated_at);
