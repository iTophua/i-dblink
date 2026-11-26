package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"math"
	"net/http/httptest"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"idblink/backend/db"
	"idblink/backend/models"
)

// ==================== 表数据对比：值的归一化、展示与字面量 ====================
//
// 对比主流程在 data_compare_run.go。

const (
	dcDefaultMaxRows       = 100_000
	dcDefaultMaxStatements = 2000
	// 上限的上限：行数直接决定内存占用（每行留键的原始值和各列的哈希），不能由请求随意放大
	dcMaxRowsLimit       = 1_000_000
	dcMaxStatementsLimit = 100_000
	dcDetailLimit        = 500
	dcMaxSQLBytes        = 4 << 20
	dcRefetchChunk       = 200
	dcCompareTimeout     = 5 * time.Minute
	dcDisplayMaxRunes    = 300
)

// dcNumberText 规范的十进制文本：不带前导零、正号、指数。
// '0123'（邮编、编码）这类文本故意不匹配，继续按字符串比较。
var dcNumberText = regexp.MustCompile(`^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`)

// dcNumberType 数值类的列类型名（各库的叫法）：tinyint / int / bigint / decimal / numeric / real / double …
var dcNumberType = regexp.MustCompile(
	`^(tinyint|smallint|mediumint|int|integer|bigint|serial|bigserial|smallserial|decimal|dec|numeric|number|real|double|float|money)\b`)

// dcTextType 文本类的列类型名。数值、布尔写进这些列时必须按字符串写（PG 不做这种隐式转换）
var dcTextType = regexp.MustCompile(
	`^(char|character|varchar|text|tinytext|mediumtext|longtext|nchar|nvarchar|nvarchar2|varchar2|clob|json|jsonb|uuid|uniqueidentifier|enum|set)\b`)

// dcDateText 日期时间文本的大致形状：日期、可选的时间（秒 / 小数可省）、可选的时区
var dcDateText = regexp.MustCompile(
	`^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?\s?(Z|[+-]\d{2}:?\d{2})?)?$`)

// ── 归一化 ──

// canonCell 把驱动返回的原始值归一成可比较的文本。规则：
//
//	数字（含看起来是规范十进制的文本）→ n:<规范十进制>     DECIMAL 的 12.50 与 12.5 视为相等
//	日期时间（time.Time 或日期形状的文本）→ t:<UTC RFC3339>  MySQL 的 '2024-01-01 10:20:30' 与 PG 的 timestamp 视为相等
//	其余文本 → s:<原文>；二进制 → b:<base64>；NULL → 空串
func canonCell(v any) string {
	switch val := v.(type) {
	case nil:
		return ""
	case bool:
		if val {
			return "n:1"
		}
		return "n:0"
	case int64:
		return "n:" + strconv.FormatInt(val, 10)
	case int32:
		return "n:" + strconv.FormatInt(int64(val), 10)
	case int:
		return "n:" + strconv.FormatInt(int64(val), 10)
	case int16:
		return "n:" + strconv.FormatInt(int64(val), 10)
	case int8:
		return "n:" + strconv.FormatInt(int64(val), 10)
	case uint64:
		return "n:" + strconv.FormatUint(val, 10)
	case uint32:
		return "n:" + strconv.FormatUint(uint64(val), 10)
	case uint:
		return "n:" + strconv.FormatUint(uint64(val), 10)
	case float64:
		return "n:" + strconv.FormatFloat(val, 'g', -1, 64)
	case float32:
		return "n:" + strconv.FormatFloat(float64(val), 'g', -1, 32)
	case time.Time:
		return "t:" + val.UTC().Format(time.RFC3339Nano)
	case []byte:
		// 先判再转：string([]byte) 会把非法 UTF-8 换成 U+FFFD，二进制内容就丢了
		if !utf8.Valid(val) {
			return "b:" + base64.StdEncoding.EncodeToString(val)
		}
		return canonText(string(val))
	case string:
		return canonText(val)
	default:
		// decimal.Decimal 之类：按其字符串形式处理
		return canonText(fmt.Sprintf("%v", val))
	}
}

func canonText(s string) string {
	if !utf8.ValidString(s) {
		return "b:" + base64.StdEncoding.EncodeToString([]byte(s))
	}
	if dcNumberText.MatchString(s) {
		return "n:" + trimDecimal(s)
	}
	if m := dcDateText.FindStringSubmatch(s); m != nil {
		if t, ok := parseDateTimeText(m); ok {
			return "t:" + t.UTC().Format(time.RFC3339Nano)
		}
	}
	return "s:" + s
}

// parseDateTimeText 把 dcDateText 的分组拼回 time.Parse 认的形状：
// 秒补齐、时区补上冒号（"+0800" → "+08:00"），再统一解析。
func parseDateTimeText(m []string) (time.Time, bool) {
	layout := "2006-01-02"
	value := m[1]
	if m[2] != "" {
		layout = "2006-01-02 15:04"
		value += " " + m[2] + ":" + m[3]
		if m[4] != "" {
			layout = "2006-01-02 15:04:05"
			value += ":" + m[4] + m[5]
		}
	}
	if zone := m[6]; zone != "" {
		if len(zone) == 5 && zone != "Z" {
			zone = zone[:3] + ":" + zone[3:]
		}
		layout += "Z07:00"
		value += zone
	}
	t, err := time.Parse(layout, value)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

// trimDecimal 去掉小数部分多余的 0；"-0" 归零
func trimDecimal(s string) string {
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	if strings.Contains(s, ".") {
		s = strings.TrimRight(s, "0")
		s = strings.TrimSuffix(s, ".")
	}
	if s == "0" {
		neg = false
	}
	if neg {
		return "-" + s
	}
	return s
}

func dcHash(s string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(s))
	return h.Sum64()
}

// dcKey 把键列的值拼成 map 键（带长度前缀，避免 "ab"+"c" 与 "a"+"bc" 相撞）
func dcKey(keyVals []any) string {
	var sb strings.Builder
	for _, v := range keyVals {
		c := canonCell(v)
		sb.WriteString(strconv.Itoa(len(c)))
		sb.WriteByte(':')
		sb.WriteString(c)
	}
	return sb.String()
}

// ── 原始值 ──

// dcScan 把一行读进 []any
func dcScan(rows *sql.Rows, n int) ([]any, error) {
	vals := make([]any, n)
	ptrs := make([]any, n)
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, err
	}
	return vals, nil
}

// dcCopy 深拷贝一行里会在下一次 Next 后失效的值（部分驱动的 []byte 是复用缓冲）
func dcCopy(vals []any) []any {
	out := make([]any, len(vals))
	for i, v := range vals {
		if b, ok := v.([]byte); ok {
			out[i] = append([]byte(nil), b...)
		} else {
			out[i] = v
		}
	}
	return out
}

// ── 展示 ──

func dcDisplay(v any) models.DataCompareCell {
	switch val := v.(type) {
	case nil:
		return models.DataCompareCell{IsNull: true}
	case []byte:
		if !utf8.Valid(val) {
			return dcDisplayText(fmt.Sprintf("[BLOB: %d bytes]", len(val)))
		}
		return dcDisplayText(string(val))
	case time.Time:
		return dcDisplayText(val.Format(time.RFC3339Nano))
	case float32:
		return dcDisplayText(strconv.FormatFloat(float64(val), 'g', -1, 32))
	case float64:
		return dcDisplayText(strconv.FormatFloat(val, 'g', -1, 64))
	case string:
		return dcDisplayText(val)
	default:
		return dcDisplayText(fmt.Sprintf("%v", val))
	}
}

func dcDisplayText(s string) models.DataCompareCell {
	if utf8.RuneCountInString(s) > dcDisplayMaxRunes {
		s = string([]rune(s)[:dcDisplayMaxRunes]) + "…"
	}
	return models.DataCompareCell{Value: s}
}

// dcDisplayCells 列名 → 展示值
func dcDisplayCells(names []string, vals []any) map[string]models.DataCompareCell {
	out := make(map[string]models.DataCompareCell, len(names))
	for i, name := range names {
		out[name] = dcDisplay(vals[i])
	}
	return out
}

// ── SQL 片段 ──

func dcPlaceholder(dbType string, n int) string {
	switch dbType {
	case "oracle", "dameng":
		return ":" + strconv.Itoa(n)
	case "mysql", "mariadb", "sqlite", "clickhouse", "tdengine":
		return "?"
	default:
		return "$" + strconv.Itoa(n)
	}
}

// dcSelectSQL 读键列 + 对比列的查询。
//
// limit > 0 时把行数上限写进 SQL：只在读满 N 行后停止的话，驱动仍会把整张表从服务器
// 读完，「最多比对 N 行」在大表上就形同虚设。调用量比上限多取一行，用来判断是否截断。
func dcSelectSQL(tableRef string, keys, compare []string, dbType string, limit int) string {
	cols := make([]string, 0, len(keys)+len(compare))
	for _, k := range keys {
		cols = append(cols, quoteIdent(k, dbType))
	}
	for _, c := range compare {
		cols = append(cols, quoteIdent(c, dbType))
	}
	head, tail := "SELECT ", ""
	switch {
	case limit <= 0:
	case dbType == "sqlserver":
		head = fmt.Sprintf("SELECT TOP (%d) ", limit)
	case dcSupportsLimit(dbType):
		tail = fmt.Sprintf(" LIMIT %d", limit)
	}
	// Oracle / 达梦没有稳妥的通用写法，不加限制，靠读到上限后提前关闭游标
	return head + strings.Join(cols, ", ") + " FROM " + tableRef + tail
}

// dcSupportsLimit 支持 MySQL 风格 `LIMIT n` 的方言
func dcSupportsLimit(dbType string) bool {
	switch dbType {
	case "mysql", "mariadb", "sqlite", "postgresql", "kingbase", "highgo", "vastbase",
		"clickhouse", "tdengine":
		return true
	}
	return false
}

// dcWhere 用键列拼 WHERE；返回片段和下一个占位符序号（NULL 用 IS NULL）
func dcWhere(keyCols []string, keyVals []any, dbType string, nextPlaceholder int) (string, int) {
	parts := make([]string, 0, len(keyCols))
	n := nextPlaceholder
	for i, col := range keyCols {
		q := quoteIdent(col, dbType)
		if keyVals[i] == nil {
			parts = append(parts, q+" IS NULL")
			continue
		}
		parts = append(parts, q+" = "+dcPlaceholder(dbType, n))
		n++
	}
	return strings.Join(parts, " AND "), n
}

// dcWhereLiteral 用字面量拼 WHERE：给生成的同步脚本用（脚本是独立执行的，不能带占位符）。
// tgtTypes 是目标表的列类型，键值同样按目标列的类型校正写法。
func dcWhereLiteral(keyCols []string, keyVals []any, dbType string, tgtTypes map[string]string) string {
	parts := make([]string, 0, len(keyCols))
	for i, col := range keyCols {
		q := quoteIdent(col, dbType)
		if keyVals[i] == nil {
			parts = append(parts, q+" IS NULL")
			continue
		}
		parts = append(parts, q+" = "+dcLiteralTyped(keyVals[i], dbType, tgtTypes[strings.ToLower(col)]))
	}
	return strings.Join(parts, " AND ")
}

// dcKeyArgs WHERE 里用到的键值（IS NULL 的列不占占位符）
func dcKeyArgs(keyVals []any) []any {
	out := make([]any, 0, len(keyVals))
	for _, v := range keyVals {
		if v != nil {
			out = append(out, v)
		}
	}
	return out
}

// dcLiteral 把原始值写成目标库方言的字面量
func dcLiteral(v any, dbType string) string {
	switch val := v.(type) {
	case nil:
		return "NULL"
	case bool:
		switch dbType {
		case "sqlite", "sqlserver", "oracle", "dameng":
			if val {
				return "1"
			}
			return "0"
		default:
			if val {
				return "TRUE"
			}
			return "FALSE"
		}
	case int64:
		return strconv.FormatInt(val, 10)
	case int32:
		return strconv.FormatInt(int64(val), 10)
	case int:
		return strconv.FormatInt(int64(val), 10)
	case int16:
		return strconv.FormatInt(int64(val), 10)
	case int8:
		return strconv.FormatInt(int64(val), 10)
	case uint64:
		return strconv.FormatUint(val, 10)
	case uint32:
		return strconv.FormatUint(uint64(val), 10)
	case uint:
		return strconv.FormatUint(uint64(val), 10)
	case float64:
		return dcFloatLiteral(val, 64)
	case float32:
		return dcFloatLiteral(float64(val), 32)
	case time.Time:
		return dcTimeLiteral(val, dbType)
	case []byte:
		if utf8.Valid(val) {
			return dcStringLiteral(string(val), dbType)
		}
		return dcBinaryLiteral(val, dbType)
	case string:
		return dcStringLiteral(val, dbType)
	default:
		s := fmt.Sprintf("%v", val)
		if dcNumberText.MatchString(s) {
			return s
		}
		return dcStringLiteral(s, dbType)
	}
}

// dcLiteralTyped 按目标列的类型校正字面量的形态。
//
// 同步脚本里的值取自源表，类型却由目标列决定。最典型的是标志位：MySQL 的 TINYINT(1)
// 在驱动里是整数 1，同步到 PG 的 boolean 列必须写成 TRUE（`flag_col = 1` 会被 PG 拒绝）；
// 反过来 boolean 进数值列要写成 1/0。
func dcLiteralTyped(v any, dbType, targetType string) string {
	// PG 的 timestamptz 列写入不带时区的时间文本时按会话时区解释：同一个绝对时刻，
	// 在 UTC 会话和东八区会话里会差 8 小时。带时区的列一律写成带偏移量的 UTC 时间。
	if ts, ok := v.(time.Time); ok && dcTypeKindOf(targetType) == dcTypeTimestampTz &&
		dcAcceptsOffsetLiteral(dbType) {
		return "'" + ts.UTC().Format("2006-01-02 15:04:05.999999") + "+00:00'"
	}
	switch dcTypeKindOf(targetType) {
	case dcTypeText:
		// 源表的数值 / 布尔列对应目标表的文本列：`SET txt = 123` 在 PG 上会被拒绝，按字符串写
		switch v := v.(type) {
		case bool:
			if v {
				return dcStringLiteral("true", dbType)
			}
			return dcStringLiteral("false", dbType)
		case float64:
			return dcStringLiteral(strconv.FormatFloat(v, 'f', -1, 64), dbType)
		case float32:
			return dcStringLiteral(strconv.FormatFloat(float64(v), 'f', -1, 32), dbType)
		default:
			if _, ok := dcGoNumber(v); ok {
				return dcStringLiteral(dcLiteral(v, dbType), dbType)
			}
		}
	case dcTypeBool:
		// 只有接受 TRUE/FALSE 关键字的方言才这样写；其余方言数值照写 1/0 本来就对
		if n, ok := dcGoNumber(v); ok && dcAcceptsTrueFalse(dbType) {
			if n != 0 {
				return "TRUE"
			}
			return "FALSE"
		}
	case dcTypeNumber:
		if b, ok := v.(bool); ok {
			if b {
				return "1"
			}
			return "0"
		}
	}
	return dcLiteral(v, dbType)
}

type dcTypeKind int

const (
	dcTypeOther dcTypeKind = iota
	dcTypeBool
	dcTypeNumber
	dcTypeTimestampTz
	dcTypeText
)

// dcTypeKindOf 按列类型名归类。只认得没有歧义的叫法：SQL Server 的 bit 两边都能收，不当布尔处理
func dcTypeKindOf(dataType string) dcTypeKind {
	t := strings.ToLower(strings.TrimSpace(dataType))
	if t == "boolean" || t == "bool" {
		return dcTypeBool
	}
	if dcNumberType.MatchString(t) {
		return dcTypeNumber
	}
	if dcTextType.MatchString(t) {
		return dcTypeText
	}
	// 注意 "timestamp without time zone" 里也有 "time zone"，只认明确带时区的写法
	if strings.Contains(t, "timestamptz") || strings.Contains(t, "with time zone") ||
		strings.Contains(t, "with tz") || strings.HasPrefix(t, "datetimeoffset") {
		return dcTypeTimestampTz
	}
	return dcTypeOther
}

// dcAcceptsOffsetLiteral `'<时间>+00:00'` 这种带偏移量的时间字面量在哪些方言里直接可用
func dcAcceptsOffsetLiteral(dbType string) bool {
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		return true
	}
	return false
}

func dcAcceptsTrueFalse(dbType string) bool {
	switch dbType {
	case "sqlserver", "oracle", "dameng", "sqlite":
		return false
	}
	return true
}

// dcGoNumber Go 的数值类型（不含看起来像数字的文本——文本照旧按字符串写）
func dcGoNumber(v any) (float64, bool) {
	switch n := v.(type) {
	case int64:
		return float64(n), true
	case int32:
		return float64(n), true
	case int:
		return float64(n), true
	case int16:
		return float64(n), true
	case int8:
		return float64(n), true
	case uint64:
		return float64(n), true
	case uint32:
		return float64(n), true
	case uint:
		return float64(n), true
	case float64:
		return n, true
	case float32:
		return float64(n), true
	}
	return 0, false
}

func dcFloatLiteral(f float64, bits int) string {
	// NaN / Infinity 没有可移植的字面量：按 NULL 写入，结果里会带提示
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return "NULL"
	}
	return strconv.FormatFloat(f, 'g', -1, bits)
}

func dcTimeLiteral(t time.Time, dbType string) string {
	// 统一写成 UTC 的朴素时间文本，带时区的列因此按 UTC 落库
	s := t.UTC().Format("2006-01-02 15:04:05.999999")
	if dbType == "oracle" || dbType == "dameng" {
		return "TO_TIMESTAMP('" + s + "', 'YYYY-MM-DD HH24:MI:SS.FF6')"
	}
	return "'" + s + "'"
}

func dcStringLiteral(s, dbType string) string {
	escaped := strings.ReplaceAll(s, "'", "''")
	switch dbType {
	case "mysql", "mariadb", "clickhouse", "tdengine":
		// 默认 sql_mode 下反斜杠是转义符，NUL 必须转义
		escaped = strings.ReplaceAll(escaped, "\\", "\\\\")
		escaped = strings.ReplaceAll(escaped, "\x00", "\\0")
	case "sqlserver":
		// 非 ASCII 文本加 N 前缀，避免按代码页转换后乱码
		if !isASCII(s) {
			return "N'" + escaped + "'"
		}
	}
	return "'" + escaped + "'"
}

func dcBinaryLiteral(b []byte, dbType string) string {
	h := hex.EncodeToString(b)
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		return "'\\x" + h + "'::bytea"
	case "sqlite":
		return "X'" + h + "'"
	case "oracle", "dameng":
		return "HEXTORAW('" + h + "')"
	default:
		return "0x" + h
	}
}

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] > 0x7F {
			return false
		}
	}
	return true
}

// ── 表结构辅助 ──

// dcSide 对比的一侧：连接、库、表及其结构
type dcSide struct {
	dbType    string
	structure models.TableStructure
	exec      db.Executor
	tableRef  string
}

// dcResolveSide 准备一侧：执行器、表所在的 schema 和表结构。
// schema 由请求指定；没指定时 PG 系自己定位。
func (h *Handler) dcResolveSide(ctx context.Context, connID, database, schema, table string) (*dcSide, error) {
	dbType, err := h.mgr.GetDBType(connID)
	if err != nil {
		return nil, err
	}
	if dbType == "sqlite" || dbType == "sqlite3" {
		database = "" // SQLite 树上的「main」只是目录名，不是可切换的库
	}
	exec, err := h.mgr.GetExecutorNoTx(connID, database)
	if err != nil {
		return nil, err
	}
	tableRef := quoteIdent(table, dbType)
	if dbType == "postgresql" || dbType == "kingbase" || dbType == "highgo" || dbType == "vastbase" {
		// 表不一定在 search_path 上；重名时各 schema 的列还会被并成一份结构。先定位它所在的 schema
		schema, err = pgResolveTableSchema(ctx, exec, table, schema)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", table, err)
		}
		tableRef = quoteIdent(schema, dbType) + "." + quoteIdent(table, dbType)
	}
	structure, err := h.tableStructureFor(connID, database, schema, table)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", table, err)
	}
	return &dcSide{dbType: dbType, structure: structure, exec: exec, tableRef: tableRef}, nil
}

// pgResolveTableSchema 定位表所在的 schema：hint 非空就必须在 hint 里；否则优先 public，
// 都没有再按名字序取第一个（多个 schema 里有同名表时无法替用户决定，取稳定的那个）
func pgResolveTableSchema(ctx context.Context, exec db.Executor, table, hint string) (string, error) {
	rows, err := exec.QueryContext(ctx, `
		SELECT n.nspname
		FROM pg_catalog.pg_class c
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE c.relname = $1 AND c.relkind IN ('r', 'p')
			AND n.nspname NOT IN ('pg_catalog', 'information_schema')
			AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg\_temp\_%'
		ORDER BY (n.nspname = $2) DESC, (n.nspname = 'public') DESC, n.nspname
	`, table, hint)
	if err != nil {
		return "", fmt.Errorf("failed to locate table schema: %w", err)
	}
	defer rows.Close()
	var schemas []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return "", err
		}
		schemas = append(schemas, name)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	if len(schemas) == 0 {
		return "", fmt.Errorf("table not found in this database")
	}
	if hint != "" && schemas[0] != hint {
		return "", fmt.Errorf("table not found in schema %s (found in %s)", hint, strings.Join(schemas, ", "))
	}
	return schemas[0], nil
}

// tableStructureFor 复用 GetTableStructure 处理器（各库差异都在那里）
func (h *Handler) tableStructureFor(connectionID, database, schema, table string) (models.TableStructure, error) {
	req := MetadataRequest{ConnectionID: connectionID, Database: &database, TableName: &table}
	if schema != "" {
		req.Schema = &schema
	}
	body, err := json.Marshal(req)
	if err != nil {
		return models.TableStructure{}, err
	}
	httpReq := httptest.NewRequest("POST", "/", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	h.GetTableStructure(rr, httpReq)

	var resp models.TableStructure
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		return models.TableStructure{}, fmt.Errorf("failed to read table structure: %w", err)
	}
	if resp.Error != "" {
		return models.TableStructure{}, errors.New(resp.Error)
	}
	return resp, nil
}

// dcIsGeneratedColumn 生成列（虚拟 / 存储生成）由数据库自己算，不能给它赋值：MySQL 会直接拒绝
func dcIsGeneratedColumn(extra *string) bool {
	if extra == nil {
		return false
	}
	return strings.Contains(*extra, "VIRTUAL GENERATED") || strings.Contains(*extra, "STORED GENERATED")
}

func dcColumnNames(s models.TableStructure) []string {
	out := make([]string, 0, len(s.Columns))
	for _, c := range s.Columns {
		out = append(out, c.ColumnName)
	}
	return out
}

// dcPrimaryKey 主键列（按索引里的列序）。索引里没有主键项时退回看列上的 PRI 标记：
// SQLite 的 INTEGER PRIMARY KEY 是 rowid 别名，不会出现在索引列表里。
func dcPrimaryKey(s models.TableStructure) []string {
	type keyColumn struct {
		name string
		seq  int64
	}
	cols := []keyColumn{}
	for _, ix := range s.Indexes {
		if ix.IsPrimary {
			cols = append(cols, keyColumn{ix.ColumnName, ix.SeqInIndex})
		}
	}
	if len(cols) == 0 {
		for _, c := range s.Columns {
			if c.ColumnKey != nil && *c.ColumnKey == "PRI" {
				cols = append(cols, keyColumn{c.ColumnName, 0})
			}
		}
	}
	sort.SliceStable(cols, func(i, j int) bool { return cols[i].seq < cols[j].seq })
	seen := map[string]bool{}
	out := []string{}
	for _, c := range cols {
		if !seen[strings.ToLower(c.name)] {
			seen[strings.ToLower(c.name)] = true
			out = append(out, c.name)
		}
	}
	return out
}

// dcFindColumn 大小写不敏感地找列（MySQL 列名不区分大小写，PG 统一转小写）
func dcFindColumn(names []string, name string) (string, bool) {
	for _, n := range names {
		if strings.EqualFold(n, name) {
			return n, true
		}
	}
	return "", false
}
