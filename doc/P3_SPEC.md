# P3 — 高级功能详细规格

> **目标**: 数据同步、备份恢复、用户管理、新数据库驱动等长期功能  
> **预估总时间**: ~94 小时

---

## P3-1: 数据同步/比较工具

**预估**: 40 小时  
**优先级**: 🟢 低 (商业级功能)

### 功能范围

Navicat Premium 的数据同步功能包含:
1. **结构同步**: 对比两个数据库/表的结构差异，生成 ALTER 语句
2. **数据同步**: 对比两个表的数据差异，生成 INSERT/UPDATE/DELETE 语句

### 实现方案

由于这是商业级功能，建议分步实现:

#### 第一阶段: 结构比较

创建 `SchemaCompare` 组件:
- 选择源和目标数据库
- 对比列定义差异
- 对比索引差异
- 对比外键差异
- 生成 ALTER TABLE 语句预览
- 一键执行

后端 API:
```go
// POST /compare-schema
type CompareSchemaRequest struct {
    SourceConnID   string `json:"source_connection_id"`
    SourceDB       string `json:"source_database"`
    TargetConnID   string `json:"target_connection_id"`
    TargetDB       string `json:"target_database"`
    TableName      string `json:"table_name"`    // 可选，单表对比
}
```

#### 第二阶段: 数据比较

类似 Navicat 的并排对比视图，左右分栏显示两个表的数据，高亮差异行。

### 关键技术点

- 结构对比: 调用两边的 `getTableStructure` API 并对比
- 数据对比: 需要后端流式返回行数据，前端做 diff
- 大表对比: 需要分批对比，不能全量加载

---

## P3-2: 备份恢复

**预估**: 16 小时  
**优先级**: 🟡 中

### 功能范围

调用数据库原生备份工具:
- MySQL: `mysqldump`
- PostgreSQL: `pg_dump`
- SQLite: 文件复制
- 达梦/人大金仓: 各自的备份工具

### 实现方案

重点实现 MySQL 和 PostgreSQL 的备份恢复:

#### 1. 备份

```typescript
// 前端 UI
interface BackupOptions {
  connectionId: string;
  database: string;
  tables?: string[];       // 空 = 全库
  includeStructure: boolean;
  includeData: boolean;
  filePath: string;         // 保存路径
}

// Go 后端
// 调用 mysqldump/pg_dump 命令行工具
// 将输出写入文件或通过 HTTP 流式返回
```

#### 2. 恢复

```typescript
// 前端 UI
interface RestoreOptions {
  connectionId: string;
  database: string;
  filePath: string;
}
```

#### 3. 检测备份工具

Go 后端需要检测系统是否安装了 `mysqldump`/`pg_dump`:
```go
func checkBackupTools(dbType string) (available bool, path string) {
    switch dbType {
    case "mysql", "mariadb":
        path, _ = exec.LookPath("mysqldump")
        return path != "", path
    case "postgresql", "kingbase", "highgo", "vastbase":
        path, _ = exec.LookPath("pg_dump")
        return path != "", path
    default:
        return false, ""
    }
}
```

### 验收标准

- [ ] MySQL 数据库可以备份为 .sql 文件
- [ ] PostgreSQL 数据库可以备份为 .sql 文件
- [ ] 备份文件可以恢复
- [ ] 未安装备份工具时给出友好错误提示

---

## P3-3: 用户权限管理

**预估**: 12 小时  
**优先级**: 🟢 低

### 功能范围

可视化界面管理数据库用户和权限:
- 创建/删除用户
- 授予/撤销权限 (GRANT/REVOKE)
- 查看用户列表和权限

### 实现方案

#### 后端 API

```go
// POST /users          - 获取用户列表
// POST /create-user    - 创建用户
// POST /drop-user      - 删除用户
// POST /grant          - 授予权限
// POST /revoke         - 撤销权限
// POST /user-privileges - 获取用户权限
```

所有操作通过 `executeDDL` 实现，不需要专用 API。前端 UI 直接构建 DDL 语句:

```sql
-- MySQL
CREATE USER 'username'@'host' IDENTIFIED BY 'password';
GRANT SELECT, INSERT ON database.* TO 'username'@'host';

-- PostgreSQL
CREATE ROLE username WITH LOGIN PASSWORD 'password';
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO username;
```

### 验收标准

- [ ] 连接树右键数据库 → "用户管理" 打开用户管理面板
- [ ] 可创建新用户
- [ ] 可授予/撤销权限
- [ ] 可删除用户
- [ ] 支持 MySQL 和 PostgreSQL

---

## P3-4: SQL Server 驱动集成

**预估**: 8 小时  
**优先级**: 🟡 中

### 现状

前端 `DatabaseType` 已定义 `'sqlserver'`，连接对话框中可以选 SQL Server。但 Go 后端 `db/sqlserver.go` 不存在，连接时返回错误。

### 实现步骤

#### 1. 添加 Go 依赖

```bash
cd go-backend
go get github.com/microsoft/go-mssqldb
```

#### 2. 创建驱动文件

`go-backend/db/sqlserver.go`:

```go
package db

import (
    "database/sql"
    _ "github.com/microsoft/go-mssqldb"
)

func openSQLServer(conn *ConnectionConfig) (*sql.DB, error) {
    // 构建 DSN: sqlserver://user:password@host:port?database=dbname
    dsn := fmt.Sprintf("sqlserver://%s:%s@%s:%d?database=%s&encrypt=disable",
        conn.Username, conn.Password, conn.Host, conn.Port, conn.Database)
    return sql.Open("sqlserver", dsn)
}

func (e *SQLServerExecutor) GetDatabases() ([]string, error) {
    // SELECT name FROM sys.databases
}

func (e *SQLServerExecutor) GetTables(schema string) ([]TableInfo, error) {
    // SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES
}

// ... 其他元数据查询
```

#### 3. 注册驱动

在 `db/manager.go` 的 `openDB()` switch 中添加:
```go
case "sqlserver":
    db, err = openSQLServer(&config)
```

在 `db/manager.go` 的 `GetExecutor()` 中添加 SQLServerExecutor。

#### 4. 元数据查询

参考已有的 `db/mysql.go` 和 `db/postgres.go` 实现:
- `GetColumns`: `SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ?`
- `GetIndexes`: `EXEC sp_helpindex ?`
- `GetForeignKeys`: `SELECT * FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS`
- `GetServerInfo`: `SELECT @@VERSION`

#### 5. 前端验证

连接对话框中 SQL Server 的默认端口应为 `1433`（当前可能是 `3306`）。需要修改:

```typescript
// ConnectionDialog.tsx 中数据库类型默认端口映射
const DEFAULT_PORTS: Record<string, number> = {
  mysql: 3306,
  postgresql: 5432,
  sqlserver: 1433,  // ← 确认已有
  sqlite: 0,
  oracle: 1521,
  // ...
};
```

### 验收标准

- [ ] 可以创建 SQL Server 连接
- [ ] 测试连接成功
- [ ] 可以浏览数据库和表
- [ ] 可以执行 SQL 查询
- [ ] 元数据查询正确（列、索引、外键）
- [ ] 事务控制正确

---

## P3-5: Oracle 驱动集成

**预估**: 8 小时  
**优先级**: 🟢 低 (需 Oracle Instant Client)

### 实现步骤

与 SQL Server 类似:
1. `go get github.com/sijms/go-ora/v2`
2. 创建 `go-backend/db/oracle.go`
3. DSN 格式: `oracle://user:password@host:1521/service_name`
4. 元数据查询使用 Oracle 系统视图 (`DBA_TABLES`, `DBA_TAB_COLUMNS` 等)
5. 注册到 `openDB()` switch

### 注意事项

- Oracle Instant Client 需要预装
- 达梦 (DM) 的实现模式可作为参考，因为达梦也有类似的系统视图

---

## P3-6: 查询参数化

**预估**: 6 小时  
**优先级**: 🟢 低

### 规格说明

支持在 SQL 中使用 `:param_name` 或 `?` 参数，执行时弹出参数输入对话框。

#### UI

```
┌─────────────────────────────────────────┐
│  参数值                                  │
├─────────────────────────────────────────┤
│                                         │
│  :user_id   [_________________________]  │
│  :status    [_________________________]  │
│                                         │
│            [取消]  [执行]                │
└─────────────────────────────────────────┘
```

#### 实现

```typescript
// 1. 从 SQL 中提取参数
function extractParams(sql: string): string[] {
  const matches = sql.match(/:(\w+)/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.substring(1)))];
}

// 2. 执行前检查参数
const params = extractParams(sql);
if (params.length > 0) {
  // 弹出参数输入对话框
  const values = await showParamDialog(params);
  // 替换参数
  let finalSql = sql;
  for (const [key, value] of Object.entries(values)) {
    finalSql = finalSql.replaceAll(`:${key}`, escapeSqlValue(value));
  }
  // 执行替换后的 SQL
}
```

### 安全注意

这种替换方式存在 SQL 注入风险。更安全的方式是使用预处理语句（prepared statements），但需要对 Go 后端做更复杂的改造。

---

## P3-7: 多语言支持 (i18n)

**预估**: 20 小时  
**优先级**: 🟢 低

### 实现方案

使用 `react-i18next`:

```bash
pnpm add react-i18next i18next
```

#### 1. 创建翻译文件

```
src/i18n/
  locales/
    zh-CN.json    # 简体中文 (当前)
    en-US.json    # 英文
  index.ts        # i18n 配置
```

#### 2. 配置 i18next

```typescript
// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
});

export default i18n;
```

#### 3. 提取所有中文文案

这是最耗时的步骤。当前代码中有大量硬编码的中文文案:
- `EnhancedConnectionTree.tsx`: ~50 处
- `DataTable.tsx`: ~40 处
- `SQLEditor.tsx`: ~30 处
- `ConnectionDialog.tsx`: ~60 处
- `TableDesigner.tsx`: ~40 处
- `SettingsDialog.tsx`: ~20 处
- 其他组件: ~50 处

每个组件中替换 `硬编码文字` 为 `t('translation.key')`。

#### 4. 设置页面

`SettingsDialog` 已有 `language` 字段，需要对接 i18next:

```typescript
const handleLanguageChange = (lang: string) => {
  i18n.changeLanguage(lang);
  updateSettings({ language: lang });
};
```

### 验收标准

- [ ] 设置页面可以切换中文/英文
- [ ] 所有 UI 文案正确翻译
- [ ] 切换语言后无需刷新即可生效
- [ ] 翻译文件格式标准，便于后续添加更多语言