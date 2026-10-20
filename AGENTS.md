# AGENTS.md — iDBLink

## Commands

```bash
# --- 依赖 & 构建 ---
pnpm install                          # 安装依赖
~/go/bin/wails dev                    # 开发模式（Vite:5100 + Wails 窗口）
~/go/bin/wails build                  # 生产构建 → build/bin/iDBLink.app/
                                      # wails ≥v2.17 内置 x/tools v0.47，
                                      # 直接用系统 Go（1.27+）即可，无需 GOTOOLCHAIN 锁定
pnpm package                          # 构建 + 创建 DMG（需要 create-dmg）

# --- 前端测试（根目录执行，内部 cd frontend） ---
pnpm test                             # 全部 Vitest 测试
cd frontend && pnpm test:unit         # 单元测试
cd frontend && pnpm test:components   # 组件测试
cd frontend && pnpm test:hooks        # Hook 测试
cd frontend && pnpm test:api          # API 测试
cd frontend && pnpm test:integration  # 集成测试
cd frontend && pnpm test:e2e          # E2E 测试（Playwright）

# --- Go 后端测试（项目根目录执行） ---
go test ./...                         # 从项目根目录执行（非 backend/ 子目录）

# --- 代码质量（根目录执行，内部 cd frontend） ---
pnpm lint                             # ESLint（flat config）
pnpm lint:fix                         # ESLint 自动修复
pnpm format                           # Prettier 格式化
pnpm format:check                     # Prettier 检查
pnpm exec -- tsc --noEmit             # TypeScript 类型检查
```

**`wails` CLI 路径：** `~/go/bin/wails` v2.17.0 — 不在 PATH 中，使用完整路径。

## Architecture

Wails v2 架构：Go 后端 → Wails TS 绑定 → React 19 前端。无 Rust、无 sidecar、无 HTTP 转发。

| 层 | 路径 | 关键文件 |
|----|------|----------|
| 入口 | `main.go` | Wails 应用设置，7 个菜单 38 个菜单项，macOS 特殊处理 |
| 后端 | `backend/` | `app.go`（332 LOC）+ 16 个 `app_*.go`（按功能拆分的 80+ 绑定方法），`db/`（10 种驱动），`api/`，`localdb/`，`security.go` |
| 前端 | `frontend/src/` | `api/index.ts`（80 个方法），`components/`（~34 个 + 子目录），`hooks/`（6 个），`stores/`（3 个 Zustand） |
| 绑定 | `frontend/wailsjs/` | `wails dev` 自动生成，**已 gitignore** |
| E2E | `e2e/` | Playwright 测试（12 个测试文件） |

**通信方式：**
- 前端 → 后端：Wails 绑定调用 `frontend/wailsjs/go/backend/App.*`
- 后端 → 前端：`runtime.EventsEmit("menu-action", ...)` 事件推送，前端通过 `EventsOn` 监听

**关键设计模式：** `backend/app.go` 通过 `httptest` 的 `callHandler` 模式包装 HTTP handler，复用现有业务逻辑实现 Wails 绑定——非常规但有意为之。

## Critical gotchas

- **`ConnectionInput` 命名空间**：Wails TS 绑定中在 `backend` 命名空间下：`new backend.ConnectionInput(source)`
- **Wails 绑定**（`frontend/wailsjs/`）已 gitignore，`wails dev` 时自动生成，CI 中也会重新生成
- **浮动窗口功能无效**：Wails v2 不支持前端多窗口 API
- **i18n 大部分已接入**（2026-10 实测）：2035 个 key、双语言全对齐（此前 12 个
  en 缺失已补）。剩余硬编码中文约 387 行/52 文件，大头在数据类内容
  （`constants/sqlFunctions.ts` 函数文档 61 行、`convertRules.ts` 26 行等）；
  若要继续接入优先级：`menuShortcuts.ts`(37) → `theme.ts` 主题描述(20) →
  `useApi.ts` 消息(21) → `uxEnhancements.tsx`(32)
- **无 LICENSE 文件**：README 声明 MIT 但仓库中无 LICENSE 文件
- **CI 不跑测试**：`.github/workflows/` 仅 `release.yml`（打包发布），无 `test.yml`，以本地验证为准

## Test quirks

- 前端测试位于 `frontend/src/__tests__/`（20 个文件）
- 测试分类：`unit/`、`components/`、`hooks/`、`api/`、`integration/`
- 所有 Wails 绑定在 `src/__tests__/setupTests.ts` 中 mock，mock 以具名常量导出，直接 import 使用：
  ```ts
  import { mockExecuteQuery } from '../setupTests'
  ```
- Vitest 配置：`frontend/vitest.config.ts`，jsdom 环境，globals 启用
- ESLint：flat config 位于 `frontend/eslint.config.mjs`，忽略 `dist` 和 `wailsjs`
- E2E 测试：Playwright 配置位于根目录 `playwright.config.ts`，测试在 `e2e/`。
  **套件已腐烂（2026-10 核实）**：testid 与实际 UI 不符（如 `conn-name` vs 实际
  `conn-name-input`）、断言早已不存在的交互（toast 已改内联提示）、未 mock Wails
  桥接——从未跑绿过，全量跑约 55 分钟且 ~100% 失败。**不要试图跑它**，验证以
  `pnpm test`（417）+ `go test ./...` + `wails dev` 人工冒烟为准；修复需按当前
  UI 重写整套用例。另外 e2e 脚本须从仓库根用
  `cd frontend && PATH="$HOME/go/bin:$PATH" pnpm exec playwright test --config ../playwright.config.ts`
  运行（`wails` 不在 PATH；直接 `pnpm test:e2e` 找不到测试）

## Verification order

```bash
pnpm lint → pnpm exec -- tsc --noEmit → pnpm test → go test ./...
```

修改前后端代码后按此顺序验证，任一步骤失败应立即修复。

**提交前 review（强制，用户要求）**：每次 `git commit` 前必须完成两步——
1. `git diff` 逐行自查：逻辑边界、回归风险、遗漏的关联改动（i18n 双语 key、类型定义、清理无用 import 等）
2. 跑完上面的验证顺序（改动范围内 applicable 的步骤）

发现问题先修复再审，全部通过才允许提交。

## Code style

| 配置 | 值 |
|------|-----|
| Prettier | semi, singleQuote, printWidth=100, tabWidth=2（`frontend/.prettierrc.json`）|
| EditorConfig | 2-space indent, LF, UTF-8（`.editorconfig`）|
| Go module | `idblink`，Go 1.25.7 |

## Key files quick reference

| 文件 | 用途 |
|------|------|
| `main.go` | Wails 入口、菜单定义、窗口配置 |
| `backend/app.go` | 所有 Wails 绑定方法（50+），callHandler 模式 |
| `backend/db/` | 10 种数据库驱动实现 |
| `backend/localdb/` | SQLite 本地存储（连接、分组、片段） |
| `backend/security.go` | AES-256-GCM 密码加密 |
| `frontend/src/api/index.ts` | 80 个 Wails 绑定封装 |
| `frontend/src/components/DataTable.tsx` | 数据表格（60KB，最大组件之一） |
| `frontend/src/components/SQLEditor.tsx` | SQL 编辑器（93KB，最大文件） |
| `frontend/src/components/ConnectionDialog.tsx` | 连接配置对话框（32KB） |
| `frontend/src/components/MainLayout.tsx` | 主布局（46KB） |
| `frontend/src/stores/` | Zustand：appStore、settingsStore、workspaceStore |
| `frontend/src/hooks/useApi.ts` | 核心 API hook + TTL 缓存（24KB） |

## References

- `.cursorrules`、`.windsurfrules`、`QODER.md` — 相同的 MCP 工具指令（code-review-graph）
- `CLAUDE.md`、`QWEN.md` — 完整项目上下文（可能含过时信息）
- `doc/` — 项目文档（P0-P3 规格、测试计划、技术债务、开发计划）
