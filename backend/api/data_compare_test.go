package api

import (
	"context"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"idblink/backend/db"
	"idblink/backend/models"
)

// ── 归一化 ──

func TestCanonCell(t *testing.T) {
	eq := func(a, b any, why string) {
		t.Helper()
		assert.Equal(t, canonCell(a), canonCell(b), why)
	}
	ne := func(a, b any, why string) {
		t.Helper()
		assert.NotEqual(t, canonCell(a), canonCell(b), why)
	}

	// 数值：整数 / 浮点 / 规范十进制文本彼此相等
	eq(int64(12), uint8(12), "int vs uint")
	eq(int64(12), float64(12), "int vs float")
	eq(12.5, "12.50", "float vs decimal text")
	eq([]byte("12.50"), "12.5", "MySQL DECIMAL ([]byte) vs PG NUMERIC text")
	eq("-0", 0, "negative zero")
	eq("100", 100.0, "whole decimal")
	// 带前导零 / 前导正号 / 指数的文本保持字符串身份：邮编 '0123' 不等于 123
	ne("0123", 123, "leading zero is text")
	ne("0123", "123", "leading zero vs plain")
	ne("+5", 5, "plus sign is text")
	ne("1e3", 1000, "exponent is text")

	// 布尔与 0/1：MySQL TINYINT(1) vs PG boolean
	eq(true, int64(1), "true vs 1")
	eq(false, int64(0), "false vs 0")

	// 时间：time.Time 与日期形状的文本
	ts := time.Date(2024, 1, 1, 10, 20, 30, 0, time.UTC)
	eq(ts, "2024-01-01 10:20:30", "time.Time vs MySQL DATETIME text")
	eq(ts, "2024-01-01T10:20:30", "ISO with T")
	eq(ts, "2024-01-01 18:20:30 +0800", "zone offset normalizes to UTC")
	eq(time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC), "2024-01-01", "date only")
	eq(ts.Add(500*time.Millisecond), "2024-01-01 10:20:30.5", "fractional seconds")
	ne(ts, "2024-01-01 10:20:31", "different second")
	// 不像日期的文本不碰
	assert.Equal(t, "s:2024-01", canonCell("2024-01"))
	assert.Equal(t, "s:hello world", canonCell("hello world"))

	// 二进制与 NULL
	assert.Equal(t, "", canonCell(nil), "NULL")
	assert.True(t, strings.HasPrefix(canonCell([]byte{0xFF, 0x41}), "b:"), "invalid UTF-8 is binary")
	ne([]byte{0xFF, 0x41}, []byte{0xFE, 0x42}, "两份不同的二进制不能因为都非法就相等")
	assert.True(t, strings.HasPrefix(canonCell([]byte{0xDE, 0xAD}), "s:"), "0xDE 0xAD 是合法的两字节 UTF-8")
	eq([]byte("text"), "text", "valid UTF-8 bytes are text")
	ne(nil, "", "NULL differs from empty string")
}

func TestTrimDecimal(t *testing.T) {
	assert.Equal(t, "12.5", trimDecimal("12.50"))
	assert.Equal(t, "12", trimDecimal("12.000"))
	assert.Equal(t, "0", trimDecimal("-0.0"))
	assert.Equal(t, "-3.14", trimDecimal("-3.1400"))
}

func TestDcKey(t *testing.T) {
	// 长度前缀：("ab","c") 与 ("a","bc") 不能撞
	assert.NotEqual(t, dcKey([]any{"ab", "c"}), dcKey([]any{"a", "bc"}))
	assert.Equal(t, dcKey([]any{int64(7)}), dcKey([]any{"7"}), "键里的数值与数值文本也归一")
	assert.Equal(t, dcKey([]any{nil}), dcKey([]any{nil}))
}

// ── 字面量 ──

func TestDcLiteral(t *testing.T) {
	bin := []byte{0xDE, 0xAD, 0xBE, 0xEF}

	assert.Equal(t, "NULL", dcLiteral(nil, "mysql"))
	assert.Equal(t, "TRUE", dcLiteral(true, "postgresql"), "PG 用 TRUE/FALSE")
	assert.Equal(t, "1", dcLiteral(true, "sqlserver"), "SQL Server 用 1/0")
	assert.Equal(t, "0", dcLiteral(false, "oracle"), "Oracle 用 0/1")
	assert.Equal(t, "42", dcLiteral(int64(42), "mysql"))
	assert.Equal(t, "12.5", dcLiteral(12.5, "postgresql"))
	assert.Equal(t, "NULL", dcLiteral(math.NaN(), "postgresql"), "NaN 没有可移植写法")

	ts := time.Date(2024, 3, 4, 5, 6, 7, 500_000_000, time.UTC)
	assert.Equal(t, "'2024-03-04 05:06:07.5'", dcLiteral(ts, "mysql"))
	assert.Equal(t, "TO_TIMESTAMP('2024-03-04 05:06:07.5', 'YYYY-MM-DD HH24:MI:SS.FF6')",
		dcLiteral(ts, "oracle"), "Oracle 要显式转换")

	// 字符串：单引号翻倍；MySQL 另外转义反斜杠与 NUL
	assert.Equal(t, "'it''s'", dcStringLiteral("it's", "postgresql"))
	assert.Equal(t, `'it''s\\n'`, dcStringLiteral(`it's\n`, "mysql"))
	assert.Equal(t, `'a\0b'`, dcStringLiteral("a\x00b", "mysql"))
	assert.Equal(t, "N'中文'", dcStringLiteral("中文", "sqlserver"), "SQL Server 非 ASCII 加 N 前缀")
	assert.Equal(t, "'plain'", dcStringLiteral("plain", "sqlserver"))

	// 二进制
	assert.Equal(t, "0xdeadbeef", dcBinaryLiteral(bin, "mysql"))
	assert.Equal(t, `'\xdeadbeef'::bytea`, dcBinaryLiteral(bin, "postgresql"))
	assert.Equal(t, "X'deadbeef'", dcBinaryLiteral(bin, "sqlite"))
	assert.Equal(t, "HEXTORAW('deadbeef')", dcBinaryLiteral(bin, "dameng"))
	// 合法 UTF-8 的 []byte 按文本写
	assert.Equal(t, "'text'", dcLiteral([]byte("text"), "sqlite"))
}

func TestDcWhere(t *testing.T) {
	where, next := dcWhere([]string{"id", "no"}, []any{int64(3), nil}, "postgresql", 1)
	assert.Equal(t, `"id" = $1 AND "no" IS NULL`, where)
	assert.Equal(t, 2, next)
	where, _ = dcWhere([]string{"id"}, []any{int64(3)}, "mysql", 1)
	assert.Equal(t, "`id` = ?", where)
	where, next = dcWhere([]string{"id"}, []any{int64(3)}, "oracle", 4)
	assert.Equal(t, `"id" = :4`, where)
	assert.Equal(t, 5, next)
	assert.Equal(t, []any{int64(3)}, dcKeyArgs([]any{int64(3), nil}))
}

func TestDcLiteralTyped(t *testing.T) {
	// 标志位：源是 MySQL 的 TINYINT(1)（驱动里是整数），目标是 PG 的 boolean 列
	assert.Equal(t, "TRUE", dcLiteralTyped(int64(1), "postgresql", "boolean"))
	assert.Equal(t, "FALSE", dcLiteralTyped(int64(0), "postgresql", "BOOLEAN"))
	assert.Equal(t, "TRUE", dcLiteralTyped(true, "postgresql", "boolean"))
	// 目标还是数值列：照写成数值
	assert.Equal(t, "1", dcLiteralTyped(int64(1), "postgresql", "integer"))
	// boolean 进数值列：写成 1/0
	assert.Equal(t, "1", dcLiteralTyped(true, "oracle", "NUMBER(1)"))
	assert.Equal(t, "0", dcLiteralTyped(false, "mysql", "tinyint(1)"))
	// 不接受 TRUE / FALSE 关键字的方言：数值列的值照写数值
	assert.Equal(t, "1", dcLiteralTyped(int64(1), "sqlserver", "int"))
	// 非数值类型的列、NULL、看起来像数字的文本：都按原规则写
	assert.Equal(t, "'x'", dcLiteralTyped("x", "postgresql", "text"))
	assert.Equal(t, "NULL", dcLiteralTyped(nil, "postgresql", "boolean"))
	assert.Equal(t, "'1'", dcLiteralTyped("1", "postgresql", "boolean"), "文本不当数值处理")

	assert.Equal(t, dcTypeNumber, dcTypeKindOf("DECIMAL(12,2)"))
	assert.Equal(t, dcTypeNumber, dcTypeKindOf("bigint"))
	assert.Equal(t, dcTypeBool, dcTypeKindOf("bool"))
	assert.Equal(t, dcTypeOther, dcTypeKindOf("timestamp without time zone"))
	assert.Equal(t, dcTypeOther, dcTypeKindOf("bit"), "SQL Server 的 bit 不当布尔处理")

	where := dcWhereLiteral([]string{"id", "flag"}, []any{int64(7), int64(1)}, "postgresql",
		map[string]string{"id": "integer", "flag": "boolean"})
	assert.Equal(t, `"id" = 7 AND "flag" = TRUE`, where)

	// 带时区的列写成带偏移量的 UTC 时间：不带偏移量的话，PG 的 timestamptz 会按会话时区解释
	cst := time.FixedZone("CST", 8*3600)
	instant := time.Date(2024, 6, 1, 2, 20, 30, 0, cst) // = 2024-05-31 18:20:30 UTC
	assert.Equal(t, "'2024-05-31 18:20:30+00:00'",
		dcLiteralTyped(instant, "postgresql", "timestamp with time zone"))
	assert.Equal(t, "'2024-05-31 18:20:30+00:00'",
		dcLiteralTyped(instant, "kingbase", "TIMESTAMPTZ"))
	// 不带时区的列、不支持这种写法的方言：维持原来的朴素时间
	assert.Equal(t, "'2024-05-31 18:20:30'",
		dcLiteralTyped(instant, "postgresql", "timestamp without time zone"))
	assert.Equal(t, "'2024-05-31 18:20:30'", dcLiteralTyped(instant, "mysql", "timestamp"))
	// 文本形式的源值不做猜测，照原样写
	assert.Equal(t, "'2024-06-01 02:20:30'",
		dcLiteralTyped([]byte("2024-06-01 02:20:30"), "postgresql", "timestamp with time zone"))

	assert.Equal(t, dcTypeTimestampTz, dcTypeKindOf("timestamp(6) with time zone"))
	assert.Equal(t, dcTypeOther, dcTypeKindOf("timestamp(6) without time zone"))
}

func TestDcSelectSQLLimit(t *testing.T) {
	cols := "`id`, `v` FROM `t`"
	assert.Equal(t, "SELECT "+cols+" LIMIT 6", dcSelectSQL("`t`", []string{"id"}, []string{"v"}, "mysql", 6))
	assert.Equal(t, "SELECT `id`, `v` FROM `t` LIMIT 6", dcSelectSQL("`t`", []string{"id"}, []string{"v"}, "sqlite", 6))
	assert.Equal(t, `SELECT "id", "v" FROM "t" LIMIT 6`, dcSelectSQL(`"t"`, []string{"id"}, []string{"v"}, "postgresql", 6))
	// SQL Server 没有 LIMIT，用 TOP
	assert.Equal(t, "SELECT TOP (6) [id], [v] FROM [t]", dcSelectSQL("[t]", []string{"id"}, []string{"v"}, "sqlserver", 6))
	// 不限制 / 没有稳妥写法的方言：不加任何限制
	assert.Equal(t, "SELECT "+cols, dcSelectSQL("`t`", []string{"id"}, []string{"v"}, "mysql", 0))
	assert.Equal(t, "SELECT "+cols, dcSelectSQL("`t`", []string{"id"}, []string{"v"}, "mysql", -1))
	assert.Equal(t, `SELECT "id", "v" FROM "t"`, dcSelectSQL(`"t"`, []string{"id"}, []string{"v"}, "oracle", 6))
}

// 复合主键：键的顺序以请求为准（和表里的列顺序相反），读取、明细回查、同步语句都要对齐
func TestCompareTableDataCompositeKeyInRequestOrder(t *testing.T) {
	f := setupDataCompare(t)
	for _, exec := range []db.Executor{f.srcExec, f.tgtExec} {
		_, err := exec.ExecContext(context.Background(), "CREATE TABLE dc_k (a INTEGER, b INTEGER, v TEXT)")
		require.NoError(t, err)
	}
	execAll(t, f.srcExec, []string{
		"INSERT INTO dc_k VALUES (1, 2, 'x')",
		"INSERT INTO dc_k VALUES (2, 1, 'y')",
	})
	execAll(t, f.tgtExec, []string{
		"INSERT INTO dc_k VALUES (1, 2, 'old')",
		"INSERT INTO dc_k VALUES (2, 1, 'y')",
		"INSERT INTO dc_k VALUES (3, 3, 'z')",
	})
	req := &models.DataCompareRequest{
		SourceConnectionID: f.src, SourceTable: "dc_k",
		TargetConnectionID: f.tgt, TargetTable: "dc_k",
		KeyColumns: []string{"b", "a"},
	}
	result, err := f.handler.CompareTableData(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, []string{"b", "a"}, result.KeyColumns)
	assert.Equal(t, []string{"v"}, result.CompareColumns)
	assert.Equal(t, 1, result.SameCount)
	assert.Equal(t, 1, result.ModifiedCount)
	assert.Equal(t, 0, result.SourceOnlyCount)
	assert.Equal(t, 1, result.TargetOnlyCount)
	// 明细回查用的也是请求里的键顺序，所以能查到目标行的旧值
	require.Len(t, result.Modified, 1)
	assert.Equal(t, "x", result.Modified[0].Changes[0].Source.Value)
	assert.Equal(t, "old", result.Modified[0].Changes[0].Target.Value)
	assert.Contains(t, result.SQL, "SET `v` = 'x' WHERE `b` = 2 AND `a` = 1;")
	assert.Contains(t, result.SQL, "DELETE FROM `dc_k` WHERE `b` = 3 AND `a` = 3;")

	for _, stmt := range dcStatements(result.SQL) {
		_, err := f.tgtExec.ExecContext(context.Background(), stmt)
		require.NoError(t, err, stmt)
	}
	after, err := f.handler.CompareTableData(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, 2, after.SameCount)
	assert.Zero(t, after.ModifiedCount+after.SourceOnlyCount+after.TargetOnlyCount)
	assert.Empty(t, after.SQL)
}

// 行数上限：在 SQL 里限制之后，截断标记和计数仍然正确
func TestCompareTableDataLimitIsPushedIntoSQL(t *testing.T) {
	f := setupDataCompare(t)
	result := f.compare(t, func(r *models.DataCompareRequest) { r.MaxRows = 2 })
	assert.True(t, result.Truncated)
	assert.Equal(t, 2, result.SourceRows, "只读取了前 2 行，多取的那一行不计数")
	assert.Equal(t, 2, result.TargetRows)
}

// ── 端到端（SQLite → SQLite，两个连接） ──

const dcTableDDL = `CREATE TABLE orders (
	id INTEGER PRIMARY KEY,
	no TEXT NOT NULL,
	amount REAL,
	qty INT,
	note TEXT,
	created DATETIME,
	blob BLOB
)`

type dcFixture struct {
	handler *Handler
	src     string
	tgt     string
	srcExec db.Executor
	tgtExec db.Executor
}

func setupDataCompare(t *testing.T) *dcFixture {
	t.Helper()
	handler, manager := setupTestHandler(t)
	f := &dcFixture{handler: handler, src: "dc-src", tgt: "dc-tgt"}
	for _, c := range []struct {
		id   string
		file string
	}{{f.src, "src.db"}, {f.tgt, "tgt.db"}} {
		require.NoError(t, manager.Connect(c.id, db.ConnectArgs{
			DbType: "sqlite", Database: t.TempDir() + "/" + c.file,
		}))
		t.Cleanup(func() { _ = manager.Disconnect(c.id) })
		exec, err := manager.GetExecutorNoTx(c.id, "")
		require.NoError(t, err)
		_, err = exec.ExecContext(context.Background(), dcTableDDL)
		require.NoError(t, err)
		if c.id == f.src {
			f.srcExec = exec
		} else {
			f.tgtExec = exec
		}
	}
	// 只在一边有的列：不参与对比，也不同步
	_, err := f.srcExec.ExecContext(context.Background(), "ALTER TABLE orders ADD COLUMN src_only TEXT")
	require.NoError(t, err)
	_, err = f.tgtExec.ExecContext(context.Background(), "ALTER TABLE orders ADD COLUMN tgt_only TEXT")
	require.NoError(t, err)

	insert := func(exec db.Executor, rows [][]any) {
		t.Helper()
		for _, r := range rows {
			_, err := exec.ExecContext(context.Background(),
				"INSERT INTO orders (id, no, amount, qty, note, created, blob) VALUES (?, ?, ?, ?, ?, ?, ?)", r...)
			require.NoError(t, err)
		}
	}
	bin := []byte{0xDE, 0xAD, 0xBE, 0xEF}
	insert(f.srcExec, [][]any{
		{1, "A", 12.5, 3, "same", "2024-01-01 10:20:30", bin},
		{2, "B", 20.0, 1, "new name", "2024-02-02 00:00:00", nil},
		{4, "D", 7.25, 9, nil, nil, nil}, // 仅源表
		{6, "F", 1.0, 1, nil, nil, nil},  // note: NULL → 目标表是 'x'
		{8, "H", 3.0, 2, "0123", nil, nil},
	})
	insert(f.tgtExec, [][]any{
		{1, "A", 12.50, 3, "same", "2024-01-01T10:20:30", bin}, // 写法不同、值相同
		{2, "B", 20, 1, "old name", "2024-02-02 00:00:00", nil},
		{3, "C", 5, 1, nil, nil, nil}, // 仅目标表
		{5, "E", 5, 1, nil, nil, nil}, // 仅目标表
		{6, "F", 1, 1, "x", nil, nil},
		{8, "H", 3, 2, "0123", nil, nil},
	})
	return f
}

func (f *dcFixture) compare(t *testing.T, mutate func(*models.DataCompareRequest)) *models.DataCompareResult {
	t.Helper()
	req := &models.DataCompareRequest{
		SourceConnectionID: f.src, SourceTable: "orders",
		TargetConnectionID: f.tgt, TargetTable: "orders",
	}
	if mutate != nil {
		mutate(req)
	}
	result, err := f.handler.CompareTableData(context.Background(), req)
	require.NoError(t, err)
	return result
}

func ids(rows []models.DataCompareRow) []string {
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.Key["id"].Value
	}
	return out
}

func TestCompareTableData(t *testing.T) {
	f := setupDataCompare(t)
	result := f.compare(t, nil)

	assert.Equal(t, []string{"id"}, result.KeyColumns)
	assert.Equal(t, []string{"no", "amount", "qty", "note", "created", "blob"}, result.CompareColumns)
	assert.Equal(t, []string{"src_only"}, result.SourceOnlyColumns)
	assert.Equal(t, []string{"tgt_only"}, result.TargetOnlyColumns)
	assert.False(t, result.Truncated)

	assert.Equal(t, 5, result.SourceRows)
	assert.Equal(t, 6, result.TargetRows)
	assert.Equal(t, 2, result.SameCount, "id 1（写法不同但值相同）与 8（'0123' 文本）")
	assert.Equal(t, 2, result.ModifiedCount, "id 2、6")
	assert.Equal(t, 1, result.SourceOnlyCount, "id 4")
	assert.Equal(t, 2, result.TargetOnlyCount, "id 3、5")

	// 明细按键排序，只列出真正不同的列
	modifiedIDs := make([]string, len(result.Modified))
	for i, m := range result.Modified {
		modifiedIDs[i] = m.Key["id"].Value
	}
	assert.Equal(t, []string{"2", "6"}, modifiedIDs)
	assert.Equal(t, []models.DataCompareChange{
		{Column: "note", Source: models.DataCompareCell{Value: "new name"}, Target: models.DataCompareCell{Value: "old name"}},
	}, result.Modified[0].Changes)
	assert.Equal(t, []models.DataCompareChange{
		{Column: "note", Source: models.DataCompareCell{IsNull: true}, Target: models.DataCompareCell{Value: "x"}},
	}, result.Modified[1].Changes)
	assert.Equal(t, []string{"4"}, ids(result.SourceOnly))
	assert.Equal(t, "D", result.SourceOnly[0].Row["no"].Value)
	assert.Equal(t, []string{"3", "5"}, ids(result.TargetOnly))
	assert.Empty(t, result.Warnings)
}

func TestCompareTableDataSyncSQL(t *testing.T) {
	f := setupDataCompare(t)
	result := f.compare(t, nil)

	assert.False(t, result.SQLTruncated)
	assert.Equal(t, models.DataCompareSQLCounts{Update: 2, Insert: 1, Delete: 2}, result.SQLCounts)

	// 先 UPDATE 再 INSERT 最后 DELETE；每条语句以 ";\n" 结尾
	lines := []string{}
	for _, line := range strings.Split(result.SQL, "\n") {
		if line != "" && !strings.HasPrefix(line, "--") {
			lines = append(lines, line)
		}
	}
	require.Len(t, lines, 5)
	for _, l := range lines {
		assert.True(t, strings.HasSuffix(l, ";"), l)
	}
	// 脚本要能独立执行：全部是字面量，不能出现占位符
	assert.NotContains(t, result.SQL, "?")
	assert.True(t, strings.HasPrefix(lines[0], "UPDATE `orders` SET `no` = 'B'"), lines[0])
	assert.Contains(t, lines[0], "`note` = 'new name',")
	assert.Contains(t, lines[0], "WHERE `id` = 2;")
	assert.Contains(t, lines[1], "`note` = NULL,")
	assert.Contains(t, lines[1], "WHERE `id` = 6;")
	assert.Equal(t,
		"INSERT INTO `orders` (`id`, `no`, `amount`, `qty`, `note`, `created`, `blob`) VALUES (4, 'D', 7.25, 9, NULL, NULL, NULL);",
		lines[2])
	assert.Equal(t, "DELETE FROM `orders` WHERE `id` = 3;", lines[3])
	assert.Equal(t, "DELETE FROM `orders` WHERE `id` = 5;", lines[4])

	// 同步列里没有只在一侧存在的列
	assert.NotContains(t, result.SQL, "src_only")
	assert.NotContains(t, result.SQL, "tgt_only")

	// 端到端：把脚本在目标库上跑一遍，再比就应该全部相同
	for _, line := range lines {
		_, err := f.tgtExec.ExecContext(context.Background(), strings.TrimSuffix(line, ";"))
		require.NoError(t, err, line)
	}
	after := f.compare(t, nil)
	assert.Equal(t, 5, after.SameCount)
	assert.Zero(t, after.ModifiedCount)
	assert.Zero(t, after.SourceOnlyCount)
	assert.Zero(t, after.TargetOnlyCount)
	assert.Empty(t, after.SQL, "没有差异就不再生成语句")
}

func TestCompareTableDataSyncsBinaryAndTime(t *testing.T) {
	f := setupDataCompare(t)
	_, err := f.srcExec.ExecContext(context.Background(),
		"INSERT INTO orders (id, no, blob, created) VALUES (20, 'bin', ?, ?)", []byte{0x00, 0xFF, 0x01}, "2024-05-06 07:08:09")
	require.NoError(t, err)
	result := f.compare(t, nil)

	assert.Contains(t, result.SQL, "X'00ff01'", "二进制按十六进制字面量写入")
	assert.Contains(t, result.SQL, "'2024-05-06 07:08:09'")
}

// 源表没有主键：必须显式指定匹配用的列
func TestCompareTableDataWithoutPrimaryKey(t *testing.T) {
	f := setupDataCompare(t)
	for _, exec := range []db.Executor{f.srcExec, f.tgtExec} {
		_, err := exec.ExecContext(context.Background(), "CREATE TABLE nopk (a TEXT, b TEXT)")
		require.NoError(t, err)
	}
	_, err := f.srcExec.ExecContext(context.Background(), "INSERT INTO nopk VALUES ('x', '1')")
	require.NoError(t, err)
	_, err = f.tgtExec.ExecContext(context.Background(), "INSERT INTO nopk VALUES ('x', '2')")
	require.NoError(t, err)

	req := &models.DataCompareRequest{
		SourceConnectionID: f.src, SourceTable: "nopk",
		TargetConnectionID: f.tgt, TargetTable: "nopk",
	}
	_, err = f.handler.CompareTableData(context.Background(), req)
	require.ErrorContains(t, err, "no primary key")

	req.KeyColumns = []string{" a "}
	result, err := f.handler.CompareTableData(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, []string{"a"}, result.KeyColumns)
	assert.Equal(t, 1, result.ModifiedCount)
	assert.Contains(t, result.SQL, "`b` = '1' WHERE `a` = 'x';")

	// 列名大小写不敏感：请求里用大写也行
	req.KeyColumns = []string{"A"}
	result, err = f.handler.CompareTableData(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, 1, result.ModifiedCount)

	// 键里有 NULL：WHERE 写成 IS NULL
	for _, row := range []struct {
		exec db.Executor
		b    string
	}{{f.srcExec, "n1"}, {f.tgtExec, "n2"}} {
		_, err = row.exec.ExecContext(context.Background(), "INSERT INTO nopk (a, b) VALUES (NULL, ?)", row.b)
		require.NoError(t, err)
	}
	req.KeyColumns = []string{"a"}
	withNull, err := f.handler.CompareTableData(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, 2, withNull.ModifiedCount)
	assert.Contains(t, withNull.SQL, "SET `b` = 'n1' WHERE `a` IS NULL;")

	req.KeyColumns = []string{"missing"}
	_, err = f.handler.CompareTableData(context.Background(), req)
	require.ErrorContains(t, err, "key column \"missing\" not found in source table")
}

func TestCompareTableDataLimits(t *testing.T) {
	f := setupDataCompare(t)

	// 行数上限：源表 5 行，只读 3 行就停
	capped := f.compare(t, func(r *models.DataCompareRequest) { r.MaxRows = 3 })
	assert.True(t, capped.Truncated)
	assert.Equal(t, 3, capped.SourceRows)
	assert.Equal(t, 3, capped.TargetRows, "行数上限对两侧都生效")
	// 只读了前 3 行源表，读到的目标行里没被命中的都算「仅目标表」
	assert.Equal(t, 1, capped.TargetOnlyCount)
	assert.Equal(t, capped.TargetRows-capped.SameCount-capped.ModifiedCount, capped.TargetOnlyCount)

	// 语句上限：只生成前 2 条，其余标记为被截断
	limited := f.compare(t, func(r *models.DataCompareRequest) { r.MaxStatements = 2 })
	assert.True(t, limited.SQLTruncated)
	assert.Equal(t, 2, limited.SQLCounts.Update+limited.SQLCounts.Insert+limited.SQLCounts.Delete)
	// 计数不受语句上限影响
	assert.Equal(t, 2, limited.ModifiedCount)
	assert.Equal(t, 1, limited.SourceOnlyCount)

	// 明细上限
	assert.LessOrEqual(t, len(limited.Modified), dcDetailLimit)
}

func TestCompareTableDataMissingTable(t *testing.T) {
	f := setupDataCompare(t)
	_, err := f.handler.CompareTableData(context.Background(), &models.DataCompareRequest{
		SourceConnectionID: f.src, SourceTable: "nope",
		TargetConnectionID: f.tgt, TargetTable: "orders",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "source")

	_, err = f.handler.CompareTableData(context.Background(), &models.DataCompareRequest{
		SourceConnectionID: "no-such-connection", SourceTable: "orders",
		TargetConnectionID: f.tgt, TargetTable: "orders",
	})
	require.Error(t, err)
}

// ── 键的选择与脚本在各种边界下的内容（SQLite，两个连接） ──

// setupDataCompareTables 用自定义的表结构建一对同名表 t，并写入各自的行（按位置 INSERT）
func setupDataCompareTables(t *testing.T, ddl string, srcRows, tgtRows [][]any) *dcFixture {
	t.Helper()
	handler, manager := setupTestHandler(t)
	f := &dcFixture{handler: handler, src: "dc-k-src", tgt: "dc-k-tgt"}
	for _, c := range []struct {
		id   string
		file string
		rows [][]any
	}{{f.src, "k-src.db", srcRows}, {f.tgt, "k-tgt.db", tgtRows}} {
		require.NoError(t, manager.Connect(c.id, db.ConnectArgs{
			DbType: "sqlite", Database: t.TempDir() + "/" + c.file,
		}))
		t.Cleanup(func() { _ = manager.Disconnect(c.id) })
		exec, err := manager.GetExecutorNoTx(c.id, "")
		require.NoError(t, err)
		_, err = exec.ExecContext(context.Background(), ddl)
		require.NoError(t, err)
		for _, r := range c.rows {
			placeholders := strings.Repeat("?, ", len(r))
			_, err = exec.ExecContext(context.Background(),
				"INSERT INTO t VALUES ("+placeholders[:len(placeholders)-2]+")", r...)
			require.NoError(t, err)
		}
		if c.id == f.src {
			f.srcExec = exec
		} else {
			f.tgtExec = exec
		}
	}
	return f
}

func (f *dcFixture) compareTable(t *testing.T, table string, mutate func(*models.DataCompareRequest)) *models.DataCompareResult {
	t.Helper()
	req := &models.DataCompareRequest{
		SourceConnectionID: f.src, SourceTable: table,
		TargetConnectionID: f.tgt, TargetTable: table,
	}
	if mutate != nil {
		mutate(req)
	}
	result, err := f.handler.CompareTableData(context.Background(), req)
	require.NoError(t, err)
	return result
}

// UNIQUE 约束的自动索引也叫 sqlite_autoindex_*：不能因此把它当成主键，
// 否则匹配键变成 UNIQUE 列，行会被错误分类、UPDATE 还会改到真正的主键
func TestCompareTableDataKeysOnPrimaryKeyNotUniqueIndex(t *testing.T) {
	f := setupDataCompareTables(t,
		`CREATE TABLE t (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, v TEXT)`,
		[][]any{{1, "a@x", "same"}, {2, "b@x", "src"}},
		[][]any{{1, "a@x", "same"}, {3, "c@x", "tgt"}},
	)

	result := f.compareTable(t, "t", nil)

	assert.Equal(t, []string{"id"}, result.KeyColumns)
	assert.Equal(t, 1, result.SameCount)
	assert.Equal(t, 1, result.SourceOnlyCount)
	assert.Equal(t, 1, result.TargetOnlyCount)
}

// 有一侧没读完时，「仅在另一侧」不可靠：INSERT / DELETE 不能进脚本，UPDATE 照常
func TestCompareTableDataTruncatedScriptHasNoInsertOrDelete(t *testing.T) {
	f := setupDataCompare(t)

	result := f.compare(t, func(r *models.DataCompareRequest) { r.MaxRows = 2 })

	require.True(t, result.Truncated)
	assert.Contains(t, result.SQL, "UPDATE `orders`", "两边都读到的行仍然生成 UPDATE")
	assert.NotContains(t, result.SQL, "INSERT INTO")
	assert.NotContains(t, result.SQL, "DELETE FROM")
	assert.Equal(t, 0, result.SQLCounts.Insert)
	assert.Equal(t, 0, result.SQLCounts.Delete)
	assert.Contains(t, strings.Join(result.Warnings, "\n"), "只包含 UPDATE")
}

// 「内容不同」的行在收集阶段就按语句上限截住了，脚本截断标记要按实际数量补上
func TestCompareTableDataSQLTruncatedWhenModifiedRowsExceedLimit(t *testing.T) {
	f := setupDataCompareTables(t,
		`CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)`,
		[][]any{{1, "a"}, {2, "b"}, {3, "c"}},
		[][]any{{1, "x"}, {2, "y"}, {3, "z"}},
	)

	limited := f.compareTable(t, "t", func(r *models.DataCompareRequest) { r.MaxStatements = 2 })
	assert.Equal(t, 3, limited.ModifiedCount)
	assert.Equal(t, 2, limited.SQLCounts.Update)
	assert.True(t, limited.SQLTruncated, "少了一条语句，界面要提示脚本不完整")

	full := f.compareTable(t, "t", nil)
	assert.False(t, full.SQLTruncated)
	assert.Equal(t, 3, full.SQLCounts.Update)
}

// 请求指定的键在目标表里不唯一：没法按行对齐，必须说出来
func TestCompareTableDataWarnsAboutDuplicateKeys(t *testing.T) {
	f := setupDataCompareTables(t,
		`CREATE TABLE t (k INT, v TEXT)`,
		[][]any{{1, "x"}},
		[][]any{{1, "x"}, {1, "y"}},
	)

	result := f.compareTable(t, "t", func(r *models.DataCompareRequest) { r.KeyColumns = []string{"k"} })

	assert.Contains(t, strings.Join(result.Warnings, "\n"), "1 行的匹配键和别的行重复")
}

func TestDcLimits(t *testing.T) {
	rows, stmts := dcLimits(&models.DataCompareRequest{})
	assert.Equal(t, dcDefaultMaxRows, rows)
	assert.Equal(t, dcDefaultMaxStatements, stmts)

	rows, stmts = dcLimits(&models.DataCompareRequest{MaxRows: 5_000_000_000, MaxStatements: 10_000_000})
	assert.Equal(t, dcMaxRowsLimit, rows, "行数决定内存占用，要封顶")
	assert.Equal(t, dcMaxStatementsLimit, stmts)

	rows, stmts = dcLimits(&models.DataCompareRequest{MaxRows: 50, MaxStatements: 5})
	assert.Equal(t, 50, rows)
	assert.Equal(t, 5, stmts)
}

// 源表的数值 / 布尔列对应目标表的文本列：必须按字符串写
func TestDcLiteralTypedTextTarget(t *testing.T) {
	assert.Equal(t, "'123'", dcLiteralTyped(int64(123), "postgresql", "character varying(32)"))
	assert.Equal(t, "'12.5'", dcLiteralTyped(12.5, "postgresql", "text"))
	assert.Equal(t, "'1000000'", dcLiteralTyped(1e6, "postgresql", "text"))
	assert.Equal(t, "'true'", dcLiteralTyped(true, "postgresql", "text"))
	assert.Equal(t, "'0123'", dcLiteralTyped("0123", "postgresql", "text"), "文本照旧")
	// 数值列、布尔列不受影响
	assert.Equal(t, "123", dcLiteralTyped(int64(123), "postgresql", "integer"))
	assert.Equal(t, "TRUE", dcLiteralTyped(int64(1), "postgresql", "boolean"))
}

func TestDcPlanColumnsSkipsGeneratedTargetColumns(t *testing.T) {
	structure := func(extra *string) models.TableStructure {
		return models.TableStructure{Columns: []models.ColumnInfo{
			{ColumnName: "id", ColumnKey: strPtr("PRI")},
			{ColumnName: "name"},
			{ColumnName: "full_name", Extra: extra},
		}}
	}

	// 生成列由数据库自己算：不能赋值，也不参与对比
	plan, err := dcPlanColumns(&dcSide{structure: structure(nil)}, &dcSide{structure: structure(strPtr("VIRTUAL GENERATED"))}, nil)
	require.NoError(t, err)
	assert.Equal(t, []string{"name"}, plan.compareNames)
	assert.Equal(t, []string{"full_name"}, plan.targetOnly)

	// DEFAULT_GENERATED 是表达式默认值，不是生成列
	plan, err = dcPlanColumns(&dcSide{structure: structure(nil)}, &dcSide{structure: structure(strPtr("DEFAULT_GENERATED"))}, nil)
	require.NoError(t, err)
	assert.Equal(t, []string{"name", "full_name"}, plan.compareNames)
	assert.Empty(t, plan.targetOnly)
}
