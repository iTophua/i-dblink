package api

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"idblink/backend/models"
)

// 结构比较的「同步 SQL」：方向必须是「让目标表向源表看齐」，而且只生成新增类语句。

func TestGenerateAlterSQLSyncsTargetToSource(t *testing.T) {
	diff := &SchemaDiffResult{TableName: "orders"}
	diff.ColumnDiffs = []SchemaDiffColumn{
		// added / modified / missing 的含义以目标表为参照：目标表多出的、两边不同的、目标表缺少的
		{ColumnName: "legacy_col", TargetDef: "varchar(255) NULL", DiffType: "added"},
		{ColumnName: "amount", SourceDef: "decimal(12,2) NOT NULL", TargetDef: "decimal(10,2) NOT NULL", DiffType: "modified"},
		{ColumnName: "remark", SourceDef: "varchar(255) NULL", DiffType: "missing"},
		{ColumnName: "no_def", DiffType: "missing"},
	}
	diff.IndexDiffs = []SchemaDiffIndex{
		{IndexName: "idx_extra", ColumnName: "status", DiffType: "added"},
		{IndexName: "idx_status", ColumnName: "status", IsUnique: true, DiffType: "missing"},
		{IndexName: "orders_pkey", ColumnName: "id", IsPrimary: true, DiffType: "missing"},
		{IndexName: "idx_old", ColumnName: "name", DiffType: "modified"},
	}
	diff.ForeignKeyDiffs = []SchemaDiffForeignKey{
		{ConstraintName: "fk_extra", ColumnName: "x", DiffType: "added"},
		{ConstraintName: "fk_user", ColumnName: "user_id", ReferencedTable: "users", ReferencedColumn: "id", DiffType: "missing"},
	}

	sqls := h().generateAlterSQL(diff, "mysql", "postgresql", "orders", "srcdb", "tgtdb")
	joined := strings.Join(sqls, "\n")

	// 目标表缺的：补列、建索引、加外键，都是可以在目标库上直接执行的新增语句
	assert.Contains(t, joined, `ALTER TABLE "orders" ADD COLUMN "remark" varchar(255) NULL`)
	assert.Contains(t, joined, `CREATE UNIQUE INDEX "idx_status" ON "orders" ("status")`)
	assert.Contains(t, joined,
		`ALTER TABLE "orders" ADD CONSTRAINT "fk_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id")`)

	// 目标表多出来的 / 两边不同的：只出现在注释里，不生成可执行语句
	assert.Contains(t, joined, "-- 目标表多出的列 legacy_col")
	assert.Contains(t, joined, `-- ALTER TABLE "orders" DROP COLUMN "legacy_col"`)
	assert.Contains(t, joined, "-- 目标表多出的索引 idx_extra")
	assert.Contains(t, joined, `-- DROP INDEX "idx_extra"`)
	assert.Contains(t, joined, "-- 目标表多出的外键 fk_extra")
	assert.Contains(t, joined, `-- ALTER TABLE "orders" DROP CONSTRAINT "fk_extra"`)
	assert.Contains(t, joined, "-- 列 amount 定义不同")
	assert.Contains(t, joined, "-- 主键不一致（源表：orders_pkey）")
	assert.Contains(t, joined, "-- 列 no_def 在目标表缺失，但源表定义未知")

	// 真正可执行的语句一条都不能是删除 / 修改类
	for _, s := range sqls {
		if strings.HasPrefix(s, "--") {
			continue
		}
		lower := strings.ToLower(s)
		assert.False(t, strings.Contains(lower, "drop "), "可执行语句里不应有 DROP：%s", s)
		assert.NotContains(t, lower, "legacy_col", "不应去动目标表已有的列：%s", s)
		assert.NotContains(t, lower, "idx_extra", "不应重建目标表已有的索引：%s", s)
	}
	// 新增语句排在前面，注释说明排在后面
	assert.True(t, strings.HasPrefix(sqls[0], "ALTER TABLE \"orders\" ADD COLUMN"), sqls[0])
	assert.True(t, strings.HasPrefix(sqls[len(sqls)-1], "--"), sqls[len(sqls)-1])
}

func TestGenerateAlterSQLDialects(t *testing.T) {
	build := func(target string) string {
		diff := &SchemaDiffResult{TableName: "t"}
		diff.ColumnDiffs = []SchemaDiffColumn{{ColumnName: "c", SourceDef: "int NOT NULL", DiffType: "missing"}}
		diff.IndexDiffs = []SchemaDiffIndex{{IndexName: "i", ColumnName: "c", DiffType: "added"}}
		diff.ForeignKeyDiffs = []SchemaDiffForeignKey{
			{ColumnName: "c", ReferencedTable: "p", ReferencedColumn: "id", ConstraintName: "fk", DiffType: "missing"},
			{ConstraintName: "fk_extra", DiffType: "added"},
		}
		return strings.Join(h().generateAlterSQL(diff, "mysql", target, "t", "", ""), "\n")
	}

	mysql := build("mysql")
	assert.Contains(t, mysql, "ALTER TABLE `t` ADD COLUMN `c` int NOT NULL")
	assert.Contains(t, mysql, "-- DROP INDEX `i` ON `t`", "MySQL 删索引要带表名")
	assert.Contains(t, mysql, "-- ALTER TABLE `t` DROP FOREIGN KEY `fk_extra`", "MySQL 删外键用 DROP FOREIGN KEY")

	oracle := build("oracle")
	assert.Contains(t, oracle, `ALTER TABLE "t" ADD "c" int NOT NULL`, "Oracle 不接受 ADD COLUMN")

	sqlite := build("sqlite")
	assert.Contains(t, sqlite, "ALTER TABLE `t` ADD COLUMN `c` int NOT NULL")
	assert.Contains(t, sqlite, "-- 外键 fk 在目标表缺失：SQLite 需重建表才能添加")
	assert.NotContains(t, sqlite, "ADD CONSTRAINT", "SQLite 不能用 ALTER TABLE 加外键约束")
}

func TestCompareIndexesCarriesPrimaryKeyFlag(t *testing.T) {
	source := []models.IndexInfo{
		{IndexName: "t_pkey", ColumnName: "id", IsPrimary: true},
		{IndexName: "idx_a", ColumnName: "a", IsUnique: true},
	}
	target := []models.IndexInfo{{IndexName: "idx_b", ColumnName: "b", IsPrimary: true}}

	diffs := h().compareIndexes(source, target, "postgresql", "postgresql")
	byName := map[string]SchemaDiffIndex{}
	for _, d := range diffs {
		byName[d.IndexName] = d
	}
	require.Len(t, diffs, 3)
	assert.True(t, byName["t_pkey"].IsPrimary)
	assert.Equal(t, "missing", byName["t_pkey"].DiffType)
	assert.True(t, byName["idx_a"].IsUnique)
	assert.False(t, byName["idx_a"].IsPrimary)
	assert.True(t, byName["idx_b"].IsPrimary)
	assert.Equal(t, "added", byName["idx_b"].DiffType)
}

func h() *Handler { return &Handler{} }
