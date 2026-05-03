# T0 — 技术债务重构计划

> **目标**: 提升代码可维护性，为后续功能开发扫清障碍  
> **原则**: 每次重构只改一个文件，改完立即运行 lint + typecheck + test 确保不引入回归

---

## T0-1: commands.rs 模块拆分

**预估**: 4 小时  
**文件**: `src-tauri/src/commands.rs` (1156 行)  
**目标**: 按职责拆分为 4 个模块文件

### 当前问题

`commands.rs` 是一个 1156 行的单文件，包含所有 Tauri 命令，按数据库类型 switch 逻辑重复。每个新数据库类型都需要在这个文件中增加大量代码。

### 拆分方案

```
src-tauri/src/
  commands/
    mod.rs              # 公共导出 + register_commands 宏
    connection.rs       # 连接管理命令 (connect, disconnect, test, etc.)
    query.rs            # 查询执行命令 (execute_query, execute_ddl)
    metadata.rs         # 元数据命令 (get_tables, get_columns, get_indexes, etc.)
    storage.rs          # 本地存储命令 (save_connection, get_connections, etc.)
```

### 步骤

1. 创建 `src-tauri/src/commands/` 目录
2. 复制 `commands.rs` 内容，按职责分组到 4 个文件
3. `mod.rs` 中 re-export 所有 pub 函数
4. 修改 `main.rs` 中的 `mod commands` 为 `mod commands;`（目录模块）
5. 运行 `pnpm tauri dev` 确保编译通过

### 验收标准

- [ ] `pnpm tauri dev` 正常启动
- [ ] 所有 Tauri 命令正常工作
- [ ] `cargo clippy` 无警告

---

## T0-2: MainLayout.tsx 拆分

**预估**: 3 小时  
**文件**: `src/components/MainLayout.tsx` (1160 行)  
**目标**: 提取业务逻辑到 hooks，UI 拆分为子组件

### 拆分方案

```
src/components/
  MainLayout.tsx              # 主布局，仅组合子组件 (~200 行)
  MainLayout/
    useConnectionManager.ts    # 连接/断开/选择逻辑 hook
    useTableActions.ts          # 表操作 (打开/设计/删除/清空/复制) hook
    useMenuActions.ts           # 菜单/快捷键动作处理 hook
    Sidebar.tsx                 # 侧边栏 (搜索 + 连接树)
    ContentArea.tsx             # 内容区域 (TabPanel)
```

### 步骤

1. 提取 `useConnectionManager` hook（连接/断开/数据库选择等状态管理）
2. 提取 `useTableActions` hook（表操作回调）
3. 提取 `useMenuActions` hook（菜单事件处理）
4. 创建 `Sidebar.tsx`（搜索框 + 连接树）
5. 创建 `ContentArea.tsx`（TabPanel + 状态栏）
6. `MainLayout.tsx` 仅做组合

### 验收标准

- [ ] `pnpm lint` 无错误
- [ ] 所有功能无回归
- [ ] 每个文件不超过 300 行

---

## T0-3: SQLEditor.tsx 关键字外部化

**预估**: 2 小时  
**文件**: `src/components/SQLEditor.tsx` (1948 行)  
**目标**: SQL 关键字和函数定义提取到独立文件

### 拆分方案

```
src/constants/
  sqlKeywords.ts     # SQL_KEYWORDS 数组 (~150 行)
  sqlFunctions.ts     # SQL_FUNCTIONS 数组 (~200 行)
  sqlSnippets.ts      # SQL 代码片段定义
```

### 步骤

1. 将 `SQLEditor.tsx` 中 `SQL_KEYWORDS` 提取到 `sqlKeywords.ts`
2. 将 `SQL_FUNCTIONS` 提取到 `sqlFunctions.ts`
3. 将 `splitSqlStatements` 提取到 `src/utils/sqlUtils.ts`
4. 修改 `SQLEditor.tsx` 中的 import

### 验收标准

- [ ] SQL 补全功能正常
- [ ] `pnpm lint` 无错误

---

## T0-4: DataTable.tsx 拆分

**预估**: 4 小时  
**文件**: `src/components/DataTable.tsx` (2636 行)  
**目标**: 按功能拆分为子模块

### 拆分方案

```
src/components/DataTable/
  index.tsx               # 主组件，组合子组件 (~300 行)
  useDataTable.ts          # 数据加载、编辑、分页等状态 hook (~400 行)
  DataTableToolbar.tsx     # 工具栏 (~200 行)
  DataTableGrid.tsx        # AG Grid 网格 (~300 行)
  DataTableFilter.tsx      # 高级筛选面板 (~200 行)
  DataTableExport.ts       # 导出逻辑 (CSV/Excel/JSON/XML/TXT/Markdown) (~150 行)
  DataTableContextMenu.tsx  # 右键菜单 (~150 行)
  DataTableModals.tsx       # 编辑/新增弹窗 (~200 行)
```

### 步骤

1. 提取导出工具函数到 `DataTableExport.ts`
2. 提取右键菜单到 `DataTableContextMenu.tsx`
3. 提取筛选面板到 `DataTableFilter.tsx`
4. 提取工具栏到 `DataTableToolbar.tsx`
5. 提取核心状态管理到 `useDataTable.ts` hook
6. 主组件仅做组合

### 验收标准

- [ ] 所有现有功能无回归
- [ ] 每个文件不超过 400 行
- [ ] `pnpm lint` 无错误

---

## T0-5: TableDesigner escapeIdentifier 修复 ✅ 已完成

**预估**: 1 小时  
**实际**: 已包含在 P0-5 中完成  
**文件**: `src/components/TableDesigner/index.tsx`
**目标**: 支持多数据库标识符转义

### 实现说明

已完成以下改进:

1. `escapeIdentifier` 函数支持多数据库类型:
   - MySQL/MariaDB: 反引号 `` ` ``
   - PostgreSQL, Kingbase, Highgo, VastBase, Oracle, Dameng: 双引号 `"`
   - SQL Server: 方括号 `[]`

2. `generateCreateTableSQL` 接受 `dbType` 参数:
   - MySQL: 生成 `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` 后缀
   - 其他数据库: 生成标准 `)` 后缀

3. `generateColumnDef` 根据数据库类型决定是否添加 `COMMENT`

4. `DB_TYPE_FIELDS` 映射 8 种数据库类型的字段类型列表

5. 类型选择器根据 `dbType` 动态加载对应数据库的字段类型

### 验收标准

- [x] MySQL 表设计器生成 `\`column\`` 格式
- [x] PostgreSQL 表设计器生成 `"column"` 格式
- [x] SQL Server 表设计器生成 `[column]` 格式
- [x] 达梦表设计器生成 `"column"` 格式
- [x] `ENGINE=InnoDB` 和 `COMMENT` 仅 MySQL 生成

---

## T0-6: SQL 注入风险修复

**预估**: 2 小时  
**文件**: `src/hooks/useApi.ts`

### 当前问题

`useApi.ts` 中 `getTableInfo` 使用字符串拼接构建 SQL:

```typescript
// 可能存在风险的代码
const sql = `SELECT * FROM ${tableName} WHERE ...`;
```

### 解决方案

对于所有前端构建 SQL 的位置:
1. 标识符使用 `escapeIdentifier` 函数
2. 值使用参数化查询或严格转义
3. 确保 `escapeSqlValue` 在所有 SQL 构建位置使用

### 审计清单

搜索所有前端构建 SQL 的位置:
- `DataTable.tsx` — `buildQuery` 函数
- `SQLEditor/ResultGrid.tsx` — INSERT/UPDATE 语句生成
- `TableDesigner/index.tsx` — DDL 生成
- `ImportExport/index.tsx` — 导入 SQL 生成

### 验收标准

- [ ] 所有前端构建的 SQL 中标识符都被正确转义
- [ ] 所有 SQL 值都被正确转义
- [ ] 无直接字符串拼接

---

## 重构顺序建议

建议按照以下顺序进行重构，每步完成后立即验证:

1. **T0-5** (1h) — escapeIdentifier 修复，影响最小，风险最低
2. **T0-6** (2h) — SQL 注入修复，安全优先
3. **T0-3** (2h) — SQLEditor 关键字外部化，最简单的拆分
4. **T0-2** (3h) — MainLayout 拆分
5. **T0-4** (4h) — DataTable 拆分，最复杂
6. **T0-1** (4h) — commands.rs 拆分，Rust 侧

**总预估**: 16 小时

---

## 验证命令

每次重构后必须运行:

```bash
# 前端
pnpm lint                    # ESLint 检查
pnpm exec tsc --noEmit       # TypeScript 类型检查
pnpm test                    # 单元测试

# Rust
cd src-tauri && cargo clippy # Rust lint

# 集成测试
pnpm tauri dev               # 启动完整应用验证
```