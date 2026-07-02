# iDBLink 开发计划 — 对标 Navicat Premium

> **最后更新**: 2026-07-02
> **适用范围**: 全栈 (前端 React 19/TypeScript + 后端 Go + Wails v2)
> **目标**: 逐步缩小 iDBLink 与 Navicat Premium 的功能差距

---

## 一、项目架构概览

Wails v2 三层架构，无 Rust、无 sidecar、无 HTTP 转发：

```
main.go                        # Wails 入口（根目录），菜单/窗口配置，绑定 *backend.App
backend/                       # Go 后端（真实源码）
  app.go                       # App 结构体 + callHandler 模式（332 行）
  app_*.go                     # 按功能拆分的 Wails 绑定方法（16 个文件）
    app_connections.go         #   连接管理
    app_metadata.go            #   元数据查询
    app_query.go               #   查询执行
    app_ddl_info.go            #   DDL/结构信息
    app_users.go               #   用户权限
    app_import_export.go       #   导入导出
    app_transaction.go         #   事务控制
    app_backup.go / app_compare.go / app_doc.go / app_migrate.go / app_update.go / ...
  api/                         # HTTP 处理器（callHandler 包装复用）
    router.go                  #   路由注册
  db/                          # 10 种数据库驱动（mysql/postgres/sqlite/sqlserver/oracle/dameng/kingbase/highgo/vastbase/mariadb）
  localdb/                     # SQLite 本地存储（连接配置/分组/片段）
  models/models.go             # JSON 结构体
  security.go                  # AES-256-GCM 密码加密
  storage.go                   # 配置存取

frontend/                      # React 19 前端（Vite 5100）
  src/
    api/index.ts               # Wails 绑定封装（80 个方法，1012 行）
    types/api.ts               # 核心类型定义（DatabaseType, ConnectionInput 等）
    stores/                    # Zustand 全局状态（appStore/settingsStore/workspaceStore）
    hooks/                     # 业务逻辑（useApi 核心 hook + TTL 缓存、useMenuShortcuts 等）
    components/                # 34 个组件 + 子目录（ConnectionTree/SQLEditor/DataTable/MainLayout 等）
    utils/sqlDialects/         # 多数据库 SQL 方言抽象（escapeIdentifier/escapeValue/build*）
    constants/                 # SQL 关键字/函数/Live Templates
    i18n/                      # react-i18next（zh-CN/en-US）
  wailsjs/                     # Wails 自动生成的 TS 绑定（gitignored，wails dev 时生成）

wails.json                     # Wails v2 配置
package.json                   # 根级 npm（封装 wails 命令）
```

**通信方式：**
- 前端 → 后端：Wails 绑定调用 `frontend/wailsjs/go/backend/App.*`
- 后端 → 前端：`runtime.EventsEmit("menu-action", ...)` 事件推送，前端 `EventsOn` 监听

**关键设计模式：** `backend/app.go` 通过 `httptest` 的 `callHandler` 模式包装 HTTP handler，复用现有业务逻辑实现 Wails 绑定——非常规但有意为之。

---

## 二、当前功能完整度

> 下表为 2026-05 基线，部分数字可能因后续迭代漂移，使用前以代码为准。

| 类别 | 完成度 | 说明 |
|------|:------:|------|
| 连接管理 | 100% | SSH 隧道、SSL/TLS 连接已实现 |
| SQL 编辑器 | 95% | 补全/格式化/历史均有，错误行高亮已实现 |
| 数据浏览/编辑 | 90% | 行内编辑、批量提交、分页排序筛选已实现 |
| 数据导出 | 95% | CSV/Excel/JSON/XML/TXT/MD 6 种格式 |
| 数据导入 | 95% | CSV/Excel/JSON 前端解析已完成，后端批量导入 API 已实现 |
| 表结构管理 | 90% | 设计器可生成并执行 DDL，支持多数据库类型适配 |
| 元数据浏览 | 90% | 触发器节点、表行数显示已实现 |
| 事务控制 | 100% | 开启/提交/回滚/状态查询 |
| 代码片段 | 100% | CRUD 完整 |
| 用户权限 | 100% | 可视化 GRANT/REVOKE |
| 备份恢复 | 100% | mysqldump/pg_dump 封装 |
| 结构对比 | 90% | 列/索引/外键差异 + ALTER SQL（数据对比待开发）|
| 数据迁移 | 100% | 跨库表结构和数据迁移 |
| 数据库文档生成 | 100% | Markdown 文档导出 |
| 自动更新检查 | 100% | GitHub Releases 查询 |
| ER 图 | 20% | 组件骨架存在但缺外键关系线和自动布局 |
| 主题系统 | 100% | 暗/亮切换 + 4 预设 + 跟随系统 |
| 工作区恢复 | 100% | localStorage 持久化 |
| i18n | 40% | 基础设施已搭建，大部分 UI 仍为硬编码中文 |

---

## 三、开发阶段总览

| 阶段 | 时间 | 目标 | 状态 |
|------|------|------|------|
| P0 — 体验修复 | 1-2 周 | 消除「功能开发中」的负面体验，补全视图浏览 | ✅ 已完成 |
| P1 — 交互补齐 | 2-4 周 | 对标 Navicat 核心交互功能 | ✅ 已完成 |
| P2 — 功能追赶 | 4-8 周 | SSH/SSL、复制表、转储 SQL 等进阶功能 | ✅ 已完成 |
| P3 — 高级功能 | 8+ 周 | 结构比较、备份恢复、用户权限、SQL Server/Oracle 驱动、参数化查询、数据迁移、文档生成、更新检查 | ✅ 已完成（i18n 持续中）|
| T0 — 技术债务 | 穿插进行 | 大文件拆分、Tauri 迁移遗留清理 | ✅ 已完成（详见 [TECH_DEBT.md](./TECH_DEBT.md)）|

---

## 四、编码规范

### 前端
- **语言**: TypeScript 严格模式
- **组件**: React 函数组件 + Hooks
- **状态管理**: Zustand（不引入 Redux）
- **UI 库**: Ant Design v6（不混用其他 UI 库）
- **样式**: CSS 变量（`var(--xxx)`），不使用 styled-components
- **API 调用**: 统一通过 `frontend/src/api/index.ts` 的 `api` 对象
- **新组件**: PascalCase 文件名，放在 `frontend/src/components/` 下
- **SQL 构建**: 统一通过 `frontend/src/utils/sqlDialects/` 的方言抽象（`escapeIdentifier`/`escapeValue`/`buildTableRef` 等），不手写拼接
- **代码风格**: 2 空格缩进，single quotes，100 字符行宽

### 后端 (Go)
- **风格**: 标准 Go 风格，gofmt
- **错误处理**: 显式 error 返回，不 panic
- **绑定方法**: 在 `backend/app_*.go` 按功能分组添加，通过 `callHandler` 包装 `api/` 下的 handler
- **模型**: 在 `backend/models/models.go` 添加新结构体
- **JSON tag 注意**: 空 slice 若加 `omitempty` 会被完全省略导致前端 `undefined`；结果集类字段（Columns/Rows）不应加 `omitempty`

### 测试
- **前端测试**: Vitest（jsdom 环境），位于 `frontend/src/__tests__/`
- **E2E 测试**: Playwright，位于 `e2e/`，需先 `wails dev` 启动 5100 端口
- **Go 测试**: 根目录 `go test ./...`

### 提交前验证
```bash
pnpm lint                    # ESLint
pnpm exec -- tsc --noEmit    # 类型检查
pnpm test                    # 单元测试
go test ./...                # Go 测试（从根目录）
```
