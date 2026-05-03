package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"idblink-backend/models"
)

// UserPrivilege 用户权限信息
type UserPrivilege struct {
	User     string `json:"user"`
	Host     string `json:"host"`
	Database string `json:"database"`
	Table    string `json:"table"`
	Privilege string `json:"privilege"`
}

// CreateUserRequest 创建用户请求
type CreateUserRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	Host         string `json:"host"`
}

// DropUserRequest 删除用户请求
type DropUserRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	Username     string `json:"username"`
	Host         string `json:"host"`
}

// GrantRequest 授予权限请求
type GrantRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	Username     string `json:"username"`
	Host         string `json:"host"`
	Privileges   []string `json:"privileges"`
	DatabaseAll  bool     `json:"database_all"`
	Table        string   `json:"table"`
}

// RevokeRequest 撤销权限请求
type RevokeRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	Username     string `json:"username"`
	Host         string `json:"host"`
	Privileges   []string `json:"privileges"`
	DatabaseAll  bool     `json:"database_all"`
	Table        string   `json:"table"`
}

// GetUserPrivilegesRequest 获取用户权限请求
type GetUserPrivilegesRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	Username     string `json:"username"`
	Host         string `json:"host"`
}

// GetUsers 获取用户列表
func (h *Handler) GetUsers(w http.ResponseWriter, r *http.Request) {
	var req models.MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var users []map[string]string
	switch dbType {
	case "mysql", "mariadb":
		users, err = h.getMySQLUsers(ctx, exec)
	case "postgresql", "kingbase", "highgo", "vastbase":
		users, err = h.getPostgreSQLUsers(ctx, exec)
	case "sqlite":
		users = []map[string]string{{"user": "sqlite", "host": "%", "type": "builtin"}}
	case "sqlserver":
		users, err = h.getSQLServerUsers(ctx, exec)
	case "oracle":
		users, err = h.getOracleUsers(ctx, exec)
	case "dameng":
		users, err = h.getDMUsers(ctx, exec)
	default:
		writeJSONError(w, fmt.Sprintf("不支持的数据库类型: %s", dbType))
		return
	}

	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"users": users,
	})
}

// getMySQLUsers 获取 MySQL 用户列表
func (h *Handler) getMySQLUsers(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }) ([]map[string]string, error) {
	rows, err := exec.QueryContext(ctx, "SELECT User, Host FROM mysql.user")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []map[string]string
	for rows.Next() {
		var user, host string
		if err := rows.Scan(&user, &host); err != nil {
			continue
		}
		users = append(users, map[string]string{"user": user, "host": host})
	}
	return users, nil
}

// getPostgreSQLUsers 获取 PostgreSQL 用户列表
func (h *Handler) getPostgreSQLUsers(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }) ([]map[string]string, error) {
	rows, err := exec.QueryContext(ctx, "SELECT rolname AS rolname, CASE WHEN rolsuper THEN 'superuser' ELSE 'normal' END AS type FROM pg_roles WHERE rolcanlogin ORDER BY rolname")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []map[string]string
	for rows.Next() {
		var name, roleType string
		if err := rows.Scan(&name, &roleType); err != nil {
			continue
		}
		users = append(users, map[string]string{"user": name, "host": "%", "type": roleType})
	}
	return users, nil
}

// getSQLServerUsers 获取 SQL Server 用户列表
func (h *Handler) getSQLServerUsers(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }) ([]map[string]string, error) {
	rows, err := exec.QueryContext(ctx, "SELECT name, type_desc FROM sys.database_principals WHERE type IN ('S', 'U', 'G') AND name NOT LIKE '##%##'")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []map[string]string
	for rows.Next() {
		var name, typeDesc string
		if err := rows.Scan(&name, &typeDesc); err != nil {
			continue
		}
		users = append(users, map[string]string{"user": name, "host": "%", "type": typeDesc})
	}
	return users, nil
}

// getOracleUsers 获取 Oracle 用户列表
func (h *Handler) getOracleUsers(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }) ([]map[string]string, error) {
	rows, err := exec.QueryContext(ctx, "SELECT username, account_status FROM dba_users WHERE account_status LIKE 'OPEN%' AND username NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'DBSNMP', 'SYSMAN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WKSYS', 'CTXSYS', 'WMSYS', 'APPQOSSYS', 'AUDSYS', 'GOLDENGATE$REPLICATION$ADMIN', 'ORDDATA', 'OLAPSYS', 'SI_INFORMTN_SCHEMA', 'XDB', 'TSMSYS', 'ANONYMOUS', 'HR', 'OE', 'PM', 'SH', 'SCOTT', 'BI', 'APEX_030200', 'FLOWS_FILES', 'APEX_PUBLIC_USER', 'SPATIAL_CSW_ADMIN_USR', 'SPATIAL_WFS_ADMIN_USR', 'MDDATA', 'ORDPLUGINS', 'DV_OWNER', 'DV_WEB_ADMIN', 'DV_PUBLIC', 'LBACSYS', 'GSMADMIN_INTERNAL', 'DIP', 'RMAN', 'ORACLE_OCM')")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []map[string]string
	for rows.Next() {
		var username, status string
		if err := rows.Scan(&username, &status); err != nil {
			continue
		}
		users = append(users, map[string]string{"user": username, "host": "%", "type": status})
	}
	return users, nil
}

// getDMUsers 获取达梦用户列表
func (h *Handler) getDMUsers(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }) ([]map[string]string, error) {
	rows, err := exec.QueryContext(ctx, "SELECT USER_NAME, USER_TYPE FROM DBA_USERS WHERE USERNAME NOT IN ('SYSDBA', 'SYSAUDITOR', 'SYS')")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []map[string]string
	for rows.Next() {
		var name, userType string
		if err := rows.Scan(&name, &userType); err != nil {
			continue
		}
		users = append(users, map[string]string{"user": name, "host": "%", "type": userType})
	}
	return users, nil
}

// GetPrivileges 获取用户权限列表
func (h *Handler) GetPrivileges(w http.ResponseWriter, r *http.Request) {
	var req GetUserPrivilegesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var privileges []UserPrivilege
	switch dbType {
	case "mysql", "mariadb":
		privileges, err = h.getMySQLPrivileges(ctx, exec, req.Username, req.Host)
	case "postgresql", "kingbase", "highgo", "vastbase":
		privileges, err = h.getPostgreSQLPrivileges(ctx, exec, req.Username)
	case "sqlserver":
		privileges, err = h.getSQLServerPrivileges(ctx, exec, req.Username)
	case "oracle":
		privileges, err = h.getOraclePrivileges(ctx, exec, req.Username)
	case "dameng":
		privileges, err = h.getDMPrivileges(ctx, exec, req.Username)
	default:
		writeJSONError(w, fmt.Sprintf("不支持的数据库类型: %s", dbType))
		return
	}

	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"privileges": privileges,
	})
}

// getMySQLPrivileges 获取 MySQL 用户权限
func (h *Handler) getMySQLPrivileges(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, username, host string) ([]UserPrivilege, error) {
	rows, err := exec.QueryContext(ctx, "SELECT PRIVILEGE_TYPE, IS_GRANTABLE FROM information_schema.USER_PRIVILEGES WHERE GRANTEE = CONCAT(\"'\", ?, \"'@'\", ?, \"'\")", username, host)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var privileges []UserPrivilege
	for rows.Next() {
		var priv, grantable string
		if err := rows.Scan(&priv, &grantable); err != nil {
			continue
		}
		privileges = append(privileges, UserPrivilege{
			User:      username,
			Host:      host,
			Privilege: priv,
		})
	}
	return privileges, nil
}

// getPostgreSQLPrivileges 获取 PostgreSQL 用户权限
func (h *Handler) getPostgreSQLPrivileges(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, username string) ([]UserPrivilege, error) {
	rows, err := exec.QueryContext(ctx, "SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication FROM pg_roles WHERE rolname = $1", username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var privileges []UserPrivilege
	for rows.Next() {
		var name string
		var super, createRole, createDB, login, replication bool
		if err := rows.Scan(&name, &super, &createRole, &createDB, &login, &replication); err != nil {
			continue
		}
		if super {
			privileges = append(privileges, UserPrivilege{User: username, Privilege: "SUPERUSER"})
		}
		if createRole {
			privileges = append(privileges, UserPrivilege{User: username, Privilege: "CREATEROLE"})
		}
		if createDB {
			privileges = append(privileges, UserPrivilege{User: username, Privilege: "CREATEDB"})
		}
		if login {
			privileges = append(privileges, UserPrivilege{User: username, Privilege: "LOGIN"})
		}
		if replication {
			privileges = append(privileges, UserPrivilege{User: username, Privilege: "REPLICATION"})
		}
	}
	return privileges, nil
}

// getSQLServerPrivileges 获取 SQL Server 用户权限
func (h *Handler) getSQLServerPrivileges(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, username string) ([]UserPrivilege, error) {
	rows, err := exec.QueryContext(ctx, "SELECT dp.name, dp.type_desc, CASE WHEN rp.permission_name IS NOT NULL THEN rp.permission_name ELSE 'VIEW DEFINITION' END as permission_name FROM sys.database_principals dp LEFT JOIN sys.database_permissions rp ON dp.principal_id = rp.grantee_id WHERE dp.name = @p1", username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var privileges []UserPrivilege
	for rows.Next() {
		var name, typeDesc, permission string
		if err := rows.Scan(&name, &typeDesc, &permission); err != nil {
			continue
		}
		privileges = append(privileges, UserPrivilege{
			User:      username,
			Privilege: permission,
		})
	}
	return privileges, nil
}

// getOraclePrivileges 获取 Oracle 用户权限
func (h *Handler) getOraclePrivileges(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, username string) ([]UserPrivilege, error) {
	rows, err := exec.QueryContext(ctx, "SELECT privilege, grantee FROM dba_sys_privs WHERE grantee = $1 UNION SELECT 'TABLE_PRIVILEGE', grantee || ' on ' || owner || '.' || table_name FROM dba_tab_privs WHERE grantee = $1", username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var privileges []UserPrivilege
	for rows.Next() {
		var priv, grantee string
		if err := rows.Scan(&priv, &grantee); err != nil {
			continue
		}
		privileges = append(privileges, UserPrivilege{
			User:      username,
			Privilege: priv,
		})
	}
	return privileges, nil
}

// getDMPrivileges 获取达梦用户权限
func (h *Handler) getDMPrivileges(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, username string) ([]UserPrivilege, error) {
	rows, err := exec.QueryContext(ctx, "SELECT privilege_name FROM dba_sys_privs WHERE grantee_name = $1 UNION SELECT 'TABLE_PRIVILEGE: ' || owner || '.' || table_name || ':' || privilege FROM dba_tab_privs WHERE grantee_name = $1", username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var privileges []UserPrivilege
	for rows.Next() {
		var priv string
		if err := rows.Scan(&priv); err != nil {
			continue
		}
		privileges = append(privileges, UserPrivilege{
			User:      username,
			Privilege: priv,
		})
	}
	return privileges, nil
}

// CreateUser 创建用户
func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	sql := buildCreateUserSQL(req.Username, req.Password, req.Host, dbType)
	if sql == "" {
		writeJSONError(w, fmt.Sprintf("CREATE USER 操作不支持 %s 数据库", dbType))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, sql)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// buildCreateUserSQL 构建创建用户 SQL
func buildCreateUserSQL(username, password, host, dbType string) string {
	switch dbType {
	case "mysql", "mariadb":
		if host == "" {
			host = "%"
		}
		return fmt.Sprintf("CREATE USER '%s'@'%s' IDENTIFIED BY '%s'", username, host, password)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return fmt.Sprintf("CREATE ROLE %s WITH LOGIN PASSWORD '%s'", username, password)
	case "sqlserver":
		return fmt.Sprintf("CREATE LOGIN [%s] WITH PASSWORD = '%s'", username, password)
	case "oracle":
		return fmt.Sprintf("CREATE USER %s IDENTIFIED BY \"%s\"", username, password)
	case "dameng":
		return fmt.Sprintf("CREATE USER \"%s\" IDENTIFIED BY \"%s\"", username, password)
	default:
		return ""
	}
}

// DropUser 删除用户
func (h *Handler) DropUser(w http.ResponseWriter, r *http.Request) {
	var req DropUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	sql := buildDropUserSQL(req.Username, req.Host, dbType)
	if sql == "" {
		writeJSONError(w, fmt.Sprintf("DROP USER 操作不支持 %s 数据库", dbType))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, sql)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// buildDropUserSQL 构建删除用户 SQL
func buildDropUserSQL(username, host, dbType string) string {
	switch dbType {
	case "mysql", "mariadb":
		if host == "" {
			host = "%"
		}
		return fmt.Sprintf("DROP USER IF EXISTS '%s'@'%s'", username, host)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return fmt.Sprintf("DROP ROLE IF EXISTS %s", username)
	case "sqlserver":
		return fmt.Sprintf("DROP LOGIN IF EXISTS [%s]", username)
	case "oracle":
		return fmt.Sprintf("DROP USER %s CASCADE", username)
	case "dameng":
		return fmt.Sprintf("DROP USER \"%s\" CASCADE", username)
	default:
		return ""
	}
}

// GrantPrivilege 授予权限
func (h *Handler) GrantPrivilege(w http.ResponseWriter, r *http.Request) {
	var req GrantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	sql := buildGrantSQL(req, dbType)
	if sql == "" {
		writeJSONError(w, fmt.Sprintf("GRANT 操作不支持 %s 数据库", dbType))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, sql)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// buildGrantSQL 构建授予权限 SQL
func buildGrantSQL(req GrantRequest, dbType string) string {
	privileges := strings.Join(req.Privileges, ", ")
	if privileges == "" {
		privileges = "ALL"
	}

	switch dbType {
	case "mysql", "mariadb":
		host := req.Host
		if host == "" {
			host = "%"
		}
		if req.DatabaseAll {
			return fmt.Sprintf("GRANT %s ON *.* TO '%s'@'%s'", privileges, req.Username, host)
		}
		tableRef := fmt.Sprintf("`%s`.`%s`", req.Database, req.Table)
		return fmt.Sprintf("GRANT %s ON %s TO '%s'@'%s'", privileges, tableRef, req.Username, host)
	case "postgresql", "kingbase", "highgo", "vastbase":
		if req.DatabaseAll {
			if containsOnlyTablePrivs(req.Privileges) {
				return fmt.Sprintf("GRANT %s ON ALL TABLES IN SCHEMA public TO %s", privileges, req.Username)
			}
			return fmt.Sprintf("GRANT %s TO %s", privileges, req.Username)
		}
		tableRef := fmt.Sprintf("\"%s\".\"%s\"", req.Database, req.Table)
		return fmt.Sprintf("GRANT %s ON %s TO %s", privileges, tableRef, req.Username)
	case "sqlserver":
		if req.DatabaseAll {
			return fmt.Sprintf("GRANT %s TO [%s]", privileges, req.Username)
		}
		tableRef := fmt.Sprintf("[%s].[%s]", req.Database, req.Table)
		return fmt.Sprintf("GRANT %s ON %s TO [%s]", privileges, tableRef, req.Username)
	case "oracle":
		if req.DatabaseAll {
			return fmt.Sprintf("GRANT %s TO \"%s\"", privileges, req.Username)
		}
		tableRef := fmt.Sprintf("\"%s\".\"%s\"", req.Database, req.Table)
		return fmt.Sprintf("GRANT %s ON %s TO \"%s\"", privileges, tableRef, req.Username)
	case "dameng":
		if req.DatabaseAll {
			return fmt.Sprintf("GRANT %s TO \"%s\"", privileges, req.Username)
		}
		tableRef := fmt.Sprintf("\"%s\".\"%s\"", req.Database, req.Table)
		return fmt.Sprintf("GRANT %s ON %s TO \"%s\"", privileges, tableRef, req.Username)
	default:
		return ""
	}
}

// containsOnlyTablePrivs 检查是否只包含表级权限
func containsOnlyTablePrivs(privs []string) bool {
	schemaPrivs := map[string]bool{
		"CREATE ROLE": true, "CREATEROLE": true, "CREATE DB": true, "CREATEDB": true,
		"LOGIN": true, "SUPERUSER": true, "REPLICATION": true,
	}
	for _, p := range privs {
		if schemaPrivs[strings.ToUpper(p)] {
			return false
		}
	}
	return true
}

// RevokePrivilege 撤销权限
func (h *Handler) RevokePrivilege(w http.ResponseWriter, r *http.Request) {
	var req RevokeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	sql := buildRevokeSQL(req, dbType)
	if sql == "" {
		writeJSONError(w, fmt.Sprintf("REVOKE 操作不支持 %s 数据库", dbType))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, sql)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// buildRevokeSQL 构建撤销权限 SQL
func buildRevokeSQL(req RevokeRequest, dbType string) string {
	privileges := strings.Join(req.Privileges, ", ")
	if privileges == "" {
		privileges = "ALL"
	}

	switch dbType {
	case "mysql", "mariadb":
		host := req.Host
		if host == "" {
			host = "%"
		}
		if req.DatabaseAll {
			return fmt.Sprintf("REVOKE %s ON *.* FROM '%s'@'%s'", privileges, req.Username, host)
		}
		tableRef := fmt.Sprintf("`%s`.`%s`", req.Database, req.Table)
		return fmt.Sprintf("REVOKE %s ON %s FROM '%s'@'%s'", privileges, tableRef, req.Username, host)
	case "postgresql", "kingbase", "highgo", "vastbase":
		if req.DatabaseAll {
			if containsOnlyTablePrivs(req.Privileges) {
				return fmt.Sprintf("REVOKE %s ON ALL TABLES IN SCHEMA public FROM %s", privileges, req.Username)
			}
			return fmt.Sprintf("REVOKE %s FROM %s", privileges, req.Username)
		}
		tableRef := fmt.Sprintf("\"%s\".\"%s\"", req.Database, req.Table)
		return fmt.Sprintf("REVOKE %s ON %s FROM %s", privileges, tableRef, req.Username)
	case "sqlserver":
		if req.DatabaseAll {
			return fmt.Sprintf("REVOKE %s FROM [%s]", privileges, req.Username)
		}
		tableRef := fmt.Sprintf("[%s].[%s]", req.Database, req.Table)
		return fmt.Sprintf("REVOKE %s ON %s FROM [%s]", privileges, tableRef, req.Username)
	case "oracle":
		if req.DatabaseAll {
			return fmt.Sprintf("REVOKE %s FROM \"%s\"", privileges, req.Username)
		}
		tableRef := fmt.Sprintf("\"%s\".\"%s\"", req.Database, req.Table)
		return fmt.Sprintf("REVOKE %s ON %s FROM \"%s\"", privileges, tableRef, req.Username)
	case "dameng":
		if req.DatabaseAll {
			return fmt.Sprintf("REVOKE %s FROM \"%s\"", privileges, req.Username)
		}
		tableRef := fmt.Sprintf("\"%s\".\"%s\"", req.Database, req.Table)
		return fmt.Sprintf("REVOKE %s ON %s FROM \"%s\"", privileges, tableRef, req.Username)
	default:
		return ""
	}
}

// GetTablePrivileges 获取表级权限
func (h *Handler) GetTablePrivileges(w http.ResponseWriter, r *http.Request) {
	var req GetUserPrivilegesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var privileges []UserPrivilege
	switch dbType {
	case "mysql", "mariadb":
		privileges, err = h.getMySQLTablePrivileges(ctx, exec, req.Username, req.Host, req.Database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		privileges, err = h.getPostgreSQLTablePrivileges(ctx, exec, req.Username, req.Database)
	case "sqlserver":
		privileges, err = h.getSQLServerTablePrivileges(ctx, exec, req.Username, req.Database)
	case "oracle":
		privileges, err = h.getOracleTablePrivileges(ctx, exec, req.Username, req.Database)
	case "dameng":
		privileges, err = h.getDMTablePrivileges(ctx, exec, req.Username, req.Database)
	default:
		writeJSONError(w, fmt.Sprintf("不支持的数据库类型: %s", dbType))
		return
	}

	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"privileges": privileges,
	})
}

// getMySQLTablePrivileges 获取 MySQL 表级权限
func (h *Handler) getMySQLTablePrivileges(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, username, host, database string) ([]UserPrivilege, error) {
	if database == "" {
		return nil, nil
	}
	rows, err := exec.QueryContext(ctx, "SELECT TABLE_NAME, PRIVILEGE_TYPE FROM information_schema.TABLE_PRIVILEGES WHERE GRANTEE = CONCAT(\"'\", ?, \"'@'\", ?, \"'\") AND TABLE_SCHEMA = ?", username, host, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var privileges []UserPrivilege
	for rows.Next() {
		var table, priv string
		if err := rows.Scan(&table, &priv); err != nil {
			continue
		}
		privileges = append(privileges, UserPrivilege{
			User:      username,
			Host:      host,
			Database:  database,
			Table:     table,
			Privilege: priv,
		})
	}
	return privileges, nil
}

// getPostgreSQLTablePrivileges 获取 PostgreSQL 表级权限
func (h *Handler) getPostgreSQLTablePrivileges(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, username, database string) ([]UserPrivilege, error) {
	if database == "" {
		return nil, nil
	}
	rows, err := exec.QueryContext(ctx, "SELECT n.nspname AS table_schema, c.relname AS table_name, p.privilege_type FROM information_schema.role_table_grants r JOIN pg_class c ON c.relname = r.object_name JOIN pg_namespace n ON n.oid = c.relnamespace JOIN information_schema.privileges p ON p.grantee = r.grantee AND p.table_name = r.object_name AND p.privilege_type = p.privilege_type WHERE r.grantee = $1 AND n.nspname = 'public'", username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var privileges []UserPrivilege
	for rows.Next() {
		var schema, table, priv string
		if err := rows.Scan(&schema, &table, &priv); err != nil {
			continue
		}
		privileges = append(privileges, UserPrivilege{
			User:      username,
			Database:  database,
			Table:     table,
			Privilege: priv,
		})
	}
	return privileges, nil
}

// getSQLServerTablePrivileges 获取 SQL Server 表级权限
func (h *Handler) getSQLServerTablePrivileges(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, username, database string) ([]UserPrivilege, error) {
	if database == "" {
		return nil, nil
	}
	rows, err := exec.QueryContext(ctx, "SELECT OBJECT_NAME(p.major_id) AS table_name, p.permission_name FROM sys.database_permissions p JOIN sys.database_principals dp ON p.grantee_id = dp.principal_id WHERE dp.name = @p1", username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var privileges []UserPrivilege
	for rows.Next() {
		var table, priv string
		if err := rows.Scan(&table, &priv); err != nil {
			continue
		}
		privileges = append(privileges, UserPrivilege{
			User:      username,
			Database:  database,
			Table:     table,
			Privilege: priv,
		})
	}
	return privileges, nil
}

// getOracleTablePrivileges 获取 Oracle 表级权限
func (h *Handler) getOracleTablePrivileges(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, username, database string) ([]UserPrivilege, error) {
	rows, err := exec.QueryContext(ctx, "SELECT owner, table_name, privilege FROM dba_tab_privs WHERE grantee = $1", username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var privileges []UserPrivilege
	for rows.Next() {
		var owner, table, priv string
		if err := rows.Scan(&owner, &table, &priv); err != nil {
			continue
		}
		privileges = append(privileges, UserPrivilege{
			User:      username,
			Database:  database,
			Table:     table,
			Privilege: priv,
		})
	}
	return privileges, nil
}

// getDMTablePrivileges 获取达梦表级权限
func (h *Handler) getDMTablePrivileges(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, username, database string) ([]UserPrivilege, error) {
	rows, err := exec.QueryContext(ctx, "SELECT owner, table_name, privilege_name FROM dba_tab_privs WHERE grantee_name = $1", username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var privileges []UserPrivilege
	for rows.Next() {
		var owner, table, priv string
		if err := rows.Scan(&owner, &table, &priv); err != nil {
			continue
		}
		privileges = append(privileges, UserPrivilege{
			User:      username,
			Database:  database,
			Table:     table,
			Privilege: priv,
		})
	}
	return privileges, nil
}
