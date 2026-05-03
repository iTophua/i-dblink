package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"idblink-backend/models"
)

// SchemaDiffColumn 列差异
type SchemaDiffColumn struct {
	ColumnName   string `json:"column_name"`
	SourceDef    string `json:"source_def"`
	TargetDef    string `json:"target_def"`
	DiffType     string `json:"diff_type"` // added, modified, missing
}

// SchemaDiffIndex 索引差异
type SchemaDiffIndex struct {
	IndexName  string `json:"index_name"`
	ColumnName string `json:"column_name"`
	IsUnique   bool   `json:"is_unique"`
	DiffType   string `json:"diff_type"` // added, modified, missing
}

// SchemaDiffForeignKey 外键差异
type SchemaDiffForeignKey struct {
	ConstraintName   string `json:"constraint_name"`
	ColumnName       string `json:"column_name"`
	ReferencedTable  string `json:"referenced_table"`
	ReferencedColumn string `json:"referenced_column"`
	DiffType         string `json:"diff_type"` // added, modified, missing
}

// SchemaDiffResult 结构比较结果
type SchemaDiffResult struct {
	TableName     string            `json:"table_name"`
	ColumnDiffs   []SchemaDiffColumn `json:"column_diffs"`
	IndexDiffs    []SchemaDiffIndex  `json:"index_diffs"`
	ForeignKeyDiffs []SchemaDiffForeignKey `json:"foreign_key_diffs"`
	HasDiffs      bool              `json:"has_diffs"`
	AlterSQL      []string          `json:"alter_sql"`
}

// CompareSchemaRequest 结构比较请求
type CompareSchemaRequest struct {
	SourceConnID string `json:"source_connection_id"`
	SourceDB     string `json:"source_database"`
	TargetConnID string `json:"target_connection_id"`
	TargetDB     string `json:"target_database"`
	TableName    string `json:"table_name,omitempty"`
}

// CompareSchema 比较两个数据库/表的结构差异
func (h *Handler) CompareSchema(w http.ResponseWriter, r *http.Request) {
	var req CompareSchemaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	if req.SourceConnID == "" || req.TargetConnID == "" {
		writeJSONError(w, "source and target connection IDs are required")
		return
	}

	sourceExec, sourceDBType, err := h.getConnAndType(req.SourceConnID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("source connection error: %v", err))
		return
	}

	targetExec, targetDBType, err := h.getConnAndType(req.TargetConnID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("target connection error: %v", err))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	var result []SchemaDiffResult

	if req.TableName != "" {
		diff, err := h.compareSingleTable(ctx, sourceExec, targetExec, sourceDBType, targetDBType, req.SourceDB, req.TargetDB, req.TableName)
		if err != nil {
			writeJSONError(w, err.Error())
			return
		}
		result = append(result, *diff)
	} else {
		tables, err := h.getTablesForCompare(ctx, sourceExec, sourceDBType, req.SourceDB)
		if err != nil {
			writeJSONError(w, err.Error())
			return
		}
		for _, tableName := range tables {
			diff, err := h.compareSingleTable(ctx, sourceExec, targetExec, sourceDBType, targetDBType, req.SourceDB, req.TargetDB, tableName)
			if err != nil {
				continue
			}
			if diff.HasDiffs {
				result = append(result, *diff)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"diffs": result,
	})
}

// compareSingleTable 比较单个表的结构
func (h *Handler) compareSingleTable(
	ctx context.Context,
	sourceExec, targetExec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error); ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) },
	sourceDBType, targetDBType, sourceDB, targetDB, tableName string,
) (*SchemaDiffResult, error) {
	sourceColumns, sourceIndexes, sourceFKs, err := h.getTableMetadata(ctx, sourceExec, sourceDBType, sourceDB, tableName)
	if err != nil {
		return nil, err
	}

	targetColumns, targetIndexes, targetFKs, err := h.getTableMetadata(ctx, targetExec, targetDBType, targetDB, tableName)
	if err != nil {
		return nil, err
	}

	diff := &SchemaDiffResult{
		TableName: tableName,
	}

	diff.ColumnDiffs = h.compareColumns(sourceColumns, targetColumns, sourceDBType, targetDBType)
	diff.IndexDiffs = h.compareIndexes(sourceIndexes, targetIndexes, sourceDBType, targetDBType)
	diff.ForeignKeyDiffs = h.compareForeignKeys(sourceFKs, targetFKs, sourceDBType, targetDBType)
	diff.HasDiffs = len(diff.ColumnDiffs) > 0 || len(diff.IndexDiffs) > 0 || len(diff.ForeignKeyDiffs) > 0
	diff.AlterSQL = h.generateAlterSQL(diff, sourceDBType, targetDBType, tableName, sourceDB, targetDB)

	return diff, nil
}

// getTableMetadata 获取表元数据
func (h *Handler) getTableMetadata(
	ctx context.Context,
	exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) },
	dbType, database, tableName string,
) ([]models.ColumnInfo, []models.IndexInfo, []models.ForeignKeyInfo, error) {
	var columns []models.ColumnInfo
	var indexes []models.IndexInfo
	var foreignKeys []models.ForeignKeyInfo

	switch dbType {
	case "mysql", "mariadb":
		rows, err := exec.QueryContext(ctx,
			"SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
			database, tableName)
		if err != nil {
			return nil, nil, nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var c models.ColumnInfo
			if err := rows.Scan(&c.ColumnName, &c.DataType, &c.IsNullable, &c.ColumnKey, &c.ColumnDefault, &c.Extra, &c.Comment); err != nil {
				continue
			}
			columns = append(columns, c)
		}

		idxRows, err := exec.QueryContext(ctx,
			"SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX",
			database, tableName)
		if err != nil {
			return nil, nil, nil, err
		}
		defer idxRows.Close()
		indexByName := make(map[string]*models.IndexInfo)
		for idxRows.Next() {
			var idx models.IndexInfo
			if err := idxRows.Scan(&idx.IndexName, &idx.ColumnName, &idx.IsUnique, &idx.SeqInIndex); err != nil {
				continue
			}
			idx.IsUnique = !idx.IsUnique
			idx.IsPrimary = idx.IndexName == "PRIMARY"
			indexByName[idx.IndexName] = &idx
			if idx.SeqInIndex == 1 {
				indexes = append(indexes, idx)
			}
		}
		_ = indexByName

		fkRows, err := exec.QueryContext(ctx,
			"SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL",
			database, tableName)
		if err != nil {
			return nil, nil, nil, err
		}
		defer fkRows.Close()
		for fkRows.Next() {
			var fk models.ForeignKeyInfo
			if err := fkRows.Scan(&fk.ConstraintName, &fk.ColumnName, &fk.ReferencedTable, &fk.ReferencedColumn); err != nil {
				continue
			}
			foreignKeys = append(foreignKeys, fk)
		}

	case "postgresql", "kingbase", "highgo", "vastbase":
		rows, err := exec.QueryContext(ctx,
			"SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, c.character_maximum_length, c.numeric_precision, c.numeric_scale, col_description(c.table_schema::regclass::oid, c.ordinal_position) FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = $1 ORDER BY c.ordinal_position",
			tableName)
		if err != nil {
			return nil, nil, nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var c models.ColumnInfo
			if err := rows.Scan(&c.ColumnName, &c.DataType, &c.IsNullable, &c.ColumnDefault, nil, nil, nil, &c.Comment); err != nil {
				continue
			}
			columns = append(columns, c)
		}

		idxRows, err := exec.QueryContext(ctx,
			"SELECT i.relname as index_name, a.attname as column_name, ix.indisunique as is_unique, array_position(ARRAY(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)), a.attnum) as seq_in_index FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_namespace n ON n.oid = i.relnamespace JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(ix.indkey) JOIN pg_class tab ON tab.oid = ix.indrelid WHERE n.nspname = 'public' AND tab.relname = $1 ORDER BY i.relname, seq_in_index",
			tableName)
		if err != nil {
			return nil, nil, nil, err
		}
		defer idxRows.Close()
		for idxRows.Next() {
			var idx models.IndexInfo
			if err := idxRows.Scan(&idx.IndexName, &idx.ColumnName, &idx.IsUnique, &idx.SeqInIndex); err != nil {
				continue
			}
			idx.IsPrimary = strings.HasPrefix(idx.IndexName, "pk_")
			indexes = append(indexes, idx)
		}

	default:
		return nil, nil, nil, fmt.Errorf("不支持的数据库类型: %s", dbType)
	}

	return columns, indexes, foreignKeys, nil
}

// compareColumns 比较列差异
func (h *Handler) compareColumns(source, target []models.ColumnInfo, sourceDBType, targetDBType string) []SchemaDiffColumn {
	sourceMap := make(map[string]models.ColumnInfo)
	for _, c := range source {
		sourceMap[c.ColumnName] = c
	}

	targetMap := make(map[string]models.ColumnInfo)
	for _, c := range target {
		targetMap[c.ColumnName] = c
	}

	var diffs []SchemaDiffColumn
	seen := make(map[string]bool)

	for name, srcCol := range sourceMap {
		seen[name] = true
		if tgtCol, ok := targetMap[name]; ok {
			srcDef := buildColumnDef(srcCol, sourceDBType)
			tgtDef := buildColumnDef(tgtCol, targetDBType)
			if srcDef != tgtDef {
				diffs = append(diffs, SchemaDiffColumn{
					ColumnName: name,
					SourceDef:  srcDef,
					TargetDef:  tgtDef,
					DiffType:   "modified",
				})
			}
		} else {
			diffs = append(diffs, SchemaDiffColumn{
				ColumnName: name,
				SourceDef:  buildColumnDef(srcCol, sourceDBType),
				DiffType:   "missing",
			})
		}
	}

	for name, tgtCol := range targetMap {
		if !seen[name] {
			diffs = append(diffs, SchemaDiffColumn{
				ColumnName: name,
				TargetDef:  buildColumnDef(tgtCol, targetDBType),
				DiffType:   "added",
			})
		}
	}

	sort.Slice(diffs, func(i, j int) bool {
		order := map[string]int{"added": 0, "modified": 1, "missing": 2}
		if order[diffs[i].DiffType] != order[diffs[j].DiffType] {
			return order[diffs[i].DiffType] < order[diffs[j].DiffType]
		}
		return diffs[i].ColumnName < diffs[j].ColumnName
	})

	return diffs
}

// compareIndexes 比较索引差异
func (h *Handler) compareIndexes(source, target []models.IndexInfo, sourceDBType, targetDBType string) []SchemaDiffIndex {
	sourceMap := make(map[string]models.IndexInfo)
	for _, idx := range source {
		sourceMap[idx.IndexName] = idx
	}

	targetMap := make(map[string]models.IndexInfo)
	for _, idx := range target {
		targetMap[idx.IndexName] = idx
	}

	var diffs []SchemaDiffIndex
	seen := make(map[string]bool)

	for name, srcIdx := range sourceMap {
		seen[name] = true
		if tgtIdx, ok := targetMap[name]; ok {
			if srcIdx.IsUnique != tgtIdx.IsUnique || srcIdx.ColumnName != tgtIdx.ColumnName {
				diffs = append(diffs, SchemaDiffIndex{
					IndexName:  name,
					ColumnName: srcIdx.ColumnName,
					IsUnique:   srcIdx.IsUnique,
					DiffType:   "modified",
				})
			}
		} else {
			diffs = append(diffs, SchemaDiffIndex{
				IndexName:  name,
				ColumnName: srcIdx.ColumnName,
				IsUnique:   srcIdx.IsUnique,
				DiffType:   "missing",
			})
		}
	}

	for name, tgtIdx := range targetMap {
		if !seen[name] {
			diffs = append(diffs, SchemaDiffIndex{
				IndexName:  name,
				ColumnName: tgtIdx.ColumnName,
				IsUnique:   tgtIdx.IsUnique,
				DiffType:   "added",
			})
		}
	}

	sort.Slice(diffs, func(i, j int) bool {
		order := map[string]int{"added": 0, "modified": 1, "missing": 2}
		if order[diffs[i].DiffType] != order[diffs[j].DiffType] {
			return order[diffs[i].DiffType] < order[diffs[j].DiffType]
		}
		return diffs[i].IndexName < diffs[j].IndexName
	})

	return diffs
}

// compareForeignKeys 比较外键差异
func (h *Handler) compareForeignKeys(source, target []models.ForeignKeyInfo, sourceDBType, targetDBType string) []SchemaDiffForeignKey {
	sourceMap := make(map[string]models.ForeignKeyInfo)
	for _, fk := range source {
		sourceMap[fk.ConstraintName] = fk
	}

	targetMap := make(map[string]models.ForeignKeyInfo)
	for _, fk := range target {
		targetMap[fk.ConstraintName] = fk
	}

	var diffs []SchemaDiffForeignKey
	seen := make(map[string]bool)

	for name, srcFK := range sourceMap {
		seen[name] = true
		if tgtFK, ok := targetMap[name]; ok {
			if srcFK.ReferencedTable != tgtFK.ReferencedTable || srcFK.ReferencedColumn != tgtFK.ReferencedColumn {
				diffs = append(diffs, SchemaDiffForeignKey{
					ConstraintName:   name,
					ColumnName:       srcFK.ColumnName,
					ReferencedTable:  srcFK.ReferencedTable,
					ReferencedColumn: srcFK.ReferencedColumn,
					DiffType:         "modified",
				})
			}
		} else {
			diffs = append(diffs, SchemaDiffForeignKey{
				ConstraintName:   name,
				ColumnName:       srcFK.ColumnName,
				ReferencedTable:  srcFK.ReferencedTable,
				ReferencedColumn: srcFK.ReferencedColumn,
				DiffType:         "missing",
			})
		}
	}

	for name, tgtFK := range targetMap {
		if !seen[name] {
			diffs = append(diffs, SchemaDiffForeignKey{
				ConstraintName:   name,
				ColumnName:       tgtFK.ColumnName,
				ReferencedTable:  tgtFK.ReferencedTable,
				ReferencedColumn: tgtFK.ReferencedColumn,
				DiffType:         "added",
			})
		}
	}

	sort.Slice(diffs, func(i, j int) bool {
		order := map[string]int{"added": 0, "modified": 1, "missing": 2}
		if order[diffs[i].DiffType] != order[diffs[j].DiffType] {
			return order[diffs[i].DiffType] < order[diffs[j].DiffType]
		}
		return diffs[i].ConstraintName < diffs[j].ConstraintName
	})

	return diffs
}

// buildColumnDef 构建列定义字符串
func buildColumnDef(col models.ColumnInfo, dbType string) string {
	def := col.DataType
	if col.DataType == "varchar" || col.DataType == "char" {
		def += "(255)"
	}
	if col.IsNullable == "YES" {
		def += " NULL"
	} else {
		def += " NOT NULL"
	}
	if col.ColumnDefault != nil && *col.ColumnDefault != "" {
		def += " DEFAULT " + *col.ColumnDefault
	}
	if col.Extra != nil && *col.Extra != "" {
		def += " " + *col.Extra
	}
	return def
}

// generateAlterSQL 生成 ALTER 语句
func (h *Handler) generateAlterSQL(diff *SchemaDiffResult, sourceDBType, targetDBType, tableName, sourceDB, targetDB string) []string {
	var sqls []string

	for _, col := range diff.ColumnDiffs {
		switch col.DiffType {
		case "added":
			sqls = append(sqls, fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s", quoteIdent(tableName, targetDBType), col.TargetDef))
		case "missing":
			sqls = append(sqls, fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s", quoteIdent(tableName, targetDBType), col.ColumnName))
		case "modified":
			sqls = append(sqls, fmt.Sprintf("-- Column %s changed:\n--   FROM: %s\n--   TO:   %s", col.ColumnName, col.SourceDef, col.TargetDef))
		}
	}

	for _, idx := range diff.IndexDiffs {
		switch idx.DiffType {
		case "added":
			unique := ""
			if idx.IsUnique {
				unique = "UNIQUE "
			}
			sqls = append(sqls, fmt.Sprintf("CREATE %sINDEX %s ON %s (%s)", unique, quoteIdent(idx.IndexName, targetDBType), quoteIdent(tableName, targetDBType), idx.ColumnName))
		case "missing":
			sqls = append(sqls, fmt.Sprintf("DROP INDEX %s", quoteIdent(idx.IndexName, targetDBType)))
		case "modified":
			sqls = append(sqls, fmt.Sprintf("-- Index %s modified", idx.IndexName))
		}
	}

	for _, fk := range diff.ForeignKeyDiffs {
		switch fk.DiffType {
		case "added":
			sqls = append(sqls, fmt.Sprintf("-- FK %s added: %s -> %s.%s", fk.ConstraintName, fk.ColumnName, fk.ReferencedTable, fk.ReferencedColumn))
		case "missing":
			sqls = append(sqls, fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT %s", quoteIdent(tableName, targetDBType), quoteIdent(fk.ConstraintName, targetDBType)))
		case "modified":
			sqls = append(sqls, fmt.Sprintf("-- FK %s modified", fk.ConstraintName))
		}
	}

	return sqls
}

// getTablesForCompare 获取用于比较的表列表
func (h *Handler) getTablesForCompare(ctx context.Context, exec interface{ QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) }, dbType, database string) ([]string, error) {
	var tables []string

	switch dbType {
	case "mysql", "mariadb":
		rows, err := exec.QueryContext(ctx, "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", database)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				continue
			}
			tables = append(tables, name)
		}
	case "postgresql", "kingbase", "highgo", "vastbase":
		rows, err := exec.QueryContext(ctx, "SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				continue
			}
			tables = append(tables, name)
		}
	default:
		return nil, fmt.Errorf("不支持的数据库类型: %s", dbType)
	}

	sort.Strings(tables)
	return tables, nil
}
