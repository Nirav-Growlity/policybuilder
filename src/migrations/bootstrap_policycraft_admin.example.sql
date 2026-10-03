-- Manual one-time designation after 2026_10_create_policycraft_access.sql is applied.
-- Review the selected account before execution. Do not change its shared ESG role/org fields.
SET @policycraft_admin_email = LOWER('<ADMIN_EMAIL>');
SET @policycraft_admin_matches = (
  SELECT COUNT(*) FROM users
   WHERE LOWER(email) COLLATE utf8mb4_general_ci = @policycraft_admin_email COLLATE utf8mb4_general_ci
     AND active = 1
     AND is_deleted = 0
);
SET @policycraft_admin_user_id = (
  SELECT MIN(id) FROM users
   WHERE LOWER(email) COLLATE utf8mb4_general_ci = @policycraft_admin_email COLLATE utf8mb4_general_ci
     AND active = 1
     AND is_deleted = 0
);

-- Review this result first; continue only when match_count is exactly 1.
SELECT @policycraft_admin_matches AS match_count, @policycraft_admin_user_id AS selected_user_id;

INSERT INTO policycraft_user_access (user_id, role, status)
SELECT @policycraft_admin_user_id, 'admin', 'active'
 WHERE @policycraft_admin_matches = 1;
SELECT ROW_COUNT() AS inserted_rows;

-- Verify exactly one intended account was designated:
SELECT a.user_id, u.name, u.email, a.role, a.status
  FROM policycraft_user_access a
  JOIN users u ON u.id = a.user_id
 WHERE a.role = 'admin';
