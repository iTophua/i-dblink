package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"idblink-backend/models"
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var databases []string
	switch dbType {
	case "mysql":
		databases, err = mysqlGetDatabases(ctx, dbConn)
	case "postgresql":
		databases, err = postgresGetDatabases(ctx, dbConn)
	case "sqlite":
		databases = []string{"main"}
	case "dameng":
		databases, err = damengGetDatabases(ctx, dbConn)
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var tables []models.TableInfo
	switch dbType {
	case "mysql":
		tables, err = mysqlGetTables(ctx, dbConn, req.Database)
	case "postgresql":
		tables, err = postgresGetTables(ctx, dbConn, req.Database)
	case "sqlite":
		tables, err = sqliteGetTables(ctx, dbConn, req.Database)
	case "dameng":
		tables, err = damengGetTables(ctx, dbConn, req.Database)
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
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
		result, err = mysqlGetTablesCategorized(ctx, dbConn, req.Database, req.Search)
	case "postgresql":
		result, err = postgresGetTablesCategorized(ctx, dbConn, req.Database, req.Search)
	case "sqlite":
		result, err = sqliteGetTablesCategorized(ctx, dbConn, req.Database, req.Search)
	case "dameng":
		result, err = damengGetTablesCategorized(ctx, dbConn, req.Database, req.Search)
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var columns []models.ColumnInfo
	switch dbType {
	case "mysql":
		columns, err = mysqlGetColumns(ctx, dbConn, *req.TableName, req.Database)
	case "postgresql":
		columns, err = postgresGetColumns(ctx, dbConn, *req.TableName, req.Database)
	case "sqlite":
		columns, err = sqliteGetColumns(ctx, dbConn, *req.TableName, req.Database)
	case "dameng":
		columns, err = damengGetColumns(ctx, dbConn, *req.TableName, req.Database)
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(columns)
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var indexes []models.IndexInfo
	switch dbType {
	case "mysql":
		indexes, err = mysqlGetIndexes(ctx, dbConn, *req.TableName, req.Database)
	case "postgresql":
		indexes, err = postgresGetIndexes(ctx, dbConn, *req.TableName, req.Database)
	case "sqlite":
		indexes, err = sqliteGetIndexes(ctx, dbConn, *req.TableName, req.Database)
	case "dameng":
		indexes, err = damengGetIndexes(ctx, dbConn, *req.TableName, req.Database)
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var fks []models.ForeignKeyInfo
	switch dbType {
	case "mysql":
		fks, err = mysqlGetForeignKeys(ctx, dbConn, *req.TableName, req.Database)
	case "postgresql":
		fks, err = postgresGetForeignKeys(ctx, dbConn, *req.TableName, req.Database)
	case "sqlite":
		fks, err = sqliteGetForeignKeys(ctx, dbConn, *req.TableName, req.Database)
	case "dameng":
		fks, err = damengGetForeignKeys(ctx, dbConn, *req.TableName, req.Database)
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var structure models.TableStructure
	switch dbType {
	case "mysql":
		structure, err = mysqlGetTableStructure(ctx, dbConn, *req.TableName, req.Database)
	case "postgresql":
		structure, err = postgresGetTableStructure(ctx, dbConn, *req.TableName, req.Database)
	case "sqlite":
		structure, err = sqliteGetTableStructure(ctx, dbConn, *req.TableName, req.Database)
	case "dameng":
		structure, err = damengGetTableStructure(ctx, dbConn, *req.TableName, req.Database)
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var result models.RoutinesResult
	switch dbType {
	case "mysql":
		result, err = mysqlGetRoutines(ctx, dbConn, req.Database)
	case "postgresql":
		result, err = postgresGetRoutines(ctx, dbConn, req.Database)
	case "sqlite":
		result = models.RoutinesResult{Procedures: []models.RoutineInfo{}, Functions: []models.RoutineInfo{}}
	case "dameng":
		result, err = damengGetRoutines(ctx, dbConn, req.Database)
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var result models.RoutinesResult
	switch dbType {
	case "mysql":
		result, err = mysqlGetRoutines(ctx, dbConn, req.Database)
	case "postgresql":
		result, err = postgresGetRoutines(ctx, dbConn, req.Database)
	case "sqlite":
		result = models.RoutinesResult{Procedures: []models.RoutineInfo{}, Functions: []models.RoutineInfo{}}
	case "dameng":
		result, err = damengGetRoutines(ctx, dbConn, req.Database)
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var result models.RoutinesResult
	switch dbType {
	case "mysql":
		result, err = mysqlGetRoutines(ctx, dbConn, req.Database)
	case "postgresql":
		result, err = postgresGetRoutines(ctx, dbConn, req.Database)
	case "sqlite":
		result = models.RoutinesResult{Procedures: []models.RoutineInfo{}, Functions: []models.RoutineInfo{}}
	case "dameng":
		result, err = damengGetRoutines(ctx, dbConn, req.Database)
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

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var body string
	switch dbType {
	case "mysql":
		body, err = mysqlGetRoutineBody(ctx, dbConn, req.Database, req.ProcedureName, "PROCEDURE")
	case "postgresql":
		body, err = postgresGetRoutineBody(ctx, dbConn, req.Database, req.ProcedureName, "PROCEDURE")
	case "dameng":
		body, err = damengGetRoutineBody(ctx, dbConn, req.Database, req.ProcedureName, "PROCEDURE")
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
		ConnectionID  string `json:"connection_id"`
		FunctionName  string `json:"function_name"`
		Database      string `json:"database"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	dbConn, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var body string
	switch dbType {
	case "mysql":
		body, err = mysqlGetRoutineBody(ctx, dbConn, req.Database, req.FunctionName, "FUNCTION")
	case "postgresql":
		body, err = postgresGetRoutineBody(ctx, dbConn, req.Database, req.FunctionName, "FUNCTION")
	case "dameng":
		body, err = damengGetRoutineBody(ctx, dbConn, req.Database, req.FunctionName, "FUNCTION")
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

// getConnAndType 获取连接和数据库类型
func (h *Handler) getConnAndType(connectionID string) (*sql.DB, string, error) {
	dbConn, err := h.mgr.Get(connectionID)
	if err != nil {
		return nil, "", err
	}
	dbType, err := h.mgr.GetDBType(connectionID)
	if err != nil {
		return nil, "", err
	}
	return dbConn, dbType, nil
}
