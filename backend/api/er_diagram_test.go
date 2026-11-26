package api

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"idblink/backend/db"
	"idblink/backend/models"
)

// erSchema 覆盖 ER 图要处理的全部情况：单列 / 复合外键、省略目标列的自引用、
// 复合主键、指向不存在的表、带引号的表名、视图（不应出现在图里）
const erOrgDDL = `CREATE TABLE er_org (id INT PRIMARY KEY, code VARCHAR(32))`
const erCompositeDDL = `CREATE TABLE er_composite (a INT NOT NULL, b INT NOT NULL, v VARCHAR(10), PRIMARY KEY (a, b))`

var erDropTables = []string{"er_order", "er_user", "er_org", "er_composite", "er_orphan"}

func execAll(t *testing.T, exec db.Executor, stmts []string) {
	t.Helper()
	for _, s := range stmts {
		if _, err := exec.ExecContext(context.Background(), s); err != nil {
			t.Fatalf("exec %q: %v", s, err)
		}
	}
}

func setupERSQLite(t *testing.T) (*Handler, string, db.Executor) {
	t.Helper()
	handler, manager := setupTestHandler(t)
	const connID = "er-sqlite"
	// 用文件库：连接池里多个连接看到同一份数据（:memory: 每个连接各一份）
	require.NoError(t, manager.Connect(connID, db.ConnectArgs{
		DbType: "sqlite", Database: filepath.Join(t.TempDir(), "er.db"),
	}))
	t.Cleanup(func() { _ = manager.Disconnect(connID) })
	exec, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	execAll(t, exec, []string{
		`CREATE TABLE er_org (id INTEGER PRIMARY KEY, code TEXT)`,
		`CREATE TABLE er_user (
			id INTEGER PRIMARY KEY,
			org_id INTEGER NOT NULL,
			mgr_id INTEGER,
			name TEXT NOT NULL,
			UNIQUE (id, org_id),
			FOREIGN KEY (org_id) REFERENCES er_org (id),
			FOREIGN KEY (mgr_id) REFERENCES er_user
		)`,
		`CREATE TABLE er_order (
			id INTEGER PRIMARY KEY,
			user_id INTEGER NOT NULL,
			region_id INTEGER NOT NULL,
			amount REAL,
			FOREIGN KEY (user_id, region_id) REFERENCES er_user (id, org_id)
		)`,
		`CREATE TABLE er_orphan (id INTEGER PRIMARY KEY, x INTEGER REFERENCES er_missing (id))`,
		`CREATE TABLE "er ""quoted""" (id INTEGER PRIMARY KEY)`,
		`CREATE VIEW er_view AS SELECT id FROM er_user`,
		erCompositeDDL,
	})
	return handler, connID, exec
}

type edgeKey struct {
	fromTable, fromColumn string
	seq                   int
}

func edgeMap(edges []models.EREdge) map[edgeKey]models.EREdge {
	out := map[edgeKey]models.EREdge{}
	for _, e := range edges {
		out[edgeKey{e.FromTable, e.FromColumn, e.Seq}] = e
	}
	return out
}

func TestERDiagramSQLiteFastPath(t *testing.T) {
	handler, connID, _ := setupERSQLite(t)

	diagram, err := handler.GetERDiagram(context.Background(), connID, nil)
	require.NoError(t, err)
	assert.False(t, diagram.SlowPath, "SQLite must use the bulk path")

	ids := []string{}
	for _, tbl := range diagram.Tables {
		ids = append(ids, tbl.ID)
	}
	// 按字节序排：引号（0x22）排在下划线（0x5F）前面
	assert.Equal(t, []string{`er "quoted"`, "er_composite", "er_order", "er_org", "er_orphan", "er_user"}, ids,
		"views and missing tables must not appear; quoted names must come through")

	byID := map[string]models.ERTable{}
	for _, tbl := range diagram.Tables {
		byID[tbl.ID] = tbl
	}
	// 复合主键的每一列都带标记
	composite := byID["er_composite"]
	assert.True(t, composite.Columns[0].IsPK, "a")
	assert.True(t, composite.Columns[1].IsPK, "b")
	assert.False(t, composite.Columns[2].IsPK, "v")
	assert.False(t, composite.Columns[1].Nullable)
	assert.True(t, composite.Columns[2].Nullable)
	user := byID["er_user"]
	assert.Equal(t, []string{"id", "org_id", "mgr_id", "name"}, columnNames(user))
	assert.True(t, user.Columns[0].IsPK)
	assert.False(t, user.Columns[1].Nullable, "NOT NULL 列")
	assert.True(t, user.Columns[2].Nullable)
	assert.False(t, user.Columns[1].IsPK, "UNIQUE / 外键列不是主键")

	edges := edgeMap(diagram.Edges)
	assert.Len(t, edges, 4, "got %+v", diagram.Edges)
	assert.Equal(t, "er_org", edges[edgeKey{"er_user", "org_id", 1}].ToTable)
	assert.Equal(t, "id", edges[edgeKey{"er_user", "org_id", 1}].ToColumn)
	// 省略目标列的自引用：回查父表主键
	assert.Equal(t, "er_user", edges[edgeKey{"er_user", "mgr_id", 1}].ToTable)
	assert.Equal(t, "id", edges[edgeKey{"er_user", "mgr_id", 1}].ToColumn)
	// 复合外键按位置配对
	assert.Equal(t, "id", edges[edgeKey{"er_order", "user_id", 1}].ToColumn)
	assert.Equal(t, "org_id", edges[edgeKey{"er_order", "region_id", 2}].ToColumn)
	assert.Equal(t, "er_user", edges[edgeKey{"er_order", "region_id", 2}].ToTable)
}

// SQLite 走通用路径时只有显式写了目标列的外键能取到（现成的逐表查询会丢弃目标列为空的行）
func TestERDiagramGenericPath(t *testing.T) {
	_, _, exec := setupERSQLite(t)

	diagram, err := genericERDiagram(context.Background(), exec, "sqlite", nil)
	require.NoError(t, err)
	assert.True(t, diagram.SlowPath)
	assert.Len(t, diagram.Tables, 6)
	assert.Empty(t, diagram.Warnings)

	edges := edgeMap(diagram.Edges)
	assert.Len(t, edges, 3, "got %+v", diagram.Edges)
	assert.Equal(t, "er_org", edges[edgeKey{"er_user", "org_id", 1}].ToTable)
	assert.Equal(t, "org_id", edges[edgeKey{"er_order", "region_id", 2}].ToColumn)
	// 指向不存在的表的关系被丢弃
	for _, e := range diagram.Edges {
		assert.NotEqual(t, "er_missing", e.ToTable)
	}
}

func TestERDiagramUnknownConnection(t *testing.T) {
	handler, _ := setupTestHandler(t)
	_, err := handler.GetERDiagram(context.Background(), "no-such-connection", nil)
	require.Error(t, err)
}

func TestSplitERTableID(t *testing.T) {
	name, schema := splitERTableID("public.users")
	assert.Equal(t, "users", name)
	assert.Equal(t, "public", schema)
	name, schema = splitERTableID("users")
	assert.Equal(t, "users", name)
	assert.Empty(t, schema)
}

func columnNames(tbl models.ERTable) []string {
	out := make([]string, len(tbl.Columns))
	for i, c := range tbl.Columns {
		out[i] = c.Name
	}
	return out
}

// ── 真实库上的批量查询 ──
//
// MySQL / PG 的两条 SQL 只能在真库上验证。开关与 backend/db 的事务冒烟共用：
//
//	docker compose -f docker-compose.test.yml up -d
//	IDBLINK_TX_SMOKE_MYSQL=1 IDBLINK_TX_SMOKE_PG=1 go test ./backend/api -run RealER -v
//
// 测试库不是空的：compose 的初始化脚本建了 users / orders 等表，backend/db 的事务冒烟
// 还可能并行往里建临时表。所以下面只断言自己建的 er_* 表——接口本身就该返回全库的表。

type realTarget struct {
	dbType, addr, user, pass, dbName string
}

func realERTarget(t *testing.T, dbType, flag, prefix, defAddr, defUser, defPass, defDB string) realTarget {
	t.Helper()
	if os.Getenv(flag) != "1" {
		t.Skipf("set %s=1 to run against a real %s", flag, dbType)
	}
	env := func(suffix, def string) string {
		if v := os.Getenv(prefix + "_" + suffix); v != "" {
			return v
		}
		return def
	}
	addr := env("ADDR", defAddr)
	host, portText, ok := strings.Cut(addr, ":")
	require.True(t, ok, "bad address %q", addr)
	return realTarget{dbType: dbType, addr: host + ":" + portText, user: env("USER", defUser),
		pass: env("PASS", defPass), dbName: env("DB", defDB)}
}

func setupRealER(t *testing.T, target realTarget, ddl []string) (*Handler, string) {
	t.Helper()
	host, portText, _ := strings.Cut(target.addr, ":")
	port, err := strconv.Atoi(portText)
	require.NoError(t, err)

	manager := db.NewManager()
	handler := &Handler{mgr: manager, tunnel: NewTunnelManager()}
	connID := "er-real-" + target.dbType
	require.NoError(t, manager.Connect(connID, db.ConnectArgs{
		DbType: target.dbType, Host: host, Port: port,
		Username: target.user, Password: target.pass, Database: target.dbName,
	}))
	t.Cleanup(func() { _ = manager.Disconnect(connID) })

	exec, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	drops := []string{}
	for _, name := range erDropTables {
		drops = append(drops, "DROP TABLE IF EXISTS "+name)
	}
	execAll(t, exec, drops)
	execAll(t, exec, ddl)
	t.Cleanup(func() {
		for _, name := range erDropTables {
			_, _ = exec.ExecContext(context.Background(), "DROP TABLE IF EXISTS "+name)
		}
	})
	return handler, connID
}

// erOnly 从全库的结果里取出本测试建的那几张表（er_ 前缀）及它们之间的关系
func erOnly(diagram models.ERDiagram, schemaPrefix string) models.ERDiagram {
	prefix := schemaPrefix + "er_"
	out := models.ERDiagram{Tables: []models.ERTable{}, Edges: []models.EREdge{}}
	kept := map[string]bool{}
	for _, tbl := range diagram.Tables {
		if strings.HasPrefix(tbl.ID, prefix) {
			out.Tables = append(out.Tables, tbl)
			kept[tbl.ID] = true
		}
	}
	for _, e := range diagram.Edges {
		if kept[e.FromTable] && kept[e.ToTable] {
			out.Edges = append(out.Edges, e)
		}
	}
	return out
}

// assertRealDiagram 两条路径（不传库名 / 显式传库名）都要拿到同样的图
func assertRealDiagram(t *testing.T, handler *Handler, connID, schemaPrefix, dbName string) {
	t.Helper()
	for _, dbArg := range []*string{nil, &dbName} {
		full, err := handler.GetERDiagram(context.Background(), connID, dbArg)
		require.NoError(t, err)
		assert.False(t, full.SlowPath)
		assert.Empty(t, full.Warnings)
		diagram := erOnly(full, schemaPrefix)

		ids := []string{}
		for _, tbl := range diagram.Tables {
			ids = append(ids, tbl.ID)
		}
		assert.Equal(t, []string{
			schemaPrefix + "er_composite", schemaPrefix + "er_order",
			schemaPrefix + "er_org", schemaPrefix + "er_user",
		}, ids)

		byID := map[string]models.ERTable{}
		for _, tbl := range diagram.Tables {
			byID[tbl.ID] = tbl
		}
		composite := byID[schemaPrefix+"er_composite"]
		assert.True(t, composite.Columns[0].IsPK, "a")
		assert.True(t, composite.Columns[1].IsPK, "b")
		assert.False(t, composite.Columns[2].IsPK, "v")
		user := byID[schemaPrefix+"er_user"]
		assert.Equal(t, []string{"id", "org_id", "mgr_id", "name"}, columnNames(user))
		assert.True(t, user.Columns[0].IsPK)
		assert.False(t, user.Columns[1].Nullable)
		assert.True(t, user.Columns[2].Nullable)
		assert.False(t, user.Columns[1].IsPK, "UNIQUE / FK 列不是主键")

		edges := edgeMap(diagram.Edges)
		assert.Len(t, edges, 4, "got %+v", diagram.Edges)
		assert.Equal(t, schemaPrefix+"er_org", edges[edgeKey{schemaPrefix + "er_user", "org_id", 1}].ToTable)
		assert.Equal(t, schemaPrefix+"er_user", edges[edgeKey{schemaPrefix + "er_user", "mgr_id", 1}].ToTable)
		assert.Equal(t, "id", edges[edgeKey{schemaPrefix + "er_order", "user_id", 1}].ToColumn)
		assert.Equal(t, "org_id", edges[edgeKey{schemaPrefix + "er_order", "region_id", 2}].ToColumn)
		assert.Equal(t, "fk_order_user", edges[edgeKey{schemaPrefix + "er_order", "region_id", 2}].Name)
	}
}

func TestRealERDiagramMySQL(t *testing.T) {
	target := realERTarget(t, "mysql", "IDBLINK_TX_SMOKE_MYSQL", "IDBLINK_TX_MYSQL",
		"127.0.0.1:13306", "testuser", "testpass", "testdb")
	handler, connID := setupRealER(t, target, []string{
		"CREATE TABLE er_org (id INT PRIMARY KEY, code VARCHAR(32) NULL) COMMENT = '组织表'",
		`CREATE TABLE er_user (
			id INT PRIMARY KEY,
			org_id INT NOT NULL,
			mgr_id INT NULL,
			name VARCHAR(64) NOT NULL,
			UNIQUE KEY uk_user_org (id, org_id),
			CONSTRAINT fk_user_org FOREIGN KEY (org_id) REFERENCES er_org (id),
			CONSTRAINT fk_user_mgr FOREIGN KEY (mgr_id) REFERENCES er_user (id)
		)`,
		`CREATE TABLE er_order (
			id INT PRIMARY KEY,
			user_id INT NOT NULL,
			region_id INT NOT NULL,
			CONSTRAINT fk_order_user FOREIGN KEY (user_id, region_id) REFERENCES er_user (id, org_id)
		)`,
		"CREATE TABLE er_composite (a INT NOT NULL, b INT NOT NULL, v VARCHAR(10), PRIMARY KEY (a, b))",
	})
	assertRealDiagram(t, handler, connID, "", target.dbName)

	full, err := handler.GetERDiagram(context.Background(), connID, nil)
	require.NoError(t, err)
	diagram := erOnly(full, "")
	assert.Equal(t, "int", diagram.Tables[2].Columns[0].DataType, "MySQL 用完整列类型")
	// 视图不进图：初始化脚本在 testdb 里建了一个视图 user_order_summary
	assert.False(t, strings.Contains(func() string {
		names := []string{}
		for _, tbl := range full.Tables {
			names = append(names, tbl.ID)
		}
		return strings.Join(names, " ")
	}(), "user_order_summary"), "views must not appear in the diagram")
}

func TestRealERDiagramPostgreSQL(t *testing.T) {
	target := realERTarget(t, "postgresql", "IDBLINK_TX_SMOKE_PG", "IDBLINK_TX_PG",
		"127.0.0.1:15432", "testuser", "testpassword", "testdb")
	handler, connID := setupRealER(t, target, []string{
		"CREATE TABLE er_org (id INT PRIMARY KEY, code VARCHAR(32))",
		`CREATE TABLE er_user (
			id INT PRIMARY KEY,
			org_id INT NOT NULL,
			mgr_id INT NULL,
			name VARCHAR(64) NOT NULL,
			UNIQUE (id, org_id),
			FOREIGN KEY (org_id) REFERENCES er_org (id),
			FOREIGN KEY (mgr_id) REFERENCES er_user (id)
		)`,
		`CREATE TABLE er_order (
			id INT PRIMARY KEY,
			user_id INT NOT NULL,
			region_id INT NOT NULL,
			CONSTRAINT fk_order_user FOREIGN KEY (user_id, region_id) REFERENCES er_user (id, org_id)
		)`,
		"CREATE TABLE er_composite (a INT NOT NULL, b INT NOT NULL, v VARCHAR(10), PRIMARY KEY (a, b))",
		"COMMENT ON TABLE er_org IS '组织表'",
	})
	assertRealDiagram(t, handler, connID, "public.", target.dbName)

	full, err := handler.GetERDiagram(context.Background(), connID, nil)
	require.NoError(t, err)
	diagram := erOnly(full, "public.")
	assert.Equal(t, "组织表", diagram.Tables[2].Comment, "PG 带出表注释")
	assert.Equal(t, "integer", diagram.Tables[2].Columns[0].DataType)
	// 每张表都带着 schema 名
	for _, tbl := range diagram.Tables {
		assert.Equal(t, "public", tbl.Schema)
	}
}

// SQLite 的外键省略目标列时指向父表主键：子表的第 n 列对应主键的第 n 列（不是都指向第一列）；
// 父表名按 REFERENCES 里写的原样返回，和 sqlite_master 里的名字大小写可能不同
func TestERDiagramSQLiteForeignKeyWithoutTargetColumn(t *testing.T) {
	handler, manager := setupTestHandler(t)
	const connID = "er-sqlite-composite"
	require.NoError(t, manager.Connect(connID, db.ConnectArgs{
		DbType: "sqlite", Database: filepath.Join(t.TempDir(), "er.db"),
	}))
	t.Cleanup(func() { _ = manager.Disconnect(connID) })
	exec, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	// 父表主键的列序 (b, a) 和表里的列序 (a, b) 相反
	execAll(t, exec, []string{
		`CREATE TABLE parent (a INT, b INT, PRIMARY KEY (b, a))`,
		`CREATE TABLE child (x INT, y INT, FOREIGN KEY (x, y) REFERENCES parent)`,
		`CREATE TABLE ref_child (p INT REFERENCES PARENT (a))`,
	})

	diagram, err := handler.GetERDiagram(context.Background(), connID, nil)
	require.NoError(t, err)

	edges := edgeMap(diagram.Edges)
	assert.Equal(t, "b", edges[edgeKey{"child", "x", 1}].ToColumn, "子表第 1 列对应主键第 1 列 b")
	assert.Equal(t, "a", edges[edgeKey{"child", "y", 2}].ToColumn, "子表第 2 列对应主键第 2 列 a")
	assert.Equal(t, "parent", edges[edgeKey{"child", "x", 1}].ToTable)
	// 大小写不同的父表名也找得到，关系不会因为两端对不上而被丢掉
	ref, ok := edges[edgeKey{"ref_child", "p", 1}]
	require.True(t, ok, "REFERENCES PARENT 的关系不能丢：%+v", diagram.Edges)
	assert.Equal(t, "parent", ref.ToTable)
	assert.Equal(t, "a", ref.ToColumn)
}
