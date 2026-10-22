-- Documents area: long multi-part documents (SOP manuals now, employee handbooks next).
-- Kept apart from policycraft_documents so the policy flow and its task tracking stay untouched.
CREATE TABLE IF NOT EXISTS policycraft_manuals (
  id CHAR(36) NOT NULL,
  org_id INT NOT NULL,
  kind ENUM('sop', 'handbook') NOT NULL,
  created_by_user_id INT NOT NULL,
  updated_by_user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  current_stage VARCHAR(64) NOT NULL,
  manual_json JSON NOT NULL,
  imported_context_json JSON NULL,
  -- Filled from the last full render so lists can show "96 pages" without rendering.
  page_count INT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  lock_version INT NOT NULL DEFAULT 1,
  archived_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_policycraft_manuals_org_updated (org_id, archived_at, updated_at),
  KEY idx_policycraft_manuals_org_kind (org_id, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
