CREATE TABLE IF NOT EXISTS policycraft_tasks (
  id CHAR(36) NOT NULL,
  org_id INT NOT NULL,
  assigned_manager_user_id INT NOT NULL,
  created_by_admin_user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  instructions TEXT NOT NULL,
  policy_type VARCHAR(64) NOT NULL,
  due_at DATETIME(3) NOT NULL,
  status ENUM('assigned', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'assigned',
  document_id CHAR(36) NULL,
  lock_version INT NOT NULL DEFAULT 1,
  started_at TIMESTAMP(3) NULL,
  completed_at TIMESTAMP(3) NULL,
  cancelled_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_policycraft_task_document (document_id),
  KEY idx_policycraft_tasks_org_status_due (org_id, status, due_at),
  KEY idx_policycraft_tasks_manager_status_due (assigned_manager_user_id, status, due_at),
  KEY idx_policycraft_tasks_org_manager (org_id, assigned_manager_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS policycraft_manager_progress (
  org_id INT NOT NULL,
  document_id CHAR(36) NOT NULL,
  manager_user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  policy_type VARCHAR(64) NOT NULL,
  percentage TINYINT UNSIGNED NOT NULL,
  filled_sections SMALLINT UNSIGNED NOT NULL,
  total_sections SMALLINT UNSIGNED NOT NULL,
  sections_json JSON NOT NULL,
  document_version INT NOT NULL,
  saved_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (org_id, document_id, manager_user_id),
  KEY idx_policycraft_manager_progress_org_saved (org_id, saved_at),
  KEY idx_policycraft_manager_progress_manager (manager_user_id, saved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS policycraft_task_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id CHAR(36) NOT NULL,
  org_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  actor_role ENUM('admin', 'manager') NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  details_json JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_policycraft_task_events_task (task_id, id),
  KEY idx_policycraft_task_events_org (org_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
