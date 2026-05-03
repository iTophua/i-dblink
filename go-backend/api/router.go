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

	// DDL 操作
	mux.HandleFunc("POST /table-ddl", recoverMiddleware(h.GetTableDDL))
	mux.HandleFunc("POST /execute-ddl", recoverMiddleware(h.ExecuteDDL))
	mux.HandleFunc("POST /truncate-table", recoverMiddleware(h.TruncateTable))
	mux.HandleFunc("POST /drop-table", recoverMiddleware(h.DropTable))
	mux.HandleFunc("POST /drop-view", recoverMiddleware(h.DropView))
	mux.HandleFunc("POST /rename-table", recoverMiddleware(h.RenameTable))
	mux.HandleFunc("POST /table-maintenance", recoverMiddleware(h.MaintainTable))

	// 事务控制
	mux.HandleFunc("POST /begin-transaction", recoverMiddleware(h.BeginTransaction))
	mux.HandleFunc("POST /commit-transaction", recoverMiddleware(h.CommitTransaction))
	mux.HandleFunc("POST /rollback-transaction", recoverMiddleware(h.RollbackTransaction))
	mux.HandleFunc("POST /transaction-status", recoverMiddleware(h.GetTransactionStatus))

	// 服务器信息
	mux.HandleFunc("POST /server-info", recoverMiddleware(h.GetServerInfo))

	// 触发器/事件
	mux.HandleFunc("POST /triggers", recoverMiddleware(h.GetTriggers))
	mux.HandleFunc("POST /events", recoverMiddleware(h.GetEvents))

	// 流式导出
	mux.HandleFunc("POST /stream-export", recoverMiddleware(h.StreamExport))
}

// Handler HTTP 处理器
type Handler struct {
	mgr *db.Manager
}

// getConnAndType 获取连接执行器和数据库类型
func (h *Handler) getConnAndType(connectionID string) (db.Executor, string, error) {
	exec, err := h.mgr.GetExecutor(connectionID, "")
	if err != nil {
		return nil, "", err
	}
	dbType, err := h.mgr.GetDBType(connectionID)
	if err != nil {
		return nil, "", err
	}
	return exec, dbType, nil
}

func writeJSONError(w http.ResponseWriter, err string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	resp := models.GenericResponse{Error: err}
	_ = json.NewEncoder(w).Encode(resp)
}
