package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"idblink/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestQuery(t *testing.T) {
	handler, _ := setupTestHandler(t)

	// Setup a SQLite connection for testing
	connectReq := models.ConnectRequest{
		ConnectionID: "test-query-conn",
		DbType:       "sqlite",
		Database:     ":memory:",
	}
	connectBytes, _ := json.Marshal(connectReq)
	req := httptest.NewRequest("POST", "/connect", bytes.NewReader(connectBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.Connect(rr, req)

	// Create test table and insert data
	queryReq := models.QueryRequest{
		ConnectionID: "test-query-conn",
		SQL:          "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)",
	}
	queryBytes, _ := json.Marshal(queryReq)
	req = httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	handler.Query(rr, req)

	// Insert test data
	queryReq.SQL = "INSERT INTO test (name) VALUES ('Alice'), ('Bob')"
	queryBytes, _ = json.Marshal(queryReq)
	req = httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	handler.Query(rr, req)

	t.Run("select query returns rows", func(t *testing.T) {
		queryReq := models.QueryRequest{
			ConnectionID: "test-query-conn",
			SQL:          "SELECT * FROM test ORDER BY id",
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
		assert.Equal(t, []string{"id", "name"}, resp.Columns)
		assert.Len(t, resp.Rows, 2)
		assert.Equal(t, "Alice", resp.Rows[0][1])
		assert.Equal(t, "Bob", resp.Rows[1][1])
	})

	t.Run("insert query", func(t *testing.T) {
		queryReq := models.QueryRequest{
			ConnectionID: "test-query-conn",
			SQL:          "INSERT INTO test (name) VALUES ('Charlie')",
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("syntax error", func(t *testing.T) {
		queryReq := models.QueryRequest{
			ConnectionID: "test-query-conn",
			SQL:          "SELECT * FORM test", // Intentional typo
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
		assert.Contains(t, resp.Error, "FORM")
	})

	t.Run("invalid request body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/query", bytes.NewReader([]byte("invalid")))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Contains(t, resp.Error, "invalid request body")
	})

	t.Run("non-existent connection", func(t *testing.T) {
		queryReq := models.QueryRequest{
			ConnectionID: "non-existent",
			SQL:          "SELECT 1",
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})

	t.Run("empty result", func(t *testing.T) {
		queryReq := models.QueryRequest{
			ConnectionID: "test-query-conn",
			SQL:          "SELECT * FROM test WHERE id = 99999",
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
		assert.Len(t, resp.Rows, 0)
	})
}

func TestExecuteSQL(t *testing.T) {
	// This is tested indirectly through TestQuery
	// Additional unit tests for executeSQL helper
}

// TestIsDMLStatement 写语句走 ExecContext 才拿得到影响行数。WITH 开头的主语句在 CTE 之后：
// 认得出就按主语句判；认不出的一律当查询——代价不对称，把 SELECT 当成写语句会把结果集丢掉，
// 当成查询只是少一个影响行数。notDML 的后半段都是「各库规则不一样、不能猜」的写法
func TestIsDMLStatement(t *testing.T) {
	dml := []string{
		"INSERT INTO t VALUES (1)",
		"REPLACE INTO t VALUES (1)",
		"update t set a = 1",
		"DELETE FROM t",
		"MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET a = 1",
		"-- 注释\nDELETE FROM t",
		"  (UPDATE t SET a = 1)",
		"WITH c AS (SELECT 1) UPDATE t SET a = 1",
		"with c as (select 1) delete from t",
		"WITH c AS (SELECT 1) REPLACE INTO t VALUES (1)",
		"WITH c AS (SELECT 1) MERGE INTO t USING c ON t.id = c.id WHEN MATCHED THEN UPDATE SET a = 1",
		"WITH c AS (SELECT 1) UPDATE t SET a = 1;",
		";WITH c AS (SELECT 1) UPDATE t SET a = 1",
		// CTE 列表的各种形状
		"WITH RECURSIVE t(n) AS (VALUES (1) UNION ALL SELECT n + 1 FROM t) INSERT INTO x SELECT n FROM t",
		`WITH "C" AS (SELECT 1) UPDATE t SET a = 1`,
		"WITH a AS (SELECT 1), b AS (SELECT 2) DELETE FROM t",
		"WITH a AS (SELECT 1), b(a) AS NOT MATERIALIZED (SELECT 2) UPDATE t SET a = 1",
		"WITH a AS MATERIALIZED (SELECT 2) UPDATE t SET a = 1",
		// 括号里的字符串、注释、E'' 不会打乱配对（字符串里是个不成对的右括号）
		`WITH c AS (SELECT ')' AS cl, 'it''s' AS q) DELETE FROM t`,
		`WITH c AS (SELECT E'x' AS e) UPDATE t SET a = 1`,
		"WITH c AS (SELECT 1 -- note\n) UPDATE t SET a = 1",
		"WITH c AS (SELECT 1 /* note ( ) */) UPDATE t SET a = 1",
	}
	for _, sql := range dml {
		if !isDMLStatement(sql) {
			t.Errorf("isDMLStatement(%q) = false, want true", sql)
		}
	}

	notDML := []string{
		"",
		"   ",
		"-- only a comment",
		"SELECT 1",
		"CREATE TABLE t (id INT)",
		"WITH c AS (SELECT 1) SELECT * FROM c",
		"WITH c AS (SELECT 1) TABLE t",
		// 数据修改 CTE 本身返回行：走 QueryContext 才拿得到 RETURNING 的结果
		"WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d",
		"WITH c AS (SELECT 1) SELECT 2; UPDATE t SET a = 1", // 多条语句按第一条判
		"WITH c AS (SELECT 1) (UPDATE t SET a = 1)",         // 主语句不能加括号
		// ——以下认不出就放弃
		`WITH c AS (SELECT '\' AS x) UPDATE t SET a = 1`,               // 字符串里的反斜杠：是不是转义符看方言
		`WITH c AS (SELECT E'it\'s' AS x) UPDATE t SET a = 1`,          // 同上
		`WITH c AS (SELECT 'unterminated) UPDATE t SET a = 1`,          // 引号没闭合
		`WITH c AS (SELECT $tag$)$tag$ AS x) UPDATE t SET a = 1`,       // $ 引用：PG 的字符串定界符
		`WITH c AS (SELECT a$b FROM t) UPDATE t SET a = 1`,             // 同上
		"WITH c AS (SELECT 1 # note\n) UPDATE t SET a = 1",             // #：MySQL 的注释
		"WITH c AS (SELECT 1 --note\n) UPDATE t SET a = 1",             // MySQL 里 -- 后面要有空白才是注释
		"WITH c AS (SELECT 1 /*! ) UPDATE fake */ ) DELETE FROM t",     // MySQL 的可执行注释，内容是 SQL
		"WITH c AS (SELECT 1 /* a /* b */ ) UPDATE fake */ ) SELECT 2", // PG 的块注释能嵌套
		"WITH c AS (SELECT 1",  // 括号没闭合
		"WITH c AS (SELECT 1)", // CTE 之后没有主语句
		"WITH c AS (SELECT 1) SEARCH BREADTH FIRST BY id SET seq UPDATE t SET a = 1", // SEARCH 子句：不认
	}
	for _, sql := range notDML {
		if isDMLStatement(sql) {
			t.Errorf("isDMLStatement(%q) = true, want false", sql)
		}
	}
}

// TestExecuteSQLWithDMLRowsAffected 在 SQLite 上确认两件事：WITH … UPDATE 拿得到影响行数
// （此前首词是 WITH 就走 QueryContext，写执行了、影响行数是空的）；WITH … SELECT 的结果集
// 没有被当成写语句丢掉
func TestExecuteSQLWithDMLRowsAffected(t *testing.T) {
	handler, _ := setupTestHandler(t)

	connectReq := models.ConnectRequest{ConnectionID: "test-with-dml", DbType: "sqlite", Database: ":memory:"}
	connectBytes, _ := json.Marshal(connectReq)
	req := httptest.NewRequest("POST", "/connect", bytes.NewReader(connectBytes))
	req.Header.Set("Content-Type", "application/json")
	handler.Connect(httptest.NewRecorder(), req)

	exec := func(t *testing.T, sql string) models.QueryResult {
		t.Helper()
		qr := models.QueryRequest{ConnectionID: "test-with-dml", SQL: sql}
		b, _ := json.Marshal(qr)
		r := httptest.NewRequest("POST", "/query", bytes.NewReader(b))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.Query(w, r)
		var res models.QueryResult
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
		require.Empty(t, res.Error, "query %q", sql)
		return res
	}

	exec(t, "CREATE TABLE t (id INTEGER PRIMARY KEY, a INTEGER)")
	exec(t, "INSERT INTO t (id, a) VALUES (1, 1), (2, 2), (3, 3)")

	res := exec(t, "WITH c AS (SELECT 1 AS id) UPDATE t SET a = 9 WHERE id IN (SELECT id FROM c)")
	require.NotNil(t, res.RowsAffected, "WITH … UPDATE must report rows_affected")
	assert.EqualValues(t, 1, *res.RowsAffected)

	res = exec(t, "WITH c AS (SELECT id FROM t WHERE a = 9) DELETE FROM t WHERE id IN (SELECT id FROM c)")
	require.NotNil(t, res.RowsAffected, "WITH … DELETE must report rows_affected")
	assert.EqualValues(t, 1, *res.RowsAffected)

	res = exec(t, "WITH c AS (SELECT 4 AS id, 4 AS a) INSERT INTO t SELECT * FROM c")
	require.NotNil(t, res.RowsAffected, "WITH … INSERT must report rows_affected")
	assert.EqualValues(t, 1, *res.RowsAffected)

	res = exec(t, "WITH c AS (SELECT id FROM t) SELECT * FROM c ORDER BY id")
	assert.Nil(t, res.RowsAffected, "WITH … SELECT is a query")
	require.Len(t, res.Rows, 3)
	assert.EqualValues(t, 2, res.Rows[0][0])
	assert.EqualValues(t, 4, res.Rows[2][0])

	// 认不出的写法退回查询：语句照常执行，只是没有影响行数
	res = exec(t, `WITH c AS (SELECT '\' AS x, 2 AS id) DELETE FROM t WHERE id = 2`)
	assert.Nil(t, res.RowsAffected)
	res = exec(t, "SELECT count(*) AS n FROM t")
	assert.EqualValues(t, 2, res.Rows[0][0])
}

func TestConvertValue(t *testing.T) {
	tests := []struct {
		name     string
		input    interface{}
		expected interface{}
	}{
		{"nil", nil, nil},
		// 安全范围内的 int64 保持原样返回（JSON 数字可精确表达），
		// 仅超 ±2^53 时转字符串——见 TestConvertValueBigintAsString 回归说明
		{"int", int64(42), int64(42)},
		{"float", float64(3.14), float64(3.14)},
		{"string", "hello", "hello"},
		{"bool", true, true},
		{"bytes", []byte("world"), "world"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertValue(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestConvertValueBigintAsString 回归：超出 JS Number 安全整数范围（±2^53-1）的
// int64 必须以十进制字符串返回。雪花 ID 等 BIGINT 主键此前作为 JSON 数字传给
// 前端被双精度取整（2110301005498429441 → 2110301005498429400），表数据编辑
// 生成的 WHERE 用错值静默匹配 0 行。
func TestConvertValueBigintAsString(t *testing.T) {
	safe := int64(9007199254740991) // 2^53-1
	big := int64(2110301005498429441)
	bigNeg := int64(-2110301005498429441)

	if got := convertValue(safe); got != int64(9007199254740991) {
		t.Errorf("safe int should stay numeric, got %v (%T)", got, got)
	}
	if got := convertValue(safe + 1); got != "9007199254740992" {
		t.Errorf("just above safe range should be string, got %v", got)
	}
	if got := convertValue(big); got != "2110301005498429441" {
		t.Errorf("snowflake id should be exact string, got %v", got)
	}
	if got := convertValue(bigNeg); got != "-2110301005498429441" {
		t.Errorf("negative snowflake id should be exact string, got %v", got)
	}
	if got := convertValue(int(42)); got != int64(42) {
		t.Errorf("small int should stay numeric, got %v (%T)", got, got)
	}
}

// TestQueryMaxRows 验证 max_rows：达到上限提前停止扫描并置 truncated=true；
// 未达到上限或未设置时不截断。GUI 路径（nil）行为不变。
func TestQueryMaxRows(t *testing.T) {
	handler, _ := setupTestHandler(t)

	connectReq := models.ConnectRequest{ConnectionID: "test-maxrows", DbType: "sqlite", Database: ":memory:"}
	connectBytes, _ := json.Marshal(connectReq)
	req := httptest.NewRequest("POST", "/connect", bytes.NewReader(connectBytes))
	req.Header.Set("Content-Type", "application/json")
	handler.Connect(httptest.NewRecorder(), req)

	exec := func(t *testing.T, sql string, maxRows *int) models.QueryResult {
		t.Helper()
		qr := models.QueryRequest{ConnectionID: "test-maxrows", SQL: sql, MaxRows: maxRows}
		b, _ := json.Marshal(qr)
		r := httptest.NewRequest("POST", "/query", bytes.NewReader(b))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.Query(w, r)
		var res models.QueryResult
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
		require.Empty(t, res.Error)
		return res
	}

	// 准备 5 行
	exec(t, "CREATE TABLE t (id INTEGER PRIMARY KEY)", nil)
	exec(t, "INSERT INTO t (id) VALUES (1),(2),(3),(4),(5)", nil)

	t.Run("caps rows and sets truncated", func(t *testing.T) {
		two := 2
		res := exec(t, "SELECT id FROM t ORDER BY id", &two)
		assert.Len(t, res.Rows, 2)
		assert.True(t, res.Truncated)
	})

	t.Run("under limit no truncation", func(t *testing.T) {
		ten := 10
		res := exec(t, "SELECT id FROM t ORDER BY id", &ten)
		assert.Len(t, res.Rows, 5)
		assert.False(t, res.Truncated)
	})

	t.Run("nil max_rows unlimited (GUI path)", func(t *testing.T) {
		res := exec(t, "SELECT id FROM t ORDER BY id", nil)
		assert.Len(t, res.Rows, 5)
		assert.False(t, res.Truncated)
	})

	t.Run("limit equals row count no truncation", func(t *testing.T) {
		five := 5
		res := exec(t, "SELECT id FROM t ORDER BY id", &five)
		assert.Len(t, res.Rows, 5)
		assert.False(t, res.Truncated)
	})
}
