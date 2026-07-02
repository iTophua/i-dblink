# T0 — 技术债务清理记录

> **最后更新**: 2026-07-02
> **状态**: 全部已完成

本文档记录 iDBLink 历次技术债清理结果。所有已列项均已完成验证。

---

## 已完成项

### T0-1: commands.rs 模块拆分 ✅

**结果**: Tauri → Wails 迁移后已不存在。`src-tauri/`（Rust）和 `commands.rs` 已随迁移整体删除，后端逻辑全部迁移到 Go（`backend/`），通过 Wails v2 绑定暴露。原 Rust 单文件 1156 行的问题自然消解。

### T0-2: MainLayout.tsx 拆分 ✅

**结果**: 已拆分完成。
- `frontend/src/components/MainLayout.tsx`: 369 行（主组件，仅做组合）
- `frontend/src/components/MainLayout/hooks/`: `useLayoutActions.ts` 等业务逻辑 hook
- `frontend/src/components/MainLayout/styles.ts`: 样式

### T0-3: SQLEditor.tsx 关键字外部化 ✅

**结果**: 已拆分完成。
- `frontend/src/components/SQLEditor.tsx`: 790 行（主组件）
- `frontend/src/components/SQLEditor/`: 12 个子文件（HistoryPanel/ResultGrid/ChartView/ContextMenu + hooks + utils）
- `frontend/src/constants/sqlKeywords.ts`、`sqlFunctions.ts`、`sqlLiveTemplates.ts`: SQL 关键字外部化

### T0-4: DataTable.tsx 拆分 ✅

**结果**: 已拆分完成。
- `frontend/src/components/DataTable.tsx`: 1196 行（主组件）
- `frontend/src/components/DataTable/`: 10 个子文件（GlideDataTable/FindReplaceBar/CellPreviewDialog/ContextMenu/ConditionalFormattingPanel/utils/adapters 等）

### T0-5: escapeIdentifier 多数据库支持 ✅

**结果**: 已完成。标识符转义通过 `frontend/src/utils/sqlDialects/` 统一实现：
- MySQL/MariaDB: 反引号 ` `` `
- PostgreSQL/Kingbase/Highgo/Vastbase/Oracle/Dameng: 双引号 `"`
- SQL Server: 方括号 `[]`
- 各方言的 `buildCreateTable`/`buildAlterTable`/`buildColumnDef` 内部统一调用 `this.escapeIdentifier`

### T0-6: SQL 注入风险修复 ✅

**结果**: 已完成（含 2026-07-02 收尾）。

前端所有 SQL 构建位置统一走 `frontend/src/utils/sqlDialects/` 方言抽象：
- 标识符：`dialect.escapeIdentifier(name)` 或包装函数 `escapeSqlIdentifier(name, dbType)`
- 值：`dialect.escapeValue(value)`（处理 NULL/数字/布尔/反斜杠/单引号/空串→NULL）
- 表引用：`dialect.buildTableRef(tableName, database)`
- WHERE 子句：`dialect.escapeIdentifier` + `dialect.escapeValue` 组合，或 `buildLikeCondition`

**审计清单（全部已修复）：**
- `DataTable/utils.ts` `buildQuery` — 用 `dialect.buildTableRef`/`escapeIdentifier`/`escapeValue`
- `SQLEditor/ResultGrid.tsx` INSERT/UPDATE/DELETE — 用 `dialect.buildInsert`/`buildUpdate`/`buildDelete`
- `TableDesigner/index.tsx` DDL — 用 `dialect.buildCreateTable`/`buildAlterTable`
- `ImportExport/index.tsx` SQL 导出 — 值转义已于 2026-07-02 从手写 `'` 加倍改为 `dialect.escapeValue`，与 DumpDialog 对齐
- `CopyTableDialog.tsx` 跨库复制 — 值转义已于 2026-07-02 从手写 `'` 加倍改为 `dialect.escapeValue`
- `hooks/useApi.ts` `getTableInfo`/`getCreateTableSQL` — 用 `dialect.buildTableInfoQuery`/`buildTableDDLQuery`，无字符串拼接
- `DumpDialog.tsx`、`ContextMenu/menuItems.tsx`、`TableExportWizard.tsx` — 均用 `dialect.escapeIdentifier`/`escapeValue`

---

## T0-7: Tauri → Wails 迁移遗留清理 ✅ (2026-07-02)

Tauri → Wails v2 迁移后遗留的死代码、失效配置、过时文档清理。

**删除的死代码：**
- `e2e/tauri-mcp-integration.test.ts` — Tauri MCP 专用测试（12 个通用 Playwright 测试保留）
- `e2e/mcp-tests/` — 4 个 `tauri-mcp` CLI shell 脚本
- `frontend/src/__mocks__/tauri-mock.ts` — 零引用孤儿文件（488 行），mock 已迁至 `setupTests.ts` 基于 Wails 绑定
- `go-backend/` — 仅剩 testdata 的僵尸目录（testdata 已在 `backend/testdata/` 存在）

**修复的失效配置：**
- `playwright.config.ts`: `webServer.command` 从 `pnpm tauri dev`（已失效）改为 `wails dev`，E2E 恢复可运行
- `docker-compose.test.yml`: testdata 挂载路径从 `./go-backend/testdata/` 改为 `./backend/testdata/`
- `frontend/vitest.config.ts`: `exclude` 移除死路径 `src-tauri/**`、`go-backend/**`
- `frontend/eslint.config.mjs`: `ignores` 移除死路径 `src-tauri`

**删除的过时文档：**
- `doc/P0_SPEC.md`、`P1_SPEC.md`、`P2_SPEC.md`、`P3_SPEC.md` — 已完成的阶段性交付规格
- `doc/TEST_PLAN.md`、`TEST_REPORT.md`、`AUTOMATION_TEST.md` — 描述已删除的 Tauri-mcp 测试方案

**保留的迁移记录（不动）：**
- `docs/superpowers/plans/2026-05-20-tauri-to-wails-migration.md` — 迁移规划历史
- `docs/superpowers/specs/2026-05-20-tauri-to-wails-migration-design.md` — 迁移设计文档
- `QWEN.md` 迁移说明章节 — 刻意保留的架构演进记录

---

## 已知遗留（非技术债，记录备查）

### CI workflow
`.github/workflows/` 仅 `release.yml`（Wails 构建 + DMG/NSIS 打包），无 `test.yml`。CI 不跑测试，本地验证为准。

### LICENSE
README 声明 MIT 但仓库无 LICENSE 文件。

### i18n
基础设施已搭建（`frontend/src/i18n/`，zh-CN + en-US），但大部分 UI 文本仍为硬编码中文。属功能增量而非技术债。

### ER 图
组件骨架存在但完成度约 20%（缺外键关系线和自动布局）。属未完成功能而非技术债。

---

## 验证命令

```bash
# 前端
pnpm lint                    # ESLint
pnpm exec -- tsc --noEmit    # TypeScript 类型检查
pnpm test                    # Vitest 单元测试（392 个）

# Go 后端（从根目录）
go build ./...               # 编译
go test ./...                # 测试

# E2E（需先启动 wails dev）
wails dev &                  # 启动 Vite:5100 + Wails 窗口
npx playwright test          # 跑 e2e/ 下的 Playwright 测试
```
