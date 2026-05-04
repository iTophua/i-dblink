# iDBLink 自动化测试计划

> **版本**: 1.0  
> **日期**: 2026-05-04  
> **目标**: 建立覆盖前端、Rust 层、Go Sidecar、E2E 的完整自动化测试体系

---

## 1. 现状分析

### 1.1 现有测试

| 层级 | 框架 | 已有测试 | 覆盖率 | 状态 |
|------|------|----------|--------|------|
| **前端单元** | Vitest + jsdom | 23 个测试文件 | ~15% | 有基础，不完整 |
| **前端组件** | Testing Library | 4 个组件 | ~10% | 需大幅扩展 |
| **前端 E2E** | Playwright | 5 个测试文件 | ~5% | 基础 smoke 测试 |
| **Go 后端** | Go testing | 1 个文件（main_test.go） | ~2% | 几乎为零 |
| **Rust 后端** | Cargo test | 1 个文件（integration_tests.rs） | ~1% | 几乎为零 |

### 1.2 架构与测试边界

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   React 前端     │────▶│  Tauri (Rust)    │────▶│  Go Sidecar      │
│  (Vitest/RTL)   │     │  (cargo test)    │     │  (go test)       │
│                 │     │                  │     │                  │
│ • 组件渲染      │     │ • 命令转发       │     │ • HTTP handlers  │
│ • Hooks 逻辑    │     │ • 密钥链安全     │     │ • DB 驱动        │
│ • Store 状态    │     │ • 本地存储       │     │ • SQL 执行       │
│ • API 封装      │     │ • Sidecar 管理   │     │ • 元数据查询     │
└─────────────────┘     └──────────────────┘     └──────────────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │   Playwright     │
                    │   (E2E 集成)     │
                    │                  │
                    │ • 全链路流程     │
                    │ • UI 交互        │
                    │ • 跨进程通信     │
                    └──────────────────┘
```

---

## 2. 测试策略

### 2.1 测试金字塔

```
         ▲
        /│\      E2E (Playwright)     ~10%  覆盖核心用户流程
       / │ \     ────────────────────────────────
      /  │  \     Integration (API + DB) ~20%  验证接口契约
     /───┼───\    ────────────────────────────────
    /    │    \   Unit (组件/函数/模块)  ~70%   快速反馈
   /     │     \  ────────────────────────────────
  /______│______\
```

### 2.2 分层策略

| 层级 | 范围 | 运行速度 | 稳定性 | 目标覆盖率 |
|------|------|----------|--------|-----------|
| **Unit** | 独立函数/组件/模块 | < 1s | 高 | 80%+ |
| **Integration** | API 接口 + Mock DB | < 5s | 高 | 70%+ |
| **E2E** | 完整应用 + 真实 DB | > 30s | 中 | 覆盖核心流程 |

---

## 3. 前端测试计划

### 3.1 单元测试 (Vitest)

#### 已有测试（需补充）

| 模块 | 已有 | 需补充 | 优先级 |
|------|------|--------|--------|
| `utils/sqlUtils.ts` | ✅ | 边界情况、复杂 SQL | P2 |
| `utils/exportUtils.ts` | ✅ | 大数据量导出 | P2 |
| `utils/ttlCache.ts` | ✅ | 并发访问、LRU 淘汰 | P2 |
| `stores/appStore.ts` | ✅ | 复杂状态转换 | P1 |
| `stores/settingsStore.ts` | ✅ | 持久化逻辑 | P1 |
| `stores/workspaceStore.ts` | ✅ | 标签页管理 | P1 |
| `hooks/useApi.ts` | ✅ | 错误处理、重试逻辑 | P1 |
| `hooks/useMenuShortcuts.ts` | ✅ | 快捷键冲突 | P2 |
| `hooks/useTableScrollHeight.ts` | ✅ | 窗口变化 | P3 |
| `hooks/useThemeColors.ts` | ✅ | 主题切换 | P3 |
| `hooks/useViewStats.ts` | ❌ | 统计计算 | P2 |

#### 新增测试清单

**API 层测试** `src/__tests__/api/`

```typescript
// api/index.test.ts
- testConnection()          // 各数据库类型参数校验
- connectConnection()       // 连接状态管理
- executeQuery()            // 结果解析、错误处理
- executeDDL()              // DDL 执行成功/失败
- getTableStructure()       // 复杂表结构
- batchImport()             // 批量导入边界
- transaction APIs          // begin/commit/rollback
- backup/restore            // 文件路径处理
- compareSchema             // 结构比较结果
- snippets CRUD             // 代码片段管理
- users/privileges          // 用户权限操作
```

**新增工具函数测试**

```typescript
// utils/validation.test.ts
- 连接参数验证（host, port, username）
- SSH 配置验证
- SSL 配置验证

// utils/formatters.test.ts
- 数据类型格式化
- 日期格式化
- 大小格式化
```

### 3.2 组件测试 (Testing Library)

#### 优先级矩阵

| 组件 | 复杂度 | 用户价值 | 测试优先级 | 测试要点 |
|------|--------|----------|-----------|----------|
| `ConnectionDialog.tsx` | 中 | 高 | **P0** | 表单验证、提交、SSH/SSL 配置 |
| `SQLEditor.tsx` | 高 | 高 | **P0** | 编辑器交互、执行、结果展示 |
| `DataTable.tsx` | 高 | 高 | **P0** | 分页、排序、过滤、右键菜单 |
| `MainLayout.tsx` | 高 | 高 | **P0** | 布局渲染、快捷键、状态栏 |
| `TabPanel/index.tsx` | 中 | 高 | **P1** | Tab 管理、切换、关闭 |
| `EnhancedConnectionTree.tsx` | 高 | 高 | **P1** | 树展开、右键菜单、拖拽 |
| `TableDesigner/index.tsx` | 中 | 中 | **P1** | 列编辑、索引管理、保存 |
| `DatabaseProperties/index.tsx` | 低 | 中 | **P2** | 属性展示 |
| `ViewDefinition/index.tsx` | 低 | 中 | **P2** | DDL 展示 |
| `TableList.tsx` | 中 | 中 | **P2** | 表列表筛选 |

#### 组件测试模板

```typescript
// src/__tests__/components/ConnectionDialog.test.tsx（扩展现有）
describe('ConnectionDialog', () => {
  describe('表单验证', () => {
    it('空 host 应显示错误', () => {})
    it('无效 port 应显示错误', () => {})
    it('空 username 应显示错误', () => {})
  })

  describe('SSH 配置', () => {
    it('启用 SSH 应显示额外字段', () => {})
    it('key 认证应要求私钥路径', () => {})
  })

  describe('SSL 配置', () => {
    it('启用 SSL 应显示证书字段', () => {})
    it('skip verify 应隐藏验证错误', () => {})
  })

  describe('提交', () => {
    it('有效表单应调用 onSubmit', () => {})
    it('测试连接按钮应调用 testConnection', () => {})
  })
})
```

### 3.3 集成测试 (前端 + Mock API)

#### Mock Tauri Invoke

```typescript
// src/__tests__/integration/connection-flow.test.ts
// 使用 vi.mock('@tauri-apps/api/core', ...) 模拟 invoke
// 验证完整用户流程：
- 打开连接对话框 → 填写参数 → 测试连接 → 保存 → 树中显示
```

#### 测试场景

```typescript
// src/__tests__/integration/
connection-flow.test.ts      // 创建连接 → 连接数据库 → 浏览表
query-flow.test.ts           // 写 SQL → 执行 → 查看结果 → 导出
transaction-flow.test.ts     // 开始事务 → 执行多条 → 提交/回滚
schema-compare-flow.test.ts  // 选择源/目标 → 比较 → 查看差异
backup-restore-flow.test.ts  // 备份 → 验证文件 → 恢复
```

---

## 4. Go 后端测试计划

### 4.1 测试架构

```
go-backend/
├── api/
│   ├── *_test.go          # HTTP handler 单元测试
│   └── router_test.go     # 路由注册测试
├── db/
│   ├── *_test.go          # 驱动单元测试
│   └── manager_test.go    # 连接池管理测试
├── models/
│   └── models_test.go     # 模型序列化/验证测试
├── integration/
│   └── api_test.go        # HTTP API 集成测试（httptest + SQLite）
└── testdata/
    └── schema.sql         # 测试数据库 schema
```

### 4.2 测试工具

| 工具 | 用途 |
|------|------|
| `httptest` | HTTP handler 测试 |
| `sqlmock` | 数据库 mock |
| `testify` | 断言、mock、suite |
| ` SQLite内存` | 集成测试数据库 |

### 4.3 各模块测试计划

#### API 层 (`api/*_test.go`)

```go
// connection_test.go
- TestConnect_ValidParams          // 有效连接参数
- TestConnect_InvalidDBType        // 无效数据库类型
- TestConnect_DuplicateID          // 重复连接 ID
- TestDisconnect_ActiveConn        // 断开活跃连接
- TestDisconnect_NotFound          // 断开不存在的连接
- TestTestConnection_Success       // 测试连接成功
- TestTestConnection_Failure       // 测试连接失败（认证错误）

// query_test.go
- TestQuery_Select                 // SELECT 查询
- TestQuery_Insert                 // INSERT 返回 affected
- TestQuery_MultiStatement         // 多语句执行
- TestQuery_SyntaxError            // SQL 语法错误
- TestQuery_Timeout                // 查询超时

// metadata_test.go
- TestGetDatabases                 // 数据库列表
- TestGetTables                    // 表列表
- TestGetTablesCategorized         // 表/视图分类
- TestGetColumns                   // 列信息
- TestGetIndexes                   // 索引信息
- TestGetForeignKeys               // 外键信息
- TestGetTableStructure            // 完整表结构

// ddl_test.go
- TestExecuteDDL_CreateTable       // CREATE TABLE
- TestExecuteDDL_AlterTable        // ALTER TABLE
- TestExecuteDDL_DropTable         // DROP TABLE
- TestTruncateTable                // TRUNCATE
- TestRenameTable                  // RENAME

// transaction_test.go
- TestBeginTransaction             // 开始事务
- TestCommitTransaction            // 提交事务
- TestRollbackTransaction          // 回滚事务
- TestTransactionStatus            // 事务状态查询
- TestNestedTransaction            // 嵌套事务处理

// users_test.go
- TestGetUsers                     // 用户列表
- TestCreateUser                   // 创建用户
- TestDropUser                     // 删除用户
- TestGrantPrivilege               // 授权
- TestRevokePrivilege              // 撤销权限

// backup_test.go
- TestCheckBackupTool              // 检查备份工具
- TestBackup                       // 备份操作
- TestRestore                      // 恢复操作

// compare_test.go
- TestCompareSchema_Same           // 相同结构
- TestCompareSchema_Different      // 不同结构

// import_test.go
- TestBatchImport_Append           // 追加模式
- TestBatchImport_Replace          // 替换模式
- TestBatchImport_Update           // 更新模式
```

#### DB 驱动层 (`db/*_test.go`)

```go
// manager_test.go
- TestManager_Connect              // 连接管理
- TestManager_Disconnect           // 断开管理
- TestManager_GetExecutor          // 获取执行器
- TestManager_GetDBType            // 获取数据库类型
- TestManager_ConcurrentAccess     // 并发安全

// mysql_test.go
- TestMySQLDriver_Open             // MySQL 连接
- TestMySQLDriver_Query            // 查询执行
- TestMySQLDriver_QuoteIdentifier  // 标识符引用

// postgres_test.go
- TestPostgresDriver_Open          // PostgreSQL 连接
- TestPostgresDriver_Query         // 查询执行

// sqlite_test.go
- TestSQLiteDriver_Open            // SQLite 内存连接
- TestSQLiteDriver_Query           // 查询执行

// dameng_test.go, kingbase_test.go, etc.
// 各国产数据库驱动基础测试
```

#### 集成测试 (`integration/api_test.go`)

```go
// 启动真实 HTTP server + SQLite 内存数据库
- TestFullFlow_ConnectQueryDisconnect
- TestFullFlow_CreateTableInsertQuery
- TestFullFlow_TransactionRollback
- TestFullFlow_BackupRestore
```

### 4.4 SQLite 测试数据库初始化

```go
// testdata/setup.go
func SetupTestDB(t *testing.T) (*sql.DB, func()) {
    db, err := sql.Open("sqlite", ":memory:")
    // 执行 schema.sql 初始化测试表
    // 返回 db 和 cleanup 函数
}
```

---

## 5. Rust 测试计划

### 5.1 测试架构

```
src-tauri/
├── src/
│   ├── commands/
│   │   ├── mod.rs
│   │   └── mod_test.rs      # 命令单元测试
│   ├── db/
│   │   └── *_test.rs        # 数据库模块测试
│   ├── security_test.rs     # 密钥链测试
│   ├── storage_test.rs      # 存储测试
│   └── sidecar_test.rs      # Sidecar 管理测试
├── tests/
│   ├── integration_tests.rs # 集成测试（扩展）
│   └── e2e_tests.rs         # E2E 测试（Sidecar + HTTP）
└── testdata/
    └── connections.json     # 测试数据
```

### 5.2 各模块测试计划

#### Commands 模块

```rust
// commands/mod_test.rs
#[cfg(test)]
mod tests {
    // ConnectionInput 序列化/反序列化
    #[test]
    fn test_connection_input_deserialization() {}

    #[test]
    fn test_connection_input_null_password() {}

    // ConnectionOutput 转换
    #[test]
    fn test_db_connection_to_output() {}

    // Group 转换
    #[test]
    fn test_group_conversion() {}

    // TableInfo 序列化
    #[test]
    fn test_table_info_serialization() {}
}
```

#### Storage 模块

```rust
// storage_test.rs
#[tokio::test]
async fn test_save_connection() {}

#[tokio::test]
async fn test_get_connections() {}

#[tokio::test]
async fn test_delete_connection() {}

#[tokio::test]
async fn test_update_connection() {}

#[tokio::test]
async fn test_group_crud() {}
```

#### Security 模块

```rust
// security_test.rs
#[test]
fn test_password_save_and_get() {}

#[test]
fn test_password_delete() {}

#[test]
fn test_password_not_found() {}
```

#### Sidecar 模块

```rust
// sidecar_test.rs
#[tokio::test]
async fn test_sidecar_start() {}

#[tokio::test]
async fn test_sidecar_post_request() {}

#[tokio::test]
async fn test_sidecar_health_check() {}
```

### 5.3 集成测试（扩展）

```rust
// tests/integration_tests.rs
#[tokio::test]
async fn test_full_command_flow() {
    // 1. 启动 Sidecar
    // 2. 保存连接配置
    // 3. 测试连接
    // 4. 执行查询
    // 5. 清理
}
```

---

## 6. E2E 测试计划

### 6.1 Playwright 配置改进

```typescript
// playwright.config.ts 改进
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,              // 增加超时（Tauri 启动慢）
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },  // 新增
  ],
  // 不再自动启动 tauri dev，改为手动控制生命周期
  // webServer: { ... }  // 移除，使用 fixture 控制
});
```

### 6.2 E2E 测试用例

#### P0 - 核心流程（必须覆盖）

```typescript
// e2e/connection-flow.test.ts
describe('Connection Flow', () => {
  test('create and connect to MySQL', async () => {
    // 1. 点击 "新建连接"
    // 2. 填写 MySQL 参数
    // 3. 测试连接
    // 4. 保存
    // 5. 双击连接
    // 6. 验证树展开
  });

  test('create and connect to PostgreSQL', async () => {
    // 同上，PostgreSQL
  });

  test('create and connect to SQLite', async () => {
    // 选择文件，连接 SQLite
  });

  test('delete connection', async () => {
    // 创建 → 删除 → 验证不存在
  });
});

// e2e/query-flow.test.ts
describe('Query Flow', () => {
  test('execute SELECT and view results', async () => {
    // 1. 连接到测试数据库
    // 2. 输入 SELECT 语句
    // 3. 执行（Ctrl+Enter）
    // 4. 验证结果表格
    // 5. 验证状态栏
  });

  test('execute INSERT and verify affected rows', async () => {
    // INSERT 语句，验证 affected rows
  });

  test('execute multiple statements', async () => {
    // 多语句执行
  });

  test('syntax error shows error message', async () => {
    // 错误 SQL，验证错误提示
  });

  test('export query results', async () => {
    // 导出 CSV/Excel
  });
});

// e2e/table-operations.test.ts
describe('Table Operations', () => {
  test('browse table data', async () => {
    // 右键表 → 浏览数据
  });

  test('view table structure', async () => {
    // 右键表 → 查看结构
  });

  test('truncate table', async () => {
    // TRUNCATE 操作
  });

  test('drop table with confirmation', async () => {
    // 删除表，验证确认对话框
  });
});

// e2e/transaction-flow.test.ts
describe('Transaction Flow', () => {
  test('begin transaction', async () => {
    // 开始事务，验证状态栏
  });

  test('commit transaction', async () => {
    // 提交事务
  });

  test('rollback transaction', async () => {
    // 回滚事务
  });
});
```

#### P1 - 重要功能

```typescript
// e2e/schema-compare.test.ts
// e2e/backup-restore.test.ts
// e2e/user-management.test.ts
// e2e/settings-flow.test.ts（已有，需扩展）
// e2e/table-designer.test.ts
// e2e/snippets.test.ts
```

#### P2 - 边缘功能

```typescript
// e2e/keyboard-shortcuts.test.ts
// e2e/theme-switch.test.ts
// e2e/group-management.test.ts
```

### 6.3 E2E 测试数据管理

```
e2e/
├── fixtures/
│   ├── test-database.ts       # 测试数据库生命周期管理
│   ├── mysql-init.sql         # MySQL 测试数据
│   ├── postgres-init.sql      # PostgreSQL 测试数据
│   └── sqlite-test.db         # SQLite 测试数据库
├── helpers/
│   ├── connection.ts          # 连接操作 helper
│   ├── query.ts               // 查询操作 helper
│   └── table.ts               // 表操作 helper
└── *.test.ts                  # 测试文件
```

---

## 7. 测试基础设施

### 7.1 新增依赖

#### 前端

```bash
# 已有：vitest, @testing-library/react, @testing-library/jest-dom, jsdom
# 需新增：
pnpm add -D @testing-library/user-event   # 用户交互模拟
pnpm add -D @testing-library/dom          # DOM 查询
pnpm add -D msw                           # Mock Service Worker（可选，用于 API mock）
```

#### Go

```bash
# 进入 go-backend 目录
cd go-backend

# 测试框架
go get github.com/stretchr/testify

# SQLite 驱动（测试用）
go get modernc.org/sqlite

# HTTP 测试
go get github.com/h2non/gock          # HTTP mock（可选）
```

#### Rust

```toml
# Cargo.toml [dev-dependencies]
[dev-dependencies]
tokio-test = "0.4"
wiremock = "0.6"          # HTTP mock
```

### 7.2 测试数据准备

#### Docker Compose（E2E 测试环境）

```yaml
# e2e/docker-compose.yml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: test
      MYSQL_DATABASE: testdb
    ports:
      - "13306:3306"
    volumes:
      - ./fixtures/mysql-init.sql:/docker-entrypoint-initdb.d/init.sql

  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    ports:
      - "15432:5432"
    volumes:
      - ./fixtures/postgres-init.sql:/docker-entrypoint-initdb.d/init.sql
```

### 7.3 CI/CD 集成

#### GitHub Actions 工作流

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  frontend-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test --coverage
      - uses: codecov/codecov-action@v3

  go-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v4
      - run: cd go-backend && go test ./... -v -race -coverprofile=coverage.out

  rust-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-action@stable
      - run: cd src-tauri && cargo test

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker-compose -f e2e/docker-compose.yml up -d
      - run: pnpm install
      - run: pnpm test:e2e
      - run: docker-compose -f e2e/docker-compose.yml down
```

### 7.4 测试脚本

```json
// package.json 脚本扩展
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run src/__tests__/unit",
    "test:components": "vitest run src/__tests__/components",
    "test:hooks": "vitest run src/__tests__/hooks",
    "test:integration": "vitest run src/__tests__/integration",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:rust": "cd src-tauri && cargo test",
    "test:go": "cd go-backend && go test ./...",
    "test:go:coverage": "cd go-backend && go test ./... -coverprofile=coverage.out && go tool cover -html=coverage.out",
    "test:all": "pnpm test && pnpm test:rust && pnpm test:go && pnpm test:e2e"
  }
}
```

---

## 8. 实施路线图

### Phase 1: 基础设施（1-2 天）

- [ ] 安装前端测试依赖（user-event, msw）
- [ ] 安装 Go 测试依赖（testify, sqlite）
- [ ] 创建测试目录结构
- [ ] 创建 Go testdata/schema.sql
- [ ] 创建 E2E Docker Compose 环境
- [ ] 更新 package.json 测试脚本
- [ ] 配置 GitHub Actions 工作流

### Phase 2: Go 后端测试（3-5 天）

- [ ] `api/connection_test.go` - 连接管理
- [ ] `api/query_test.go` - 查询执行
- [ ] `api/metadata_test.go` - 元数据查询
- [ ] `api/ddl_test.go` - DDL 操作
- [ ] `api/transaction_test.go` - 事务控制
- [ ] `db/manager_test.go` - 连接池管理
- [ ] `integration/api_test.go` - 集成测试
- [ ] 各数据库驱动基础测试

### Phase 3: Rust 后端测试（2-3 天）

- [ ] `commands/mod_test.rs` - 数据结构测试
- [ ] `storage_test.rs` - 存储 CRUD
- [ ] `security_test.rs` - 密钥链操作
- [ ] `sidecar_test.rs` - Sidecar 管理
- [ ] `tests/integration_tests.rs` - 集成测试

### Phase 4: 前端单元/集成测试（3-5 天）

- [ ] API 层完整测试
- [ ] 核心组件测试（ConnectionDialog, SQLEditor, DataTable）
- [ ] Store 复杂场景测试
- [ ] Hooks 边界情况测试
- [ ] 集成测试（完整用户流程模拟）

### Phase 5: E2E 测试（3-5 天）

- [ ] Playwright 配置优化
- [ ] 核心流程测试（连接、查询、表操作）
- [ ] 事务流程测试
- [ ] 备份恢复测试
- [ ] 用户管理测试
- [ ] 多浏览器支持

### Phase 6: CI/CD 与监控（1-2 天）

- [ ] GitHub Actions 配置
- [ ] 覆盖率报告集成（Codecov）
- [ ] 测试失败通知
- [ ] 文档更新

---

## 9. 预期成果

| 指标 | 当前 | 目标 |
|------|------|------|
| 前端单元测试覆盖率 | ~15% | 75%+ |
| 前端组件测试覆盖率 | ~10% | 70%+ |
| Go 后端测试覆盖率 | ~2% | 70%+ |
| Rust 后端测试覆盖率 | ~1% | 60%+ |
| E2E 核心流程覆盖 | 5 个 | 20+ 个 |
| CI 通过率 | N/A | 100%（主干） |
| 测试执行时间 | N/A | < 5min（PR 检查） |

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Tauri E2E 测试不稳定 | 高 | 使用 `retry` 配置，隔离测试数据 |
| 数据库 Docker 启动慢 | 中 | 使用 testcontainers 或预启动 |
| Go 国产数据库驱动测试困难 | 中 | 优先测试 MySQL/PostgreSQL/SQLite |
| 测试数据维护成本 | 中 | 统一 testdata，版本化 schema |
| 大文件组件测试困难 | 低 | 拆分组件，聚焦交互逻辑 |

---

## 附录

### A. 测试文件命名规范

```
前端:  src/__tests__/{类型}/{模块名}.test.{ts,tsx}
       {类型}: unit | components | hooks | integration | api

Go:    go-backend/{包}/**/*_test.go
       go-backend/integration/*_test.go

Rust:  src-tauri/src/**/*_test.rs
       src-tauri/tests/*_test.rs

E2E:   e2e/{功能域}-flow.test.ts
```

### B. Mock 策略

| 层级 | Tauri invoke | Go HTTP | 数据库 |
|------|-------------|---------|--------|
| 前端单元 | `vi.mock('@tauri-apps/api/core')` | N/A | N/A |
| 前端集成 | `vi.mock` + 预设响应 | N/A | N/A |
| Go 单元 | N/A | `httptest` + `sqlmock` | `sqlmock` |
| Go 集成 | N/A | 真实 HTTP | SQLite `:memory:` |
| Rust 单元 | N/A | `wiremock` | 内存存储 |
| E2E | 真实 Tauri | 真实 Sidecar | Docker 数据库 |

### C. 测试数据库 Schema

```sql
-- testdata/schema.sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    amount DECIMAL(10,2),
    status VARCHAR(20),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 插入测试数据
INSERT INTO users (username, email) VALUES 
    ('alice', 'alice@example.com'),
    ('bob', 'bob@example.com');

INSERT INTO orders (user_id, amount, status) VALUES
    (1, 100.00, 'completed'),
    (1, 200.00, 'pending'),
    (2, 150.00, 'completed');
```
