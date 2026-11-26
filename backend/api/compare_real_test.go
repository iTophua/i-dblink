package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"idblink/backend/db"
	"idblink/backend/models"
)

// ── 真实库上的结构比较 ──
//
//	IDBLINK_TX_SMOKE_MYSQL=1 IDBLINK_TX_SMOKE_PG=1 go test ./backend/api -run RealCompareSchema -v
//
// 同一个连接上的两个库：A 是源、B 是目标。B 的表缺列、缺索引、缺外键，也多出一些东西。
// 除了比对结果，还要把生成的同步 SQL 真的在 B 上跑一遍再回比——回比后不该再有「缺失」。
//
// MySQL 的两个库由 backend/testdata/mysql-test.sql 建好并授权给 testuser；PG 的两个库由测试自己建。

const (
	compareDBA = "idblink_compare_a"
	compareDBB = "idblink_compare_b"
)

// dropAllMySQLTables 清空一个 MySQL 库里的全部表。有外键的表要等引用它的表删掉后才能删，所以多试几轮
func dropAllMySQLTables(ctx context.Context, exec db.Executor) {
	for pass := 0; pass < 4; pass++ {
		rows, err := exec.QueryContext(ctx, "SHOW TABLES")
		if err != nil {
			return
		}
		var names []string
		for rows.Next() {
			var name string
			if rows.Scan(&name) == nil {
				names = append(names, name)
			}
		}
		_ = rows.Close()
		if len(names) == 0 {
			return
		}
		for _, name := range names {
			_, _ = exec.ExecContext(ctx, "DROP TABLE IF EXISTS `"+strings.ReplaceAll(name, "`", "``")+"`")
		}
	}
}

// compareExpectation 两种方言下同一组建表语句，以及期望生成的同步语句里的写法
type compareExpectation struct {
	a, b             []string
	quote            string
	decimal, varchar string
	defaultNew       string
}

func compareFixture(dialect string) compareExpectation {
	switch dialect {
	case "postgresql":
		return compareExpectation{
			quote: `"`, decimal: "numeric(10,2)", varchar: "character varying(16)",
			defaultNew: "'new'::character varying",
			a: []string{
				"CREATE TABLE cmp_parent (id INT PRIMARY KEY, code VARCHAR(16) UNIQUE, note VARCHAR(64))",
				"CREATE TABLE cmp_pair (a INT NOT NULL, b INT NOT NULL, PRIMARY KEY (a, b))",
				"CREATE TABLE cmp_item (id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, price NUMERIC(10,2), " +
					"label VARCHAR(32) DEFAULT 'none', created_at TIMESTAMP DEFAULT now(), " +
					"cat_id INT, a INT, b INT, extra VARCHAR(16) DEFAULT 'new', " +
					"CONSTRAINT uk_item_name UNIQUE (name), " +
					"CONSTRAINT fk_item_cat FOREIGN KEY (cat_id) REFERENCES cmp_parent (id), " +
					"CONSTRAINT fk_pair FOREIGN KEY (a, b) REFERENCES cmp_pair (a, b))",
				// 列序故意和表里的列序相反：索引的列必须按索引里的顺序取
				"CREATE INDEX idx_ba ON cmp_item (b, a)",
				"CREATE TABLE cmp_only_in_a (id INT PRIMARY KEY)",
				"CREATE TABLE cmp_same (id INT PRIMARY KEY, v VARCHAR(10))",
			},
			b: []string{
				"CREATE TABLE cmp_parent (id INT PRIMARY KEY, code VARCHAR(16) UNIQUE, note VARCHAR(64))",
				"CREATE TABLE cmp_pair (a INT NOT NULL, b INT NOT NULL, PRIMARY KEY (a, b))",
				"CREATE TABLE cmp_item (id INT PRIMARY KEY, name VARCHAR(32) NOT NULL, " +
					"label VARCHAR(32) DEFAULT 'other', created_at TIMESTAMP DEFAULT now(), " +
					"cat_id INT, a INT, b INT, legacy INT, " +
					"CONSTRAINT fk_cat FOREIGN KEY (cat_id) REFERENCES cmp_parent (id))",
				"CREATE INDEX idx_legacy ON cmp_item (legacy)",
				"CREATE TABLE cmp_only_in_b (id INT PRIMARY KEY)",
				"CREATE TABLE cmp_same (id INT PRIMARY KEY, v VARCHAR(10))",
			},
		}
	default:
		return compareExpectation{
			quote: "`", decimal: "decimal(10,2)", varchar: "varchar(16)", defaultNew: "'new'",
			a: []string{
				"CREATE TABLE cmp_parent (id INT PRIMARY KEY, code VARCHAR(16) UNIQUE, note VARCHAR(64))",
				"CREATE TABLE cmp_pair (a INT NOT NULL, b INT NOT NULL, PRIMARY KEY (a, b))",
				"CREATE TABLE cmp_item (id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, price DECIMAL(10,2), " +
					"label VARCHAR(32) DEFAULT 'none', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, " +
					"cat_id INT, a INT, b INT, extra VARCHAR(16) DEFAULT 'new', " +
					"UNIQUE KEY uk_item_name (name), KEY idx_ba (b, a), " +
					"CONSTRAINT fk_item_cat FOREIGN KEY (cat_id) REFERENCES cmp_parent (id), " +
					"CONSTRAINT fk_pair FOREIGN KEY (a, b) REFERENCES cmp_pair (a, b))",
				"CREATE TABLE cmp_only_in_a (id INT PRIMARY KEY)",
				"CREATE TABLE cmp_same (id INT PRIMARY KEY, v VARCHAR(10))",
			},
			b: []string{
				"CREATE TABLE cmp_parent (id INT PRIMARY KEY, code VARCHAR(16) UNIQUE, note VARCHAR(64))",
				"CREATE TABLE cmp_pair (a INT NOT NULL, b INT NOT NULL, PRIMARY KEY (a, b))",
				"CREATE TABLE cmp_item (id INT PRIMARY KEY, name VARCHAR(32) NOT NULL, " +
					"label VARCHAR(32) DEFAULT 'other', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, " +
					"cat_id INT, a INT, b INT, legacy INT, " +
					"KEY idx_legacy (legacy), " +
					"CONSTRAINT fk_cat FOREIGN KEY (cat_id) REFERENCES cmp_parent (id))",
				"CREATE TABLE cmp_only_in_b (id INT PRIMARY KEY)",
				"CREATE TABLE cmp_same (id INT PRIMARY KEY, v VARCHAR(10))",
			},
		}
	}
}

// realCompareSetup 在同一个实例上准备好两个库，返回处理器、连接 ID、连到源库和目标库的执行器
func realCompareSetup(t *testing.T, target realTarget) (*Handler, string, db.Executor, db.Executor, compareExpectation) {
	t.Helper()
	host, portText, _ := strings.Cut(target.addr, ":")
	port, err := strconv.Atoi(portText)
	require.NoError(t, err)
	args := db.ConnectArgs{
		DbType: target.dbType, Host: host, Port: port,
		Username: target.user, Password: target.pass, Database: target.dbName,
	}

	manager := db.NewManager()
	handler := &Handler{mgr: manager, tunnel: NewTunnelManager()}
	connID := "compare-real-" + target.dbType
	require.NoError(t, manager.Connect(connID, args))
	isPG := target.dbType == "postgresql"
	t.Cleanup(func() {
		// 断开主连接会顺带关掉按库打开的连接池，PG 的库才删得掉
		_ = manager.Disconnect(connID)
		cleanup := db.NewManager()
		if cleanup.Connect("compare-cleanup", args) != nil {
			return
		}
		defer cleanup.Disconnect("compare-cleanup")
		if isPG {
			admin, err := cleanup.GetExecutor("compare-cleanup", "")
			require.NoError(t, err)
			for _, name := range []string{compareDBA, compareDBB} {
				_, _ = admin.ExecContext(context.Background(), "DROP DATABASE IF EXISTS "+name)
			}
			return
		}
		// MySQL 的库是初始化脚本建的，留着；只清表
		for _, name := range []string{compareDBA, compareDBB} {
			if exec, err := cleanup.GetExecutor("compare-cleanup", name); err == nil {
				dropAllMySQLTables(context.Background(), exec)
			}
		}
	})

	base, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	if isPG {
		for _, name := range []string{compareDBA, compareDBB} {
			_, _ = base.ExecContext(context.Background(), "DROP DATABASE IF EXISTS "+name)
			_, err = base.ExecContext(context.Background(), "CREATE DATABASE "+name)
			require.NoError(t, err)
		}
	}

	execA, err := manager.GetExecutor(connID, compareDBA)
	require.NoError(t, err)
	execB, err := manager.GetExecutor(connID, compareDBB)
	require.NoError(t, err)
	dropAllMySQLTables(context.Background(), execA)
	dropAllMySQLTables(context.Background(), execB)
	fixture := compareFixture(target.dbType)
	execAll(t, execA, fixture.a)
	execAll(t, execB, fixture.b)
	return handler, connID, execA, execB, fixture
}

func realCompareCall(t *testing.T, handler *Handler, sourceConn, sourceDB, targetConn, targetDB, table string) CompareSchemaResponse {
	t.Helper()
	body, err := json.Marshal(CompareSchemaRequest{
		SourceConnID: sourceConn, SourceDB: sourceDB,
		TargetConnID: targetConn, TargetDB: targetDB, TableName: table,
	})
	require.NoError(t, err)
	rec := httptest.NewRecorder()
	handler.CompareSchema(rec, httptest.NewRequest(http.MethodPost, "/compare-schema", bytes.NewReader(body)))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var resp CompareSchemaResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp), rec.Body.String())
	return resp
}

// executable 只留真正会发给目标库的语句（和前端 syncStatements 同样的规则：注释行不算）
func executable(alterSQL []string) []string {
	var out []string
	for _, entry := range alterSQL {
		lines := strings.Split(entry, "\n")
		commentOnly := true
		for _, line := range lines {
			if !strings.HasPrefix(strings.TrimSpace(line), "--") {
				commentOnly = false
				break
			}
		}
		if !commentOnly {
			out = append(out, entry)
		}
	}
	return out
}

func diffNames[T any](list []T, name func(T) string) []string {
	out := make([]string, len(list))
	for i, item := range list {
		out[i] = name(item)
	}
	return out
}

func realCompareAssertAtoB(t *testing.T, handler *Handler, connID string, fixture compareExpectation) CompareSchemaResponse {
	t.Helper()
	resp := realCompareCall(t, handler, connID, compareDBA, connID, compareDBB, "")
	require.Empty(t, resp.Errors)
	assert.True(t, resp.SyncSupported, "同一种库之间应该允许执行同步")
	assert.Equal(t, []string{"cmp_only_in_b"}, resp.TargetOnlyTables, "目标库独有的表只是告知")

	names := make([]string, len(resp.Diffs))
	for i, diff := range resp.Diffs {
		names[i] = diff.TableName
	}
	assert.Equal(t, []string{"cmp_item", "cmp_only_in_a"}, names, "相同的表不列出")

	item := resp.Diffs[0]
	assert.Equal(t, []string{"legacy", "label", "name", "extra", "price"},
		diffNames(item.ColumnDiffs, func(d SchemaDiffColumn) string { return d.ColumnName }), "多出 → 不同 → 缺失，同类按名字")
	columns := map[string]SchemaDiffColumn{}
	for _, c := range item.ColumnDiffs {
		columns[c.ColumnName] = c
	}
	assert.Equal(t, "added", columns["legacy"].DiffType)
	assert.Equal(t, "modified", columns["name"].DiffType, "varchar(64) 与 varchar(32) 是不同的定义")
	assert.Equal(t, "modified", columns["label"].DiffType)
	assert.Equal(t, "missing", columns["extra"].DiffType)
	assert.Equal(t, "missing", columns["price"].DiffType)

	assert.Equal(t, []string{"idx_legacy", "idx_ba", "uk_item_name"},
		diffNames(item.IndexDiffs, func(d SchemaDiffIndex) string { return d.IndexName }))
	indexes := map[string]SchemaDiffIndex{}
	for _, d := range item.IndexDiffs {
		indexes[d.IndexName] = d
	}
	assert.Equal(t, "added", indexes["idx_legacy"].DiffType)
	assert.Equal(t, "missing", indexes["idx_ba"].DiffType)
	assert.Equal(t, []string{"b", "a"}, indexes["idx_ba"].ColumnNames, "按索引里的列序，不是表里的列序")
	assert.Equal(t, "missing", indexes["uk_item_name"].DiffType)
	assert.True(t, indexes["uk_item_name"].IsUnique)

	require.Len(t, item.ForeignKeyDiffs, 1, "名字不同、定义相同的 fk_item_cat / fk_cat 不算差异：%+v", item.ForeignKeyDiffs)
	fk := item.ForeignKeyDiffs[0]
	assert.Equal(t, "fk_pair", fk.ConstraintName)
	assert.Equal(t, []string{"a", "b"}, fk.ColumnNames)
	assert.Equal(t, "cmp_pair", fk.ReferencedTable)
	assert.Equal(t, []string{"a", "b"}, fk.ReferencedColumns)

	missingTable := resp.Diffs[1]
	assert.True(t, missingTable.TableMissing)
	assert.Empty(t, executable(missingTable.AlterSQL), "缺表只给提示，不给可执行语句")

	q := func(name string) string { return fixture.quote + name + fixture.quote }
	// 先补列、再建索引、最后加外键；同类里按名字排序
	assert.Equal(t, []string{
		"ALTER TABLE " + q("cmp_item") + " ADD COLUMN " + q("extra") + " " + fixture.varchar + " NULL DEFAULT " + fixture.defaultNew,
		"ALTER TABLE " + q("cmp_item") + " ADD COLUMN " + q("price") + " " + fixture.decimal + " NULL",
		"CREATE INDEX " + q("idx_ba") + " ON " + q("cmp_item") + " (" + q("b") + ", " + q("a") + ")",
		"CREATE UNIQUE INDEX " + q("uk_item_name") + " ON " + q("cmp_item") + " (" + q("name") + ")",
		"ALTER TABLE " + q("cmp_item") + " ADD CONSTRAINT " + q("fk_pair") + " FOREIGN KEY (" + q("a") + ", " + q("b") +
			") REFERENCES " + q("cmp_pair") + " (" + q("a") + ", " + q("b") + ")",
	}, executable(item.AlterSQL))
	return resp
}

// realCompareRoundTrip 把同步语句在目标库上执行，再比一次：不该再有「缺失」
func realCompareRoundTrip(t *testing.T, handler *Handler, connID string, target db.Executor, first CompareSchemaResponse) {
	t.Helper()
	for _, diff := range first.Diffs {
		for _, statement := range executable(diff.AlterSQL) {
			_, err := target.ExecContext(context.Background(), statement)
			require.NoError(t, err, "同步语句在目标库上执行失败：%s", statement)
		}
	}

	again := realCompareCall(t, handler, connID, compareDBA, connID, compareDBB, "")
	require.Empty(t, again.Errors)
	for _, diff := range again.Diffs {
		for _, c := range diff.ColumnDiffs {
			assert.NotEqual(t, "missing", c.DiffType, "回比后 %s 的列 %s 仍缺失", diff.TableName, c.ColumnName)
		}
		for _, d := range diff.IndexDiffs {
			assert.NotEqual(t, "missing", d.DiffType, "回比后 %s 的索引 %s 仍缺失", diff.TableName, d.IndexName)
		}
		assert.Empty(t, diff.ForeignKeyDiffs, "回比后 %s 仍有外键差异：%+v", diff.TableName, diff.ForeignKeyDiffs)
		assert.Empty(t, executable(diff.AlterSQL), "回比后不该还有可执行语句：%v", diff.AlterSQL)
	}

	// 目标库多出的、两边不同的还在，但都只是注释
	item := again.Diffs[0]
	assert.Equal(t, "cmp_item", item.TableName)
	assert.Equal(t, []string{"legacy", "label", "name"},
		diffNames(item.ColumnDiffs, func(d SchemaDiffColumn) string { return d.ColumnName }))
	assert.Equal(t, "cmp_only_in_a", again.Diffs[1].TableName, "缺的表还在缺：同步不负责建表")
}

func TestRealCompareSchemaMySQL(t *testing.T) {
	target := realERTarget(t, "mysql", "IDBLINK_TX_SMOKE_MYSQL", "IDBLINK_TX_MYSQL",
		"127.0.0.1:13306", "testuser", "testpass", "testdb")
	handler, connID, _, execB, fixture := realCompareSetup(t, target)
	resp := realCompareAssertAtoB(t, handler, connID, fixture)
	realCompareRoundTrip(t, handler, connID, execB, resp)
}

func TestRealCompareSchemaPostgreSQL(t *testing.T) {
	target := realERTarget(t, "postgresql", "IDBLINK_TX_SMOKE_PG", "IDBLINK_TX_PG",
		"127.0.0.1:15432", "testuser", "testpassword", "testdb")
	handler, connID, _, execB, fixture := realCompareSetup(t, target)
	resp := realCompareAssertAtoB(t, handler, connID, fixture)
	realCompareRoundTrip(t, handler, connID, execB, resp)
}

// 不同种类的库之间（MySQL → PG）：能比，但语句里的类型、默认值没做方言转换，必须标成不能执行
func TestRealCompareSchemaCrossDialect(t *testing.T) {
	if os.Getenv("IDBLINK_TX_SMOKE_MYSQL") != "1" || os.Getenv("IDBLINK_TX_SMOKE_PG") != "1" {
		t.Skip("set IDBLINK_TX_SMOKE_MYSQL=1 and IDBLINK_TX_SMOKE_PG=1 to run")
	}
	handler, mysqlConn, _, _, _ := realCompareSetup(t, realERTarget(t, "mysql", "IDBLINK_TX_SMOKE_MYSQL", "IDBLINK_TX_MYSQL",
		"127.0.0.1:13306", "testuser", "testpass", "testdb"))
	_, pgConn, _, _, _ := realCompareSetup(t, realERTarget(t, "postgresql", "IDBLINK_TX_SMOKE_PG", "IDBLINK_TX_PG",
		"127.0.0.1:15432", "testuser", "testpassword", "testdb"))

	resp := realCompareCall(t, handler, mysqlConn, compareDBA, pgConn, compareDBB, "")
	require.Empty(t, resp.Errors)
	assert.False(t, resp.SyncSupported)
	// 这两组表两边列名相同：差异只有类型名写法不同（int 与 integer），都只该是注释
	for _, diff := range resp.Diffs {
		for _, c := range diff.ColumnDiffs {
			assert.NotEqual(t, "missing", c.DiffType, "%s.%s", diff.TableName, c.ColumnName)
		}
		assert.Empty(t, executable(diff.AlterSQL), "%s 不该有可执行语句：%v", diff.TableName, diff.AlterSQL)
	}
}

// ── 表结构页的元数据（结构比较复用它们，这里直接断言查询本身） ──
//
//	IDBLINK_TX_SMOKE_MYSQL=1 IDBLINK_TX_SMOKE_PG=1 go test ./backend/api -run RealStructureMetadata -v

type indexCell struct{ index, column string }

func indexRows(indexes []models.IndexInfo) map[indexCell]models.IndexInfo {
	out := make(map[indexCell]models.IndexInfo, len(indexes))
	for _, index := range indexes {
		out[indexCell{index.IndexName, index.ColumnName}] = index
	}
	return out
}

func TestRealStructureMetadataPostgreSQL(t *testing.T) {
	target := realERTarget(t, "postgresql", "IDBLINK_TX_SMOKE_PG", "IDBLINK_TX_PG",
		"127.0.0.1:15432", "testuser", "testpassword", "testdb")
	_, _, execA, _, _ := realCompareSetup(t, target)
	ctx := context.Background()

	structure, err := postgresGetTableStructure(ctx, execA, "cmp_item", nil, strPtr("public"))
	require.NoError(t, err)

	names := make([]string, len(structure.Columns))
	for i, column := range structure.Columns {
		names[i] = column.ColumnName
	}
	// id 同属主键和另一个索引：以前每多一个索引就多出一行
	assert.Equal(t, []string{"id", "name", "price", "label", "created_at", "cat_id", "a", "b", "extra"}, names)
	assert.Equal(t, "PRI", deref(structure.Columns[0].ColumnKey))

	indexes := indexRows(structure.Indexes)
	assert.Equal(t, int64(1), indexes[indexCell{"idx_ba", "b"}].SeqInIndex, "索引里的列序是 (b, a)")
	assert.Equal(t, int64(2), indexes[indexCell{"idx_ba", "a"}].SeqInIndex)
	assert.True(t, indexes[indexCell{"cmp_item_pkey", "id"}].IsPrimary)
	assert.True(t, indexes[indexCell{"uk_item_name", "name"}].IsUnique)

	// 复合外键按位置配对，两列就是两行
	type fkKey struct{ constraint, column string }
	fks := map[fkKey]models.ForeignKeyInfo{}
	for _, fk := range structure.ForeignKeys {
		fks[fkKey{fk.ConstraintName, fk.ColumnName}] = fk
	}
	assert.Len(t, fks, 3, "%+v", structure.ForeignKeys)
	assert.Equal(t, "cmp_pair", fks[fkKey{"fk_pair", "a"}].ReferencedTable)
	assert.Equal(t, "a", fks[fkKey{"fk_pair", "a"}].ReferencedColumn)
	assert.Equal(t, "b", fks[fkKey{"fk_pair", "b"}].ReferencedColumn)
	assert.Equal(t, "id", fks[fkKey{"fk_item_cat", "cat_id"}].ReferencedColumn)
}

func TestRealStructureMetadataMySQL(t *testing.T) {
	target := realERTarget(t, "mysql", "IDBLINK_TX_SMOKE_MYSQL", "IDBLINK_TX_MYSQL",
		"127.0.0.1:13306", "testuser", "testpass", "testdb")
	_, _, execA, _, _ := realCompareSetup(t, target)
	ctx := context.Background()

	structure, err := mysqlGetTableStructure(ctx, execA, "cmp_item", strPtr(compareDBA))
	require.NoError(t, err)
	require.NotEmpty(t, structure.Columns)

	// MySQL 8.0 的 SHOW INDEX 有 15 列：以前按 11 列取值，索引列表一直是空的
	require.Len(t, structure.Indexes, 7, "%+v", structure.Indexes)
	indexes := indexRows(structure.Indexes)
	assert.Equal(t, int64(1), indexes[indexCell{"idx_ba", "b"}].SeqInIndex)
	assert.Equal(t, int64(2), indexes[indexCell{"idx_ba", "a"}].SeqInIndex)
	assert.True(t, indexes[indexCell{"uk_item_name", "name"}].IsUnique)
	assert.False(t, indexes[indexCell{"uk_item_name", "name"}].IsPrimary)
	assert.True(t, indexes[indexCell{"PRIMARY", "id"}].IsPrimary)

	assert.Len(t, structure.ForeignKeys, 3, "%+v", structure.ForeignKeys)
	for _, column := range structure.Columns {
		if column.ColumnName == "extra" {
			assert.Equal(t, "varchar(16)", column.DataType, "类型带长度")
			assert.Equal(t, "new", deref(column.ColumnDefault), "字符串默认值不带引号")
		}
	}
}
