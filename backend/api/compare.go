package api

// 结构比较：找出两个库（或其中一张表）在列、索引、外键上的差异，并生成「让目标向源看齐」的同步 SQL。
//
// 只支持 MySQL 系和 PG 系，元数据直接用表结构页的查询（mysqlGetTableStructure / postgresGet*）。
// 比较自己另写一套时出过事：PG 的列查询在真库上直接报错，逐表循环又把错误吞了，结果永远是「无差异」。

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"idblink/backend/db"
	"idblink/backend/models"
)

// SchemaDiffColumn 列差异
type SchemaDiffColumn struct {
	ColumnName string `json:"column_name"`
	SourceDef  string `json:"source_def"`
	TargetDef  string `json:"target_def"`
	DiffType   string `json:"diff_type"` // added, modified, missing
}

// SchemaDiffIndex 索引差异。ColumnNames 是索引里的全部列、按列序；ColumnName 是其中第一列
type SchemaDiffIndex struct {
	IndexName   string   `json:"index_name"`
	ColumnName  string   `json:"column_name"`
	ColumnNames []string `json:"column_names,omitempty"`
	IsUnique    bool     `json:"is_unique"`
	IsPrimary   bool     `json:"is_primary"`
	DiffType    string   `json:"diff_type"` // added, modified, missing
}

// SchemaDiffForeignKey 外键差异。两个 ColumnNames 分别是外键列和被引用列，按位置一一对应
type SchemaDiffForeignKey struct {
	ConstraintName    string   `json:"constraint_name"`
	ColumnName        string   `json:"column_name"`
	ColumnNames       []string `json:"column_names,omitempty"`
	ReferencedTable   string   `json:"referenced_table"`
	ReferencedColumn  string   `json:"referenced_column"`
	ReferencedColumns []string `json:"referenced_columns,omitempty"`
	DiffType          string   `json:"diff_type"` // added, modified, missing
}

// SchemaDiffResult 单表的比较结果
type SchemaDiffResult struct {
	TableName       string                 `json:"table_name"`
	ColumnDiffs     []SchemaDiffColumn     `json:"column_diffs"`
	IndexDiffs      []SchemaDiffIndex      `json:"index_diffs"`
	ForeignKeyDiffs []SchemaDiffForeignKey `json:"foreign_key_diffs"`
	HasDiffs        bool                   `json:"has_diffs"`
	AlterSQL        []string               `json:"alter_sql"`
	// 目标库里没有这张表：只给提示，不给可执行语句（逐条补列只会全部失败）
	TableMissing bool `json:"table_missing,omitempty"`
}

// CompareSchemaRequest 结构比较请求
type CompareSchemaRequest struct {
	SourceConnID string `json:"source_connection_id"`
	SourceDB     string `json:"source_database"`
	TargetConnID string `json:"target_connection_id"`
	TargetDB     string `json:"target_database"`
	TableName    string `json:"table_name,omitempty"`
}

// CompareSchemaResponse 结构比较结果。errors 非空说明有表没比成、diffs 不完整，界面必须提示
type CompareSchemaResponse struct {
	Diffs            []SchemaDiffResult `json:"diffs"`
	Errors           []string           `json:"errors,omitempty"`
	TargetOnlyTables []string           `json:"target_only_tables,omitempty"`
	// 两边不是同一种库（如 MySQL → PG）时，语句里的类型、默认值没做方言转换：只能参考，不能执行
	SyncSupported bool `json:"sync_supported"`
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
	// PG 不能在连接上切库：选了库就要换成连到那个库的连接池，否则同一连接上的两个库
	// 是拿同一个库和自己比，永远「无差异」
	sourceExec, err = h.resolvePGExec(sourceExec, req.SourceConnID, sourceDBType, &req.SourceDB)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("source connection error: %v", err))
		return
	}
	targetExec, err = h.resolvePGExec(targetExec, req.TargetConnID, targetDBType, &req.TargetDB)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("target connection error: %v", err))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	response := CompareSchemaResponse{
		Diffs:         []SchemaDiffResult{},
		SyncSupported: dialectFamily(sourceDBType) == dialectFamily(targetDBType),
	}

	if req.TableName != "" {
		diff, err := h.compareSingleTable(ctx, sourceExec, targetExec, sourceDBType, targetDBType, req.SourceDB, req.TargetDB, req.TableName)
		if err != nil {
			writeJSONError(w, err.Error())
			return
		}
		response.Diffs = append(response.Diffs, *diff)
	} else {
		tables, err := h.getTablesForCompare(ctx, sourceExec, sourceDBType, optStr(req.SourceDB))
		if err != nil {
			writeJSONError(w, err.Error())
			return
		}
		for _, tableName := range tables {
			diff, err := h.compareSingleTable(ctx, sourceExec, targetExec, sourceDBType, targetDBType, req.SourceDB, req.TargetDB, tableName)
			if err != nil {
				// 读取失败不能悄悄跳过：少比一张表，界面上就成了「无差异」
				response.Errors = append(response.Errors, fmt.Sprintf("%s: %v", tableName, err))
				continue
			}
			if diff.HasDiffs {
				response.Diffs = append(response.Diffs, *diff)
			}
		}
		// 一张都没比成：按失败返回，不给一个空荡荡的「无差异」
		if len(tables) > 0 && len(response.Errors) == len(tables) {
			writeJSONError(w, response.Errors[0])
			return
		}
		response.TargetOnlyTables = h.tablesOnlyInTarget(ctx, targetExec, targetDBType, req.TargetDB, tables)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

// dialectFamily 同一家族的库之间，一边的 DDL 可以直接拿到另一边执行
func dialectFamily(dbType string) string {
	switch dbType {
	case "mysql", "mariadb":
		return "mysql"
	case "postgresql", "kingbase", "highgo", "vastbase":
		return "postgresql"
	}
	return dbType
}

// tablesOnlyInTarget 目标库里有、源库里没有的表。只是告知：同步不会碰它们
func (h *Handler) tablesOnlyInTarget(ctx context.Context, exec db.Executor, dbType, database string, sourceTables []string) []string {
	targetTables, err := h.getTablesForCompare(ctx, exec, dbType, optStr(database))
	if err != nil {
		return nil
	}
	source := make(map[string]bool, len(sourceTables))
	for _, name := range sourceTables {
		source[name] = true
	}
	var only []string
	for _, name := range targetTables {
		if !source[name] {
			only = append(only, name)
		}
	}
	return only
}

// compareSingleTable 比较单个表的结构
func (h *Handler) compareSingleTable(
	ctx context.Context,
	sourceExec, targetExec db.Executor,
	sourceDBType, targetDBType, sourceDB, targetDB, tableName string,
) (*SchemaDiffResult, error) {
	source, err := h.getTableMetadata(ctx, sourceExec, sourceDBType, optStr(sourceDB), tableName)
	if err != nil {
		return nil, err
	}
	target, err := h.getTableMetadata(ctx, targetExec, targetDBType, optStr(targetDB), tableName)
	if err != nil {
		return nil, err
	}

	// 列表都给空切片而不是 nil：nil 会被序列化成 null，前端读 .length 直接崩
	diff := &SchemaDiffResult{
		TableName:       tableName,
		ColumnDiffs:     []SchemaDiffColumn{},
		IndexDiffs:      []SchemaDiffIndex{},
		ForeignKeyDiffs: []SchemaDiffForeignKey{},
		AlterSQL:        []string{},
	}
	// 表至少有一列：目标表一列都没有，说明它根本不存在
	if len(source.Columns) > 0 && len(target.Columns) == 0 {
		diff.HasDiffs = true
		diff.TableMissing = true
		diff.AlterSQL = []string{fmt.Sprintf(
			"-- 目标库没有表 %s：请先按源表结构建表，再重新比较", tableName)}
		return diff, nil
	}

	diff.ColumnDiffs = h.compareColumns(source.Columns, target.Columns, sourceDBType, targetDBType)
	diff.IndexDiffs = h.compareIndexes(
		withoutFKBackingIndexes(source), withoutFKBackingIndexes(target), sourceDBType, targetDBType)
	diff.ForeignKeyDiffs = h.compareForeignKeys(source.ForeignKeys, target.ForeignKeys, sourceDBType, targetDBType)
	diff.HasDiffs = len(diff.ColumnDiffs) > 0 || len(diff.IndexDiffs) > 0 || len(diff.ForeignKeyDiffs) > 0
	if sqls := h.generateAlterSQL(diff, sourceDBType, targetDBType, tableName, sourceDB, targetDB); sqls != nil {
		diff.AlterSQL = sqls
	}

	return diff, nil
}

// getTableMetadata 取一张表在比较里要用的三样东西：列、索引、外键。
// 用的就是表结构页的查询：类型带长度（varchar(64)）、默认值的格式在真实库上验证过
func (h *Handler) getTableMetadata(ctx context.Context, exec db.Executor, dbType string, database *string, tableName string) (models.TableStructure, error) {
	switch dbType {
	case "mysql", "mariadb":
		columns, err := mysqlGetColumns(ctx, exec, tableName, database)
		if err != nil {
			return models.TableStructure{}, err
		}
		if len(columns) == 0 {
			// 表不存在：不再查索引和外键（SHOW INDEX 对不存在的表直接报错）
			return models.TableStructure{}, nil
		}
		result := models.TableStructure{Columns: columns}
		if result.Indexes, err = mysqlGetIndexes(ctx, exec, tableName, database); err != nil {
			return result, err
		}
		result.ForeignKeys, err = mysqlGetForeignKeys(ctx, exec, tableName, database)
		return result, err
	case "postgresql", "kingbase", "highgo", "vastbase":
		var result models.TableStructure
		var err error
		// 和表清单一致：只比 public schema 下的表
		schema := "public"
		if result.Columns, err = postgresGetColumns(ctx, exec, tableName, database, &schema); err != nil {
			return result, err
		}
		if result.Indexes, err = postgresGetIndexes(ctx, exec, tableName, database, &schema); err != nil {
			return result, err
		}
		if result.ForeignKeys, err = postgresGetForeignKeys(ctx, exec, tableName, database, &schema); err != nil {
			return result, err
		}
		return result, nil
	}
	return models.TableStructure{}, fmt.Errorf("unsupported database type: %s", dbType)
}

// withoutFKBackingIndexes 去掉外键自带的索引。MySQL 给外键列自动建一个和约束同名的索引，
// 它删不掉、也不是用户建的：当成索引差异会建议一条执行不了的 DROP INDEX
func withoutFKBackingIndexes(structure models.TableStructure) []models.IndexInfo {
	if len(structure.ForeignKeys) == 0 {
		return structure.Indexes
	}
	fkNames := make(map[string]bool, len(structure.ForeignKeys))
	for _, fk := range structure.ForeignKeys {
		fkNames[fk.ConstraintName] = true
	}
	out := make([]models.IndexInfo, 0, len(structure.Indexes))
	for _, index := range structure.Indexes {
		if !fkNames[index.IndexName] {
			out = append(out, index)
		}
	}
	return out
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

	sortDiffs(diffs, func(d SchemaDiffColumn) string { return d.ColumnName }, func(d SchemaDiffColumn) string { return d.DiffType })
	return diffs
}

// indexDef 一个索引的完整定义：按列序排好的列
type indexDef struct {
	columns   []string
	isUnique  bool
	isPrimary bool
}

// fkDef 一个外键的完整定义：两边各一列，按位置一一对应
type fkDef struct {
	columns    []string
	refTable   string
	refColumns []string
}

// groupIndexes 把「一列一行」的索引记录按索引名归并，列按 SeqInIndex 排序（序号相同时保持原顺序）
func groupIndexes(rows []models.IndexInfo) map[string]indexDef {
	type pending struct {
		indexDef
		columns []models.IndexInfo
	}
	groups := make(map[string]*pending)
	for _, row := range rows {
		group := groups[row.IndexName]
		if group == nil {
			group = &pending{indexDef: indexDef{isUnique: row.IsUnique, isPrimary: row.IsPrimary}}
			groups[row.IndexName] = group
		}
		group.columns = append(group.columns, row)
	}

	out := make(map[string]indexDef, len(groups))
	for name, group := range groups {
		sort.SliceStable(group.columns, func(i, j int) bool {
			return group.columns[i].SeqInIndex < group.columns[j].SeqInIndex
		})
		def := group.indexDef
		for _, column := range group.columns {
			def.columns = append(def.columns, column.ColumnName)
		}
		out[name] = def
	}
	return out
}

// groupForeignKeys 把「一列一行」的外键记录按约束名归并。查询已按约束名、列位置排好序
func groupForeignKeys(rows []models.ForeignKeyInfo) map[string]fkDef {
	out := make(map[string]fkDef)
	for _, row := range rows {
		def := out[row.ConstraintName]
		def.columns = append(def.columns, row.ColumnName)
		def.refTable = row.ReferencedTable
		def.refColumns = append(def.refColumns, row.ReferencedColumn)
		out[row.ConstraintName] = def
	}
	return out
}

// indexKey / fkKey 按定义（而不是名字）认索引和外键：MySQL 自动起的外键名（orders_ibfk_1）
// 取决于建约束的先后，两边名字不同、定义相同的约束很常见，按名字比会报出成对的「缺失 / 多出」
func indexKey(def indexDef) string {
	return fmt.Sprintf("%t|%t|%s", def.isUnique, def.isPrimary, strings.Join(def.columns, "\x00"))
}

func fkKey(def fkDef) string {
	return def.refTable + "(" + strings.Join(def.refColumns, "\x00") + ")<-(" + strings.Join(def.columns, "\x00") + ")"
}

// compareIndexes 比较索引差异。按「列 + 是否唯一 + 是否主键」配对，不看名字
func (h *Handler) compareIndexes(source, target []models.IndexInfo, sourceDBType, targetDBType string) []SchemaDiffIndex {
	sourceIndexes := groupIndexes(source)
	targetIndexes := groupIndexes(target)

	targetKeys := make(map[string]bool, len(targetIndexes))
	for _, def := range targetIndexes {
		targetKeys[indexKey(def)] = true
	}
	sourceKeys := make(map[string]bool, len(sourceIndexes))
	for _, def := range sourceIndexes {
		sourceKeys[indexKey(def)] = true
	}

	var diffs []SchemaDiffIndex
	for name, def := range sourceIndexes {
		if !targetKeys[indexKey(def)] {
			diffs = append(diffs, indexDiff(name, def, "missing"))
		}
	}
	for name, def := range targetIndexes {
		if !sourceKeys[indexKey(def)] {
			diffs = append(diffs, indexDiff(name, def, "added"))
		}
	}

	sortDiffs(diffs, func(d SchemaDiffIndex) string { return d.IndexName }, func(d SchemaDiffIndex) string { return d.DiffType })
	return diffs
}

func indexDiff(name string, def indexDef, diffType string) SchemaDiffIndex {
	return SchemaDiffIndex{
		IndexName:   name,
		ColumnName:  firstOr(def.columns, name),
		ColumnNames: def.columns,
		IsUnique:    def.isUnique,
		IsPrimary:   def.isPrimary,
		DiffType:    diffType,
	}
}

// compareForeignKeys 比较外键差异。按「外键列 → 被引用表(列)」配对，不看名字
func (h *Handler) compareForeignKeys(source, target []models.ForeignKeyInfo, sourceDBType, targetDBType string) []SchemaDiffForeignKey {
	sourceFKs := groupForeignKeys(source)
	targetFKs := groupForeignKeys(target)

	targetKeys := make(map[string]bool, len(targetFKs))
	for _, def := range targetFKs {
		targetKeys[fkKey(def)] = true
	}
	sourceKeys := make(map[string]bool, len(sourceFKs))
	for _, def := range sourceFKs {
		sourceKeys[fkKey(def)] = true
	}

	var diffs []SchemaDiffForeignKey
	for name, def := range sourceFKs {
		if !targetKeys[fkKey(def)] {
			diffs = append(diffs, fkDiff(name, def, "missing"))
		}
	}
	for name, def := range targetFKs {
		if !sourceKeys[fkKey(def)] {
			diffs = append(diffs, fkDiff(name, def, "added"))
		}
	}

	sortDiffs(diffs, func(d SchemaDiffForeignKey) string { return d.ConstraintName }, func(d SchemaDiffForeignKey) string { return d.DiffType })
	return diffs
}

func fkDiff(name string, def fkDef, diffType string) SchemaDiffForeignKey {
	return SchemaDiffForeignKey{
		ConstraintName:    name,
		ColumnName:        firstOr(def.columns, name),
		ColumnNames:       def.columns,
		ReferencedTable:   def.refTable,
		ReferencedColumn:  firstOr(def.refColumns, name),
		ReferencedColumns: def.refColumns,
		DiffType:          diffType,
	}
}

// sortDiffs 把差异按「多出 → 不同 → 缺失」排，同类里再按名字
func sortDiffs[T any](diffs []T, name func(T) string, diffType func(T) string) {
	order := map[string]int{"added": 0, "modified": 1, "missing": 2}
	sort.Slice(diffs, func(i, j int) bool {
		if order[diffType(diffs[i])] != order[diffType(diffs[j])] {
			return order[diffType(diffs[i])] < order[diffType(diffs[j])]
		}
		return name(diffs[i]) < name(diffs[j])
	})
}

func firstOr(list []string, fallback string) string {
	if len(list) == 0 {
		return fallback
	}
	return list[0]
}

// buildColumnDef 把一列拼成能写进 CREATE / ALTER TABLE 的定义
func buildColumnDef(col models.ColumnInfo, dbType string) string {
	def := col.DataType
	if col.IsNullable == "YES" {
		def += " NULL"
	} else {
		def += " NOT NULL"
	}
	switch dbType {
	case "mysql", "mariadb":
		def += mysqlDefaultClause(deref(col.ColumnDefault), deref(col.Extra))
		def += mysqlExtraClause(deref(col.Extra))
	default:
		if columnDefault := deref(col.ColumnDefault); columnDefault != "" {
			def += " DEFAULT " + columnDefault
		}
	}
	return def
}

// mysqlDefaultClause 把 information_schema.COLUMNS 里的默认值还原成能写进 DDL 的片段。
// 那一列存的不是 SQL 原文：字符串默认值不带引号（DEFAULT 'abc' 存成 abc，引号也不转义），
// 表达式默认值不带括号、里面的引号带着反斜杠转义（JSON_OBJECT('k',1) 存成
// json_object(_latin1\'k\',1)，EXTRA 里标着 DEFAULT_GENERATED）。原样拼进去轻则语法错误，
// 重则把 'abc' 当成列名
func mysqlDefaultClause(columnDefault, extra string) string {
	columnDefault = strings.TrimSpace(columnDefault)
	if columnDefault == "" || strings.EqualFold(columnDefault, "NULL") {
		return ""
	}
	if strings.Contains(extra, "DEFAULT_GENERATED") || strings.Contains(extra, "DEFAULT_VIRTUAL") {
		// 列里存的引号带着反斜杠转义：json_object(_latin1\'k\',1)
		expr := strings.ReplaceAll(columnDefault, `\'`, `'`)
		if mysqlQuotedExpression(expr) {
			// 旧版本连括号一起包进了引号，括号已经有了，不能再套一层
			return " DEFAULT " + expr[1:len(expr)-1]
		}
		return " DEFAULT (" + expr + ")"
	}
	if mysqlBareDefault(columnDefault) {
		return " DEFAULT " + columnDefault
	}
	escaped := strings.NewReplacer(`\`, `\\`, `'`, `\'`).Replace(columnDefault)
	return " DEFAULT '" + escaped + "'"
}

var mysqlNumberDefault = regexp.MustCompile(`^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$`)

// mysqlBareDefault 不需要加引号的默认值：数字、位串字面量、TRUE / FALSE
func mysqlBareDefault(columnDefault string) bool {
	if strings.EqualFold(columnDefault, "TRUE") || strings.EqualFold(columnDefault, "FALSE") {
		return true
	}
	return strings.HasPrefix(columnDefault, "b'") || mysqlNumberDefault.MatchString(columnDefault)
}

// mysqlQuotedExpression 旧版本（8.0.13–8.0.17）把表达式默认值连同括号包在一对单引号里：'(uuid())'。
// 只认这一种形状：字符串字面量的表达式默认值是 'abc'，没有括号，不能把它的引号去掉
func mysqlQuotedExpression(expr string) bool {
	return strings.HasPrefix(expr, "'(") && strings.HasSuffix(expr, ")'")
}

// mysqlExtraClause 把 EXTRA 翻译成 DDL 片段。DEFAULT_GENERATED 之类只是标记，不进语句
func mysqlExtraClause(extra string) string {
	out := ""
	if strings.Contains(extra, "auto_increment") {
		out += " AUTO_INCREMENT"
	}
	lower := strings.ToLower(extra)
	if i := strings.Index(lower, "on update"); i >= 0 {
		out += " ON UPDATE " + strings.TrimSpace(extra[i+len("on update"):])
	}
	return out
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func optStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// generateAlterSQL 生成把**目标表**改成和源表一致的语句（用目标库的方言写）。
//
// 可执行的只有「新增」类语句：补列、建索引、加外键。目标表多出来的列 / 索引 / 外键
// 以及两边定义不同的项，只以注释列出——在真实库上删列会丢数据，这类改动由人看过后
// 自己决定，不由「执行同步」代劳。
//
// 2026-11 修正：此前的方向是反的（源表独有的列生成 DROP COLUMN、目标表独有的列生成
// ADD COLUMN），配合前端把语句发给源库，差异只有一条时会直接删掉源库的列。
func (h *Handler) generateAlterSQL(diff *SchemaDiffResult, sourceDBType, targetDBType, tableName, sourceDB, targetDB string) []string {
	table := quoteIdent(tableName, targetDBType)
	sqls := []string{}
	notes := []string{}

	// Oracle 的 ALTER TABLE 不接受 ADD COLUMN 里的 COLUMN 关键字
	addColumn := "ADD COLUMN"
	if targetDBType == "oracle" {
		addColumn = "ADD"
	}

	for _, col := range diff.ColumnDiffs {
		column := quoteIdent(col.ColumnName, targetDBType)
		switch col.DiffType {
		case "missing": // 源表有、目标表没有：在目标表上补这一列
			if strings.TrimSpace(col.SourceDef) == "" {
				notes = append(notes, fmt.Sprintf("-- 列 %s 在目标表缺失，但源表定义未知，未生成语句", col.ColumnName))
				continue
			}
			sqls = append(sqls, fmt.Sprintf("ALTER TABLE %s %s %s %s", table, addColumn, column, col.SourceDef))
		case "added": // 目标表多出来的列
			notes = append(notes, fmt.Sprintf("-- 目标表多出的列 %s（删除会丢数据，确认后手动执行）：\n-- ALTER TABLE %s DROP COLUMN %s",
				col.ColumnName, table, column))
		case "modified":
			notes = append(notes, fmt.Sprintf("-- 列 %s 定义不同，未生成语句（改类型 / 默认值请手动处理）：\n--   源：%s\n--   目标：%s",
				col.ColumnName, col.SourceDef, col.TargetDef))
		}
	}

	primaryNoted := false
	for _, idx := range diff.IndexDiffs {
		name := quoteIdent(idx.IndexName, targetDBType)
		// 主键不能当成普通索引补：建主键要先保证数据里没有重复和空值，由人处理
		if idx.IsPrimary {
			if !primaryNoted {
				notes = append(notes, fmt.Sprintf("-- 主键不一致（源表：%s），未生成语句（主键需手动处理）", idx.IndexName))
				primaryNoted = true
			}
			continue
		}
		switch idx.DiffType {
		case "missing": // 源表有、目标表没有：在目标表上建索引
			unique := ""
			if idx.IsUnique {
				unique = "UNIQUE "
			}
			sqls = append(sqls, fmt.Sprintf("CREATE %sINDEX %s ON %s (%s)",
				unique, name, table, quoteIdentList(idx.ColumnNames, idx.ColumnName, targetDBType)))
		case "added": // 目标表多出来的索引
			drop := fmt.Sprintf("DROP INDEX %s", name)
			if targetDBType == "mysql" || targetDBType == "mariadb" || targetDBType == "sqlserver" {
				drop = fmt.Sprintf("DROP INDEX %s ON %s", name, table)
			}
			notes = append(notes, fmt.Sprintf("-- 目标表多出的索引 %s（确认后手动执行）：\n-- %s", idx.IndexName, drop))
		case "modified":
			notes = append(notes, fmt.Sprintf("-- 索引 %s 定义不同，未生成语句（请手动处理）", idx.IndexName))
		}
	}

	for _, fk := range diff.ForeignKeyDiffs {
		name := quoteIdent(fk.ConstraintName, targetDBType)
		switch fk.DiffType {
		case "missing": // 源表有、目标表没有：在目标表上补外键
			if targetDBType == "sqlite" {
				// SQLite 不能用 ALTER TABLE 加外键约束（要重建表）
				notes = append(notes, fmt.Sprintf("-- 外键 %s 在目标表缺失：SQLite 需重建表才能添加，请手动处理", fk.ConstraintName))
				continue
			}
			sqls = append(sqls, fmt.Sprintf("ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)",
				table, name,
				quoteIdentList(fk.ColumnNames, fk.ColumnName, targetDBType),
				quoteIdent(fk.ReferencedTable, targetDBType),
				quoteIdentList(fk.ReferencedColumns, fk.ReferencedColumn, targetDBType)))
		case "added": // 目标表多出来的外键
			drop := fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT %s", table, name)
			if targetDBType == "mysql" || targetDBType == "mariadb" {
				drop = fmt.Sprintf("ALTER TABLE %s DROP FOREIGN KEY %s", table, name)
			}
			notes = append(notes, fmt.Sprintf("-- 目标表多出的外键 %s（确认后手动执行）：\n-- %s", fk.ConstraintName, drop))
		case "modified":
			notes = append(notes, fmt.Sprintf("-- 外键 %s 定义不同，未生成语句（请手动处理）", fk.ConstraintName))
		}
	}

	return append(sqls, notes...)
}

// quoteIdentList 把一列名字逐个加上引号；列表为空时退回单个列名
func quoteIdentList(names []string, fallback string, dbType string) string {
	if len(names) == 0 {
		names = []string{fallback}
	}
	quoted := make([]string, len(names))
	for i, name := range names {
		quoted[i] = quoteIdent(name, dbType)
	}
	return strings.Join(quoted, ", ")
}

// getTablesForCompare 获取用于比较的表列表：MySQL 取选中的库（不指定就是连接的当前库），PG 取 public schema
func (h *Handler) getTablesForCompare(ctx context.Context, exec db.Executor, dbType string, database *string) ([]string, error) {
	var query string
	var args []any
	switch dbType {
	case "mysql", "mariadb":
		query = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = COALESCE(?, DATABASE()) ORDER BY TABLE_NAME"
		if database != nil {
			args = append(args, *database)
		}
	case "postgresql", "kingbase", "highgo", "vastbase":
		query = "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
	default:
		return nil, fmt.Errorf("unsupported database type: %s", dbType)
	}

	rows, err := exec.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tables = append(tables, name)
	}
	return tables, rows.Err()
}
