-- Owner-run PolicyCraft signature storage reset. This deletes all saved signatures
-- from both prior signature tables.
-- Pause signature writes before applying. Requires policycraft_documents to exist. The application
-- startup never executes this script.

DROP TABLE IF EXISTS policycraft_document_signatures;
DROP TABLE IF EXISTS policycraft_user_signatures;

CREATE TABLE policycraft_user_signatures (
  user_id INT NOT NULL,
  org_id INT NOT NULL,
  document_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  content MEDIUMBLOB NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, org_id, document_id),
  KEY idx_policycraft_user_signatures_document (document_id),
  CONSTRAINT fk_policycraft_user_signatures_document
    FOREIGN KEY (document_id) REFERENCES policycraft_documents (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
