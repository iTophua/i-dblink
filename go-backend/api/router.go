package api

import (
	"encoding/json"
	"net/http"

	"idblink-backend/db"
	"idblink-backend/models"
)

// RegisterRoutes 注册所有 API 路由
func RegisterRoutes(mux *http.ServeMux, manager *db.Manager) {
	h := &Handler{mgr: manager}

	mux.HandleFunc("POST /connect", h.Connect)
	mux.HandleFunc("POST /disconnect", h.Disconnect)
	mux.HandleFunc("POST /test", h.Test)
	mux.HandleFunc("POST /query", h.Query)
	mux.HandleFunc("POST /databases", h.GetDatabases)
	mux.HandleFunc("POST /tables", h.GetTables)
	mux.HandleFunc("POST /tables-categorized", h.GetTablesCategorized)
	mux.HandleFunc("POST /columns", h.GetColumns)
	mux.HandleFunc("POST /indexes", h.GetIndexes)
	mux.HandleFunc("POST /foreign-keys", h.GetForeignKeys)
	mux.HandleFunc("POST /table-structure", h.GetTableStructure)
	mux.HandleFunc("POST /routines", h.GetRoutines)
}

// Handler HTTP 处理器
type Handler struct {
	mgr *db.Manager
}

func writeJSONError(w http.ResponseWriter, err string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	resp := models.GenericResponse{Error: err}
	_ = json.NewEncoder(w).Encode(resp)
}
