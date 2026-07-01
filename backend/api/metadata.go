package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"idblink/backend/db"
	"idblink/backend/models"
)

// MetadataRequest 元数据通用请求
type MetadataRequest struct {
	ConnectionID string  `json:"connection_id"`
	Database     *string `json:"database,omitempty"`
	TableName    *string `json:"table_name,omitempty"`
	Search       *string `json:"search,omitempty"`
}

// GetDatabases 获取数据库列表
func (h *Handler) GetDatabases(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var databases []string
	switch dbType {
	case "mysql":
		databases, err = mysqlGetDatabases(ctx, exec)
	case "postgresql", "kingbase", "highgo", "vastbase":
		databases, err = postgresGetDatabases(ctx, exec)
	case "sqlite":
		databases = []string{"main"}
	case "dameng":
		databases, err = damengGetDatabases(ctx, exec)
	case "sqlserver":
		databases, err = sqlserverGetDatabases(ctx, exec)
	case "oracle":
		databases, err = oracleGetDatabases(ctx, exec)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(databases)
}

// GetTables 获取表列表
func (h *Handler) GetTables(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var tables []models.TableInfo
	switch dbType {
	case "mysql":
		tables, err = mysqlGetTables(ctx, exec, req.Database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		tables, err = postgresGetTables(ctx, exec, req.Database)
	case "sqlite":
		tables, err = sqliteGetTables(ctx, exec, req.Database)
	case "dameng":
		tables, err = damengGetTables(ctx, exec, req.Database)
	case "sqlserver":
		tables, err = sqlserverGetTables(ctx, exec, req.Database)
	case "oracle":
		tables, err = oracleGetTables(ctx, exec, req.Database)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(tables)
}

// GetTablesCategorized 获取分类的表和视图
func (h *Handler) GetTablesCategorized(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result := models.TablesResult{
		Tables: []models.TableInfo{},
		Views:  []models.TableInfo{},
	}
	switch dbType {
	case "mysql":
		result, err = mysqlGetTablesCategorized(ctx, exec, req.Database, req.Search)
	case "postgresql", "kingbase", "highgo", "vastbase":
		result, err = postgresGetTablesCategorized(ctx, exec, req.Database, req.Search)
	case "sqlite":
		result, err = sqliteGetTablesCategorized(ctx, exec, req.Database, req.Search)
	case "dameng":
		result, err = damengGetTablesCategorized(ctx, exec, req.Database, req.Search)
	case "sqlserver":
		result, err = sqlserverGetTablesCategorized(ctx, exec, req.Database, req.Search)
	case "oracle":
		result, err = oracleGetTablesCategorized(ctx, exec, req.Database, req.Search)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(result)
}

// GetColumns 获取列信息
func (h *Handler) GetColumns(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	if req.TableName == nil {
		writeJSONError(w, "table_name is required")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var columns []models.ColumnInfo
	switch dbType {
	case "mysql":
		columns, err = mysqlGetColumns(ctx, exec, *req.TableName, req.Database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		columns, err = postgresGetColumns(ctx, exec, *req.TableName, req.Database)
	case "sqlite":
		columns, err = sqliteGetColumns(ctx, exec, *req.TableName, req.Database)
	case "dameng":
		columns, err = damengGetColumns(ctx, exec, *req.TableName, req.Database)
	case "sqlserver":
		columns, err = sqlserverGetColumns(ctx, exec, *req.TableName, req.Database)
	case "oracle":
		columns, err = oracleGetColumns(ctx, exec, *req.TableName, req.Database)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	if columns == nil {
		columns = []models.ColumnInfo{}
	}
	json.NewEncoder(w).Encode(columns)
}

// GetAllColumns 批量获取数据库中所有表的列信息（一次请求，减少 IPC 开销）
func (h *Handler) GetAllColumns(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var result models.AllColumnsResult
	switch dbType {
	case "mysql":
		result, err = mysqlGetAllColumns(ctx, exec, req.Database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		result, err = postgresGetAllColumns(ctx, exec, req.Database)
	case "sqlite":
		result, err = sqliteGetAllColumns(ctx, exec, req.Database)
	case "dameng":
		result, err = damengGetAllColumns(ctx, exec, req.Database)
	case "sqlserver":
		result, err = sqlserverGetAllColumns(ctx, exec, req.Database)
	case "oracle":
		result, err = oracleGetAllColumns(ctx, exec, req.Database)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	if result.Tables == nil {
		result.Tables = make(map[string][]models.ColumnInfo)
	}
	json.NewEncoder(w).Encode(result)
}

// GetIndexes 获取索引信息
func (h *Handler) GetIndexes(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	if req.TableName == nil {
		writeJSONError(w, "table_name is required")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var indexes []models.IndexInfo
	switch dbType {
	case "mysql":
		indexes, err = mysqlGetIndexes(ctx, exec, *req.TableName, req.Database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		indexes, err = postgresGetIndexes(ctx, exec, *req.TableName, req.Database)
	case "sqlite":
		indexes, err = sqliteGetIndexes(ctx, exec, *req.TableName, req.Database)
	case "dameng":
		indexes, err = damengGetIndexes(ctx, exec, *req.TableName, req.Database)
	case "sqlserver":
		indexes, err = sqlserverGetIndexes(ctx, exec, *req.TableName, req.Database)
	case "oracle":
		indexes, err = oracleGetIndexes(ctx, exec, *req.TableName, req.Database)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(indexes)
}

// GetForeignKeys 获取外键信息
func (h *Handler) GetForeignKeys(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	if req.TableName == nil {
		writeJSONError(w, "table_name is required")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var fks []models.ForeignKeyInfo
	switch dbType {
	case "mysql":
		fks, err = mysqlGetForeignKeys(ctx, exec, *req.TableName, req.Database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		fks, err = postgresGetForeignKeys(ctx, exec, *req.TableName, req.Database)
	case "sqlite":
		fks, err = sqliteGetForeignKeys(ctx, exec, *req.TableName, req.Database)
	case "dameng":
		fks, err = damengGetForeignKeys(ctx, exec, *req.TableName, req.Database)
	case "sqlserver":
		fks, err = sqlserverGetForeignKeys(ctx, exec, *req.TableName, req.Database)
	case "oracle":
		fks, err = oracleGetForeignKeys(ctx, exec, *req.TableName, req.Database)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(fks)
}

// GetTableStructure 获取完整表结构
func (h *Handler) GetTableStructure(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	if req.TableName == nil {
		writeJSONError(w, "table_name is required")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var structure models.TableStructure
	switch dbType {
	case "mysql":
		structure, err = mysqlGetTableStructure(ctx, exec, *req.TableName, req.Database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		structure, err = postgresGetTableStructure(ctx, exec, *req.TableName, req.Database)
	case "sqlite":
		structure, err = sqliteGetTableStructure(ctx, exec, *req.TableName, req.Database)
	case "dameng":
		structure, err = damengGetTableStructure(ctx, exec, *req.TableName, req.Database)
	case "sqlserver":
		structure, err = sqlserverGetTableStructure(ctx, exec, *req.TableName, req.Database)
	case "oracle":
		structure, err = oracleGetTableStructure(ctx, exec, *req.TableName, req.Database)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(models.TableStructure{
			Columns:     []models.ColumnInfo{},
			Indexes:     []models.IndexInfo{},
			ForeignKeys: []models.ForeignKeyInfo{},
			Error:       err.Error(),
		})
		return
	}
	if structure.Indexes == nil {
		structure.Indexes = []models.IndexInfo{}
	}
	if structure.ForeignKeys == nil {
		structure.ForeignKeys = []models.ForeignKeyInfo{}
	}
	json.NewEncoder(w).Encode(structure)
}

// GetRoutines 获取存储过程和函数
func (h *Handler) GetRoutines(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var result models.RoutinesResult
	switch dbType {
	case "mysql":
		result, err = mysqlGetRoutines(ctx, exec, req.Database)
	case "postgresql":
		result, err = postgresGetRoutines(ctx, exec, req.Database)
	case "sqlite":
		result = models.RoutinesResult{Procedures: []models.RoutineInfo{}, Functions: []models.RoutineInfo{}}
	case "dameng":
		result, err = damengGetRoutines(ctx, exec, req.Database)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(result)
}

// GetProcedures 获取存储过程列表（仅名称）
func (h *Handler) GetProcedures(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var result models.RoutinesResult
	switch dbType {
	case "mysql":
		result, err = mysqlGetRoutines(ctx, exec, req.Database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		result, err = postgresGetRoutines(ctx, exec, req.Database)
	case "sqlite":
		result = models.RoutinesResult{Procedures: []models.RoutineInfo{}, Functions: []models.RoutineInfo{}}
	case "dameng":
		result, err = damengGetRoutines(ctx, exec, req.Database)
	case "sqlserver":
		result, err = sqlserverGetRoutines(ctx, exec, req.Database)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	names := make([]string, len(result.Procedures))
	for i, p := range result.Procedures {
		names[i] = p.RoutineName
	}
	json.NewEncoder(w).Encode(names)
}

// GetFunctions 获取函数列表（仅名称）
func (h *Handler) GetFunctions(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var result models.RoutinesResult
	switch dbType {
	case "mysql":
		result, err = mysqlGetRoutines(ctx, exec, req.Database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		result, err = postgresGetRoutines(ctx, exec, req.Database)
	case "sqlite":
		result = models.RoutinesResult{Procedures: []models.RoutineInfo{}, Functions: []models.RoutineInfo{}}
	case "dameng":
		result, err = damengGetRoutines(ctx, exec, req.Database)
	case "sqlserver":
		result, err = sqlserverGetRoutines(ctx, exec, req.Database)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	names := make([]string, len(result.Functions))
	for i, f := range result.Functions {
		names[i] = f.RoutineName
	}
	json.NewEncoder(w).Encode(names)
}

// GetProcedureBody 获取存储过程定义
func (h *Handler) GetProcedureBody(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ConnectionID  string `json:"connection_id"`
		ProcedureName string `json:"procedure_name"`
		Database      string `json:"database"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	if req.Database != "" {
		switch dbType {
		case "postgresql", "kingbase", "highgo", "vastbase":
			exec, err = h.mgr.GetExecutor(req.ConnectionID, req.Database)
			if err != nil {
				writeJSONError(w, err.Error())
				return
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var body string
	switch dbType {
	case "mysql":
		body, err = mysqlGetRoutineBody(ctx, exec, req.Database, req.ProcedureName, "PROCEDURE")
	case "postgresql", "kingbase", "highgo", "vastbase":
		body, err = postgresGetRoutineBody(ctx, exec, req.Database, req.ProcedureName, "PROCEDURE")
	case "dameng":
		body, err = damengGetRoutineBody(ctx, exec, req.Database, req.ProcedureName, "PROCEDURE")
	case "sqlserver":
		body, err = sqlserverGetRoutineBody(ctx, exec, req.Database, req.ProcedureName, "PROCEDURE")
	case "oracle":
		body, err = oracleGetRoutineBody(ctx, exec, req.Database, req.ProcedureName, "PROCEDURE")
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"body": body})
}

// GetFunctionBody 获取函数定义
func (h *Handler) GetFunctionBody(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ConnectionID string `json:"connection_id"`
		FunctionName string `json:"function_name"`
		Database     string `json:"database"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	if req.Database != "" {
		switch dbType {
		case "postgresql", "kingbase", "highgo", "vastbase":
			exec, err = h.mgr.GetExecutor(req.ConnectionID, req.Database)
			if err != nil {
				writeJSONError(w, err.Error())
				return
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var body string
	switch dbType {
	case "mysql":
		body, err = mysqlGetRoutineBody(ctx, exec, req.Database, req.FunctionName, "FUNCTION")
	case "postgresql", "kingbase", "highgo", "vastbase":
		body, err = postgresGetRoutineBody(ctx, exec, req.Database, req.FunctionName, "FUNCTION")
	case "dameng":
		body, err = damengGetRoutineBody(ctx, exec, req.Database, req.FunctionName, "FUNCTION")
	case "sqlserver":
		body, err = sqlserverGetRoutineBody(ctx, exec, req.Database, req.FunctionName, "FUNCTION")
	case "oracle":
		body, err = oracleGetRoutineBody(ctx, exec, req.Database, req.FunctionName, "FUNCTION")
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"body": body})
}

// resolvePGExec 为 PG 系数据库解析带 database 的执行器，其他类型原样返回
func (h *Handler) resolvePGExec(exec db.Executor, connectionID string, dbType string, database *string) (db.Executor, error) {
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		if database != nil && *database != "" {
			return h.mgr.GetExecutor(connectionID, *database)
		}
	}
	return exec, nil
}

// GetSequences 获取序列列表
func (h *Handler) GetSequences(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var sequences []models.SequenceInfo
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		sequences, err = postgresGetSequences(ctx, exec, req.Database)
	default:
		sequences = []models.SequenceInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(sequences)
}

// ResetSequence 重置序列值
func (h *Handler) ResetSequence(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ConnectionID string `json:"connection_id"`
		Database     string `json:"database,omitempty"`
		SequenceName string `json:"sequence_name"`
		Value        int64  `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	if req.Database != "" {
		switch dbType {
		case "postgresql", "kingbase", "highgo", "vastbase":
			exec, err = h.mgr.GetExecutor(req.ConnectionID, req.Database)
			if err != nil {
				writeJSONError(w, err.Error())
				return
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		err = postgresResetSequence(ctx, exec, req.SequenceName, req.Value)
	default:
		err = fmt.Errorf("unsupported db type for sequence reset: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// GetSchemas 获取 Schema 列表
func (h *Handler) GetSchemas(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var schemas []string
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		schemas, err = postgresGetSchemas(ctx, exec, req.Database)
	default:
		schemas = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(schemas)
}

// CreateSchema 创建 Schema
func (h *Handler) CreateSchema(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ConnectionID string `json:"connection_id"`
		Database     string `json:"database,omitempty"`
		SchemaName   string `json:"schema_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	if req.Database != "" {
		switch dbType {
		case "postgresql", "kingbase", "highgo", "vastbase":
			exec, err = h.mgr.GetExecutor(req.ConnectionID, req.Database)
			if err != nil {
				writeJSONError(w, err.Error())
				return
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		err = postgresCreateSchema(ctx, exec, req.SchemaName)
	default:
		err = fmt.Errorf("unsupported db type for schema creation: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// DropSchema 删除 Schema
func (h *Handler) DropSchema(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ConnectionID string `json:"connection_id"`
		Database     string `json:"database,omitempty"`
		SchemaName   string `json:"schema_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	if req.Database != "" {
		switch dbType {
		case "postgresql", "kingbase", "highgo", "vastbase":
			exec, err = h.mgr.GetExecutor(req.ConnectionID, req.Database)
			if err != nil {
				writeJSONError(w, err.Error())
				return
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		err = postgresDropSchema(ctx, exec, req.SchemaName)
	default:
		err = fmt.Errorf("unsupported db type for schema drop: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// GetCheckConstraints 获取 CHECK 约束列表
func (h *Handler) GetCheckConstraints(w http.ResponseWriter, r *http.Request) {
	var req MetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	if req.TableName == nil {
		writeJSONError(w, "table_name is required")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var constraints []models.CheckConstraintInfo
	switch dbType {
	case "mysql", "mariadb":
		constraints, err = mysqlGetCheckConstraints(ctx, exec, *req.TableName, req.Database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		constraints, err = postgresGetCheckConstraints(ctx, exec, *req.TableName, req.Database)
	default:
		constraints = []models.CheckConstraintInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(constraints)
}
