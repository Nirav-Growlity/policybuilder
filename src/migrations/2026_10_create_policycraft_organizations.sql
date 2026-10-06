CREATE TABLE IF NOT EXISTS policycraft_organization_migration_state (
  marker VARCHAR(64) NOT NULL,
  completed_at TIMESTAMP(3) NULL,
  PRIMARY KEY (marker)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS policycraft_organizations (
  id INT NOT NULL AUTO_INCREMENT,
  source ENUM('esg', 'standalone') NOT NULL,
  esg_org_id INT NULL,
  lock_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_policycraft_organization_esg_id (esg_org_id),
  KEY idx_policycraft_organizations_source (source, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS policycraft_organization_profiles (
  org_id INT NOT NULL,
  profile_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Precondition: run before deploying code that can create standalone organizations.
-- On the first run the registry must be empty. If migration execution is interrupted,
-- the 'started' marker allows this same explicit-ID seed to resume. Once 'complete',
-- reruns never copy raw ESG IDs into or over the registry again.
INSERT IGNORE INTO policycraft_organization_migration_state (marker, completed_at)
SELECT 'initial_esg_seed_started', NULL
 WHERE NOT EXISTS (SELECT 1 FROM policycraft_organization_migration_state WHERE marker = 'initial_esg_seed_complete');

INSERT INTO policycraft_organizations (id, source, esg_org_id)
SELECT o.id, 'esg', o.id
  FROM organizations o
 WHERE EXISTS (SELECT 1 FROM policycraft_organization_migration_state WHERE marker = 'initial_esg_seed_started')
   AND NOT EXISTS (SELECT 1 FROM policycraft_organization_migration_state WHERE marker = 'initial_esg_seed_complete')
   AND NOT EXISTS (SELECT 1 FROM policycraft_organizations existing WHERE existing.source = 'esg' AND existing.esg_org_id = o.id);

INSERT INTO policycraft_organization_migration_state (marker, completed_at)
SELECT 'initial_esg_seed_complete', CURRENT_TIMESTAMP(3)
 WHERE EXISTS (SELECT 1 FROM policycraft_organization_migration_state WHERE marker = 'initial_esg_seed_started')
   AND NOT EXISTS (SELECT 1 FROM policycraft_organization_migration_state WHERE marker = 'initial_esg_seed_complete')
   AND (SELECT COUNT(*) FROM organizations) =
       (SELECT COUNT(*) FROM policycraft_organizations WHERE source = 'esg')
   AND NOT EXISTS (
     SELECT 1 FROM organizations o
      LEFT JOIN policycraft_organizations pco ON pco.source = 'esg' AND pco.esg_org_id = o.id AND pco.id = o.id
     WHERE pco.id IS NULL
   );
