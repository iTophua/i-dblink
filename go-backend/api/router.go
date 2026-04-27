package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime/debug"

	"idblink-backend/db"
	"idblink-backend/models"
)

// recoverMiddleware 包装 handler，捕获 panic 防止 sidecar 进程崩溃
func recoverMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				stack := debug.Stack()
				fmt.Fprintf(
					os.Stderr,
					"[PANIC] %s %s: %v\n%s\n",
					r.Method, r.URL.Path, rec, stack,
				)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(models.GenericResponse{
					Error: fmt.Sprintf("internal server error: %v", rec),
				})
			}
		}()
		next(w, r)
	}
}

// RegisterRoutes 注册所有 API 路由
func RegisterRoutes(mux *http.ServeMux, manager *db.Manager) {
	h := &Handler{mgr: manager}

	mux.HandleFunc("GET /health", recoverMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))

	mux.HandleFunc("POST /connect", recoverMiddleware(h.Connect))
	mux.HandleFunc("POST /disconnect", recoverMiddleware(h.Disconnect))
	mux.HandleFunc("POST /test", recoverMiddleware(h.Test))
	mux.HandleFunc("POST /query", recoverMiddleware(h.Query))
	mux.HandleFunc("POST /databases", recoverMiddleware(h.GetDatabases))
	mux.HandleFunc("POST /tables", recoverMiddleware(h.GetTables))
	mux.HandleFunc("POST /tables-categorized", recoverMiddleware(h.GetTablesCategorized))
	mux.HandleFunc("POST /columns", recoverMiddleware(h.GetColumns))
	mux.HandleFunc("POST /indexes", recoverMiddleware(h.GetIndexes))
	mux.HandleFunc("POST /foreign-keys", recoverMiddleware(h.GetForeignKeys))
	mux.HandleFunc("POST /table-structure", recoverMiddleware(h.GetTableStructure))
	mux.HandleFunc("POST /routines", recoverMiddleware(h.GetRoutines))
	mux.HandleFunc("POST /procedures", recoverMiddleware(h.GetProcedures))
	mux.HandleFunc("POST /functions", recoverMiddleware(h.GetFunctions))
	mux.HandleFunc("POST /procedure-body", recoverMiddleware(h.GetProcedureBody))
	mux.HandleFunc("POST /function-body", recoverMiddleware(h.GetFunctionBody))
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
