CREATE TABLE IF NOT EXISTS policycraft_documents (
  id CHAR(36) NOT NULL,
  org_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  updated_by_user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  policy_type VARCHAR(64) NOT NULL,
  current_step VARCHAR(32) NOT NULL,
  policy_json JSON NOT NULL,
  imported_policy_json JSON NULL,
  schema_version INT NOT NULL DEFAULT 1,
  lock_version INT NOT NULL DEFAULT 1,
  archived_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_policycraft_documents_org_updated (org_id, archived_at, updated_at),
  KEY idx_policycraft_documents_org_type (org_id, policy_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

