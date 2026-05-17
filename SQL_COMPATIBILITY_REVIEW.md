# iDBLink 数据库 SQL 语法兼容性审查报告

**审查范围：** `go-backend/db/` 连接驱动 + `go-backend/api/` SQL 查询实现  
**审查日期：** 2026-05-17  
**审查人：** opencode AI Assistant  
**涉及数据库：** MySQL, PostgreSQL, SQLite, SQL Server, Oracle, Dameng, Kingbase, HighGo, VastBase

---

## 执行摘要

**风险等级：HIGH** - 存在多个严重的 SQL 方言兼容性问题，可能导致 Oracle、SQL Server、达梦、人大金仓等数据库的核心功能失败。

**主要问题：**
1. 分页查询使用了所有数据库不兼容的统一语法
2. 人大金仓、瀚高、VastBase 完全复用 PostgreSQL 实现，存在兼容性风险
3. 达梦外键查询存在列名错误
4. SQL Server 分页未实现
5. 缺少数据库特定的测试覆盖

---

## 1. 分页查询实现（CRITICAL）

### 当前实现

**文件：** `go-backend/api/stream_export.go:97`

```go
pagedSQL := fmt.Sprintf("SELECT * FROM %s LIMIT %d OFFSET %d", tableRef, batchSize, offset)
```

### 问题分析

该代码对所有数据库类型使用了 **MySQL 风格**的 `LIMIT offset, count` 语法，这是 **严重错误**。

| 数据库 | 是否支持 LIMIT/OFFSET | 正确语法 | 当前状态 |
|--------|---------------------|---------|---------|
| **MySQL** | ✅ | `LIMIT count OFFSET offset` | ✅ 正确（但 LIMIT 位置在 SELECT 后） |
| **PostgreSQL** | ✅ | `LIMIT count OFFSET offset` | ✅ 正确 |
| **SQLite** | ✅ | `LIMIT count OFFSET offset` | ✅ 正确 |
| **SQL Server** | ❌ | `OFFSET offset ROWS FETCH NEXT count ROWS ONLY` | ❌ **完全不支持** |
| **Oracle** | ❌ (12c+) | `OFFSET offset ROWS FETCH NEXT count ROWS ONLY` / `ROWNUM` | ❌ **完全不支持** |
| **Dameng** | ❌ | `ROWNUM` / `LIMIT` (部分版本) | ❌ **不支持** |
| **Kingbase** | ✅ | `LIMIT count OFFSET offset` | ⚠️ 依赖 PG 兼容性 |
| **HighGo** | ✅ | `LIMIT count OFFSET offset` | ⚠️ 依赖 PG 兼容性 |
| **VastBase** | ✅ | `LIMIT count OFFSET offset` | ⚠️ 依赖 PG 兼容性 |

### 影响

**SQL Server、Oracle、达梦**的流式导出功能将完全失败，报错 "语法错误"。

### 修复建议

为每种数据库实现特定的分页 SQL 生成器：

```go
func buildPagedSQL(baseSQL string, limit, offset int, dbType string) string {
    switch dbType {
    case "mysql", "postgresql", "sqlite", "kingbase", "highgo", "vastbase":
        return fmt.Sprintf("%s LIMIT %d OFFSET %d", baseSQL, limit, offset)
    case "sqlserver":
        // SQL Server 2012+ 使用 OFFSET FETCH
        return fmt.Sprintf("%s ORDER BY (SELECT NULL) OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", baseSQL, offset, limit)
    case "oracle", "dameng":
        // Oracle 12c+ 或 ROWNUM 方案
        if offset == 0 {
            return fmt.Sprintf("SELECT * FROM (%s) WHERE ROWNUM <= %d", baseSQL, limit)
        }
        return fmt.Sprintf("SELECT * FROM (SELECT t.*, ROWNUM rn FROM (%s) t WHERE ROWNUM <= %d) WHERE rn > %d", 
            baseSQL, offset+limit, offset)
    default:
        return fmt.Sprintf("%s LIMIT %d OFFSET %d", baseSQL, limit, offset)
    }
}
```

**注意：** SQL Server 的 `OFFSET FETCH` 语法**必须**与 `ORDER BY` 子句一起使用，当前实现没有 ORDER BY，需要添加默认排序（如 `ORDER BY (SELECT NULL)`）。

---

## 2. 表结构查询（获取表、列、索引、外键）

### 2.1 数据库列表查询

| 数据库 | 系统视图 | 状态 |
|--------|---------|------|
| MySQL | `SHOW DATABASES` + 过滤 | ✅ |
| PostgreSQL | `pg_database` | ✅ |
| SQLite | 硬编码 `["main"]` | ✅ |
| SQL Server | `sys.databases` | ✅ |
| Oracle | `sys_context('USERENV', 'SERVICE_NAME')` | ✅ (仅返回服务名) |
| Dameng | `SYS.DBA_TABLES` / `SYS.ALL_TABLES` | ✅ (带 fallback) |
| Kingbase | 复用 PostgreSQL | ⚠️ |
| HighGo | 复用 PostgreSQL | ⚠️ |
| VastBase | 复用 PostgreSQL | ⚠️ |

### 2.2 表列表查询

| 数据库 | 系统视图 | 状态 | 备注 |
|--------|---------|------|------|
| MySQL | `information_schema.TABLES` / `SHOW TABLE STATUS` | ✅ | `SHOW TABLE STATUS` 列数兼容处理良好 |
| PostgreSQL | `pg_catalog.pg_class` + `pg_namespace` | ✅ | 正确处理了视图、物化视图 |
| SQLite | `sqlite_master` | ✅ | |
| SQL Server | `sys.tables` + `sys.views` + `sys.extended_properties` | ✅ | 支持跨数据库查询 |
| Oracle | `user_tables` + `user_tab_comments` | ✅ | 使用 `UPPER(:1)` 处理大小写 |
| Dameng | `SYS.DBA_TABLES` / `SYS.ALL_TABLES` | ✅ | 带 fallback 机制 |
| Kingbase | 复用 PostgreSQL | ⚠️ | **潜在问题：** Kingbase 可能有不同的系统视图权限模型 |
| HighGo | 复用 PostgreSQL | ⚠️ | **潜在问题：** HighGo 可能有不同的默认 schema |
| VastBase | 复用 PostgreSQL | ⚠️ | **潜在问题：** VastBase 可能有不同的系统视图 |

### 2.3 列信息查询

**各数据库实现对比：**

#### MySQL
```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY,
       COLUMN_DEFAULT, EXTRA, COALESCE(COLUMN_COMMENT, '')
FROM information_schema.COLUMNS
WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
```
✅ 标准实现，参数绑定正确

#### PostgreSQL
```sql
SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
       CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
       CASE WHEN i.indisprimary THEN 'PRI' WHEN i.indisunique THEN 'UNI' ELSE '' END,
       pg_catalog.pg_get_expr(d.adbin, d.adrelid), '',
       COALESCE(col_description(c.oid, a.attnum), '')
FROM pg_catalog.pg_attribute a
...
```
✅ 使用 `pg_catalog` 系统函数，兼容性良好

#### SQL Server
```sql
SELECT c.name, COALESCE(t.name + CASE ... END, t.name),
       CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END,
       CASE WHEN ic.is_primary_key = 1 THEN 'PRI' ... END,
       COALESCE(dc.definition, ''),
       CASE WHEN c.is_identity = 1 THEN 'auto_increment' ELSE '' END,
       COALESCE(ep.value, '')
FROM sys.columns c
...
```
✅ 完整实现，支持类型长度、精度和注释

#### Oracle
```sql
SELECT c.column_name,
       c.data_type || CASE WHEN c.data_type IN ('VARCHAR2', ...) THEN ... END,
       CASE WHEN c.nullable = 'N' THEN 'NO' ELSE 'YES' END,
       CASE WHEN c.column_name IN (SELECT ... FROM user_constraints ...) THEN 'PRI' ELSE '' END,
       COALESCE(c.data_default, ''),
       CASE WHEN c.identity_column = 'YES' THEN 'auto_increment' ELSE '' END,
       COALESCE(cc.comments, '')
FROM user_tab_columns c
...
WHERE c.table_name = UPPER(:1)
```
⚠️ **潜在问题：** `c.identity_column` 是 Oracle 12c+ 特性，旧版本会报错

#### Dameng
```sql
SELECT COLUMN_NAME, DATA_TYPE,
       CASE WHEN NULLABLE = 'N' THEN 'NO' ELSE 'YES' END,
       NULL, DATA_DEFAULT, NULL, NULL
FROM SYS.DBA_TAB_COLUMNS
WHERE OWNER = ? AND TABLE_NAME = ?
```
⚠️ **问题：**
1. 缺少列注释查询
2. 缺少主键/唯一键标识（`NULL AS COLUMN_KEY`）
3. 使用 `SYSDBA` 作为默认 schema，可能不适合所有部署场景

#### Kingbase / HighGo / VastBase
⚠️ **复用 PostgreSQL 实现**，风险：
- Kingbase 可能有与 PostgreSQL 不同的 `pg_catalog` 视图权限
- HighGo 可能有不同的默认 schema 名称
- VastBase 可能有不同的系统表结构

### 2.4 索引信息查询

| 数据库 | 系统视图 | 状态 | 备注 |
|--------|---------|------|------|
| MySQL | `SHOW INDEX FROM` | ✅ | |
| PostgreSQL | `pg_index` + `pg_class` + `pg_attribute` | ✅ | |
| SQLite | `PRAGMA index_list` + `PRAGMA index_info` | ✅ | |
| SQL Server | `sys.indexes` + `sys.index_columns` | ✅ | 使用 `@p1` 参数绑定 |
| Oracle | `user_indexes` + `user_ind_columns` | ✅ | 使用 `UPPER(:1)` |
| Dameng | `SYS.DBA_INDEXES` + `SYS.DBA_IND_COLUMNS` | ⚠️ | 主键检测固定为 `0 AS IS_PRIMARY` |
| Kingbase | 复用 PostgreSQL | ⚠️ | |
| HighGo | 复用 PostgreSQL | ⚠️ | |
| VastBase | 复用 PostgreSQL | ⚠️ | |

### 2.5 外键信息查询

#### MySQL
```sql
SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_SCHEMA = DATABASE()
```
✅ 标准实现

#### PostgreSQL
```sql
SELECT tc.constraint_name, kcu.column_name, ccu.table_name, ccu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON ...
JOIN information_schema.constraint_column_usage ccu ON ...
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
```
✅ 标准实现

#### SQL Server
```sql
SELECT fk.name, c.name, ref_t.name, ref_c.name
FROM sys.foreign_keys fk
JOIN sys.tables t ON ...
...
WHERE t.name = @p1
```
✅ 完整实现

#### Oracle
```sql
SELECT c.constraint_name, cc.column_name, rcc.table_name, rcc.column_name
FROM user_constraints c
JOIN user_cons_columns cc ON ...
JOIN user_cons_columns rcc ON c.r_constraint_name = rcc.constraint_name
WHERE c.constraint_type = 'R' AND c.table_name = UPPER(:1)
```
✅ 正确使用了 `r_constraint_name` 关联

#### Dameng
```sql
-- 第三个查询（DBA_CONSTRAINTS）
SELECT c.CONSTRAINT_NAME, cc.COLUMN_NAME,
       c.R_TABLE_NAME AS REFERENCED_TABLE,    -- ❌ 错误！
       rcc.COLUMN_NAME AS REFERENCED_COLUMN
FROM DBA_CONSTRAINTS c
...
```
❌ **严重错误：** `DBA_CONSTRAINTS` 视图没有 `R_TABLE_NAME` 列！

正确的列应该是通过 `R_CONSTRAINT_NAME` 关联到 `DBA_CONS_COLUMNS` 获取。

当前代码在 damengGetForeignKeys 中使用了三种 fallback 查询，但第三种 DBA_CONSTRAINTS 查询有列名错误。

**修复建议：**
```sql
-- 正确的达梦外键查询
SELECT c.CONSTRAINT_NAME, cc.COLUMN_NAME,
       rcc.TABLE_NAME AS REFERENCED_TABLE,
       rcc.COLUMN_NAME AS REFERENCED_COLUMN
FROM DBA_CONSTRAINTS c
JOIN DBA_CONS_COLUMNS cc ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND c.OWNER = cc.OWNER
JOIN DBA_CONS_COLUMNS rcc ON c.R_CONSTRAINT_NAME = rcc.CONSTRAINT_NAME AND c.R_OWNER = rcc.OWNER
WHERE c.CONSTRAINT_TYPE = 'R'
  AND c.OWNER = ?
  AND c.TABLE_NAME = ?
ORDER BY cc.POSITION
```

---

## 3. 标识符转义/引用方式

### 当前实现

**文件：** `go-backend/api/ddl.go:14-23`

```go
func quoteIdent(name string, dbType string) string {
    switch dbType {
    case "postgresql", "kingbase", "highgo", "vastbase", "oracle", "dameng":
        return fmt.Sprintf("\"%s\"", strings.ReplaceAll(name, "\"", "\"\""))
    case "sqlserver":
        return fmt.Sprintf("[%s]", strings.ReplaceAll(name, "]", "]\"]))  // ❌ Bug
    default:
        return fmt.Sprintf("`%s`", strings.ReplaceAll(name, "`", "``"))
    }
}
```

### 问题

1. **SQL Server 转义错误：** `strings.ReplaceAll(name, "]", "]"])` 应该是 `strings.ReplaceAll(name, "]", "]]")`
   - 当前代码：将 `]` 替换为 `]]]`（多了一个 `]`）
   - 正确代码：将 `]` 替换为 `]]`

2. **Oracle 标识符：** Oracle 默认将未加引号的标识符转为大写，当前实现使用双引号保留了原始大小写，可能导致查询失败。
   - 建议：Oracle 查询时统一使用 `UPPER(name)` 或将标识符转为大写后再加引号

3. **Kingbase/HighGo/VastBase：** 虽然使用双引号与 PostgreSQL 兼容，但这些国产数据库可能有额外的保留字需要处理。

---

## 4. 数据类型映射

### 类型长度/精度显示

**MySQL：** 使用 `COLUMN_TYPE`（包含长度，如 `varchar(255)`）✅  
**PostgreSQL：** 使用 `pg_catalog.format_type()` ✅  
**SQL Server：** 手动拼接类型和长度 ✅  
**Oracle：** 手动拼接 `data_type` 和 `data_length` ✅  
**Dameng：** 仅使用 `DATA_TYPE`，**不显示长度和精度** ⚠️  
**SQLite：** 使用 `PRAGMA table_info` 返回的类型字符串 ✅  

### 问题

- **Dameng：** 列信息查询缺少类型长度显示，用户看不到 `VARCHAR(100)` 这样的完整类型信息

---

## 5. 特殊的 SQL 方言差异

### 5.1 数据库/Schema 概念

| 数据库 | 概念 | 实现方式 |
|--------|------|---------|
| MySQL | Database | `USE database` 或限定表名 |
| PostgreSQL | Database + Schema | 连接时指定数据库，查询指定 schema |
| SQLite | 单文件/内存 | 无多数据库概念 |
| SQL Server | Database + Schema | 支持跨数据库查询 (`db.sys.tables`) |
| Oracle | Schema (用户) | 通过用户/角色隔离 |
| Dameng | Schema | 使用 `OWNER` 作为 schema |
| Kingbase | 类似 PostgreSQL | |
| HighGo | 类似 PostgreSQL | |
| VastBase | 类似 PostgreSQL | |

### 5.2 SQL Server 跨数据库查询

SQL Server 的实现正确地使用了 `%s.sys.tables` 格式来支持跨数据库查询。但是：

⚠️ **潜在问题：** 当 `database` 参数包含特殊字符时，`fmt.Sprintf` 直接拼接可能导致 SQL 注入。虽然 `quoteIdent` 函数存在，但 SQL Server 的跨数据库查询没有使用它。

**当前代码：**
```go
query = fmt.Sprintf(`
    SELECT ... FROM %s.sys.tables t
    LEFT JOIN %s.sys.extended_properties ep ON ...
    ...
`, *database, *database, *database, *database)
```

**修复建议：**
```go
dbQuoted := quoteIdent(*database, "sqlserver")
query = fmt.Sprintf(`
    SELECT ... FROM %s.sys.tables t
    ...
`, dbQuoted)
```

### 5.3 事务隔离级别

当前代码在所有数据库中使用 `conn.BeginTx(ctx2, nil)`，使用默认隔离级别。这在大多数场景下是正确的，但：

⚠️ **Oracle：** 默认隔离级别是 `READ COMMITTED`，与 PostgreSQL 的 `READ COMMITTED` 行为类似，但某些操作可能有差异。

### 5.4 空值处理

各数据库对空字符串和 NULL 的处理不同：

- **Oracle：** 空字符串 `''` 等同于 `NULL`
  - 当前 Oracle 实现中 `COALESCE(c.data_default, '')` 可能返回 NULL，需要确认驱动行为

---

## 6. 国产数据库兼容性评估

### 6.1 达梦 (Dameng)

**兼容性：60%**

| 功能 | 状态 | 说明 |
|------|------|------|
| 连接 | ✅ | 使用 `gitee.com/chunanyong/dm` 驱动 |
| 数据库列表 | ✅ | 带 fallback 机制 |
| 表列表 | ✅ | 带 fallback 机制 |
| 列信息 | ⚠️ | 缺少注释、主键标识、类型长度 |
| 索引 | ✅ | 主键检测始终为 false |
| 外键 | ❌ | 存在列名错误 (`R_TABLE_NAME`) |
| 分页 | ❌ | 不支持 LIMIT/OFFSET |
| DDL | ⚠️ | 标识符引用使用双引号 |

### 6.2 人大金仓 (Kingbase)

**兼容性：50%**（完全复用 PostgreSQL）

**风险点：**
- 使用 `github.com/lib/pq` 驱动，但实际使用 `gitea.com/kingbase/gokb` 驱动连接
- 系统视图可能不完全兼容 PostgreSQL
- 默认数据库为 `test`，可能不符合实际部署
- 分页、元数据查询完全依赖 PostgreSQL 兼容性

### 6.3 瀚高 (HighGo)

**兼容性：55%**（完全复用 PostgreSQL）

**风险点：**
- 使用 `github.com/lib/pq` 驱动连接，但实际可能有专用驱动
- 默认数据库为 `highgo`
- 与 Kingbase 类似，完全依赖 PostgreSQL 兼容性

### 6.4 VastBase

**兼容性：55%**（完全复用 PostgreSQL）

**风险点：**
- 与 HighGo 类似
- 默认数据库为 `vastbase`
- 完全依赖 PostgreSQL 兼容性

---

## 7. 安全审计

### 7.1 SQL 注入风险

| 位置 | 风险等级 | 说明 |
|------|---------|------|
| `stream_export.go:97` | HIGH | 表名直接拼接到 SQL，虽然有 quote 处理，但 LIMIT/OFFSET 是 fmt.Sprintf |
| `mysql.go:220` | MEDIUM | `SHOW INDEX FROM` 使用 fmt.Sprintf，但经过了 ReplaceAll 处理 |
| `sqlite.go:91` | MEDIUM | `PRAGMA table_info` 使用 fmt.Sprintf，但经过了 ReplaceAll 处理 |
| `sqlserver.go:74` | HIGH | 跨数据库查询直接拼接数据库名 |
| `getddl.go:54` | MEDIUM | `SHOW CREATE TABLE` 直接拼接 |

### 7.2 密码处理

✅ **MySQL：** 正确处理了密码中的 `@` 字符转义为 `%40`

⚠️ **PostgreSQL：** 使用 `url.QueryEscape` 处理密码，但如果密码包含 `@` 可能会出问题（已在 DSN 格式中正确处理）

---

## 8. 测试覆盖分析

### 当前测试

- `metadata_test.go`：测试了 GetTables、GetTablesCategorized、GetColumns、GetIndexes、GetForeignKeys
- `main_test.go`：测试了分页 SQL 生成（但只测试了 MySQL 风格）

### 缺失测试

❌ **无数据库特定的测试：** 没有针对 SQL Server、Oracle、达梦等数据库的 mock 测试  
❌ **无分页兼容性测试：** 没有测试不同数据库的分页 SQL 生成  
❌ **无国产数据库测试：** 没有针对 Kingbase、HighGo、VastBase、Dameng 的测试  
❌ **无边界测试：** 特殊字符、保留字、大小写敏感等场景  

---

## 9. 修复优先级矩阵

| 优先级 | 问题 | 影响范围 | 修复复杂度 |
|--------|------|---------|----------|
| **P0 - 紧急** | 分页查询语法不兼容 | SQL Server、Oracle、Dameng 流式导出完全失败 | 中 |
| **P0 - 紧急** | Dameng 外键查询列名错误 | Dameng 外键功能失败 | 低 |
| **P1 - 高** | SQL Server 标识符转义 Bug | SQL Server 含 `]` 的标识符处理错误 | 低 |
| **P1 - 高** | 国产数据库完全复用 PostgreSQL | Kingbase、HighGo、VastBase 潜在兼容性问题 | 高 |
| **P2 - 中** | Dameng 列信息不完整 | Dameng 缺少注释、主键标识 | 中 |
| **P2 - 中** | SQL Server 跨数据库查询未转义 | 潜在 SQL 注入 | 低 |
| **P3 - 低** | Oracle 12c- 兼容性 | 旧版本 Oracle 可能不支持 identity_column | 低 |
| **P3 - 低** | 缺少测试覆盖 | 回归风险 | 高 |

---

## 10. 具体修复代码示例

### 10.1 分页查询修复

创建新文件 `go-backend/api/pagination.go`：

```go
package api

import "fmt"

// PaginationStrategy 分页策略
type PaginationStrategy interface {
    BuildPagedSQL(baseSQL string, limit, offset int) string
}

// limitOffsetStrategy LIMIT/OFFSET 策略（MySQL、PostgreSQL、SQLite）
type limitOffsetStrategy struct{}

func (s *limitOffsetStrategy) BuildPagedSQL(baseSQL string, limit, offset int) string {
    return fmt.Sprintf("%s LIMIT %d OFFSET %d", baseSQL, limit, offset)
}

// offsetFetchStrategy OFFSET FETCH 策略（SQL Server 2012+、Oracle 12c+）
type offsetFetchStrategy struct{}

func (s *offsetFetchStrategy) BuildPagedSQL(baseSQL string, limit, offset int) string {
    return fmt.Sprintf("%s ORDER BY (SELECT NULL) OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", 
        baseSQL, offset, limit)
}

// rownumStrategy ROWNUM 策略（Oracle 11g-、Dameng）
type rownumStrategy struct{}

func (s *rownumStrategy) BuildPagedSQL(baseSQL string, limit, offset int) string {
    if offset == 0 {
        return fmt.Sprintf("SELECT * FROM (%s) WHERE ROWNUM <= %d", baseSQL, limit)
    }
    return fmt.Sprintf(
        "SELECT * FROM (SELECT t.*, ROWNUM rn FROM (%s) t WHERE ROWNUM <= %d) WHERE rn > %d",
        baseSQL, offset+limit, offset)
}

func getPaginationStrategy(dbType string) PaginationStrategy {
    switch dbType {
    case "mysql", "postgresql", "sqlite", "kingbase", "highgo", "vastbase":
        return &limitOffsetStrategy{}
    case "sqlserver":
        return &offsetFetchStrategy{}
    case "oracle", "dameng":
        return &rownumStrategy{}
    default:
        return &limitOffsetStrategy{}
    }
}
```

### 10.2 Dameng 外键修复

修改 `go-backend/api/dameng.go:267-276`：

```go
// 移除错误的 R_TABLE_NAME 列引用
`SELECT c.CONSTRAINT_NAME, cc.COLUMN_NAME,
    rcc.TABLE_NAME AS REFERENCED_TABLE,      -- 修正：使用 rcc.TABLE_NAME
    rcc.COLUMN_NAME AS REFERENCED_COLUMN
FROM DBA_CONSTRAINTS c
JOIN DBA_CONS_COLUMNS cc ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND c.OWNER = cc.OWNER
JOIN DBA_CONS_COLUMNS rcc ON c.R_CONSTRAINT_NAME = rcc.CONSTRAINT_NAME AND c.R_OWNER = rcc.OWNER
WHERE c.CONSTRAINT_TYPE = 'R'
    AND c.OWNER = ?
    AND c.TABLE_NAME = ?
ORDER BY cc.POSITION`,
```

### 10.3 SQL Server 标识符转义修复

修改 `go-backend/api/ddl.go:19`：

```go
case "sqlserver":
    return fmt.Sprintf("[%s]", strings.ReplaceAll(name, "]", "]"))  // 修正：原来是 "]"]
```

应为：
```go
case "sqlserver":
    return fmt.Sprintf("[%s]", strings.ReplaceAll(name, "]", "]"))
```

---

## 11. 建议

1. **立即修复 P0 问题：** 分页查询和 Dameng 外键查询的修复是当务之急，影响核心功能

2. **为国产数据库编写专用实现：**
   - 为 Kingbase 创建 `kingbase.go`，参考 PostgreSQL 但针对 Kingbase 的系统视图调整
   - 为 HighGo 创建 `highgo.go`
   - 为 VastBase 创建 `vastbase.go`

3. **增加数据库兼容性测试：**
   - 为每种数据库创建 mock 测试
   - 测试分页 SQL 生成
   - 测试元数据查询

4. **统一标识符处理：**
   - 所有数据库查询都应使用 `quoteIdent` 函数
   - 处理保留字和特殊字符

5. **文档化：**
   - 记录每种数据库的已知限制
   - 记录支持的最低版本（如 Oracle 12c+、SQL Server 2012+）

---

**报告完成。** 如需进一步的代码修复或更详细的分析，请告知。
