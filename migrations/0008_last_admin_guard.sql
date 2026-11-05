-- Preserve at least one active administrator at the database layer.
-- Protects against concurrent role changes as well as application bugs.
CREATE TRIGGER IF NOT EXISTS user_access_keep_last_admin_update
BEFORE UPDATE OF role_key,active ON user_access
WHEN OLD.role_key='administrador' AND OLD.active=1
 AND (NEW.role_key<>'administrador' OR NEW.active<>1)
 AND (SELECT COUNT(*) FROM user_access WHERE role_key='administrador' AND active=1)<=1
BEGIN
 SELECT RAISE(ABORT,'LAST_ADMIN_REQUIRED');
END;
CREATE TRIGGER IF NOT EXISTS user_access_keep_last_admin_delete
BEFORE DELETE ON user_access
WHEN OLD.role_key='administrador' AND OLD.active=1
 AND (SELECT COUNT(*) FROM user_access WHERE role_key='administrador' AND active=1)<=1
BEGIN
 SELECT RAISE(ABORT,'LAST_ADMIN_REQUIRED');
END;
