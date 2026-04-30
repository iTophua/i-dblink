package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	"idblink-backend/db"
	"idblink-backend/models"
)

// ServerInfoRequest 服务器信息请求
type ServerInfoRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
}

// ServerInfoResponse 服务器信息响应
type ServerInfoResponse struct {
	Version        string  `json:"version,omitempty"`
	ServerType     string  `json:"server_type,omitempty"`
	CharacterSet   string  `json:"character_set,omitempty"`
	Collation      string  `json:"collation,omitempty"`
	Uptime         *string `json:"uptime,omitempty"`
	MaxConnections *int    `json:"max_connections,omitempty"`
	Error          string  `json:"error,omitempty"`
}

// GetServerInfo 获取数据库服务器信息
func (h *Handler) GetServerInfo(w http.ResponseWriter, r *http.Request) {
	var req ServerInfoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	pool, err := h.mgr.GetPool(req.ConnectionID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("connection not found: %v", err))
		return
	}

	info, err := getServerInfo(pool, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// getServerInfo 根据数据库类型获取服务器信息
func getServerInfo(pool *db.DBPool, database string) (ServerInfoResponse, error) {
	var resp ServerInfoResponse
	resp.ServerType = pool.DbType

	var db *sql.DB
	if pool.DbType == "sqlite" {
		resp.Version = "SQLite"
		resp.CharacterSet = "utf-8"
		return resp, nil
	}

	db = pool.DB()

	switch pool.DbType {
	case "mysql", "mariadb":
		var version, charset, collation, uptime string
		var maxConns int
		err := db.QueryRow("SELECT VERSION(), @@character_set_server, @@collation_server, @@global.max_connections").
			Scan(&version, &charset, &collation, &maxConns)
		if err != nil {
			return resp, fmt.Errorf("get server info failed: %v", err)
		}
		resp.Version = version
		resp.CharacterSet = charset
		resp.Collation = collation
		resp.MaxConnections = &maxConns

	case "postgresql", "highgo", "vastbase":
		var version, charset string
		var maxConns int
		err := db.QueryRow("SELECT version(), current_setting('client_encoding'), (SELECT setting::int FROM pg_settings WHERE name = 'max_connections')").
			Scan(&version, &charset, &maxConns)
		if err != nil {
			return resp, fmt.Errorf("get server info failed: %v", err)
		}
		resp.Version = version
		resp.CharacterSet = charset
		resp.MaxConnections = &maxConns

	case "dameng", "kingbase":
		var version string
		var maxConns int
		err := db.QueryRow("SELECT banner FROM v$version WHERE rownum = 1").
			Scan(&version)
		if err != nil {
			return resp, fmt.Errorf("get server info failed: %v", err)
		}
		resp.Version = version
		resp.CharacterSet = "utf-8"
		// 达梦/金仓 max_connections 需要查询 v$parameter，此处暂不获取

	default:
		resp.Version = "Unknown"
	}

	return resp, nil
}
