CREATE TABLE IF NOT EXISTS policycraft_user_access (
  user_id INT NOT NULL,
  role ENUM('admin', 'manager') NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_by_user_id INT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  KEY idx_policycraft_user_access_role_status (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS policycraft_manager_organizations (
  manager_user_id INT NOT NULL,
  org_id INT NOT NULL,
  assigned_by_user_id INT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (manager_user_id, org_id),
  KEY idx_policycraft_manager_org_active (org_id, active, manager_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS policycraft_manager_invitations (
  id CHAR(36) NOT NULL,
  email VARCHAR(254) NOT NULL,
  name VARCHAR(255) NOT NULL,
  organization_ids_json JSON NOT NULL,
  token_hash CHAR(64) NOT NULL,
  existing_user_id INT NULL,
  invited_by_user_id INT NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  accepted_at TIMESTAMP(3) NULL,
  cancelled_at TIMESTAMP(3) NULL,
  delivery_status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_policycraft_manager_invitation_email (email),
  UNIQUE KEY uq_policycraft_manager_invitation_token_hash (token_hash),
  KEY idx_policycraft_manager_invitation_pending (accepted_at, cancelled_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
