package api

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"idblink/backend/models"
)

// 列定义的还原：类型要带长度，默认值要能原样写回 DDL。

func TestBuildColumnDefMySQL(t *testing.T) {
	// 样本取自真实 MySQL 8.0 的 information_schema.COLUMNS
	cases := []struct {
		name, dataType, nullable, extra, want string
	}{
		{"a", "varchar(16)", "NO", "", "varchar(16) NOT NULL DEFAULT 'abc'"},
		{"b", "varchar(16)", "YES", "", `varchar(16) NULL DEFAULT 'it\'s'`},
		{"c", "varchar(32)", "YES", "DEFAULT_GENERATED", "varchar(32) NULL DEFAULT (uuid())"},
		{"d", "datetime(3)", "YES", "DEFAULT_GENERATED on update CURRENT_TIMESTAMP(3)",
			"datetime(3) NULL DEFAULT (CURRENT_TIMESTAMP(3)) ON UPDATE CURRENT_TIMESTAMP(3)"},
		{"e", "timestamp", "NO", "DEFAULT_GENERATED", "timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)"},
		{"f", "int", "YES", "", "int NULL DEFAULT 42"},
		{"h", "json", "YES", "DEFAULT_GENERATED", `json NULL DEFAULT (json_object(_latin1'k',1))`},
		{"i", "varchar(8)", "YES", "", "varchar(8) NULL"},
		{"j", "tinyint(1)", "YES", "", "tinyint(1) NULL DEFAULT TRUE"},
		{"l", "decimal(10,2)", "YES", "", "decimal(10,2) NULL DEFAULT -1.50"},
		{"m", "bit(8)", "YES", "", "bit(8) NULL DEFAULT b'1'"},
		{"id", "int", "NO", "auto_increment", "int NOT NULL AUTO_INCREMENT"},
	}
	defaults := map[string]string{
		"a": "abc", "b": "it's", "c": "uuid()", "d": "CURRENT_TIMESTAMP(3)", "e": "CURRENT_TIMESTAMP",
		"f": "42", "h": `json_object(_latin1\'k\',1)`, "i": "NULL", "j": "TRUE", "l": "-1.50", "m": "b'1'",
	}
	for _, c := range cases {
		col := models.ColumnInfo{
			ColumnName: c.name, DataType: c.dataType, IsNullable: c.nullable,
			ColumnDefault: strPtr(defaults[c.name]), Extra: strPtr(c.extra),
		}
		assert.Equal(t, c.want, buildColumnDef(col, "mysql"), "列 %s", c.name)
	}
}

func TestBuildColumnDefMysqlOldExpressionQuoting(t *testing.T) {
	// 8.0.13–8.0.17 把表达式默认值连同括号包在单引号里；字符串字面量的表达式默认值没有括号，引号要留着
	col := models.ColumnInfo{
		ColumnName: "c", DataType: "varchar(32)", IsNullable: "YES",
		ColumnDefault: strPtr("'(uuid())'"), Extra: strPtr("DEFAULT_GENERATED"),
	}
	assert.Equal(t, "varchar(32) NULL DEFAULT (uuid())", buildColumnDef(col, "mysql"))

	col.ColumnDefault = strPtr("'abc'")
	assert.Equal(t, "varchar(32) NULL DEFAULT ('abc')", buildColumnDef(col, "mysql"))
}

func TestBuildColumnDefPostgreSQL(t *testing.T) {
	col := models.ColumnInfo{
		ColumnName: "name", DataType: "character varying(32)", IsNullable: "YES",
		ColumnDefault: strPtr("'abc'::character varying"),
	}
	// 类型里已经带了长度，不能再补一个 (255)
	assert.Equal(t, "character varying(32) NULL DEFAULT 'abc'::character varying", buildColumnDef(col, "postgresql"))

	col = models.ColumnInfo{ColumnName: "n", DataType: "integer", IsNullable: "NO"}
	assert.Equal(t, "integer NOT NULL", buildColumnDef(col, "postgresql"))
}

// 索引、外键按定义配对，不看名字；复合的要把全部列按列序带上。

func TestCompareIndexesByDefinition(t *testing.T) {
	source := []models.IndexInfo{
		{IndexName: "idx_ab", ColumnName: "b", SeqInIndex: 2}, // 行的先后不代表列序
		{IndexName: "PRIMARY", ColumnName: "id", IsUnique: true, IsPrimary: true},
		{IndexName: "idx_ab", ColumnName: "a", SeqInIndex: 1},
	}

	// 名字不同、定义相同：不算差异（MySQL 自动起的索引名两边经常不一样）
	same := []models.IndexInfo{
		{IndexName: "idx_ba", ColumnName: "a", SeqInIndex: 1},
		{IndexName: "idx_ba", ColumnName: "b", SeqInIndex: 2},
		{IndexName: "PRIMARY", ColumnName: "id", IsUnique: true, IsPrimary: true},
	}
	assert.Empty(t, h().compareIndexes(source, same, "mysql", "mysql"))

	// 名字相同、列不同：配不上，成对地报「多出」（一列）和「缺失」（两列），多出排前面
	narrower := []models.IndexInfo{
		{IndexName: "idx_ab", ColumnName: "a", SeqInIndex: 1},
		{IndexName: "PRIMARY", ColumnName: "id", IsUnique: true, IsPrimary: true},
	}
	diffs := h().compareIndexes(source, narrower, "mysql", "mysql")
	require.Len(t, diffs, 2)
	assert.Equal(t, "added", diffs[0].DiffType)
	assert.Equal(t, []string{"a"}, diffs[0].ColumnNames)
	assert.Equal(t, "missing", diffs[1].DiffType)
	assert.Equal(t, []string{"a", "b"}, diffs[1].ColumnNames, "按列序，不按返回的先后")
	assert.Equal(t, "a", diffs[1].ColumnName)
}

func TestCompareForeignKeysByDefinition(t *testing.T) {
	source := []models.ForeignKeyInfo{
		{ConstraintName: "fk_pair", ColumnName: "x", ReferencedTable: "parent", ReferencedColumn: "p"},
		{ConstraintName: "fk_pair", ColumnName: "y", ReferencedTable: "parent", ReferencedColumn: "q"},
	}
	same := []models.ForeignKeyInfo{
		{ConstraintName: "child_ibfk_2", ColumnName: "x", ReferencedTable: "parent", ReferencedColumn: "p"},
		{ConstraintName: "child_ibfk_2", ColumnName: "y", ReferencedTable: "parent", ReferencedColumn: "q"},
	}
	assert.Empty(t, h().compareForeignKeys(source, same, "mysql", "mysql"))

	// 列的对应关系变了（y 改指 p）就不一样
	swapped := []models.ForeignKeyInfo{
		{ConstraintName: "fk_pair", ColumnName: "x", ReferencedTable: "parent", ReferencedColumn: "p"},
		{ConstraintName: "fk_pair", ColumnName: "y", ReferencedTable: "parent", ReferencedColumn: "p"},
	}
	diffs := h().compareForeignKeys(source, swapped, "mysql", "mysql")
	require.Len(t, diffs, 2)
	// 同名约束定义不同：按定义配不上，成对地报「多出」和「缺失」（多出排前面）
	assert.Equal(t, "added", diffs[0].DiffType)
	assert.Equal(t, []string{"p", "p"}, diffs[0].ReferencedColumns)
	assert.Equal(t, "missing", diffs[1].DiffType)
	assert.Equal(t, []string{"x", "y"}, diffs[1].ColumnNames)
	assert.Equal(t, []string{"p", "q"}, diffs[1].ReferencedColumns)
}

func TestGenerateAlterSQLComposite(t *testing.T) {
	diff := &SchemaDiffResult{TableName: "t"}
	diff.IndexDiffs = []SchemaDiffIndex{
		{IndexName: "idx_ab", ColumnName: "a", ColumnNames: []string{"a", "b"}, IsUnique: true, DiffType: "missing"},
		{IndexName: "t_pkey", ColumnName: "id", IsPrimary: true, DiffType: "added"},
		{IndexName: "old", ColumnName: "o", DiffType: "added"},
	}
	diff.ForeignKeyDiffs = []SchemaDiffForeignKey{{
		ConstraintName: "fk_pair", ColumnName: "x", ColumnNames: []string{"x", "y"},
		ReferencedTable: "parent", ReferencedColumn: "p", ReferencedColumns: []string{"p", "q"},
		DiffType: "missing",
	}}

	pg := strings.Join(h().generateAlterSQL(diff, "postgresql", "postgresql", "t", "", ""), "\n")
	assert.Contains(t, pg, `CREATE UNIQUE INDEX "idx_ab" ON "t" ("a", "b")`)
	assert.Contains(t, pg, `ALTER TABLE "t" ADD CONSTRAINT "fk_pair" FOREIGN KEY ("x", "y") REFERENCES "parent" ("p", "q")`)
	assert.Contains(t, pg, "-- 主键不一致（源表：t_pkey）")
	assert.NotContains(t, pg, "DROP INDEX \"t_pkey\"", "主键不能当普通索引去删")

	mysql := strings.Join(h().generateAlterSQL(diff, "mysql", "mysql", "t", "", ""), "\n")
	assert.Contains(t, mysql, "CREATE UNIQUE INDEX `idx_ab` ON `t` (`a`, `b`)")
	assert.Contains(t, mysql, "-- DROP INDEX `old` ON `t`", "MySQL 删索引要带表名")
}

func TestDialectFamily(t *testing.T) {
	assert.Equal(t, dialectFamily("mysql"), dialectFamily("mariadb"))
	assert.Equal(t, dialectFamily("postgresql"), dialectFamily("kingbase"))
	assert.NotEqual(t, dialectFamily("mysql"), dialectFamily("postgresql"))
}

func TestQuoteIdentList(t *testing.T) {
	assert.Equal(t, `"a", "b"`, quoteIdentList([]string{"a", "b"}, "x", "postgresql"))
	assert.Equal(t, "`x`", quoteIdentList(nil, "x", "mysql"), "没有列表时退回单个列名")
}
