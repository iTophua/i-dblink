package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"idblink-backend/db"
	"idblink-backend/models"
)

// Connect 建立数据库连接
func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	var req models.ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	// 如果有 SSH 配置，先建立 SSH 隧道
	connectArgs := db.ConnectArgs{
		DbType:   req.DbType,
		Host:     req.Host,
		Port:     req.Port,
		Username: req.Username,
		Password: req.Password,
		Database: req.Database,
		SSL: db.SSLArgs{
			Enabled:    req.SSLEnabled,
			CAPath:     req.SSLCAPath,
			CertPath:   req.SSLCertPath,
			KeyPath:    req.SSLKeyPath,
			SkipVerify: req.SSLSkipVerify,
		},
	}

	if req.SSHEnabled && req.SSHHost != "" {
		tunnel, err := h.tunnel.StartTunnel(
			req.ConnectionID,
			req.SSHHost,
			req.SSHPort,
			req.SSHUsername,
			req.SSHAuthMethod,
			req.SSHPassword,
			req.SSHPrivateKeyPath,
			req.SSHPassphrase,
			req.Host,
			req.Port,
		)
		if err != nil {
			resp := models.ConnectResponse{
				ConnectionID: req.ConnectionID,
				Error:        fmt.Sprintf("SSH tunnel failed: %v", err),
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
		// 修改连接参数，使用本地隧道端口
		connectArgs.Host = "127.0.0.1"
		connectArgs.Port = tunnel.LocalPort()
	}

	err := h.mgr.Connect(req.ConnectionID, connectArgs)

	resp := models.ConnectResponse{ConnectionID: req.ConnectionID}
	if err != nil {
		resp.Error = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// Disconnect 断开数据库连接
func (h *Handler) Disconnect(w http.ResponseWriter, r *http.Request) {
	var req models.DisconnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	// 关闭 SSH 隧道（如果存在）
	_ = h.tunnel.StopTunnel(req.ConnectionID)

	err := h.mgr.Disconnect(req.ConnectionID)
	resp := models.GenericResponse{}
	if err != nil {
		resp.Error = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// Test 测试数据库连接（不保存连接池）
func (h *Handler) Test(w http.ResponseWriter, r *http.Request) {
	var req models.ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	connectArgs := db.ConnectArgs{
		DbType:   req.DbType,
		Host:     req.Host,
		Port:     req.Port,
		Username: req.Username,
		Password: req.Password,
		Database: req.Database,
		SSL: db.SSLArgs{
			Enabled:    req.SSLEnabled,
			CAPath:     req.SSLCAPath,
			CertPath:   req.SSLCertPath,
			KeyPath:    req.SSLKeyPath,
			SkipVerify: req.SSLSkipVerify,
		},
	}

	// 如果有 SSH 配置，先建立临时 SSH 隧道
	if req.SSHEnabled && req.SSHHost != "" {
		tunnel, err := h.tunnel.StartTunnel(
			"test-"+req.ConnectionID,
			req.SSHHost,
			req.SSHPort,
			req.SSHUsername,
			req.SSHAuthMethod,
			req.SSHPassword,
			req.SSHPrivateKeyPath,
			req.SSHPassphrase,
			req.Host,
			req.Port,
		)
		if err != nil {
			resp := models.GenericResponse{Error: fmt.Sprintf("SSH tunnel failed: %v", err)}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
		defer h.tunnel.StopTunnel("test-" + req.ConnectionID)
		// 修改连接参数，使用本地隧道端口
		connectArgs.Host = "127.0.0.1"
		connectArgs.Port = tunnel.LocalPort()
	}

	// 使用临时 manager 测试连接
	tmpMgr := db.NewManager()
	defer tmpMgr.Disconnect("test-" + req.ConnectionID)
	err := tmpMgr.Connect("test-"+req.ConnectionID, connectArgs)

	resp := models.GenericResponse{}
	if err != nil {
		resp.Error = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
