package api

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"idblink/backend/db"
	"idblink/backend/models"
)

// ── 数据对比在真实库上的验证 ──
//
// SQLite 里每种值都是整数 / 浮点 / 文本，验证不到驱动之间的类型差异：
// MySQL 的 DECIMAL / DATETIME 回来是 []byte，PG 的 timestamp 是 time.Time，
// TINYINT(1) 与 boolean 要能对应上。开关与事务冒烟共用：
//
//	docker compose -f docker-compose.test.yml up -d
//	IDBLINK_TX_SMOKE_MYSQL=1 IDBLINK_TX_SMOKE_PG=1 go test ./backend/api -run RealDataCompare -v

// dcRealSide 对比的一侧：一个真实连接 + 库里的两张表 dc_src / dc_tgt
type dcRealSide struct {
	connID   string
	database string
	dbType   string
	exec     db.Executor
}

var dcRealTables = []string{"dc_src", "dc_tgt"}

const dcMySQLDDL = `CREATE TABLE %s (
	id INT PRIMARY KEY,
	no VARCHAR(32) NOT NULL,
	amount DECIMAL(12,2),
	qty INT,
	flag_col TINYINT(1),
	note VARCHAR(255),
	created_at DATETIME,
	created_tz DATETIME,
	payload BLOB
)`

const dcPostgresDDL = `CREATE TABLE %s (
	id INT PRIMARY KEY,
	no VARCHAR(32) NOT NULL,
	amount NUMERIC(12,2),
	qty INT,
	flag_col BOOLEAN,
	note VARCHAR(255),
	created_at TIMESTAMP(6),
	created_tz TIMESTAMP WITH TIME ZONE,
	payload BYTEA
)`

// setupRealDC 连上真实库并建好两张表。同一个 Handler 可以同时挂上 MySQL 和 PG 两个连接
// （跨库对比要用）；同一个库在同一测试里只要连一次。
func setupRealDC(t *testing.T, h *Handler, dbType, flag, envPrefix, defAddr, defUser, defPass, defDB string) dcRealSide {
	t.Helper()
	if os.Getenv(flag) != "1" {
		t.Skipf("set %s=1 to run against a real %s", flag, dbType)
	}
	env := func(suffix, def string) string {
		if v := os.Getenv(envPrefix + "_" + suffix); v != "" {
			return v
		}
		return def
	}
	host, portText, ok := strings.Cut(env("ADDR", defAddr), ":")
	require.True(t, ok, "bad address")
	port, err := strconv.Atoi(portText)
	require.NoError(t, err)
	database := env("DB", defDB)

	connID := "dc-real-" + dbType
	side := dcRealSide{connID: connID, database: database, dbType: dbType}
	if exec, err := h.mgr.GetExecutor(connID, ""); err == nil {
		side.exec = exec // 这个库已经连上了（同一测试里的第二次调用）
		return side
	}
	require.NoError(t, h.mgr.Connect(connID, db.ConnectArgs{
		DbType: dbType, Host: host, Port: port,
		Username: env("USER", defUser), Password: env("PASS", defPass), Database: database,
	}))
	t.Cleanup(func() { _ = h.mgr.Disconnect(connID) })
	exec, err := h.mgr.GetExecutorNoTx(connID, "")
	require.NoError(t, err)
	side.exec = exec

	ddl := dcMySQLDDL
	if dbType == "postgresql" {
		ddl = dcPostgresDDL
	}
	for _, table := range dcRealTables {
		_, _ = exec.ExecContext(context.Background(), "DROP TABLE IF EXISTS "+table)
		_, err = exec.ExecContext(context.Background(), fmt.Sprintf(ddl, table))
		require.NoError(t, err, "create %s", table)
	}
	t.Cleanup(func() {
		for _, table := range dcRealTables {
			_, _ = exec.ExecContext(context.Background(), "DROP TABLE IF EXISTS "+table)
		}
	})
	return side
}

func dcCompare(t *testing.T, h *Handler, src, tgt dcRealSide) *models.DataCompareResult {
	t.Helper()
	result, err := h.CompareTableData(context.Background(), &models.DataCompareRequest{
		SourceConnectionID: src.connID, SourceDatabase: src.database, SourceTable: "dc_src",
		TargetConnectionID: tgt.connID, TargetDatabase: tgt.database, TargetTable: "dc_tgt",
	})
	require.NoError(t, err)
	return result
}

// dcInsertRows 往表里写行。金额与时间用字符串写：两种库都接受
func dcInsertRows(t *testing.T, side dcRealSide, table string, rows [][]any) {
	t.Helper()
	placeholders := make([]string, 9)
	for i := range placeholders {
		placeholders[i] = dcPlaceholder(side.dbType, i+1)
	}
	stmt := "INSERT INTO " + quoteIdent(table, side.dbType) +
		" (id, no, amount, qty, flag_col, note, created_at, created_tz, payload) VALUES (" +
		strings.Join(placeholders, ", ") + ")"
	for _, r := range rows {
		_, err := side.exec.ExecContext(context.Background(), stmt, r...)
		require.NoError(t, err, "insert id %v", r[0])
	}
}

// dcApplySync 在目标库上执行生成的同步脚本（纯字面量，直接跑）
func dcApplySync(t *testing.T, tgt dcRealSide, result *models.DataCompareResult) {
	t.Helper()
	require.False(t, result.SQLTruncated)
	assert.Equal(t, models.DataCompareSQLCounts{Update: 2, Insert: 1, Delete: 2}, result.SQLCounts)
	for _, stmt := range dcStatements(result.SQL) {
		_, err := tgt.exec.ExecContext(context.Background(), stmt)
		require.NoError(t, err, "exec %q", stmt)
	}
}

// dcStatements 把脚本拆成一条条可执行的语句：先去掉注释行，再按 ";\n" 切
// （开头的说明注释和第一条语句在同一段里，不能整段当成注释丢掉）
func dcStatements(sql string) []string {
	var body strings.Builder
	for _, line := range strings.Split(sql, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "--") {
			continue
		}
		body.WriteString(line)
		body.WriteByte('\n')
	}
	out := []string{}
	for _, stmt := range strings.Split(body.String(), ";\n") {
		if stmt = strings.TrimSpace(stmt); stmt != "" {
			out = append(out, stmt)
		}
	}
	return out
}

// dcTrickyText 带引号、反斜杠、换行的文本：两种库的字符串转义规则不同，同步脚本必须各自转对
const dcTrickyText = "it's a \"quote\" \\ back\nnext"

var (
	dcBinSame     = []byte{0x00, 0xFF, 0x10}
	dcBinInsert   = []byte{0xDE, 0xAD, 0xBE, 0xEF}
	dcBinModified = []byte{0xFF, 0x00}
)

// dcSample 源表与目标表的数据：
//
//	id 1     两边相同（含二进制和带时区的时间）
//	id 2     note 不同（源是含引号 / 反斜杠 / 换行的文本）
//	id 4     只在源表（带二进制，检验 INSERT 里的二进制字面量）
//	id 6     amount / flag / created_tz / payload 不同（检验 UPDATE 里的二进制、带时区时间）
//	id 3、5  只在目标表
func dcSample(flagOn, flagOff any) (source, target [][]any) {
	source = [][]any{
		{1, "A", "12.50", 3, flagOn, "same", "2024-01-01 10:20:30", "2024-03-01 12:00:00", dcBinSame},
		{2, "B", "20.00", 1, flagOn, dcTrickyText, "2024-02-02 02:00:00", "2024-04-01 00:00:00", nil},
		{4, "D", "7.25", 9, flagOn, nil, nil, nil, dcBinInsert},
		{6, "F", "99.99", 1, flagOn, "x", nil, "2024-06-01 08:00:00", dcBinModified},
	}
	target = [][]any{
		{1, "A", "12.50", 3, flagOn, "same", "2024-01-01 10:20:30", "2024-03-01 12:00:00", dcBinSame},
		{2, "B", "20.00", 1, flagOn, "old note", "2024-02-02 02:00:00", "2024-04-01 00:00:00", nil},
		{3, "C", "5.00", 1, flagOn, nil, nil, nil, nil},
		{5, "E", "5.00", 1, flagOn, nil, nil, nil, nil},
		{6, "F", "10.00", 1, flagOff, "x", nil, "2024-05-01 08:00:00", nil},
	}
	return source, target
}

func dcChangedColumns(m models.DataCompareModified) []string {
	out := []string{}
	for _, c := range m.Changes {
		out = append(out, c.Column)
	}
	return out
}

// dcAssertDiff 核对一次比对结果（三个方向共用）
func dcAssertDiff(t *testing.T, result *models.DataCompareResult) {
	t.Helper()
	assert.Equal(t, []string{"id"}, result.KeyColumns)
	assert.Equal(t, []string{"no", "amount", "qty", "flag_col", "note", "created_at", "created_tz", "payload"},
		result.CompareColumns)
	assert.Empty(t, result.SourceOnlyColumns)
	assert.Empty(t, result.TargetOnlyColumns)
	assert.Empty(t, result.Warnings)
	assert.False(t, result.Truncated)

	assert.Equal(t, 4, result.SourceRows)
	assert.Equal(t, 5, result.TargetRows)
	assert.Equal(t, 1, result.SameCount, "id 1")
	assert.Equal(t, 2, result.ModifiedCount, "id 2、6")
	assert.Equal(t, 1, result.SourceOnlyCount, "id 4")
	assert.Equal(t, 2, result.TargetOnlyCount, "id 3、5")

	require.Len(t, result.Modified, 2)
	assert.Equal(t, "2", result.Modified[0].Key["id"].Value)
	assert.Equal(t, []string{"note"}, dcChangedColumns(result.Modified[0]))
	assert.Equal(t, dcTrickyText, result.Modified[0].Changes[0].Source.Value)
	assert.Equal(t, "old note", result.Modified[0].Changes[0].Target.Value)

	assert.Equal(t, "6", result.Modified[1].Key["id"].Value)
	assert.Equal(t, []string{"amount", "flag_col", "created_tz", "payload"}, dcChangedColumns(result.Modified[1]))
	amount := result.Modified[1].Changes[0]
	assert.Equal(t, "99.99", amount.Source.Value)
	assert.Equal(t, "10.00", amount.Target.Value)

	require.Len(t, result.SourceOnly, 1)
	assert.Equal(t, "4", result.SourceOnly[0].Key["id"].Value)
	assert.Equal(t, "D", result.SourceOnly[0].Row["no"].Value)
	require.Len(t, result.TargetOnly, 2)
	assert.Equal(t, "3", result.TargetOnly[0].Key["id"].Value)
	assert.Equal(t, "5", result.TargetOnly[1].Key["id"].Value)
}

// dcAssertSynced 同步之后再比：应当完全一致，不再生成语句
func dcAssertSynced(t *testing.T, result *models.DataCompareResult) {
	t.Helper()
	assert.Equal(t, 4, result.SameCount)
	assert.Zero(t, result.ModifiedCount+result.SourceOnlyCount+result.TargetOnlyCount)
	assert.Empty(t, result.SQL)
}

// dcTrickyText 在两种方言里的字面量：MySQL 默认把反斜杠当转义符（要写成两个），PG 默认不当（原样一个）
const dcNoteLiteralMySQL = `'it''s a "quote" \\ back` + "\n" + `next'`
const dcNoteLiteralPG = `'it''s a "quote" \ back` + "\n" + `next'`

func TestRealDataCompareMySQL(t *testing.T) {
	h := &Handler{mgr: db.NewManager(), tunnel: NewTunnelManager()}
	side := setupRealDC(t, h, "mysql", "IDBLINK_TX_SMOKE_MYSQL", "IDBLINK_TX_MYSQL",
		"127.0.0.1:13306", "testuser", "testpass", "testdb")
	source, target := dcSample(int64(1), int64(0))
	dcInsertRows(t, side, "dc_src", source)
	dcInsertRows(t, side, "dc_tgt", target)

	result := dcCompare(t, h, side, side)
	dcAssertDiff(t, result)

	// DECIMAL 在 MySQL 驱动里是字节串：按文本写成带引号的字面量，库会转成列类型
	assert.Contains(t, result.SQL, "UPDATE `dc_tgt` SET `no` = 'B', `amount` = '20.00', `qty` = 1,")
	assert.Contains(t, result.SQL, "`note` = "+dcNoteLiteralMySQL+
		", `created_at` = '2024-02-02 02:00:00', `created_tz` = '2024-04-01 00:00:00', "+
		"`payload` = NULL WHERE `id` = 2;")
	assert.Contains(t, result.SQL, "`payload` = 0xff00 WHERE `id` = 6;", "BLOB 写成十六进制字面量")
	assert.Regexp(t, regexp.MustCompile(
		"INSERT INTO `dc_tgt` \\(`id`, `no`, `amount`, `qty`, `flag_col`, `note`, `created_at`, `created_tz`, `payload`\\) "+
			"VALUES \\(4, 'D', '7\\.25', 9, (TRUE|1), NULL, NULL, NULL, 0xdeadbeef\\);"), result.SQL)
	assert.Contains(t, result.SQL, "DELETE FROM `dc_tgt` WHERE `id` = 3;")

	dcApplySync(t, side, result)
	dcAssertSynced(t, dcCompare(t, h, side, side))
}

func TestRealDataComparePostgreSQL(t *testing.T) {
	h := &Handler{mgr: db.NewManager(), tunnel: NewTunnelManager()}
	side := setupRealDC(t, h, "postgresql", "IDBLINK_TX_SMOKE_PG", "IDBLINK_TX_PG",
		"127.0.0.1:15432", "testuser", "testpassword", "testdb")
	source, target := dcSample(true, false)
	dcInsertRows(t, side, "dc_src", source)
	dcInsertRows(t, side, "dc_tgt", target)

	result := dcCompare(t, h, side, side)
	dcAssertDiff(t, result)

	assert.Contains(t, result.SQL, `UPDATE "public"."dc_tgt" SET "no" = 'B', "amount" = '20.00', "qty" = 1,`)
	assert.Contains(t, result.SQL, `"note" = `+dcNoteLiteralPG+
		`, "created_at" = '2024-02-02 02:00:00', "created_tz" = '2024-04-01 00:00:00+00:00', `+
		`"payload" = NULL WHERE "id" = 2;`, "timestamptz 列带偏移量写入")
	assert.Contains(t, result.SQL, `"payload" = '\xff00'::bytea WHERE "id" = 6;`, "BYTEA 字面量")
	assert.Contains(t, result.SQL,
		`INSERT INTO "public"."dc_tgt" ("id", "no", "amount", "qty", "flag_col", "note", "created_at", "created_tz", "payload") VALUES (4, 'D', '7.25', 9, TRUE, NULL, NULL, NULL, '\xdeadbeef'::bytea);`)
	assert.Contains(t, result.SQL, `DELETE FROM "public"."dc_tgt" WHERE "id" = 3;`)

	dcApplySync(t, side, result)
	dcAssertSynced(t, dcCompare(t, h, side, side))
}

// 跨库：源是 MySQL，目标是 PG。检验值的归一化（DECIMAL 字节串对 numeric、DATETIME 文本对
// timestamp、TINYINT(1) 对 boolean、BLOB 对 bytea）和按目标方言生成字面量。
func TestRealDataCompareMySQLToPostgreSQL(t *testing.T) {
	h := &Handler{mgr: db.NewManager(), tunnel: NewTunnelManager()}
	mysqlSide := setupRealDC(t, h, "mysql", "IDBLINK_TX_SMOKE_MYSQL", "IDBLINK_TX_MYSQL",
		"127.0.0.1:13306", "testuser", "testpass", "testdb")
	pgSide := setupRealDC(t, h, "postgresql", "IDBLINK_TX_SMOKE_PG", "IDBLINK_TX_PG",
		"127.0.0.1:15432", "testuser", "testpassword", "testdb")
	source, _ := dcSample(int64(1), int64(0))
	dcInsertRows(t, mysqlSide, "dc_src", source)
	_, pgTarget := dcSample(true, false)
	dcInsertRows(t, pgSide, "dc_tgt", pgTarget)

	result := dcCompare(t, h, mysqlSide, pgSide)
	dcAssertDiff(t, result)

	// 源是 MySQL：反斜杠按 PG 规则原样写；时间是文本，照原样写（不带偏移量）
	assert.Contains(t, result.SQL, `UPDATE "public"."dc_tgt" SET "no" = 'B', "amount" = '20.00', "qty" = 1,`)
	assert.Contains(t, result.SQL, `"note" = `+dcNoteLiteralPG+
		`, "created_at" = '2024-02-02 02:00:00', "created_tz" = '2024-04-01 00:00:00', `+
		`"payload" = NULL WHERE "id" = 2;`)
	assert.Contains(t, result.SQL, `"payload" = '\xff00'::bytea WHERE "id" = 6;`, "BLOB → bytea")
	assert.Contains(t, result.SQL,
		`INSERT INTO "public"."dc_tgt" ("id", "no", "amount", "qty", "flag_col", "note", "created_at", "created_tz", "payload") VALUES (4, 'D', '7.25', 9, TRUE, NULL, NULL, NULL, '\xdeadbeef'::bytea);`)

	dcApplySync(t, pgSide, result)
	dcAssertSynced(t, dcCompare(t, h, mysqlSide, pgSide))
}

// PG 的表不一定在 public、也不一定在 search_path 上：没指定 schema 时自己定位；
// 别的 schema 里有同名表时，不能把两份结构并成一份
func TestRealDataComparePostgreSQLResolvesSchema(t *testing.T) {
	h := &Handler{mgr: db.NewManager(), tunnel: NewTunnelManager()}
	side := setupRealDC(t, h, "postgresql", "IDBLINK_TX_SMOKE_PG", "IDBLINK_TX_PG",
		"127.0.0.1:15432", "testuser", "testpassword", "testdb")
	execAll(t, side.exec, []string{
		"DROP SCHEMA IF EXISTS dc_other CASCADE",
		"CREATE SCHEMA dc_other",
		"CREATE TABLE dc_other.dc_tgt (id INT PRIMARY KEY, other_col TEXT)",
	})
	t.Cleanup(func() { _, _ = side.exec.ExecContext(context.Background(), "DROP SCHEMA IF EXISTS dc_other CASCADE") })
	// 第 2 行两边内容不同：这样才会有脚本，可以断言脚本里的表名
	source, target := dcSample(true, false)
	dcInsertRows(t, side, "dc_src", source[1:2])
	dcInsertRows(t, side, "dc_tgt", target[1:2])
	_, err := side.exec.ExecContext(context.Background(), "INSERT INTO dc_other.dc_tgt VALUES (1, 'other schema')")
	require.NoError(t, err)

	compare := func(mutate func(*models.DataCompareRequest)) (*models.DataCompareResult, error) {
		req := &models.DataCompareRequest{
			SourceConnectionID: side.connID, SourceDatabase: side.database, SourceTable: "dc_src",
			TargetConnectionID: side.connID, TargetDatabase: side.database, TargetTable: "dc_tgt",
		}
		if mutate != nil {
			mutate(req)
		}
		return h.CompareTableData(context.Background(), req)
	}

	// 没指定 schema：落在 public，同名的那张没有混进来
	result, err := compare(nil)
	require.NoError(t, err)
	assert.Contains(t, result.CompareColumns, "no", "用的是 public 里那张表的结构")
	assert.NotContains(t, result.CompareColumns, "other_col")
	assert.Equal(t, 1, result.TargetRows, "另一个 schema 里的行不算")
	assert.Contains(t, result.SQL, `"public"."dc_tgt"`, "脚本里的表名带 schema")

	// 指定了 schema：用的是那边的表
	result, err = compare(func(r *models.DataCompareRequest) { r.TargetSchema = "dc_other" })
	require.NoError(t, err)
	assert.Empty(t, result.CompareColumns, "和 dc_other.dc_tgt 没有共有的非键列")
	assert.Equal(t, []string{"other_col"}, result.TargetOnlyColumns)
	assert.Contains(t, result.SourceOnlyColumns, "no")

	// 指定了不存在的位置：明确报错，而不是悄悄退回别的 schema
	_, err = compare(func(r *models.DataCompareRequest) { r.TargetSchema = "nowhere" })
	require.Error(t, err)
	assert.Contains(t, err.Error(), "nowhere")
}

// 目标表的生成列由数据库自己算，不能赋值（MySQL 直接拒绝，错误 3105）：
// 不参与对比和同步，脚本里也不能出现它，其余语句照常能在目标库上跑通
func TestRealDataCompareMySQLSkipsGeneratedTargetColumn(t *testing.T) {
	h := &Handler{mgr: db.NewManager(), tunnel: NewTunnelManager()}
	side := setupRealDC(t, h, "mysql", "IDBLINK_TX_SMOKE_MYSQL", "IDBLINK_TX_MYSQL",
		"127.0.0.1:13306", "testuser", "testpass", "testdb")
	_, err := side.exec.ExecContext(context.Background(),
		"ALTER TABLE dc_tgt ADD COLUMN no_upper VARCHAR(64) GENERATED ALWAYS AS (UPPER(`no`)) VIRTUAL")
	require.NoError(t, err)
	source, target := dcSample(int64(1), int64(0))
	dcInsertRows(t, side, "dc_src", source)
	dcInsertRows(t, side, "dc_tgt", target)

	result := dcCompare(t, h, side, side)

	assert.Equal(t, []string{"no", "amount", "qty", "flag_col", "note", "created_at", "created_tz", "payload"},
		result.CompareColumns)
	assert.Equal(t, []string{"no_upper"}, result.TargetOnlyColumns)
	assert.Equal(t, 2, result.ModifiedCount, "生成列不参与对比，差异只来自真正的列")
	assert.NotContains(t, result.SQL, "no_upper")

	dcApplySync(t, side, result)
	dcAssertSynced(t, dcCompare(t, h, side, side))
}
