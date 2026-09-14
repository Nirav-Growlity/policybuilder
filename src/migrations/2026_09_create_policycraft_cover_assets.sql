CREATE TABLE IF NOT EXISTS policycraft_cover_assets (
  id CHAR(36) NOT NULL,
  org_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  byte_size INT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  content MEDIUMBLOB NOT NULL,
  archived_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_policycraft_cover_asset_hash (org_id, sha256),
  KEY idx_policycraft_cover_assets_org (org_id, archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS policycraft_cover_templates (
  id CHAR(36) NOT NULL,
  org_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  composition_json JSON NOT NULL,
  preview_asset_id CHAR(36) NULL,
  lock_version INT NOT NULL DEFAULT 1,
  archived_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_policycraft_cover_templates_org (org_id, archived_at, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
