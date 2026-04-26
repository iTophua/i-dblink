package api

import (
	"encoding/json"
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

	err := h.mgr.Connect(req.ConnectionID, db.ConnectArgs{
		DbType:   req.DbType,
		Host:     req.Host,
		Port:     req.Port,
		Username: req.Username,
		Password: req.Password,
		Database: req.Database,
	})

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

	// 使用临时 manager 测试连接
	tmpMgr := db.NewManager()
	defer tmpMgr.Disconnect("test-" + req.ConnectionID)
	err := tmpMgr.Connect("test-"+req.ConnectionID, db.ConnectArgs{
		DbType:   req.DbType,
		Host:     req.Host,
		Port:     req.Port,
		Username: req.Username,
		Password: req.Password,
		Database: req.Database,
	})

	resp := models.GenericResponse{}
	if err != nil {
		resp.Error = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
