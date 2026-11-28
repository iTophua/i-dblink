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
- **连接树的节点 key 不能重复**（`useTreeData.tsx` 的 `createKeyAllocator`）：antd 按 key 认节点，
  React 按 key 复用虚拟列表的行。key 重名时列表一变短（收起），先出现的重名行没人回收，成了
  没人管的孤儿节点一直留在树上——2026-11 用户在 PG 连接的「存储过程」上遇到，收起后下面留着
  三行过程项，其中两行同名。名字是会重复的：PG 的过程 / 函数有重载（TimescaleDB 的
  `cagg_migrate_*` 一串）、别的 schema 里有同名的，同名触发器可以建在多张表上。例程在后端按
  名字去重（`uniqueRoutines`，PG 系和 SQL Server；MCP、文档生成走的是同一个函数），触发器不去重
  （是不同的触发器），由 `createKeyAllocator` 给重名的后续项在 key 末尾接 `::序号`——名字仍是
  第 4 段，`parseTreeKey` 照常取得到。表 / 视图没走它：key 是「库 [+ schema] + 表名」，本身唯一，
  而且扁平模式的表 key 多一段会被 `parseTreeKey` 当成 schema 模式。新增会生成树叶节点的列表时
  key 要经 `nextKey(...)`；控制台出现 `Same 'key' exist in the Tree` 就是撞了
- **连接树不走展开 / 收起动画**（`EnhancedConnectionTree` 给 antd `<Tree>` 传 `motion={false}`）：
  antd 的树在虚拟滚动下的动画是「在被操作的节点下方插入一个动画行，装着正在出现 / 消失的子项，
  动画结束再移除」。这一行从起步走到进行中靠 rAF，兜底期限（500ms）要进了进行中才启动，渲染一
  停顿它就留在原地；动画进行期间再点展开 / 收起，树组件还会把点击直接忽略（动画行和被忽略的
  点击在 jsdom 里能复现，停在原地是预览窗格不出帧时见到的；但「收起后残留子项」不是它造成的，
  见上一条）。要传给 antd 的 `<Tree>` 本身（`EnhancedConnectionTree` 不转发）；传 `null` 不行
  （antd 用 `??` 回退成默认动画），要传 `false`
- **树上的「存储过程 / 函数 / 触发器 / 序列」目录**（`useTreeHandlers.ts` + `RoutineList.tsx`）：双击
  目录标题和点箭头一样切换展开（列表没加载就先加载，都走 `loadRoutinesIfNeeded`）；选中目录或
  其中的项时 `handleSelect` 通过 `onObjectTypeSelect(kind)` 让对象页切到对应的列表（类型是
  `ObjectTypeFilter`，`tabMgr.selectedObjectType` 传给 `TabPanel`，`isRoutineKind` 分流到
  `RoutineList`）。2026-11 之前这两条都没接：只有箭头能展开，点了目录对象页没有任何反应。
  `RoutineList` 的做法：
  - 详情侧栏**默认关着**（用户要求，和表列表一致；`localStorage` 的 `routinelist-show-detail`
    只记右上角按钮的操作）。单击一行只是选中，**双击一行**才打开这一项的定义（这次打开不记入偏好）
  - 换连接 / 库 / 类型靠外层的 `key` 让状态整个重来，列表只在挂载和点刷新时请求；详情侧栏同理，
    所以 effect 里只有异步回调里 setState（`react-hooks/set-state-in-effect` 不报）
  - 表头和行放在**同一个滚动容器**里（表头吸顶），列多、窗口窄时横向滚动、表头跟着走；属性列用
    `minmax(下限, 上限)`，下限之和就是出横向滚动的临界宽度。这个容器不能加 `contain` /
    `content-visibility`（见上面 WKWebView 那条）。PG bigint 序列的上限是 19 位数，「最大值」列的
    下限要放得下它
  - 各库的触发器 / 序列字段名不一样，统一经 `routineMeta.ts` 的 `toRoutineItem` 归一；过程 / 函数
    的定义按名字另取（`getProcedureBody` / `getFunctionBody`），触发器的定义随列表来，序列只有属性
  - 图标是组件、其余是函数和常量：分开放在 `RoutineKindIcon.tsx` 和 `routineMeta.ts`，放一个文件
    会触发 `react-refresh/only-export-components`（新文件要求 0 问题）
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
- **Monaco 编辑器**（2026-11）：本地打包、按需加载——所有编辑器必须经
  `components/LocalMonacoEditor`，不能直接用 `@monaco-editor/react` 的 `<Editor>`（它的
  loader 默认在运行时从 cdn.jsdelivr.net 加载，断网 / CDN 不通时编辑器出不来）。加载链：
  `utils/monacoLoader`（动态 import，缓存 Promise）→ `utils/monacoLocal`（`edcore.main` +
  SQL 基础语言 + worker + `loader.config({ monaco })`）。不用包的默认入口 `editor.main`：
  它会把 TS / CSS / HTML / JSON 四个语言服务的 worker 也打进产物（近 9 MB，从不加载）。
  ESM 构建没有 `window.monaco` 全局。主题是**全局**的：定义在 `utils/appMonacoTheme`，各处
  编辑器共用同一对 `custom-dark` / `custom-light`；传给 `defineTheme` 的颜色必须是十六进制——
  Monaco 的 `Color.fromHex` 解析不了 `rgba(...)` 会直接回退成纯红（选区、补全弹窗、缩进线
  都曾因此变红），统一经 `utils/monacoColors` 转换。补全提供器按语言全局注册，Monaco 会把
  同一语言的提供器**都跑一遍再合并**：不要在每个编辑器里各自
  `registerCompletionItemProvider`（开 N 个标签页候选重复 N 份），经
  `SQLEditor/hooks/sqlCompletionRegistry` 登记，每个 Monaco 实例只注册一次
- **tab-action 事件只由当前标签页响应**（`SQLEditor/hooks/useTabActions`）：菜单 / ⌘R 的
  执行、保存派发到 window，所有已挂载的 SQL 标签页都收得到；`TabPanel` 用 `isActive` 告诉
  编辑器自己是不是当前页。新增这类广播动作时同样带上 tabKey 或走这个 hook（同 `ai-sql-inject`）
- **「不分组」只有一种存法**：后端 `localdb.normalizeGroupID` 把 `'default'` / 空串统一成
  NULL（启动迁移会归一旧数据），前端用 `ConnectionTree/utils/groupUtils` 的
  `isUngroupedConnection` 判断。此前删除分组会把组内连接写成 `'default'`，而连接树只认
  空值，表现为删除分组后组内连接整组消失
- **启动画面是覆盖层**（`App.tsx`）：主界面在它下面立即挂载，不要改回「先渲染画面、结束后
  再挂载主界面」
- **主题在首帧之前应用**（`main.tsx` 的 `applyThemeBeforeRender` + `hooks/useAppTheme`）：设置存在
  localStorage，zustand persist 对同步存储是**同步** hydrate 的，store 创建时就读完了——挂载后
  注册的 `onFinishHydration` 永远不会再触发。此前主题应用挂在 `isHydrated` 后面，实际要等启动
  画面结束才生效：深色用户每次启动先看到 1.2 秒的浅色启动画面，再渐变成深色。现在渲染前先把
  令牌写到文档上，挂载后的第一次只同步原生窗口、不带过渡，之后的切换才带过渡。原生窗口那一层
  （webview 透明，前端画出来之前露的是窗口底色）靠后端记住上次的主题：前端每次应用主题调
  `SaveStartupTheme`（存 `app_config`），`main.go` 用 `SetStorageReadyCallback` 在 `ServiceStartup`
  里改主窗口的 `BackgroundColour` 和原生外观——Wails 的 `Run()` 先启动服务、后创建窗口，
  `SetBackgroundColour` 在窗口还没创建时只改选项。这两个前提变了，深色用户又会闪浅色。
  各窗口把主题底色写给原生窗口的逻辑在 `utils/windowBackground.ts`（每个窗口是独立的原生窗口，
  主窗口 / 托盘面板 / 结果弹窗各调各的）；结果弹窗创建时的底色也取存下来的主题（`app_popup.go`）
- **会话事务绑定在库上，按空闲回收**（`backend/db/manager.go`，2026-11）：
  `BeginTransaction(connectionID, sessionID, database)` 把事务开在该会话语句要落的库的连接池上
  （空 = 连接默认库），之后同会话的语句**必须带同一个库**：`GetExecutorForSession` 对换库的语句
  报错，既不进事务也不落到自动提交（此前事务固定开在默认库，选了别的库的查询 Tab 在手动模式下
  会写到默认库去）。看门狗从**最近一条语句结束**起算空闲（不是从 BEGIN 起算总时长），正在执行的
  语句算活动；被它回收的会话记在 `txTimedOut` 里，之后的语句一律拒绝，直到调用方显式
  begin / commit / rollback——以前事务被回收后界面还亮着事务按钮，后续语句逐条自动提交，等去
  提交时才发现「事务已结束」。`use_transaction`：`false` = 绕过事务，不传 = 有事务就进（MCP / DDL /
  导入），显式 `true` = 必须在会话事务里（编辑器手动模式），事务不在了直接报错。前端
  `useTransaction(connectionId, tabKey, database)` 执行前会先向后端核对事务还在不在。给会话开事务的
  新入口都要带上会话用的那个库（SQL 导入向导、MCP `begin_transaction` 的 `database` 参数同理）
- **MCP `execute_script` 的 DML 分支看的是 `res.Error`**：`App.ExecuteQuery` 的 Go `err` 只表示没
  执行到数据库那一层，SQL 报错在 `QueryResult.Error` 里。此前只看 `err`：脚本里一条失败后继续往下
  跑并**提交**了前面的语句，还报「已提交」。逻辑在 `mcpserver.runDMLScript`（抽成接口，可用假实现测）
- **MCP 的只读门禁建立在方言词法上**（`backend/mcpserver/security.go`）：三个分类器（只读 / DML /
  DDL）先做词法视图 `lexSQL`——注释、字符串、引用标识符抹成空格，分号和第一个关键字都从视图里读。
  边界画错有两个方向：把字面量当代码只会误拒；把代码当字面量，藏在「字符串」里的第二条语句就跟着
  发给数据库了（lib/pq 不带参数时走简单协议，一次执行整段）。旧扫描器一律把 `\` 当转义符、不认
  `$tag$` / `[]` / `q'[…]'`，2026-11 实锤 PG 上 `SELECT '\'; DROP TABLE t; SELECT ''`、
  `SELECT $$a'b$$; DROP …`（真库上直接发过去，表真的没了）以及 SQL Server 的 `[x']; …`、Oracle 的
  `q'[a'b]'; …` 全部被判成只读。`E'…'` 不在其中：转义引号只会让字符串更长，夹着 DROP 的 E 字符串
  是一条合法的只读 SELECT，认它是为了不误拒。现在按连接的方言扫：MySQL 系 / ClickHouse / TDengine
  字符串里 `\` 是转义，
  MySQL 系另认 `#` 注释和 `/*! … */` 可执行注释（内容当 SQL）；PG 系认 `$tag$`（紧跟标识符字符的
  `$` 属于标识符，`foo$tag$` 不是字符串）、`E'…'`、嵌套块注释；SQL Server 认 `[…]`；Oracle / 达梦
  遇到 `q'[…]'` 整条拒绝；未知方言字符串里出现 `\` 就拒绝。没闭合的一律拒绝。
  只读工具里还拒绝：`EXPLAIN ANALYZE / ANALYSE`（会真的执行语句）、数据修改 CTE 和 `WITH … DML`
  （视图里出现 INSERT / UPDATE / DELETE / MERGE / REPLACE 即拒）、`SELECT … INTO`（按词判，字符串里的
  "into" 不再误伤）、赋值形式的 `PRAGMA`（只读形式：裸的 `PRAGMA 名字`，或参数在括号里且名字在
  `sqliteQueryPragmas` 里）、`USE`（语句落在连接池的任意一条连接上，后面不带 `database` 的调用不一定
  在它上面——改用 `database` 参数）。`explain_query` 标了 readOnlyHint，被解释的语句过 `explainTarget`
  （同样拒 ANALYZE，只收有执行计划的语句）。`WITH … INSERT / UPDATE / DELETE / MERGE` 归
  `execute_update`（`withMainWord` 找主语句）；PG 系的 `$tag$` 函数体算一条语句，`execute_ddl` 和
  `execute_script` 能建函数，其余方言的函数体没法可靠切分、仍然拒绝。改分类器先看
  `security_test.go` 的样本表。拦不住的：带副作用的函数（`SELECT pg_terminate_backend(...)`）；
  词法按各库的默认配置扫，PG 开着 `standard_conforming_strings = off`、MySQL 开着 `ANSI_QUOTES` /
  `NO_BACKSLASH_ESCAPES` 时转义规则不一样；硬保证要靠只读事务 + 扩展协议，没做
- **MCP 的协议流是进程的 stdout**：`iDBLink --mcp --stdio` 下任何写到 stdout 的东西都是非法的
  JSON-RPC 消息。开发构建的 sidecar 同样算 `isDevMode()`，`callHandler` 的 `[API]` 调试输出此前打到
  stdout——开发版挂 MCP 时每次查元数据都往协议流里掺一行。现在走 stderr；`stdio_test.go` 用管道
  代替进程 stdio 跑真实的 StdioServer，并盯着真的 `os.Stdout`（强制 `WAILS_DEV=1`）
- **MCP 结果的几条约定**（`mcpserver/`）：SQL 报错在 `QueryResult.Error` 里，工具结果必须标
  `isError`（`queryResultJSON`），否则客户端按成功处理、模型把主键冲突读成「影响 0 行」；
  `execute_script` 的 `executed` 只数成功的，`stop_on_error=false` 时有失败即 isError。取消和超时靠
  ctx 贯通：`ExecuteQueryCtx` / `ExecuteQueryLimitedCtx` / `ExecuteDDLCtx` + `callHandlerCtx`，handler
  里要从 `r.Context()` 派生超时（`api/ddl.go`），写回 `context.Background()` 就断了；工具有可选的
  `timeout_seconds`（上限同 30 分钟的长操作上限）。工具清单不手抄：`mcpserver.ToolNames()` 走注册，
  `main` 用 `SetMCPToolNamesFunc` 注入（backend 引用不了 mcpserver），设置页「可用工具」从它来。
  不支持 elicitation 的客户端是以 JSON-RPC 错误回应的，`kill_process` 的失败分支一律给出
  `force=true` 的出路（`killConfirmationFailed`），不能只靠 `ErrElicitationNotSupported`。
  `create_connection` 命中同服务器同账号的已有连接时会复用它：带了密码要先
  `CheckSavedConnectionPassword`（按已存连接的 SSL / SSH 配置用新密码试连一次，不落库、不碰现有
  连接池）验证通过才替换，验证不过报错并保留原密码——模型抄错一位不能把桌面端能用的连接改坏。
  例程定义找不到时后端返回空串而不是报错，`routineBodyResult` 把空串按「没找到」处理；PG 系的
  `get_procedure_body` / `get_function_body` 认 `schema` 参数（`qualifiedRoutineName`），只有 PG 系拼，
  别的库带了点反而找不到。同名重载分不出（后端按名字找、取第一个），`list_*` 也不带 schema——
  桌面端的例程列表是同一个后端查询，同样的局限
- **MCP 写类工具的边界**（2026-11 定）：`execute_update` = INSERT / UPDATE / DELETE / MERGE / REPLACE
  （可带 WITH；写语句走 ExecContext 才有影响行数——`api.isDMLStatement` 遇到 WITH 按 CTE 列表的
  固定形状找主语句，认不出的一律当查询：把 SELECT 当写语句去 Exec 会丢结果集，反过来只是少个影响
  行数，代价不对称。MySQL 没有 `WITH … INSERT`，带 CTE 的插入得写 `INSERT … WITH … SELECT`）；
  `execute_ddl` = CREATE / DROP / ALTER / TRUNCATE / RENAME + 授权 GRANT / REVOKE + 对象
  注释 COMMENT ON；`execute_procedure` = CALL / EXEC / EXECUTE（各库写法不同），PG 系另有 DO（匿名块
  在 `$tag$` 里、是一条语句）。`execute_script` 只收只读 / DML / DDL 三类，过程调用不进脚本。
  Oracle / SQL Server 的匿名块（`BEGIN … END;`，体内全是分号）没法可靠切分，哪个工具都不收。
  每个写类工具都带 destructiveHint、靠客户端确认，分类器保证的只是「发出去的确实只有这一类的一条
  语句」；过程调用带回的结果集走查询路径（上限 1000 行），MySQL 驱动关结果集时会丢掉剩余的结果集，
  连接不会坏。`CALL …; DROP …` 这种多语句同样被拦。要再放宽类别时同步改 `IsDDLStatement` /
  `IsProcedureCall`、工具描述和 `security_test.go` 的样本表
- **网格编辑：没动过 = 取消**（`DataTable/utils.editorCommitValue`、`GlideDataTable` 的
  `InlineCellEditor`）：Glide 关闭编辑器时不比较新旧值、一律回调，而 NULL 格子的编辑框本来就是空的
  ——必须靠「用户有没有输入过」判断，不能靠上层比对新旧值。NULL 与空串是两个值：NULL 在网格里是
  `data=''` + `displayData='NULL'`（斜体显示，判断用 `isNullCell`），空串显示为空白；清空数值格上报
  `'NULL'`（数值列写不了空串）；`'NULL'` 字符串由上层解析成空值（所以文本列存不了字面量 "NULL"，
  已知限制）。范围编辑只在直接键入（Glide 传 `initialValue`）时铺满选区，双击 / F2 进入时不铺
- **结果集编辑要认对表**（`SQLEditor/resultTable.ts` + `ResultGrid`）：从 SQL 里取出 `FROM` 后的表
  引用（含 `库.表` / `schema.表`），写回的 UPDATE / DELETE 带上限定部分；取列信息也按限定名查——
  后端 `tableQualifier` 把 `限定部分.表名` 拆开（MySQL 当库名，PG 系 / SQL Server 当 schema，其余库
  不拆）。只拿表名去查的话，`SELECT * FROM b.t` 的编辑会落到当前库的同名表上。
  定位不到唯一的表（JOIN / 子查询 / 列信息有重名）一律只读；列信息连同它对应的表一起存，换了
  结果集不沿用上一张表的主键；重名列的网格列 id 按出现次序编号（`id`、`id#2`）
- **PG 系 / SQL Server 的表名带 schema**（`utils/qualifiedName`，2026-11）：这两种库的表按 schema 分层，
  定位一张表要用「schema.表」——不带的话 PG 按 search_path 找同名表，数据页读的、改的、右键删的
  可能是别的 schema 里的表（删表还因为 `IF EXISTS` 不报错）。界面上所有打开表、对表操作的出口
  （连接树节点、树的节点 key、对象页的表列表、ER 图、⌘K 命令面板、全局搜索）都经
  `qualifiedTableName(table, schema, dbType)` 拿完整名字；其余库原样返回表名（MySQL 的库是单独一个
  `database` 参数；Oracle 的 owner 不能拼进去，带了会被当成名字本身加引号）。拼表引用一律走方言的
  `buildTableRef`：PG 系 / SQL Server 认「schema.表」并按段加引号，库名不当限定符；其余库照旧拿库名
  当限定部分、名字里的点不拆。后端对应的入口是 `tableQualifier`（列 / 索引 / 外键 / 结构 / CHECK /
  建表语句 / 表引用都用它）。复制表改写 DDL 时要用**去掉 schema 的表名**：DDL 里是 `"schema"."表"`
  两段，拿整串去对不上；目标表默认是 `schema.表_copy`，落在源表所在的 schema。已知限制：schema 或
  表名本身带点的表不支持；收藏里存的表名不带 schema；SQL Server 这一路没有真库验证过
- **带 `database` 的表操作走 `getExecAndType`，不是 `getConnAndType`**（`backend/api/router.go`）：
  后者固定返回连接默认库上的执行器。PG 不能在连接上切库，删表 / 清空 / 重命名 / 表维护 / 导出 /
  导入 / 触发器列表若拿默认库的执行器，语句会落到默认库去——删中的可能是另一个库里的同名表。
  `getExecAndType` 对 PG 系换成按库开的连接池，其余库不变。表引用由 `buildTableRef` 拼：PG 系 / SQL
  Server 的限定部分只能是 schema，库名拼成 `"库"."表"` 在 PG 上只会报 schema 不存在。新增带库的表
  操作时照这个来；给会话开事务、取执行器时带的库要和语句一致（导入向导的 `txDatabase` 同理）
- **PG 的建表语句从系统目录拼**（`postgresBuildTableDDL`）：列（NOT NULL / 默认值 / 自增 / 生成列 /
  排序规则）、主键 / 唯一 / 外键 / CHECK / 排他约束、不挂在约束上的索引、表和列注释；视图取
  `pg_get_viewdef`。此前只输出「列名 类型」，表结构页的 DDL、导出 SQL、复制表拿到的都是没有约束的
  空壳。CHECK 写成表级约束（多列 CHECK 也适用，和 pg_dump 一致）；不在 `pg_catalog` 里的排序规则带
  schema。`attidentity`（PG 10 起）/ `attgenerated`（PG 12 起）老版本没有，用 `pgAttributeHas` 先探；
  过程 / 函数定义走 `pg_get_functiondef`，判断聚合用 `pg_aggregate`——`prokind` PG 11 以前没有，
  `proisagg` PG 11 起删掉了，都不能用。完整性靠「拿生成的语句在另一个 schema 重建、按系统目录比对」
  的测试保证。没做的：分区表的子分区按普通表输出
- **连接串**（`backend/db/mysql.go` 的 `mysqlDSN`、`postgres.go` 的 `postgresDSN`）：MySQL 密码原样写进
  连接串，驱动按最后一个 `@` 分隔账号和地址、也不做 `%XX` 解码（此前把 `@` 换成 `%40`，带这种密码的库
  一律 Access denied）。PG 连接带 `statement_timeout`，对齐上层的 30 分钟长操作上限和 MySQL 的
  `readTimeout`（改一处要一起改）；不设 `lock_timeout`，等锁由用户点「停止」取消
- **连接弹窗的 SSH 认证方式**（`ConnectionDialog.tsx`）：后端只在 `ssh_auth_method == "key"` 时用私钥，
  界面上有「密码 / 私钥」开关，存下来的才是选中的那种。文件路径输入框是 `FilePickerField`：带 `name`
  的 `Form.Item` 必须包在 `Space.Compact` **里面**（Compact 不往下传 value / onChange，包在外面输入框
  绑不到表单值，选了文件、编辑已有连接时都是空的）。**别在处理函数里切页签后紧接着 `validateFields`**：
  字段在刚切过来的页签上时校验不保证作用得到它（实测紧接着调、隔一个宏任务调都静默通过，原因在
  表单库内部），要显示错误就把文字当属性传给字段（私钥文件那行红字这么做）；原有的「名称 / 主机」
  那段用的是 `setTimeout(60)`，同样不可靠，没动
- **编辑提交：没碰到行也算失败**（`DataTable/utils.runEditStatement`）：`rows_affected === 0` 说明
  WHERE 一行都没匹配上（主键值在界面上失真，如 BINARY(16) 显示成 `[BLOB: n bytes]`；或数据已被改
  掉），以前照样报成功并清掉编辑标记。MySQL 的 UPDATE 只数「值真的变了」的行，所以 UPDATE 报 0 行时
  回头 `SELECT COUNT(*)` 确认行还在不在；影响行数未知时不判。结果集提交是逐条执行的，已落库的编辑
  立刻从待提交状态里移除，中途失败后再提交不会把已落库的 INSERT 再执行一遍
- **复制表的 DDL 改写按标识符来**（`utils/ddlCopy.rewriteDDLForCopy`）：只改「表」和 `CONSTRAINT /
  KEY / INDEX` 后面的对象名（名字里按 `_` 分段后等于表名的那一段），列名、注释、默认值不动。此前是
  整段子串替换：把 `user` 复制成 `user_copy`，列 `user_name` 也被改成 `user_copy_name`。数据复制的
  每一步都要看 `result.error`（`api.executeQuery` 不抛错）；跨库逐行复制遇到二进制列（值只剩
  `[BLOB: n bytes]` 占位文本）直接报错，而不是把占位文本写进去；MySQL 同服务器的两个库交给
  `INSERT INTO db2.t SELECT * FROM db1.t`
- **查询执行分轮次**（`useQueryExecution`）：每次执行有一个序号。执行中再次触发会先取消上一轮的
  后端批次，被取代的那一轮晚返回时丢弃结果、不动共享状态、不清新一轮的取消令牌；卸载（关闭查询
  Tab）时取消后端还在跑的批次。只中止界面等待的话，旧批次继续占着连接，「停止」也停不掉新一轮
- **antd 6 的几处改名/改结构**：Alert 的 `message` → `title`；Select 的 `data-testid` 落在
  `.ant-select` 根节点，没有 `.ant-select-selector`，展开要点 `input[role="combobox"]`，
  测试里同一选项会渲染两份（可见列表 + 无障碍列表）
- **给 `.ant-input` 写主题样式时注意它有两层**（`theme-enhancements.css`）：带 prefix / suffix /
  allowClear 的输入框、密码框、搜索框是 `.ant-input-affix-wrapper` 外壳套一个 `input.ant-input`，
  两层都带 `.ant-input`。暗黑的底色是半透明的，外壳和内层各刷一遍就叠出两种深浅——文字区域比
  四周亮一圈（2026-11 用户在对象页的搜索框上发现）。antd 给内层的透明底不带 `!important`，挡不住
  带 `!important` 的规则，所以内层的底色靠
  `[data-theme='dark'] .ant-input-affix-wrapper > .ant-input` 那条重置成透明；新增暗黑下输入框的
  底色规则时别把它盖掉。这类问题 jsdom 测不出来（样式表不加载），要在预览里读计算样式
- **要被假计时器控制的定时器用全局 `setTimeout`**，别用 `window.setTimeout`（vitest 的
  `vi.useFakeTimers()` 只替换全局的）
- **README / doc 已过期**（仍写 Wails v2、AG Grid）；LICENSE 文件已存在（旧的「无 LICENSE」说法不成立）
- **CI 不跑测试**：`.github/workflows/` 仅 `release.yml`（打包发布），无 `test.yml`，以本地验证为准

## Test quirks

- 前端测试位于 `frontend/src/__tests__/`（62 个文件）
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
  `pnpm test`（827）+ `go test ./...` + `wails3 task dev` 人工冒烟为准；修复需按当前
  UI 重写整套用例。另外 e2e 脚本须从仓库根用
  `cd frontend && PATH="$HOME/go/bin:$PATH" pnpm exec playwright test --config ../playwright.config.ts`
  运行（`wails` 不在 PATH；直接 `pnpm test:e2e` 找不到测试）
- **lint 基线不是干净的**：`TabPanel/index.tsx`、`TableList.tsx`、`api/index.ts` 等 6 个
  大文件在 HEAD 上就有几十个存量 error/warning（`no-explicit-any`、`exhaustive-deps`、
  react-hooks 编译器规则）。判断自己有没有引入问题，要和 HEAD 逐文件对比数量，
  新增文件则必须 0 问题。prettier 同理：这 6 个文件在 HEAD 上就没格式化，不要整文件重排。
  gofmt 也一样：`backend/navicat.go`、`backend/app_query_test.go` 在 HEAD 上就没格式化，
  只对自己改的文件**按路径**跑 `gofmt -w`，别用目录通配（2026-11 一次 `gofmt -w backend/*.go`
  把这两个文件整篇重排了）
- **真实库上的门控测试**（默认跳过）：会话级事务并发与「事务开在所选库上」（
  `backend/db/manager_tx_real_test.go`；空闲回收、超时后不退回自动提交、事务绑定库在 SQLite 上就能
  跑，见 `manager_tx_binding_test.go`）、限定表名取列（`backend/api/qualified_table_real_test.go`）、
  PG 的 schema 贯通（`backend/api/pg_schema_real_test.go`：限定名的列 / 索引 / 外键 / CHECK、删表 /
  清空 / 重命名落在选中的库和 schema 上、触发器与过程函数列表（重载、别的 schema 里的同名例程
  只列一条；建在多张表上的同名触发器各是一行）、过程定义、建表语句重建后比对系统
  目录、序列、导入导出、服务端超时）、ER 图的 MySQL/PG 批量查询（`backend/api/er_diagram_test.go`）、
  数据对比（`backend/api/data_compare_real_test.go`，含 MySQL → PG 跨库、PG 的 schema 定位、MySQL
  生成列）、结构比较与表结构元数据（`backend/api/compare_real_test.go`，含「同步语句在
  目标库跑一遍再回比」）、MCP 只读门禁在真库上的行为（`backend/mcpserver/gate_real_test.go`：
  放行的只读语句结果正确、拦下的语句直接发过去真的会执行、PG 的 `$tag$` 函数体能建、
  `timeout_seconds` 真的打断语句、过程调用带回多个结果集后连接照常可用、`WITH … DML` 带影响行数、
  GRANT / REVOKE 真的改了权限；包在 `./backend/mcpserver`，跑法
  `go test ./backend/mcpserver -run RealGate -count=1 -v`）需要
  `IDBLINK_TX_SMOKE_MYSQL=1` / `IDBLINK_TX_SMOKE_PG=1`，库由根目录
  `docker compose -f docker-compose.test.yml up -d` 起（13306 / 15432）：

  ```bash
  docker compose -f docker-compose.test.yml up -d
  IDBLINK_TX_SMOKE_MYSQL=1 IDBLINK_TX_SMOKE_PG=1 \
    go test ./backend/db ./backend/api -run 'Real|SessionScoped' -count=1 -v
  docker compose -f docker-compose.test.yml down -v
  ```

  `TestRealPGStatementTimeout` 真跑一条 32 秒的语句（约 33 秒），赶时间加 `-short` 跳过。
  `pg_schema_real_test.go` 每个用例建两个临时库 `idblink_pg_home` / `idblink_pg_work`（连接的默认库、
  请求里选中的库），两边放同名对象当诱饵，断言既看目标也盯诱饵；清理用
  `DROP DATABASE … WITH (FORCE)`，清理失败会让用例失败（残留要能被发现）。
  断言「被拦下」不能只看 isError：数据库报错同样是 isError，「门禁放行、语句在库里出错」也会算
  通过——`gate_real_test.go` 的 `mustReject` 认的是门禁的拒绝文本（2026-11 实锤：MySQL 的
  ``SELECT `a'; DROP TABLE t; SELECT '` `` 反引号里整段是一个列名，本来就是一条合法的只读 SELECT，
  此前它靠 Unknown column 报错「被拦下」）。临时对象开头也清一次、名单要全：门禁真坏了的时候留下
  的对象会让下次的 CREATE 报「已存在」，同样是 isError。样本要能区分规则在不在：写完对每条规则
  做一次变异，结论不变就是没测到（PG 的嵌套块注释、MySQL 的 `--` 后空白、结尾是反斜杠的字符串
  都是这么补出来的）

  写这类测试注意：两个包是**并行**跑的，testdb 里还有初始化脚本建的 users / orders 等表，
  断言只能看自己建的表；两个库的账号密码不一样（MySQL 用户 `testpass`，PG 用户
  `testpassword`）。结构比较要在同一实例上比两个库：MySQL 的 `testuser` 没有建库权限，
  `idblink_compare_a/b` 由 `backend/testdata/mysql-test.sql` 建好并授权（PG 的由测试自己建删），
  **改了初始化脚本要重建容器**才生效：`docker compose -f docker-compose.test.yml up -d
  --force-recreate --renew-anon-volumes mysql`。本机 Docker Hub 直连不通，镜像走
  `public.ecr.aws/docker/library/<image>` 再 `docker tag` 回原名（Amazon 的 Docker 官方镜像缓存，
  2026-11 实测约 600 KB/s，PG + MySQL 两个镜像 4 分钟；同一时间 `docker.m.daocloud.io` 只有约
  120 KB/s、47 分钟没拉下来一个，`mirror.gcr.io` 连不上）
- jsdom 里 antd 的虚拟列表 / 表格 / 主题 hook 依赖 `ResizeObserver`、`matchMedia`，用到
  Select、Table、主题的组件测试要自己 stub

## Verification order

```bash
pnpm lint → pnpm exec -- tsc --noEmit → pnpm test → go test ./...
```

修改前后端代码后按此顺序验证，任一步骤失败应立即修复。

**`go build` 通过不代表没问题**：改 `router.go` / `manager.go` / `helpers.go` 这类所有处理器都要走的
入口，改完当场编译加跑测试，不要攒着一组文件改完再验——两个函数互相调用这种错误编译器发现不了，
只有测试会撞上（2026-11 实锤：`getConnAndType` 和新加的 `getExecAndType` 互相转调，每个请求一进来
就无限递归）。同理，新写的用例一次就过时，把被测的源文件临时退回去确认它会变红，再恢复。
做这种反向确认时注意两点：变异要改成一个**能编译**的等价表达式（编译失败也会让测试变红，
那不算被抓住）；动手前先确认基线是绿的，并且看一眼变红的是不是预期的那条断言——2026-11 有个
用例因为断言自己写错一直是红的，它「抓住」了一个其实没测到的变异

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
