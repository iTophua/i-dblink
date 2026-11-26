package models

// DataCompareRequest 表数据对比：按主键比对源表与目标表，并生成把目标表同步成源表的 SQL。
type DataCompareRequest struct {
	SourceConnectionID string `json:"source_connection_id"`
	SourceDatabase     string `json:"source_database,omitempty"`
	SourceTable        string `json:"source_table"`
	TargetConnectionID string `json:"target_connection_id"`
	TargetDatabase     string `json:"target_database,omitempty"`
	TargetTable        string `json:"target_table"`
	// 表所在的 schema（PG 系、SQL Server）。留空时 PG 自己定位：优先 public，重名再按名字序
	SourceSchema string `json:"source_schema,omitempty"`
	TargetSchema string `json:"target_schema,omitempty"`
	// 匹配行用的键：留空用源表主键；源表没有主键时必须指定
	KeyColumns []string `json:"key_columns,omitempty"`
	// 每侧最多读取的行数（默认 100000），超过即停止并标记 truncated
	MaxRows int `json:"max_rows,omitempty"`
	// 生成的同步语句上限（默认 2000）
	MaxStatements int `json:"max_statements,omitempty"`
}

// DataCompareCell 单元格的展示值（已转成文本并限长）
type DataCompareCell struct {
	IsNull bool   `json:"is_null"`
	Value  string `json:"value"`
}

type DataCompareRow struct {
	Key map[string]DataCompareCell `json:"key"`
	// 仅在源表的行带整行内容
	Row map[string]DataCompareCell `json:"row,omitempty"`
}

// DataCompareChange 一列的差异
type DataCompareChange struct {
	Column string          `json:"column"`
	Source DataCompareCell `json:"source"`
	Target DataCompareCell `json:"target"`
}

type DataCompareModified struct {
	Key     map[string]DataCompareCell `json:"key"`
	Changes []DataCompareChange        `json:"changes"`
}

// DataCompareSQLCounts 同步 SQL 里各类语句实际生成的条数
type DataCompareSQLCounts struct {
	Update int `json:"update"`
	Insert int `json:"insert"`
	Delete int `json:"delete"`
}

type DataCompareResult struct {
	// 参与对比的列
	KeyColumns        []string `json:"key_columns"`
	CompareColumns    []string `json:"compare_columns"`
	SourceOnlyColumns []string `json:"source_only_columns"`
	TargetOnlyColumns []string `json:"target_only_columns"`
	// 行数与分类
	SourceRows      int `json:"source_rows"`
	TargetRows      int `json:"target_rows"`
	SameCount       int `json:"same_count"`
	ModifiedCount   int `json:"modified_count"`
	SourceOnlyCount int `json:"source_only_count"`
	TargetOnlyCount int `json:"target_only_count"`
	// 任一侧超过 max_rows 提前停止：上面的数字只是已读取部分的，
	// 同步 SQL 也只包含 UPDATE（没读到的部分里可能正好有「仅在另一侧」的行）
	Truncated bool     `json:"truncated"`
	Warnings  []string `json:"warnings"`
	// 明细（每类最多保留前若干条，按主键排序）
	Modified   []DataCompareModified `json:"modified"`
	SourceOnly []DataCompareRow      `json:"source_only"`
	TargetOnly []DataCompareRow      `json:"target_only"`
	// 同步 SQL：把目标表改成和源表一致。只为审阅与手动执行而生成，本功能不执行它
	SQL          string               `json:"sql"`
	SQLCounts    DataCompareSQLCounts `json:"sql_counts"`
	SQLTruncated bool                 `json:"sql_truncated"`
}
