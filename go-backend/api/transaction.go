package api

import (
	"encoding/json"
	"net/http"

	"idblink-backend/models"
)

// TransactionRequest 事务请求
type TransactionRequest struct {
	ConnectionID string `json:"connection_id"`
}

// BeginTransaction 开启事务
func (h *Handler) BeginTransaction(w http.ResponseWriter, r *http.Request) {
	var req TransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	err := h.mgr.BeginTransaction(req.ConnectionID)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(models.GenericResponse{Error: err.Error()})
		return
	}
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// CommitTransaction 提交事务
func (h *Handler) CommitTransaction(w http.ResponseWriter, r *http.Request) {
	var req TransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	err := h.mgr.CommitTransaction(req.ConnectionID)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(models.GenericResponse{Error: err.Error()})
		return
	}
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// RollbackTransaction 回滚事务
func (h *Handler) RollbackTransaction(w http.ResponseWriter, r *http.Request) {
	var req TransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	err := h.mgr.RollbackTransaction(req.ConnectionID)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(models.GenericResponse{Error: err.Error()})
		return
	}
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// GetTransactionStatus 获取事务状态
func (h *Handler) GetTransactionStatus(w http.ResponseWriter, r *http.Request) {
	var req TransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	active := h.mgr.HasTransaction(req.ConnectionID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"active": active})
}
