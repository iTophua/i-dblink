# AGENTS.md — iDBLink

## Commands

```bash
# --- 依赖 & 构建 ---
pnpm install                          # 安装依赖
~/go/bin/wails3 task dev              # 开发模式（Vite:5100 + Wails 窗口）
~/go/bin/wails3 task package          # 生产构建 → build/bin/iDBLink.app/
                                      # wails3 v3.0.0 要求 Go ≥1.26，系统 Go 1.27 即可
~/go/bin/wails3 generate bindings -ts -i   # 手动再生成前端绑定（构建时也会自动生成）
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

**`wails3` CLI 路径：** `~/go/bin/wails3` v3.0.0 — 不在 PATH 中，使用完整路径（Taskfile 内部以裸 `wails3` 调用，跑 task 时需 `PATH="$HOME/go/bin:$PATH"`，`pnpm dev`/`pnpm build` 已内置）。

## Architecture

Wails v3 架构：Go 后端 → Wails TS 绑定 → React 19 前端。无 Rust、无 sidecar。构建由 Taskfile 驱动（`Taskfile.yml` + `build/Taskfile.yml` + 平台 Taskfile，`build/config.yml` 为 dev 模式配置）。

| 层 | 路径 | 关键文件 |
|----|------|----------|
| 入口 | `main.go` | Wails 应用设置、菜单、托盘、单实例、关闭保护、ai-chat 流 |
| 后端 | `backend/` | `app.go`（332 LOC）+ 16 个 `app_*.go`（按功能拆分的 80+ 绑定方法），`db/`（10 种驱动），`api/`，`localdb/`，`security.go` |
| 前端 | `frontend/src/` | `api/index.ts`（80 个方法），`components/`（~34 个 + 子目录），`hooks/`（6 个），`stores/`（3 个 Zustand） |
| 绑定 | `frontend/bindings/` | `wails3 generate bindings -ts -i` 生成（interfaces 模式），**已 gitignore**，构建/测试前需先生成 |
| E2E | `e2e/` | Playwright 测试（12 个测试文件） |

**通信方式：**
- 前端 → 后端：绑定调用 `frontend/bindings/idblink/backend/app`（具名函数导出），`api/index.ts` 统一封装
- 后端 → 前端：`application.Get().Event.Emit("menu-action", ...)` 事件推送；前端 `Events.On`（`api/index.ts` 提供 v2 风格 `EventsOn` 兼容层，回调直接收 data）
- 前端窗口操作：`@wailsio/runtime` 的 `Window.SetTitle/SetBackgroundColour/Minimise/Hide`

**关键设计模式：** `backend/app.go` 通过 `httptest` 的 `callHandler` 模式包装 HTTP handler，复用现有业务逻辑实现 Wails 绑定——非常规但有意为之。

## Critical gotchas

- **WKWebView 渲染坑**（macOS 实际引擎）：`position: sticky` 元素放在带
  `contain`/`content-visibility` 的滚动容器内会渲染错位——滚动内容从 sticky
  元素上方漏出（Chromium 完全正常，只在 WKWebView 出现）。表头类常驻元素要放
  滚动容器**外**（`TableList.tsx` 已改为 sibling + CSS 变量补偿滚动条宽度保持
  列对齐，勿改回 sticky）；`ResultGrid.tsx` 的 sticky 行在普通 overflow 容器内，不受影响
- **`ConnectionInput` 等模型**：v3 绑定生成 interfaces（`-i`），前端直接用对象字面量传参，无模型类
- **Wails 绑定**（`frontend/bindings/`）已 gitignore，`wails3 task build`/`dev` 时自动生成；跑 `tsc`/`pnpm test` 前若缺失需先 `~/go/bin/wails3 generate bindings -ts -i`（setupTests 已 mock 绑定模块，测试不依赖生成物）
- **多窗口**：查询结果可弹出到独立窗口（`/#popup/<id>` hash 路由到 ResultPopup，
  经 popup-result:request/data 事件从源 SQLEditor 取快照；快照语义不联动）
- **关窗=隐藏不退出**：红绿灯关闭只是 Hide（状态全保留），退出走托盘菜单/⌘Q；
  dock 角标显示执行中查询数（NSDockTile CGO，backend/window_appearance_darwin.go）
- **SQL 写入编辑器必须带目标 tab**：`ai-sql-inject` 事件冒泡到 window，所有已打开的
  SQL 标签页都在监听，不带 `tabKey` 会把每个标签页的内容一起改掉。统一走
  `utils/activeSqlRegistry.ts`：写入用 `injectSqlToEditor({ mode, sql, tabKey })`，
  读「当前 SQL」用 `registerSqlReader` / `readSqlFromEditor`（SQLEditor 挂载时按 tabKey 登记）
- **AI 助手面板**（`components/AIChatPanel/`，样式在 `styles/ai-chat.css`）：全局 `code`/`pre`
  规则会套进高亮代码块里形成多层框并把正文染红，`CodeBlock` 已逐项覆盖，改渲染器后
  要实际看一眼代码块；`MarkdownRenderer` 同时被 SQL 优化抽屉、文档生成弹窗复用
- **i18n 大部分已接入**（2026-10 实测）：2035 个 key、双语言全对齐（此前 12 个
  en 缺失已补）。剩余硬编码中文约 387 行/52 文件，大头在数据类内容
  （`constants/sqlFunctions.ts` 函数文档 61 行、`convertRules.ts` 26 行等）；
  若要继续接入优先级：`menuShortcuts.ts`(37) → `theme.ts` 主题描述(20) →
  `useApi.ts` 消息(21) → `uxEnhancements.tsx`(32)
- **AI 对话历史**（2026-11）：后端 `localdb/ai_chat.go` + `app_ai_chat_store.go`，前端
  `services/aiChatHistory.ts` 订阅 store 的消息变更后批量落盘——终态（完成/失败/停止/删除）
  立即写，流式过程中每 2 秒存档一次；首条用户消息发出时才建会话。重命名走单独接口，
  不动 `updated_at`（否则改名会把对话顶到「最近」）；时间戳是定宽纳秒串，列表排序依赖它。
  外部入口（ER 图「发给 AI」）设好上下文后要调 `setContextSyncHold`，否则面板打开时会
  被连接树的选中项覆盖；开新对话前还要派发 `ai-chat-interrupt`，让面板把进行中的回复收尾
  （直接 `startNewAIChat()` 的话面板清空了、旧流还在跑，它的内容会接进新对话的下一条回复）。
  回复收尾后必须清掉 `streamIdRef`：留着的话切换 / 新建会话时会把已完成的回答改写成
  「已停止」并落盘；还没生成内容就被打断的占位回复直接撤掉。历史列表加载失败会在下次
  打开面板时重试；重命名不走 `runHistoryAction`（不收尾进行中的回复），失败提示要自己给。
  只有消息才算对话活动：改名、保存上下文都不动 `updated_at`
- **诊断日志**（2026-11）：`backend/applog.go`，`<数据目录>/logs/`（dev 与打包版目录不同），
  单文件 8MB、最多 10 个、保留 14 天；`IDBLINK_LOG_LEVEL=debug` 记录每次接口调用。
  约定不落请求体、密码、API Key、对话内容。接口报错文本经 `logSafeError` 只留第一行、
  截到第一个引号：驱动的报错会带出违反约束的数据值和出错的 SQL 片段（MySQL 的
  `Duplicate entry '…'` / `near '…'`，PG 的 `DETAIL: Key (…)=(…)`），不能原样进日志。
  前端未捕获错误 / 未处理 Promise / console.error 经 `utils/diagnostics.ts` 合并后上报
  （`WriteAppLog`），只在 Wails 运行时里工作；console 来源每次运行最多上报 500 条（内容各不相同
  的报错靠合并重复挡不住）。`main.tsx` 里过滤 React ref 警告的 `console.error` 包装必须装在
  `installDiagnostics()` **之后**，反过来包的话警告照样落盘
- **ER 图**（2026-11）：`backend/api/er_diagram.go` 一次取齐表/列/外键——MySQL、PG 系、
  SQLite 是批量查询，其余库走通用路径逐表取（响应里 `slow_path=true`）。PG 的表 id 是
  `schema.table`。前端 `components/ERDiagram/`（React Flow + dagre，依赖早已在 package.json），
  **`@xyflow/react/dist/style.css` 必须引入**，漏掉时节点不定位、jsdom 测试发现不了。
  SQLite 省略目标列的外键按位置对应父表主键的第 n 列（主键列序 ≠ 表里的列序），父表名按
  大小写折叠查找。达梦外键查询（`damengGetForeignKeys` 里 USER_ 视图那一版）此前取的是子表
  自己、每条外键都成了自环，已改成走 `R_CONSTRAINT_NAME`——**没有真实达梦库，未验证**。
  自引用外键走自定义的 `SelfLoopEdge`，两端都是 source 连接点；React Flow 默认的 strict
  模式会**静默丢弃** source→source 的边，必须设 `connectionMode={ConnectionMode.Loose}`
  （jsdom 里节点没有尺寸、边不渲染，这类问题测不出来，要在真实渲染里看）。
  导出 PNG 不用库自带的 `toPng`（挂在 `img.decode()` 上），用 `toSvg` + 自己的画布；
  关系线不进快照，读出路径后用 `Path2D` 画，画在节点下面
- **数据对比**（2026-11）：`backend/api/data_compare*.go`，按主键做哈希连接（不依赖
  ORDER BY），值先归一化再比（`12.50` 与 `12.5` 相等；`'0123'` 这种带前导零的文本保持
  字符串身份）。**只生成同步 SQL、不执行**；生成的脚本必须是纯字面量（`dcWhereLiteral`），
  不能带占位符。字面量按**目标列**的类型校正（`dcLiteralTyped`）：值取自源表，MySQL 的
  TINYINT(1) 标志位在驱动里是整数，同步到 PG 的 boolean 列必须写 `TRUE`（写 `1` 会被拒绝）。
  `quoteIdent` 对 SQLite 用反引号。**脚本的可信边界**：任一侧超过 `max_rows` 时脚本只含
  UPDATE（没读到的部分里可能正好有「仅在另一侧」的行，INSERT / DELETE 会出错）；
  `sql_truncated` 要按「实际收集的行数 < 计数」补算（行在收集阶段就按 `max_statements` 截住了）；
  PG 系先定位表所在的 schema（请求可带 `source_schema` / `target_schema`，默认优先 `public`），
  表名写成 `"schema"."table"`——不定位的话重名表的结构会跨 schema 合并；目标表匹配键重复要
  告警；目标表的生成列（MySQL `EXTRA` 含 `VIRTUAL/STORED GENERATED`）不参与对比和同步
  （PG 的 identity 列从现有元数据里认不出来，生成的 INSERT 会被 PG 拒绝）；数值 / 布尔进
  文本列按字符串写
- **按库打开的连接池**：PG 不能在连接上切库，选了库就按「连接 ID:库名」另开一个连接池
  （`GetWithDatabase`）。PG 系的接口带 `database` 时必须经 `resolvePGExec` 换执行器，
  否则同一连接上的两个库是同一个库和自己比。`Manager.Disconnect` / `CancelConnect` 会连同
  这些池一起关（`takeDatabasePools`）——新增移除连接池的入口时也要调它，否则重连后按库的
  查询仍走旧池（改地址 / 密码、SSH 隧道换端口之后一直连着旧的）
- **表结构的元数据查询**（`postgresGet*` / `mysqlGet*`，表结构页和结构比较共用）：
  PG 取列不能用 `LEFT JOIN pg_index` 取 COLUMN_KEY（一列属于几个索引就出几行），用 `EXISTS`；
  索引列按 `array_position(indkey, attnum)` 排才是索引里的列序；外键走 `pg_constraint`
  按位置配对（information_schema 那套对复合外键出笛卡尔积）。MySQL `SHOW INDEX` 的列数
  随版本变（8.0 是 15 列），要按 `rows.Columns()` 取、按位置读前 5 列。SQLite 的
  `sqlite_autoindex_*` 既可能是主键也可能是 UNIQUE 约束，主键要按 `index_list` 的
  `origin = 'pk'` 判（按名字前缀判会把 UNIQUE 列当成主键，数据对比的匹配键就错了）
- **语句切分**（`utils/sqlUtils.ts`）：`splitSqlStatements(sql, { backslashEscapes })`。只有
  MySQL 系（和 ClickHouse / TDengine）把字符串里的反斜杠当转义符；PG、SQLite、SQL Server、
  Oracle 里它是普通字符，当成转义符的话以反斜杠结尾的值会让两条语句并成一条。编辑器的执行
  路径按连接类型传（`stringBackslashIsEscape`），不传则沿用旧行为；PG 的 `E'…'` 始终按转义处理
- **结构比较与同步**（`backend/api/compare.go`，只支持 MySQL 系和 PG 系）：元数据复用
  表结构页的查询，不要另写一套；索引 / 外键按**定义**配对、不看名字（MySQL 自动起的约束名
  两边经常不同），复合的带全部列；MySQL 的字符串默认值在 information_schema 里不带引号，
  写回 DDL 要经 `mysqlDefaultClause`。逐表读取失败不能吞——放进响应的 `errors`，前端提示
  结果不完整。目标库缺表只给提示。「执行同步」只跑新增类语句、发到**目标库**；两边不是
  同一种库时 `sync_supported=false`，按钮置灰。Go 的 nil 切片会序列化成 `null`，
  前端读 `.length` 前要兜底（或后端给空切片）
- **antd 6 的几处改名/改结构**：Alert 的 `message` → `title`；Select 的 `data-testid` 落在
  `.ant-select` 根节点，没有 `.ant-select-selector`，展开要点 `input[role="combobox"]`，
  测试里同一选项会渲染两份（可见列表 + 无障碍列表）
- **要被假计时器控制的定时器用全局 `setTimeout`**，别用 `window.setTimeout`（vitest 的
  `vi.useFakeTimers()` 只替换全局的）
- **README / doc 已过期**（仍写 Wails v2、AG Grid）；LICENSE 文件已存在（旧的「无 LICENSE」说法不成立）
- **CI 不跑测试**：`.github/workflows/` 仅 `release.yml`（打包发布），无 `test.yml`，以本地验证为准

## Test quirks

- 前端测试位于 `frontend/src/__tests__/`（37 个文件）
- 测试分类：`unit/`、`components/`、`hooks/`、`api/`、`integration/`
- 所有 Wails 绑定在 `src/__tests__/setupTests.ts` 中 mock，mock 以具名常量导出，直接 import 使用：
  ```ts
  import { mockExecuteQuery } from '../setupTests'
  ```
- Vitest 配置：`frontend/vitest.config.ts`，jsdom 环境，globals 启用
- **Node ≥26 必须关掉原生 webstorage**（2026-11-21 实锤）：Node 26 起默认声明实验性
  `localStorage` 全局，但未传 `--localstorage-file` 时访问为 `undefined`；vitest 看到
  globalThis 已有该 key 就不再从 jsdom 挂载，35 个用到 localStorage 的用例全炸。
  所有 vitest script 已带 `NODE_OPTIONS=--no-experimental-webstorage`（`poolOptions.execArgv`
  传播不到 worker，勿改回），若见 `Cannot read properties of undefined (reading 'setItem')`
  先查这个。另外本机 pnpm 已升到 12.x，跑 `pnpm test` 会把根 `package.json` 的
  `packageManager` 和 lockfile 重写，提交前注意还原这两个文件
- ESLint：flat config 位于 `frontend/eslint.config.mjs`，忽略 `dist`、`wailsjs`（历史）和 `bindings`（生成物）
- E2E 测试：Playwright 配置位于根目录 `playwright.config.ts`，测试在 `e2e/`。
  **套件已腐烂（2026-10 核实）**：testid 与实际 UI 不符（如 `conn-name` vs 实际
  `conn-name-input`）、断言早已不存在的交互（toast 已改内联提示）、未 mock Wails
  桥接——从未跑绿过，全量跑约 55 分钟且 ~100% 失败。**不要试图跑它**，验证以
  `pnpm test`（570）+ `go test ./...` + `wails3 task dev` 人工冒烟为准；修复需按当前
  UI 重写整套用例。另外 e2e 脚本须从仓库根用
  `cd frontend && PATH="$HOME/go/bin:$PATH" pnpm exec playwright test --config ../playwright.config.ts`
  运行（`wails` 不在 PATH；直接 `pnpm test:e2e` 找不到测试）
- **lint 基线不是干净的**：`TabPanel/index.tsx`、`TableList.tsx`、`api/index.ts` 等 6 个
  大文件在 HEAD 上就有几十个存量 error/warning（`no-explicit-any`、`exhaustive-deps`、
  react-hooks 编译器规则）。判断自己有没有引入问题，要和 HEAD 逐文件对比数量，
  新增文件则必须 0 问题。prettier 同理：这 6 个文件在 HEAD 上就没格式化，不要整文件重排
- **真实库上的门控测试**（默认跳过）：会话级事务并发（`backend/db/manager_tx_real_test.go`）、
  ER 图的 MySQL/PG 批量查询（`backend/api/er_diagram_test.go`）、数据对比（
  `backend/api/data_compare_real_test.go`，含 MySQL → PG 跨库、PG 的 schema 定位、MySQL
  生成列）、结构比较与表结构元数据（`backend/api/compare_real_test.go`，含「同步语句在
  目标库跑一遍再回比」）需要
  `IDBLINK_TX_SMOKE_MYSQL=1` / `IDBLINK_TX_SMOKE_PG=1`，库由根目录
  `docker compose -f docker-compose.test.yml up -d` 起（13306 / 15432）：

  ```bash
  docker compose -f docker-compose.test.yml up -d
  IDBLINK_TX_SMOKE_MYSQL=1 IDBLINK_TX_SMOKE_PG=1 \
    go test ./backend/db ./backend/api -run 'Real|SessionScoped' -count=1 -v
  docker compose -f docker-compose.test.yml down -v
  ```

  写这类测试注意：两个包是**并行**跑的，testdb 里还有初始化脚本建的 users / orders 等表，
  断言只能看自己建的表；两个库的账号密码不一样（MySQL 用户 `testpass`，PG 用户
  `testpassword`）。结构比较要在同一实例上比两个库：MySQL 的 `testuser` 没有建库权限，
  `idblink_compare_a/b` 由 `backend/testdata/mysql-test.sql` 建好并授权（PG 的由测试自己建删），
  **改了初始化脚本要重建容器**才生效：`docker compose -f docker-compose.test.yml up -d
  --force-recreate --renew-anon-volumes mysql`。本机 Docker Hub 直连不通，镜像要走
  `docker.m.daocloud.io/library/<image>` 再 `docker tag` 回原名
- jsdom 里 antd 的虚拟列表 / 表格 / 主题 hook 依赖 `ResizeObserver`、`matchMedia`，用到
  Select、Table、主题的组件测试要自己 stub

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
