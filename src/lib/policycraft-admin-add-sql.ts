/** String identity comparison avoids mixed-collation errors and preserves canonical account IDs. */
export const policyCraftAdminAddUserSelect = `SELECT u.id, u.name, u.email, u.active, u.is_deleted,
       access.role AS access_role, access.status AS access_status,
       credential.password AS credential_hash
  FROM users u
  LEFT JOIN policycraft_user_access access ON access.user_id = u.id
  LEFT JOIN account credential ON BINARY credential.userId = BINARY CAST(u.id AS CHAR) AND credential.providerId = 'credential'`;
