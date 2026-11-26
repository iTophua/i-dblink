package api

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"

	"idblink/backend/models"
)

// ==================== 表数据对比：主流程 ====================
//
// 哈希连接，不依赖 ORDER BY（不同库 / 排序规则下键的顺序对不上）：
//
//	第一遍流式读目标表，内存里只存「键 → 每个对比列的哈希」；
//	第二遍流式读源表逐行查找，分成相同 / 内容不同 / 仅源表，没被命中的目标是「仅目标表」。
//
// 留原始值的只有要写进同步 SQL 的行和前若干条明细。值的归一化与字面量在 data_compare.go。

// dcTargetEntry 目标表的一行：键的原始值 + 每个对比列的哈希
type dcTargetEntry struct {
	keyVals []any
	hashes  []uint64
	matched bool
}

// dcRawRow 留着原始值的一行：vals = 键列 + 对比列
type dcRawRow struct {
	key  string
	vals []any
}

// dcKeyRow 只保留键的原始值（仅目标表的行）
type dcKeyRow struct {
	key  string
	vals []any
}

// dcPlan 两边怎么对齐：列名大小写可能不同，各表用各自的列名
type dcPlan struct {
	srcKeys      []string
	tgtKeys      []string
	srcCompare   []string
	tgtCompare   []string
	keyNames     []string // 结果里展示用（取源表的列名）
	compareNames []string
	sourceOnly   []string // 只在源表有的列：不会同步到目标
	targetOnly   []string // 只在目标表有的列：保持不动
}

// CompareTableData 按主键比对源表与目标表，并生成把目标表同步成源表的 SQL。
// SQL 只生成不执行。
func (h *Handler) CompareTableData(ctx context.Context, req *models.DataCompareRequest) (*models.DataCompareResult, error) {
	maxRows, maxStmts := dcLimits(req)

	src, err := h.dcResolveSide(ctx, req.SourceConnectionID, req.SourceDatabase, req.SourceSchema, req.SourceTable)
	if err != nil {
		return nil, fmt.Errorf("source: %w", err)
	}
	tgt, err := h.dcResolveSide(ctx, req.TargetConnectionID, req.TargetDatabase, req.TargetSchema, req.TargetTable)
	if err != nil {
		return nil, fmt.Errorf("target: %w", err)
	}
	ctx, cancel := context.WithTimeout(ctx, dcCompareTimeout)
	defer cancel()

	plan, err := dcPlanColumns(src, tgt, req.KeyColumns)
	if err != nil {
		return nil, err
	}
	result := &models.DataCompareResult{
		KeyColumns:        plan.keyNames,
		CompareColumns:    plan.compareNames,
		SourceOnlyColumns: plan.sourceOnly,
		TargetOnlyColumns: plan.targetOnly,
		Warnings:          []string{},
		Modified:          []models.DataCompareModified{},
		SourceOnly:        []models.DataCompareRow{},
		TargetOnly:        []models.DataCompareRow{},
	}
	truncated := false

	// ── 第一遍：目标表 ──
	target := map[string]*dcTargetEntry{}
	duplicateTargetKeys := 0
	{
		rows, err := tgt.exec.QueryContext(ctx,
			dcSelectSQL(tgt.tableRef, plan.tgtKeys, plan.tgtCompare, tgt.dbType, maxRows+1))
		if err != nil {
			return nil, fmt.Errorf("failed to read target table: %w", err)
		}
		k := len(plan.tgtKeys)
		for rows.Next() {
			if len(target) >= maxRows {
				truncated = true
				break
			}
			vals, err := dcScan(rows, k+len(plan.tgtCompare))
			if err != nil {
				rows.Close()
				return nil, fmt.Errorf("failed to read target row: %w", err)
			}
			entry := &dcTargetEntry{keyVals: dcCopy(vals[:k]), hashes: make([]uint64, len(plan.tgtCompare))}
			for i := range plan.tgtCompare {
				entry.hashes[i] = dcHash(canonCell(vals[k+i]))
			}
			key := dcKey(vals[:k])
			if target[key] != nil {
				duplicateTargetKeys++
			}
			target[key] = entry
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("failed to read target table: %w", err)
		}
	}
	result.TargetRows = len(target)
	if duplicateTargetKeys > 0 {
		// 匹配键不唯一（请求里指定的键不是主键 / 唯一键）时没法按行对齐：说清楚，别让人拿它去同步
		result.Warnings = append(result.Warnings, fmt.Sprintf(
			"目标表有 %d 行的匹配键和别的行重复：这些行只有最后一行参与比对，按这个键生成的 UPDATE 也会一起改到它们。请换一个唯一的键",
			duplicateTargetKeys))
	}

	// ── 第二遍：源表 ──
	k := len(plan.srcKeys)
	var updateRows, insertRows []dcRawRow
	var modifiedDetailRows []dcRawRow
	sourceOnlyDetail := []models.DataCompareRow{}
	{
		rows, err := src.exec.QueryContext(ctx,
			dcSelectSQL(src.tableRef, plan.srcKeys, plan.srcCompare, src.dbType, maxRows+1))
		if err != nil {
			return nil, fmt.Errorf("failed to read source table: %w", err)
		}
		for rows.Next() {
			if result.SourceRows >= maxRows {
				truncated = true
				break
			}
			vals, err := dcScan(rows, k+len(plan.srcCompare))
			if err != nil {
				rows.Close()
				return nil, fmt.Errorf("failed to read source row: %w", err)
			}
			result.SourceRows++
			key := dcKey(vals[:k])

			entry := target[key]
			if entry == nil {
				result.SourceOnlyCount++
				if len(insertRows) < maxStmts {
					insertRows = append(insertRows, dcRawRow{key: key, vals: dcCopy(vals)})
				}
				if len(sourceOnlyDetail) < dcDetailLimit {
					sourceOnlyDetail = append(sourceOnlyDetail, models.DataCompareRow{
						Key: dcDisplayCells(plan.keyNames, vals[:k]),
						Row: dcDisplayCells(plan.compareNames, vals[k:]),
					})
				}
				continue
			}
			entry.matched = true

			different := false
			for i := range plan.srcCompare {
				if dcHash(canonCell(vals[k+i])) != entry.hashes[i] {
					different = true
					break
				}
			}
			if !different {
				result.SameCount++
				continue
			}
			result.ModifiedCount++
			if len(updateRows) < maxStmts || len(modifiedDetailRows) < dcDetailLimit {
				raw := dcRawRow{key: key, vals: dcCopy(vals)}
				if len(updateRows) < maxStmts {
					updateRows = append(updateRows, raw)
				}
				if len(modifiedDetailRows) < dcDetailLimit {
					modifiedDetailRows = append(modifiedDetailRows, raw)
				}
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("failed to read source table: %w", err)
		}
	}

	// 没被源表命中的目标行 = 仅目标表；按键排序，结果才稳定
	targetOnlyKeys := []dcKeyRow{}
	for key, entry := range target {
		if !entry.matched {
			targetOnlyKeys = append(targetOnlyKeys, dcKeyRow{key: key, vals: entry.keyVals})
		}
	}
	result.TargetOnlyCount = len(targetOnlyKeys)
	sort.Slice(targetOnlyKeys, func(i, j int) bool { return targetOnlyKeys[i].key < targetOnlyKeys[j].key })
	for i := 0; i < len(targetOnlyKeys) && i < dcDetailLimit; i++ {
		result.TargetOnly = append(result.TargetOnly, models.DataCompareRow{
			Key: dcDisplayCells(plan.keyNames, targetOnlyKeys[i].vals),
		})
	}
	result.SourceOnly = sourceOnlyDetail

	result.Modified, err = h.dcModifiedDetails(ctx, tgt, plan, modifiedDetailRows)
	if err != nil {
		return nil, err
	}
	result.Truncated = truncated

	// 目标列的类型决定字面量的形态（如 MySQL 的 TINYINT(1) 标志位同步到 PG 的 boolean 列要写 TRUE）
	tgtTypes := map[string]string{}
	for _, c := range tgt.structure.Columns {
		tgtTypes[strings.ToLower(c.ColumnName)] = c.DataType
	}
	sqlInserts, sqlDeletes := insertRows, targetOnlyKeys
	if truncated {
		// 有一侧没读完：「仅源表」的行可能在目标表没读到的部分里，「仅目标表」同理，
		// 这两类的 INSERT / DELETE 都不可靠，不进脚本。UPDATE 针对的是两边都读到的行，仍然可靠
		sqlInserts, sqlDeletes = nil, nil
		result.Warnings = append(result.Warnings,
			"有一侧的行数超过上限，同步 SQL 只包含 UPDATE：没读到的部分里可能正好有「仅在另一侧」的行，INSERT / DELETE 会出错。要完整脚本请调高「最多比对行数」后重新对比")
	}
	sqlText, sqlCounts, sqlTruncated, nonFinite := dcBuildSQL(tgt, plan, tgtTypes, updateRows, sqlInserts, sqlDeletes, maxStmts)
	// 语句数在收集行的时候就按上限截住了，dcBuildSQL 里比较不出来，这里按实际数量补上
	if len(updateRows) < result.ModifiedCount || len(insertRows) < result.SourceOnlyCount {
		sqlTruncated = true
	}
	result.SQL = sqlText
	result.SQLCounts = sqlCounts
	result.SQLTruncated = sqlTruncated
	if nonFinite {
		result.Warnings = append(result.Warnings, "NaN / Infinity 没有可移植的写法，同步 SQL 里按 NULL 写入")
	}
	return result, nil
}

// dcLimits 请求里的行数 / 语句数上限：缺省取默认值，再封顶
func dcLimits(req *models.DataCompareRequest) (maxRows, maxStmts int) {
	maxRows = req.MaxRows
	if maxRows <= 0 {
		maxRows = dcDefaultMaxRows
	}
	maxStmts = req.MaxStatements
	if maxStmts <= 0 {
		maxStmts = dcDefaultMaxStatements
	}
	return min(maxRows, dcMaxRowsLimit), min(maxStmts, dcMaxStatementsLimit)
}

// dcPlanColumns 决定用哪些列匹配、哪些列对比。键优先用请求指定的，否则取源表主键。
func dcPlanColumns(src, tgt *dcSide, requestedKeys []string) (*dcPlan, error) {
	srcCols := dcColumnNames(src.structure)
	tgtCols := dcColumnNames(tgt.structure)

	keys := []string{}
	for _, k := range requestedKeys {
		if k = strings.TrimSpace(k); k != "" {
			keys = append(keys, k)
		}
	}
	if len(keys) == 0 {
		keys = dcPrimaryKey(src.structure)
	}
	if len(keys) == 0 {
		return nil, errors.New("source table has no primary key; specify key_columns")
	}

	p := &dcPlan{
		srcKeys: []string{}, tgtKeys: []string{}, keyNames: []string{},
		srcCompare: []string{}, tgtCompare: []string{}, compareNames: []string{},
		sourceOnly: []string{}, targetOnly: []string{},
	}
	for _, key := range keys {
		s, ok := dcFindColumn(srcCols, key)
		if !ok {
			return nil, fmt.Errorf("key column %q not found in source table", key)
		}
		t, ok := dcFindColumn(tgtCols, key)
		if !ok {
			return nil, fmt.Errorf("key column %q not found in target table", key)
		}
		p.srcKeys = append(p.srcKeys, s)
		p.tgtKeys = append(p.tgtKeys, t)
		p.keyNames = append(p.keyNames, s)
	}
	for _, c := range srcCols {
		if dcContainsFold(p.srcKeys, c) {
			continue
		}
		t, ok := dcFindColumn(tgtCols, c)
		if !ok {
			p.sourceOnly = append(p.sourceOnly, c)
			continue
		}
		if dcIsGeneratedColumn(tgtColumnExtra(tgt.structure, t)) {
			// 目标表的生成列由数据库自己算，不能赋值（MySQL 直接拒绝）；也不参与对比——
			// 否则只有生成列不同的行会报成「内容不同」，却生成不出可执行的 UPDATE
			p.targetOnly = append(p.targetOnly, t)
			continue
		}
		p.srcCompare = append(p.srcCompare, c)
		p.tgtCompare = append(p.tgtCompare, t)
		p.compareNames = append(p.compareNames, c)
	}
	for _, c := range tgtCols {
		if dcContainsFold(p.tgtKeys, c) {
			continue
		}
		if _, ok := dcFindColumn(srcCols, c); !ok {
			p.targetOnly = append(p.targetOnly, c)
		}
	}
	return p, nil
}

func tgtColumnExtra(s models.TableStructure, name string) *string {
	for _, c := range s.Columns {
		if c.ColumnName == name {
			return c.Extra
		}
	}
	return nil
}

func dcContainsFold(names []string, name string) bool {
	_, ok := dcFindColumn(names, name)
	return ok
}

// dcModifiedDetails 内容不同的行：回查目标表里对应的行，算出每一列的新旧值。
// 只对前若干条做（每条都要再查一次库），其余只计数。
func (h *Handler) dcModifiedDetails(ctx context.Context, tgt *dcSide, plan *dcPlan, rows []dcRawRow) ([]models.DataCompareModified, error) {
	details := []models.DataCompareModified{}
	if len(rows) == 0 {
		return details, nil
	}
	k := len(plan.srcKeys)
	fetched := map[string][]any{}
	cols := k + len(plan.tgtCompare)
	for start := 0; start < len(rows); start += dcRefetchChunk {
		end := min(start+dcRefetchChunk, len(rows))
		ors := []string{}
		args := []any{}
		next := 1
		for _, r := range rows[start:end] {
			where, n := dcWhere(plan.tgtKeys, r.vals[:k], tgt.dbType, next)
			ors = append(ors, "("+where+")")
			next = n
			args = append(args, dcKeyArgs(r.vals[:k])...)
		}
		query := dcSelectSQL(tgt.tableRef, plan.tgtKeys, plan.tgtCompare, tgt.dbType, 0) +
			" WHERE " + strings.Join(ors, " OR ")
		targetRows, err := tgt.exec.QueryContext(ctx, query, args...)
		if err != nil {
			return nil, fmt.Errorf("failed to read target rows for details: %w", err)
		}
		for targetRows.Next() {
			vals, err := dcScan(targetRows, cols)
			if err != nil {
				targetRows.Close()
				return nil, fmt.Errorf("failed to read target row for details: %w", err)
			}
			fetched[dcKey(vals[:k])] = dcCopy(vals)
		}
		targetRows.Close()
		if err := targetRows.Err(); err != nil {
			return nil, fmt.Errorf("failed to read target rows for details: %w", err)
		}
	}

	type keyed struct {
		key    string
		detail models.DataCompareModified
	}
	found := []keyed{}
	for _, r := range rows {
		old, ok := fetched[r.key]
		if !ok {
			continue
		}
		changes := []models.DataCompareChange{}
		for i := range plan.compareNames {
			if canonCell(r.vals[k+i]) != canonCell(old[k+i]) {
				changes = append(changes, models.DataCompareChange{
					Column: plan.compareNames[i],
					Source: dcDisplay(r.vals[k+i]),
					Target: dcDisplay(old[k+i]),
				})
			}
		}
		found = append(found, keyed{r.key, models.DataCompareModified{
			Key:     dcDisplayCells(plan.keyNames, r.vals[:k]),
			Changes: changes,
		}})
	}
	// 按键排序，明细的顺序才稳定
	sort.SliceStable(found, func(i, j int) bool { return found[i].key < found[j].key })
	for _, f := range found {
		details = append(details, f.detail)
	}
	return details, nil
}

// dcBuildSQL 生成把目标表同步成源表的脚本：先 UPDATE 再 INSERT 最后 DELETE。
// 语句总数受 maxStatements 限制，总大小受 dcMaxSQLBytes 限制；被截断时第三个返回值为 true。
func dcBuildSQL(tgt *dcSide, plan *dcPlan, tgtTypes map[string]string, updates, inserts []dcRawRow, deletes []dcKeyRow, maxStatements int) (string, models.DataCompareSQLCounts, bool, bool) {
	var sb strings.Builder
	counts := models.DataCompareSQLCounts{}
	truncated := false
	nonFinite := false
	if len(updates)+len(inserts)+len(deletes) == 0 {
		return "", counts, false, false // 两边已经一致：不需要脚本
	}
	sb.WriteString("-- 把目标表同步成源表的内容：先 UPDATE，再 INSERT，最后 DELETE\n")
	sb.WriteString("-- 执行前请先核对；建议在事务里执行，确认无误后再提交\n\n")

	quota := maxStatements
	emit := func(stmt string) bool {
		if quota <= 0 || sb.Len()+len(stmt) > dcMaxSQLBytes {
			truncated = true
			return false
		}
		quota--
		sb.WriteString(stmt)
		sb.WriteString(";\n")
		return true
	}

	k := len(plan.srcKeys)
	for _, r := range updates {
		setters := make([]string, 0, len(plan.tgtCompare))
		for i, col := range plan.tgtCompare {
			setters = append(setters, quoteIdent(col, tgt.dbType)+" = "+
				dcLiteralTyped(r.vals[k+i], tgt.dbType, tgtTypes[strings.ToLower(col)]))
		}
		where := dcWhereLiteral(plan.tgtKeys, r.vals[:k], tgt.dbType, tgtTypes)
		nonFinite = nonFinite || dcHasNonFinite(r.vals)
		if !emit("UPDATE " + tgt.tableRef + " SET " + strings.Join(setters, ", ") + " WHERE " + where) {
			break
		}
		counts.Update++
	}
	for _, r := range inserts {
		cols := make([]string, 0, k+len(plan.tgtCompare))
		vals := make([]string, 0, k+len(plan.tgtCompare))
		for i, col := range plan.tgtKeys {
			cols = append(cols, quoteIdent(col, tgt.dbType))
			vals = append(vals, dcLiteralTyped(r.vals[i], tgt.dbType, tgtTypes[strings.ToLower(col)]))
		}
		for i, col := range plan.tgtCompare {
			cols = append(cols, quoteIdent(col, tgt.dbType))
			vals = append(vals, dcLiteralTyped(r.vals[k+i], tgt.dbType, tgtTypes[strings.ToLower(col)]))
		}
		nonFinite = nonFinite || dcHasNonFinite(r.vals)
		if !emit("INSERT INTO " + tgt.tableRef + " (" + strings.Join(cols, ", ") + ") VALUES (" + strings.Join(vals, ", ") + ")") {
			break
		}
		counts.Insert++
	}
	for _, r := range deletes {
		where := dcWhereLiteral(plan.tgtKeys, r.vals, tgt.dbType, tgtTypes)
		if !emit("DELETE FROM " + tgt.tableRef + " WHERE " + where) {
			break
		}
		counts.Delete++
	}
	if len(updates) > counts.Update || len(inserts) > counts.Insert || len(deletes) > counts.Delete {
		truncated = true
	}
	return sb.String(), counts, truncated, nonFinite
}

func dcHasNonFinite(vals []any) bool {
	for _, v := range vals {
		switch f := v.(type) {
		case float64:
			if math.IsNaN(f) || math.IsInf(f, 0) {
				return true
			}
		case float32:
			if math.IsNaN(float64(f)) || math.IsInf(float64(f), 0) {
				return true
			}
		}
	}
	return false
}
