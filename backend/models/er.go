package models

// ERDiagram ER 图数据：一次请求拿齐表、列、外键。
type ERDiagram struct {
	Tables []ERTable `json:"tables"`
	Edges  []EREdge  `json:"edges"`
	// 通用路径里逐表取外键时的失败摘要（最多几条）
	Warnings []string `json:"warnings,omitempty"`
	// true = 走了通用兜底路径（逐表查外键，表多时明显变慢）；MySQL / PG 系 / SQLite 为 false
	SlowPath bool `json:"slow_path"`
}

// ERTable ER 图里的一个表节点。
type ERTable struct {
	// 前端节点 id：PG 系为 "schema.table"，其余为表名。外键两端用的也是这个 id。
	ID      string     `json:"id"`
	Name    string     `json:"name"`
	Schema  string     `json:"schema,omitempty"`
	Comment string     `json:"comment"`
	Columns []ERColumn `json:"columns"`
}

// ERColumn 列（只带画图需要的属性）
type ERColumn struct {
	Name     string `json:"name"`
	DataType string `json:"data_type"`
	Nullable bool   `json:"nullable"`
	IsPK     bool   `json:"is_pk"`
	Comment  string `json:"comment,omitempty"`
}

// EREdge 一条外键关系（复合外键按列拆成多条，Seq 是该列在约束里的顺序）
type EREdge struct {
	Name       string `json:"name,omitempty"`
	FromTable  string `json:"from_table"`
	FromColumn string `json:"from_column"`
	ToTable    string `json:"to_table"`
	ToColumn   string `json:"to_column"`
	Seq        int    `json:"seq"`
}
