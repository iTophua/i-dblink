# iDBLink 开发计划 — 对标 Navicat Premium

> **最后更新**: 2026-05-03  
> **适用范围**: 全栈 (前端 React/TypeScript + 后端 Go + Rust/Tauri)  
> **目标**: 逐步缩小 iDBLink 与 Navicat Premium 的功能差距

---

## 一、项目架构概览

```
src/                          # 前端 (React 18 + TypeScript + Vite)
  api/index.ts                # Tauri invoke 封装 (274行, 35+ API 方法)
  types/api.ts                # 核心类型定义 (DatabaseType, ConnectionInput 等)
  stores/appStore.ts          # Zustand 全局状态 (connections, groups, cache)
  stores/settingsStore.ts     # 设置持久化 (主题, 语言, 快捷键)
  stores/workspaceStore.ts    # 工作区持久化 (标签页, 侧栏状态)
  hooks/useApi.ts             # 业务逻辑 Hook (848行)
  hooks/useMenuShortcuts.ts   # 快捷键系统
  components/
    MainLayout.tsx             # 主布局 (1160行)
    ConnectionDialog.tsx       # 连接配置弹窗 (764行)
    EnhancedConnectionTree.tsx # 连接树 (1947行)
    TabPanel/index.tsx         # 标签页管理 (1127行)
    SQLEditor.tsx              # SQL 编辑器 (1948行)
    DataTable.tsx              # 数据表格 (2636行)
    TableDesigner/index.tsx    # 表设计器 (1034行)
    StatusBar/index.tsx        # 状态栏 (124行)
    Toolbar/index.tsx          # 工具栏 (289行)
    ImportExport/index.tsx     # 导入导出 (358行)
    ERDiagram/index.tsx        # ER 图 (387行)
    SnippetManager/index.tsx   # 代码片段管理
    CommandPalette/index.tsx   # 命令面板

src-tauri/src/
  main.rs                     # Tauri 入口
  sidecar.rs                  # Go sidecar 进程管理
  commands.rs                 # Tauri 命令 (1156行, 需重构)
  security.rs                 # 密钥存储
  storage.rs                  # SQLite 连接配置

go-backend/
  api/                        # HTTP 处理器
    router.go                 # 路由注册
    connection.go             # 连接管理
    query.go                  # 查询执行
    metadata.go                # 元数据查询
    ddl.go                     # DDL 操作
    transaction.go             # 事务控制
    triggers.go                # 触发器/事件
    stream_export.go           # 流式导出
  db/                         # 数据库驱动
    mysql.go, postgres.go, sqlite.go, dameng.go, kingbase.go, highgo.go, vastbase.go
  models/models.go            # JSON 结构体
```

---

## 二、当前功能完整度

| 类别 | 完成度 | 说明 |
|------|:------:|------|
| 连接管理 | 95% | 缺 SSH 隧道、SSL 连接后端实现 |
| SQL 编辑器 | 95% | 补全/格式化/历史均有，错误行高亮已实现 |
| 数据浏览/编辑 | 90% | 行内编辑、批量提交、分页排序筛选已实现 |
| 数据导出 | 95% | CSV/Excel/JSON/XML/TXT/MD 6种格式 |
| 数据导入 | 40% | 仅 CSV，缺 Excel/JSON |
| 表结构管理 | 90% | 设计器可生成并执行 DDL，支持多数据库类型适配 |
| 元数据浏览 | 90% | 触发器节点、表行数显示已实现 |
| 事务控制 | 100% | 开启/提交/回滚/状态查询 |
| 代码片段 | 100% | CRUD 完整 |
| ER 图 | 20% | 组件骨架存在但缺外键关系线和自动布局 |
| 主题系统 | 100% | 暗/亮切换 + 4 预设 + 跟随系统 |
| 工作区恢复 | 100% | localStorage 持久化 |

---

## 三、「功能开发中」占位符汇总

以下位置当前返回 `message.info('功能开发中...')` 或 `console.log('not yet implemented')`:
需要将这些项标记为 `disabled: true` 或完全隐藏。

| 文件 | 行号 | 菜单项/动作 |
|------|------|------------|
| `EnhancedConnectionTree.tsx` | 642 | 数据库菜单: 转储 SQL/运行 SQL |
| `EnhancedConnectionTree.tsx` | 736 | 表菜单: 复制表/转储 SQL/导入 CSV/导出 CSV |
| `EnhancedConnectionTree.tsx` | 757 | 视图菜单: 打开视图/设计视图 |
| `EnhancedConnectionTree.tsx` | 776 | 视图菜单: 重命名/依赖关系/属性 |
| `EnhancedConnectionTree.tsx` | 1879 | 空白状态: 导入连接 |
| `TabPanel/index.tsx` | 887 | TableList: 复制表 |
| `TabPanel/index.tsx` | 890 | TableList: 转储 SQL |
| `MainLayout.tsx` | 965-969 | 工具菜单: data-sync/backup/restore/model-designer |

**已实现功能**:
- ✅ P0-1: 禁用/隐藏未实现菜单项
- ✅ P0-2: 视图数据浏览
- ✅ P0-3: 视图定义查看
- ✅ P0-4: 状态栏增强（事务计时、查询中指示器、数据库名显示）
- ✅ P0-5: TableDesigner 保存到数据库
- ✅ P1-1: 结果网格列统计 (SUM/AVG/COUNT/MIN/MAX)
- ✅ P1-2: DataTable 单元格右键增强
- ✅ P1-3: SQL 错误行高亮
- ✅ P1-4: 连接树表行数显示
- ✅ P1-5: 触发器节点
- ✅ P1-6: TableDesigner 数据库类型适配
- ✅ P1-7: 连接颜色标记
- ✅ P1-8: 数据库属性面板

---

## 四、开发阶段总览

| 阶段 | 时间 | 目标 | 详细文档 | 状态 |
|------|------|------|---------|------|
| P0 — 体验修复 | 1-2 周 | 消除「功能开发中」的负面体验，补全视图浏览 | [P0_SPEC.md](./P0_SPEC.md) | ✅ 已完成 |
| P1 — 交互补齐 | 2-4 周 | 对标 Navicat 核心交互功能 | [P1_SPEC.md](./P1_SPEC.md) | ✅ 已完成 |
| P2 — 功能追赶 | 4-8 周 | SSH/SSL、复制表、转储 SQL 等进阶功能 | [P2_SPEC.md](./P2_SPEC.md) | ⏳ 待开发 |
| P3 — 高级功能 | 8+ 周 | 结构比较、备份恢复、用户权限、SQL Server/Oracle 驱动、参数化查询、多语言 | [P3_SPEC.md](./P3_SPEC.md) | 🔄 部分完成 |
| T0 — 技术债务 | 穿插进行 | 大文件拆分、重构 | [TECH_DEBT.md](./TECH_DEBT.md) | 🔄 进行中 |

---

## 五、各阶段任务清单

### P0 — 体验修复（1-2 周）✅ 全部完成

| # | 任务 | 涉及文件 | 状态 |
|---|------|---------|------|
| P0-1 | 禁用/隐藏未实现菜单项 | `EnhancedConnectionTree.tsx`, `TabPanel/index.tsx`, `MainLayout.tsx` | ✅ |
| P0-2 | 视图数据浏览（复用 DataTable） | `EnhancedConnectionTree.tsx`, `MainLayout.tsx` | ✅ |
| P0-3 | 视图定义查看（显示 CREATE VIEW） | `EnhancedConnectionTree.tsx`, 新建 `ViewDefinition/index.tsx` | ✅ |
| P0-4 | 状态栏增强（事务计时、编码） | `StatusBar/index.tsx` | ✅ |
| P0-5 | TableDesigner 保存到数据库 | `TableDesigner/index.tsx`, `api/index.ts` | ✅ |

### P1 — 交互补齐（2-4 周）✅ 全部完成

| # | 任务 | 涉及文件 | 状态 |
|---|------|---------|------|
| P1-1 | 结果网格列统计 (SUM/AVG/COUNT/MIN/MAX) | `SQLEditor/ResultGrid.tsx` | ✅ |
| P1-2 | DataTable 单元格右键增强 | `DataTable.tsx` | ✅ |
| P1-3 | SQL 错误行高亮 | `SQLEditor.tsx` | ✅ |
| P1-4 | 连接树表行数显示 | `EnhancedConnectionTree.tsx`, `useApi.ts`, Go 后端 | ✅ |
| P1-5 | 触发器节点 | `EnhancedConnectionTree.tsx`, `MainLayout.tsx` | ✅ |
| P1-6 | TableDesigner 数据库类型适配 | `TableDesigner/index.tsx` | ✅ |
| P1-7 | 连接颜色标记 | `appStore.ts`, `ConnectionDialog.tsx`, `EnhancedConnectionTree.tsx` | ✅ |
| P1-8 | 数据库属性面板 | 新建 `DatabaseProperties/index.tsx`, `EnhancedConnectionTree.tsx` | ✅ |

### P2 — 功能追赶（4-8 周）

| # | 任务 | 涉及文件 | 预估 |
|---|------|---------|------|
| P2-1 | SSH 隧道后端 | Go sidecar + Rust commands | 16h |
| P2-2 | SSL/TLS 连接后端 | Go sidecar + Rust commands | 8h |
| P2-3 | 复制表（仅结构/结构+数据） | `TabPanel/index.tsx`, Go 后端 | 6h |
| P2-4 | 转储 SQL 文件 | `TabPanel/index.tsx`, Go 后端 | 8h |
| P2-5 | 运行 SQL 文件 | 新组件 + Go 后端 | 4h |
| P2-6 | 导入 Excel | `DataTable/ImportWizard.tsx`, 添加 `xlsx` 库 | 6h |
| P2-7 | 导入 JSON | `DataTable/ImportWizard.tsx` | 3h |
| P2-8 | ER 图完善（外键连线+自动布局） | `ERDiagram/index.tsx` | 12h |
| P2-9 | 全局对象搜索 | `MainLayout.tsx`, Go 后端 | 6h |

### P3 — 高级功能（8+ 周）

| # | 任务 | 说明 | 预估 |
|---|------|------|------|
| P3-1 | 结构比较 | 结构对比（列/索引/外键差异+ALTER SQL） | 40h | ✅ 已完成（数据对比待开发） |
| P3-2 | 备份恢复 | mysqldump/pg_dump 封装 | 16h | ✅ 已完成 |
| P3-3 | 用户权限管理 | 可视化 GRANT/REVOKE | 12h | ✅ 已完成 |
| P3-4 | SQL Server 驱动 | go-mssqldb 集成 | 8h | ✅ 已完成 |
| P3-5 | Oracle 驱动 | go-ora 集成 | 8h | ✅ 已完成 |
| P3-6 | 查询参数化 | `:param` 变量替换 | 6h | ✅ 已完成 |
| P3-7 | 多语言 | i18n 框架 (react-i18next) | 20h | ⏳ 待开发 |

---

## 六、编码规范

智能体在开发时需遵循以下规范:

### 前端
- **语言**: TypeScript 严格模式
- **组件**: React 函数组件 + Hooks
- **状态管理**: Zustand (不引入 Redux)
- **UI 库**: Ant Design v6 (不混用其他 UI 库)
- **样式**: CSS 变量 (`var(--xxx)`)，不使用 styled-components
- **API 调用**: 统一通过 `src/api/index.ts` 的 `invoke` 封装
- **新组件**: PascalCase 文件名，放在 `src/components/` 下
- **不要添加注释** 除非必要
- **代码风格**: 2 空格缩进，single quotes，100 字符行宽

### 后端 (Go)
- **风格**: 标准 Go 风格，gofmt
- **错误处理**: 显式 error 返回，不 panic
- **路由**: 在 `go-backend/api/router.go` 注册新路由
- **模型**: 在 `go-backend/models/models.go` 添加新结构体

### Rust/Tauri
- **命令**: 在 `src-tauri/src/commands.rs` 添加新 command
- **安全**: 敏感操作需确认，密码不记录日志

### 测试
- **前端测试**: Vitest (jsdom 环境)
- **测试文件**: 与源文件同目录，`*.test.ts(x)` 命名
- **运行**: `pnpm test`

### 提交前验证
```bash
pnpm lint           # ESLint
pnpm exec tsc --noEmit  # 类型检查
pnpm test           # 单元测试
```