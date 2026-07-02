package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"idblink/backend/db"
	"idblink/backend/models"
)

// DocOptions 文档生成选项
type DocOptions struct {
	IncludeViews        bool `json:"include_views"`
	IncludeProcedures   bool `json:"include_procedures"`
	IncludeFunctions    bool `json:"include_functions"`
	IncludeTriggers     bool `json:"include_triggers"`
	IncludeIndexes      bool `json:"include_indexes"`
	IncludeForeignKeys  bool `json:"include_foreign_keys"`
	IncludeRowCounts    bool `json:"include_row_counts"`
	IncludeDDL          bool `json:"include_ddl"`
}

// GenerateDocRequest 文档生成请求
type GenerateDocRequest struct {
	ConnectionID string     `json:"connection_id"`
	Database     string     `json:"database"`
	Options      DocOptions `json:"options"`
}

// GenerateDoc 生成数据库文档
func (h *Handler) GenerateDoc(w http.ResponseWriter, r *http.Request) {
	var req GenerateDocRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	exec, err = h.resolvePGExec(exec, req.ConnectionID, dbType, &req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	var md strings.Builder

	// ── 标题 ──
	md.WriteString(fmt.Sprintf("# %s\n\n", req.Database))
	md.WriteString(fmt.Sprintf("**数据库类型:** %s | **生成时间:** %s\n\n", dbType, time.Now().Format("2006-01-02 15:04:05")))

	// ── 获取表和视图 ──
	tablesResult, err := getTablesCategorized(ctx, exec, dbType, &req.Database, nil)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("failed to get tables: %v", err))
		return
	}

	// ── 目录 ──
	md.WriteString("## 目录\n\n")
	if len(tablesResult.Tables) > 0 {
		md.WriteString("- [表 (Tables)](#表)\n")
	}
	if req.Options.IncludeViews && len(tablesResult.Views) > 0 {
		md.WriteString("- [视图 (Views)](#视图)\n")
	}
	if req.Options.IncludeProcedures {
		md.WriteString("- [存储过程 (Procedures)](#存储过程)\n")
	}
	if req.Options.IncludeFunctions {
		md.WriteString("- [函数 (Functions)](#函数)\n")
	}
	if req.Options.IncludeTriggers {
		md.WriteString("- [触发器 (Triggers)](#触发器)\n")
	}
	md.WriteString("\n")

	// ── 表统计 ──
	md.WriteString(fmt.Sprintf("**表数量:** %d | **视图数量:** %d\n\n---\n\n", len(tablesResult.Tables), len(tablesResult.Views)))

	// ── 表详情 ──
	if len(tablesResult.Tables) > 0 {
		md.WriteString("<a id=\"表\"></a>\n\n## 表 (Tables)\n\n")
		writeTableDocs(ctx, exec, dbType, &req.Database, tablesResult.Tables, &req.Options, &md)
	}

	// ── 视图详情 ──
	if req.Options.IncludeViews && len(tablesResult.Views) > 0 {
		md.WriteString("<a id=\"视图\"></a>\n\n## 视图 (Views)\n\n")
		writeTableDocs(ctx, exec, dbType, &req.Database, tablesResult.Views, &req.Options, &md)
	}

	// ── 存储过程 ──
	if req.Options.IncludeProcedures {
		writeRoutinesDocs(ctx, exec, dbType, &req.Database, "PROCEDURE", &md)
	}

	// ── 函数 ──
	if req.Options.IncludeFunctions {
		writeRoutinesDocs(ctx, exec, dbType, &req.Database, "FUNCTION", &md)
	}

	// ── 触发器 ──
	if req.Options.IncludeTriggers {
		writeTriggersDocs(ctx, exec, dbType, &req.Database, &md)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"content": md.String()})
}

// getTablesCategorized 获取分类的表和视图
func getTablesCategorized(ctx context.Context, exec db.Executor, dbType string, database *string, search *string) (models.TablesResult, error) {
	// 复用 metadata handler 的逻辑
	var result models.TablesResult
	switch dbType {
	case "mysql", "mariadb":
		return mysqlGetTablesCategorized(ctx, exec, database, search)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return postgresGetTablesCategorized(ctx, exec, database, search)
	case "sqlite":
		return sqliteGetTablesCategorized(ctx, exec, database, search)
	case "dameng":
		return damengGetTablesCategorized(ctx, exec, database, search)
	case "sqlserver":
		return sqlserverGetTablesCategorized(ctx, exec, database, search)
	case "oracle":
		return oracleGetTablesCategorized(ctx, exec, database, search)
	default:
		return result, fmt.Errorf("unsupported db type: %s", dbType)
	}
}

// getColumnsForDoc 获取列信息
func getColumnsForDoc(ctx context.Context, exec db.Executor, dbType string, tableName string, database *string) ([]models.ColumnInfo, error) {
	switch dbType {
	case "mysql", "mariadb":
		return mysqlGetColumns(ctx, exec, tableName, database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return postgresGetColumns(ctx, exec, tableName, database)
	case "sqlite":
		return sqliteGetColumns(ctx, exec, tableName, database)
	case "dameng":
		return damengGetColumns(ctx, exec, tableName, database)
	case "sqlserver":
		return sqlserverGetColumns(ctx, exec, tableName, database)
	case "oracle":
		return oracleGetColumns(ctx, exec, tableName, database)
	default:
		return nil, fmt.Errorf("unsupported db type: %s", dbType)
	}
}

// getIndexesForDoc 获取索引信息
func getIndexesForDoc(ctx context.Context, exec db.Executor, dbType string, tableName string, database *string) ([]models.IndexInfo, error) {
	switch dbType {
	case "mysql", "mariadb":
		return mysqlGetIndexes(ctx, exec, tableName, database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return postgresGetIndexes(ctx, exec, tableName, database)
	case "sqlite":
		return sqliteGetIndexes(ctx, exec, tableName, database)
	case "dameng":
		return damengGetIndexes(ctx, exec, tableName, database)
	case "sqlserver":
		return sqlserverGetIndexes(ctx, exec, tableName, database)
	case "oracle":
		return oracleGetIndexes(ctx, exec, tableName, database)
	default:
		return nil, fmt.Errorf("unsupported db type: %s", dbType)
	}
}

// getForeignKeysForDoc 获取外键信息
func getForeignKeysForDoc(ctx context.Context, exec db.Executor, dbType string, tableName string, database *string) ([]models.ForeignKeyInfo, error) {
	switch dbType {
	case "mysql", "mariadb":
		return mysqlGetForeignKeys(ctx, exec, tableName, database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return postgresGetForeignKeys(ctx, exec, tableName, database)
	case "sqlite":
		return sqliteGetForeignKeys(ctx, exec, tableName, database)
	case "dameng":
		return damengGetForeignKeys(ctx, exec, tableName, database)
	case "sqlserver":
		return sqlserverGetForeignKeys(ctx, exec, tableName, database)
	case "oracle":
		return oracleGetForeignKeys(ctx, exec, tableName, database)
	default:
		return nil, fmt.Errorf("unsupported db type: %s", dbType)
	}
}

// getRoutinesForDoc 获取存储过程/函数
func getRoutinesForDoc(ctx context.Context, exec db.Executor, dbType string, database *string) (models.RoutinesResult, error) {
	switch dbType {
	case "mysql", "mariadb":
		return mysqlGetRoutines(ctx, exec, database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return postgresGetRoutines(ctx, exec, database)
	case "sqlite":
		return models.RoutinesResult{Procedures: []models.RoutineInfo{}, Functions: []models.RoutineInfo{}}, nil
	case "dameng":
		return damengGetRoutines(ctx, exec, database)
	case "sqlserver":
		return sqlserverGetRoutines(ctx, exec, database)
	case "oracle":
		// Oracle 没有统一的 routines 查询，返回空（通过 body 单独获取）
		return models.RoutinesResult{Procedures: []models.RoutineInfo{}, Functions: []models.RoutineInfo{}}, nil
	default:
		return models.RoutinesResult{Procedures: []models.RoutineInfo{}, Functions: []models.RoutineInfo{}}, nil
	}
}

// getRoutineBodyForDoc 获取存储过程/函数定义
func getRoutineBodyForDoc(ctx context.Context, exec db.Executor, dbType string, database string, name string, routineType string) (string, error) {
	switch dbType {
	case "mysql", "mariadb":
		return mysqlGetRoutineBody(ctx, exec, database, name, routineType)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return postgresGetRoutineBody(ctx, exec, database, name, routineType)
	case "dameng":
		return damengGetRoutineBody(ctx, exec, database, name, routineType)
	case "sqlserver":
		return sqlserverGetRoutineBody(ctx, exec, database, name, routineType)
	case "oracle":
		return oracleGetRoutineBody(ctx, exec, database, name, routineType)
	default:
		return "", fmt.Errorf("unsupported db type: %s", dbType)
	}
}

// getTriggersForDoc 获取触发器
func getTriggersForDoc(pool *db.DBPool, database string) ([]map[string]interface{}, error) {
	return getTriggers(pool, database)
}

// getTableDDLForDoc 从列信息生成简单的 CREATE TABLE DDL
func getTableDDLForDoc(ctx context.Context, exec db.Executor, dbType string, tableName string, database *string) string {
	columns, err := getColumnsForDoc(ctx, exec, dbType, tableName, database)
	if err != nil || len(columns) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("CREATE TABLE %s (\n", quoteIdent(tableName, dbType)))
	for i, col := range columns {
		sb.WriteString(fmt.Sprintf("  %s %s", quoteIdent(col.ColumnName, dbType), col.DataType))
		if col.IsNullable == "NO" {
			sb.WriteString(" NOT NULL")
		}
		if col.ColumnDefault != nil && *col.ColumnDefault != "" {
			sb.WriteString(fmt.Sprintf(" DEFAULT %s", *col.ColumnDefault))
		}
		if i < len(columns)-1 {
			sb.WriteString(",")
		}
		sb.WriteString("\n")
	}
	sb.WriteString(");")
	return sb.String()
}

// writeTableDocs 写入表/视图的文档
func writeTableDocs(ctx context.Context, exec db.Executor, dbType string, database *string, tables []models.TableInfo, opts *DocOptions, md *strings.Builder) {
	for _, table := range tables {
		tableName := table.TableName
		md.WriteString(fmt.Sprintf("### %s", tableName))
		if table.Comment != nil && *table.Comment != "" {
			md.WriteString(fmt.Sprintf(" — %s", *table.Comment))
		}
		md.WriteString("\n\n")

		// 表信息
		infoParts := []string{}
		if table.TableType != "" {
			infoParts = append(infoParts, fmt.Sprintf("类型: %s", table.TableType))
		}
		if table.Engine != nil && *table.Engine != "" {
			infoParts = append(infoParts, fmt.Sprintf("引擎: %s", *table.Engine))
		}
		if table.RowCount != nil && opts.IncludeRowCounts {
			infoParts = append(infoParts, fmt.Sprintf("行数: %d", *table.RowCount))
		}
		if table.DataSize != nil && *table.DataSize != "" {
			infoParts = append(infoParts, fmt.Sprintf("数据大小: %s", *table.DataSize))
		}
		if table.Collation != nil && *table.Collation != "" {
			infoParts = append(infoParts, fmt.Sprintf("排序规则: %s", *table.Collation))
		}
		if len(infoParts) > 0 {
			md.WriteString(fmt.Sprintf("> %s\n\n", strings.Join(infoParts, " | ")))
		}

		// 列信息
		columns, err := getColumnsForDoc(ctx, exec, dbType, tableName, database)
		if err != nil {
			md.WriteString(fmt.Sprintf("> ⚠️ 获取列信息失败: %v\n\n", err))
			continue
		}

		md.WriteString("| 列名 | 类型 | 可空 | 默认值 | 键 | 注释 |\n")
		md.WriteString("|------|------|------|--------|-----|------|\n")
		for _, col := range columns {
			nullable := "NO"
			if col.IsNullable == "YES" {
				nullable = "YES"
			}
			defaultVal := ""
			if col.ColumnDefault != nil {
				defaultVal = *col.ColumnDefault
			}
			key := ""
			if col.ColumnKey != nil {
				switch *col.ColumnKey {
				case "PRI":
					key = "🔑 PK"
				case "UNI":
					key = "🔑 UNI"
				case "MUL":
					key = "MUL"
				}
			}
			comment := ""
			if col.Comment != nil {
				comment = *col.Comment
			}
			md.WriteString(fmt.Sprintf("| %s | %s | %s | %s | %s | %s |\n",
				col.ColumnName, col.DataType, nullable, defaultVal, key, comment))
		}
		md.WriteString("\n")

		// 索引
		if opts.IncludeIndexes {
			indexes, err := getIndexesForDoc(ctx, exec, dbType, tableName, database)
			if err == nil && len(indexes) > 0 {
				// 按索引名分组
				idxMap := make(map[string][]models.IndexInfo)
				for _, idx := range indexes {
					idxMap[idx.IndexName] = append(idxMap[idx.IndexName], idx)
				}
				md.WriteString("**索引:**\n\n")
				md.WriteString("| 索引名 | 列 | 唯一 | 主键 |\n")
				md.WriteString("|--------|-----|------|------|\n")
				// 排序以保证输出稳定
				idxNames := make([]string, 0, len(idxMap))
				for name := range idxMap {
					idxNames = append(idxNames, name)
				}
				sort.Strings(idxNames)
				for _, name := range idxNames {
					cols := idxMap[name]
					colNames := make([]string, len(cols))
					for i, c := range cols {
						colNames[i] = c.ColumnName
					}
					unique := ""
					if cols[0].IsUnique {
						unique = "✅"
					}
					pk := ""
					if cols[0].IsPrimary {
						pk = "✅"
					}
					md.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n",
						name, strings.Join(colNames, ", "), unique, pk))
				}
				md.WriteString("\n")
			}
		}

		// DDL
		if opts.IncludeDDL {
			ddl := getTableDDLForDoc(ctx, exec, dbType, tableName, database)
			if ddl != "" {
				md.WriteString("**DDL:**\n\n```sql\n")
				md.WriteString(ddl)
				md.WriteString("\n```\n\n")
			}
		}

		// 外键
		if opts.IncludeForeignKeys {
			fks, err := getForeignKeysForDoc(ctx, exec, dbType, tableName, database)
			if err == nil && len(fks) > 0 {
				md.WriteString("**外键:**\n\n")
				md.WriteString("| 约束名 | 列 | 引用表 | 引用列 |\n")
				md.WriteString("|--------|-----|--------|--------|\n")
				for _, fk := range fks {
					md.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n",
						fk.ConstraintName, fk.ColumnName, fk.ReferencedTable, fk.ReferencedColumn))
				}
				md.WriteString("\n")
			}
		}

		md.WriteString("---\n\n")
	}
}

// writeRoutinesDocs 写入存储过程/函数文档
func writeRoutinesDocs(ctx context.Context, exec db.Executor, dbType string, database *string, routineType string, md *strings.Builder) {
	routines, err := getRoutinesForDoc(ctx, exec, dbType, database)
	if err != nil {
		return
	}

	var items []models.RoutineInfo
	sectionTitle := "存储过程 (Procedures)"
	if routineType == "FUNCTION" {
		items = routines.Functions
		sectionTitle = "函数 (Functions)"
	} else {
		items = routines.Procedures
	}

	if len(items) == 0 {
		return
	}

	id := "存储过程"
	if routineType == "FUNCTION" {
		id = "函数"
	}
	md.WriteString(fmt.Sprintf("<a id=\"%s\"></a>\n\n## %s\n\n", id, sectionTitle))

	for _, routine := range items {
		md.WriteString(fmt.Sprintf("### %s", routine.RoutineName))
		if routine.Comment != nil && *routine.Comment != "" {
			md.WriteString(fmt.Sprintf(" — %s", *routine.Comment))
		}
		md.WriteString("\n\n")

		// 获取定义
		body, err := getRoutineBodyForDoc(ctx, exec, dbType, *database, routine.RoutineName, routineType)
		if err == nil && body != "" {
			md.WriteString("```sql\n")
			md.WriteString(body)
			md.WriteString("\n```\n\n")
		} else if routine.Definition != nil && *routine.Definition != "" {
			md.WriteString("```sql\n")
			md.WriteString(*routine.Definition)
			md.WriteString("\n```\n\n")
		}
	}
}

// writeTriggersDocs 写入触发器文档
func writeTriggersDocs(ctx context.Context, exec db.Executor, dbType string, database *string, md *strings.Builder) {
	// 触发器需要通过 pool 访问，这里用 GetPool 的方式
	// 由于 doc handler 已经通过 exec 执行，我们用不同方式获取触发器
	switch dbType {
	case "mysql", "mariadb":
		writeTriggersFromQuery(ctx, exec, dbType, database, md)
	case "postgresql", "kingbase", "highgo", "vastbase":
		writeTriggersFromQuery(ctx, exec, dbType, database, md)
	case "sqlserver":
		writeTriggersFromQuery(ctx, exec, dbType, database, md)
	default:
		return
	}
}

func writeTriggersFromQuery(ctx context.Context, exec db.Executor, dbType string, database *string, md *strings.Builder) {
	var rows [][]interface{}

	switch dbType {
	case "mysql", "mariadb":
		result, qErr := execQuery(ctx, exec,
			"SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING, ACTION_STATEMENT "+
				"FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?", *database)
		if qErr != nil {
			return
		}
		rows = result
	case "postgresql", "kingbase", "highgo", "vastbase":
		result, qErr := execQuery(ctx, exec,
			"SELECT tgname, tgtype::text, c.relname, '' FROM pg_trigger t "+
				"JOIN pg_class c ON c.oid = t.tgrelid "+
				"JOIN pg_namespace n ON n.oid = c.relnamespace "+
				"WHERE NOT tgisinternal AND n.nspname = $1", *database)
		if qErr != nil {
			return
		}
		rows = result
	case "sqlserver":
		result, qErr := execQuery(ctx, exec,
			"SELECT name, type_desc, OBJECT_NAME(parent_id), is_disabled FROM sys.triggers WHERE is_ms_shipped = 0")
		if qErr != nil {
			return
		}
		rows = result
	default:
		return
	}

	if len(rows) == 0 {
		return
	}

	md.WriteString("<a id=\"触发器\"></a>\n\n## 触发器 (Triggers)\n\n")
	md.WriteString("| 名称 | 事件 | 表 | 时机 |\n")
	md.WriteString("|------|------|-----|------|\n")
	for _, row := range rows {
		if len(row) >= 3 {
			name := fmt.Sprintf("%v", row[0])
			event := fmt.Sprintf("%v", row[1])
			table := fmt.Sprintf("%v", row[2])
			timing := ""
			if len(row) >= 4 {
				timing = fmt.Sprintf("%v", row[3])
			}
			md.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n", name, event, table, timing))
		}
	}
	md.WriteString("\n")
}

// execQuery 执行查询并返回结果行
func execQuery(ctx context.Context, exec db.Executor, query string, args ...interface{}) ([][]interface{}, error) {
	rows, err := exec.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var result [][]interface{}
	for rows.Next() {
		values := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			continue
		}
		// 转换 []byte 为 string
		for i, v := range values {
			if b, ok := v.([]byte); ok {
				values[i] = string(b)
			}
		}
		result = append(result, values)
	}
	if err := rows.Err(); err != nil {
		return result, fmt.Errorf("row iteration error: %w", err)
	}
	return result, nil
}
