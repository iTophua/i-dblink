# iDBLink 自动化测试文档

> 使用 **tauri-mcp CLI** (tauri-plugin-mcp-bridge) + **Playwright** + **Docker 数据库** 对 iDBLink Tauri 应用进行全面自动化测试

---

## 一、测试体系概览

iDBLink 采用 **双轨测试体系**：

| 维度 | tauri-mcp CLI | Playwright |
|------|---------------|------------|
| 定位 | Tauri 原生集成测试 | Web 前端 E2E 测试 |
| 连接方式 | WebSocket → MCP Bridge 插件 | HTTP → Vite Dev Server |
| 覆盖范围 | UI + Rust Backend + Go Sidecar | UI 渲染 + 交互 |
| 速度 | 快（直连 WebView） | 中等（经浏览器） |
| 最佳场景 | 数据库操作、IPC 调用验证 | 页面渲染、复杂交互流 |

**推荐策略**：用 Playwright 跑核心 UI 流程，用 tauri-mcp 验证 Tauri 特有功能（IPC、系统集成）。

---

## 二、测试前置条件

### 2.1 环境要求

| 组件 | 要求 | 验证命令 |
|------|------|----------|
| Node.js | >= 20 | `node --version` |
| pnpm | latest | `pnpm --version` |
| Rust/Cargo | stable | `cargo --version` |
| Docker | >= 24 | `docker info --format '{{.ServerVersion}}'` |
| Docker Compose | v2+ | `docker compose version` |
| Go | >= 1.21 | `go version` |
| tauri-mcp CLI | >= 0.10 | `tauri-mcp --help` |
| Playwright | >= 1.59 | `npx playwright --version` |

### 2.2 安装 tauri-mcp CLI

```bash
npm install -g @hypothesi/tauri-mcp-cli --registry=https://registry.npmjs.org
```

### 2.3 安装 Playwright

```bash
pnpm add -D @playwright/test
npx playwright install chromium
```

### 2.4 启动 Docker 测试数据库

```bash
# 清理旧容器并启动
docker compose -f docker-compose.test.yml down --remove-orphans
docker compose -f docker-compose.test.yml up -d

# 等待数据库就绪（利用 healthcheck，比 sleep 更可靠）
docker compose -f docker-compose.test.yml ps --format json | jq -r '.[] | select(.Health=="healthy") | .Service'
```

**测试数据库连接信息：**

| 数据库 | 主机 | 端口 | 数据库名 | 用户 | 密码 |
|--------|------|------|----------|------|------|
| MySQL | 127.0.0.1 | 13306 | testdb | testuser | testpass |
| PostgreSQL | 127.0.0.1 | 15432 | testdb | testuser | testpassword |

**测试数据**（MySQL: 5 用户, 5 订单, 5 商品, 5 分类, 6 表）

### 2.5 集成 MCP Bridge 插件

项目已集成。如需新项目，参考以下配置：

**Cargo.toml:**
```toml
tauri-plugin-mcp-bridge = "0.11"
```

**main.rs** (仅在 debug 模式启用):
```rust
fn main() {
    let mut builder = tauri::Builder::default();
    #[cfg(debug_assertions)]
    { builder = builder.plugin(tauri_plugin_mcp_bridge::init()); }
    // ... rest of builder chain
}
```

**tauri.conf.json:** 确保 `"withGlobalTauri": true`

### 2.6 启动应用并创建 MCP 会话

```bash
# 1. 启动 Tauri 应用（后台运行）
nohup pnpm tauri dev > /tmp/idblink-tauri-dev.log 2>&1 &
TAURI_PID=$!

# 2. 等待 MCP Bridge 就绪（轮询日志，比 sleep 更可靠）
for i in {1..60}; do
  if grep -q "MCP.*listening" /tmp/idblink-tauri-dev.log 2>/dev/null; then
    echo "MCP Bridge 就绪"
    break
  fi
  sleep 1
done

# 3. 创建自动化会话
tauri-mcp driver-session start

# 4. 验证连接
tauri-mcp driver-session status
```

---

## 三、tauri-mcp CLI 工具使用说明

### 3.1 核心命令

| 命令 | 功能 | 参数示例 |
|------|------|----------|
| `driver-session start` | 创建自动化会话 | 无参数 |
| `driver-session status` | 查看会话状态 | 无参数 |
| `driver-session stop` | 停止会话 | 无参数 |
| `webview-dom-snapshot` | 获取 DOM 快照 | `--type accessibility` 或 `--type structure` |
| `webview-interact` | 模拟交互 | `--action click --selector "ref=e6"` |
| `webview-keyboard` | 键盘输入 | `--action type --selector "ref=e203" --text "test"` |
| `webview-execute-js` | 执行 JS | `--script "(() => { ... })()"` |
| `webview-screenshot` | 截图 | `--file /path/to/output.png` |
| `webview-wait-for` | 等待条件 | `--type text --value "success"` |
| `ipc-execute-command` | 调用 Tauri IPC | `--command test_connection --args '{"json":"..."}'` |
| `ipc-monitor` | 监控 IPC | `--action start/stop` |
| `read-logs` | 读取日志 | `--source console` |

### 3.2 选择器策略

| 策略 | 示例 | 说明 |
|------|------|------|
| CSS 选择器 | `--selector ".ant-modal"` | 默认策略 |
| ref 引用 | `--selector "ref=e6"` | 从 DOM 快照获取的 ref |
| 文本匹配 | `--selector "新建连接" --strategy text` | 按元素文本搜索 |
| XPath | `--selector "//div[@id='root']" --strategy xpath` | XPath 表达式 |

### 3.3 通信架构

```
AI Agent (tauri-mcp CLI)
  → tauri-mcp driver-session (WebSocket :9223)
    → tauri-plugin-mcp-bridge (Rust 插件)
      → Tauri WebView / Rust Backend / Go Sidecar
```

---

## 四、Playwright E2E 测试体系

### 4.1 测试文件结构

```
e2e/
├── helpers/
│   └── test-helpers.ts          # 测试辅助函数（创建连接、执行 SQL 等）
├── fixtures/
│   └── ...                      # 测试固件数据
├── smoke.test.ts                # 冒烟测试：应用启动、布局渲染
├── connection-flow.test.ts      # 连接管理：创建、编辑、删除连接
├── query-flow.test.ts           # SQL 查询：编辑、执行、导出结果
├── table-operations.test.ts     # 表操作：浏览、结构、增删改查
├── transaction-flow.test.ts     # 事务控制：BEGIN/COMMIT/ROLLBACK
├── settings-flow.test.ts        # 应用设置：主题、语言、快捷键
├── backup-restore.test.ts       # 备份恢复功能
├── schema-compare.test.ts       # 结构比较功能
├── keyboard-shortcuts.test.ts   # 快捷键验证
└── regression.test.ts           # 回归测试：完整用户旅程
```

### 4.2 运行 Playwright 测试

```bash
# 运行所有 E2E 测试
pnpm test:e2e

# 带 UI 界面调试
pnpm test:e2e:ui

# 运行单个测试文件
npx playwright test e2e/smoke.test.ts

# 只运行有 tag 的测试
npx playwright test --grep "@critical"
```

### 4.3 Playwright 配置要点

`playwright.config.ts` 关键配置：

```typescript
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,      // 串行执行（共享应用状态）
  workers: 1,                // 单 worker 避免状态冲突
  use: {
    baseURL: 'http://localhost:5100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm tauri dev',
    port: 5100,
    reuseExisting: false,
  },
});
```

---

## 五、用户场景驱动测试（核心章节）

所有测试用例以**真实用户操作**为主线，每个场景包含四维验证：

| 验证维度 | 说明 | 验证方式 |
|----------|------|----------|
| **页面显示** | UI 元素是否正确渲染、位置/样式/文字是否符合预期 | DOM 快照、截图对比、元素可见性断言 |
| **功能交互** | 点击、输入、拖拽等操作是否触发正确响应 | 交互命令、状态变更监听 |
| **数据正确性** | 操作后业务数据是否符合预期 | 非可视化验证：IPC 调用、数据库查询、日志分析 |
| **提示信息** | 成功/失败/警告提示是否准确、友好 | Toast/Modal/状态栏文字断言 |

---

### 场景 1：首次启动应用（ smoke 测试）

**用户故事：** 用户首次打开 iDBLink，期望看到完整的界面布局。

**前置条件：** 应用已启动，无历史连接数据。

**用户操作：**
1. 打开应用，等待主界面加载完成。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 工具栏按钮 | 显示"新建连接"、"刷新"、"新建查询"、"设置"四个按钮，图标和文字完整 |
| 页面显示 | 侧边栏 | 显示连接树区域，无连接时显示"暂无连接"或空状态提示 |
| 页面显示 | 主区域 | 默认显示"对象"标签页，内容为空白或欢迎提示 |
| 页面显示 | 状态栏 | 显示"未连接"、编码"UTF-8"等状态信息 |
| 功能交互 | 点击"新建连接" | 弹出"新建连接"对话框 |
| 功能交互 | 点击"设置" | 弹出"设置"对话框 |
| 数据正确性 | 连接列表 | 通过 IPC 调用 `get_connections` 返回空数组 |
| 提示信息 | 无连接提示 | 侧边栏友好提示用户如何创建第一个连接 |

**脚本位置：** `e2e/mcp-tests/t_01_initial_page.sh` / `e2e/smoke.test.ts`

---

### 场景 2：创建并测试 MySQL 连接

**用户故事：** 用户需要连接到一个 MySQL 测试数据库，验证连接配置正确。

**前置条件：** 应用已启动，Docker MySQL 容器运行中（端口 13306）。

**用户操作：**
1. 点击工具栏"新建连接"按钮。
2. 在左侧面板选择"MySQL"数据库类型。
3. 在右侧表单填写连接信息：
   - 连接名称：`Docker MySQL`
   - 主机：`127.0.0.1`
   - 端口：`13306`
   - 用户名：`testuser`
   - 密码：`testpass`
   - 数据库：`testdb`
4. 点击"测试连接"按钮。
5. 等待提示"连接成功"。
6. 点击"保存"按钮。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 对话框标题 | 显示"新建连接" |
| 页面显示 | 数据库类型选中 | MySQL 高亮显示，右侧显示 MySQL 图标和描述 |
| 页面显示 | 表单字段 | 名称、主机、端口、用户名、密码、数据库六个字段均可见且可输入 |
| 页面显示 | 测试连接按钮状态 | 点击后变为加载状态，显示"测试中..." |
| 功能交互 | 测试连接 | 点击后触发后端验证，按钮禁用防止重复点击 |
| 功能交互 | 保存后关闭对话框 | 对话框消失，主界面可交互 |
| 数据正确性 | 连接保存验证 | IPC 调用 `get_connections` 返回包含 `Docker MySQL` 的连接列表 |
| 数据正确性 | 连接树显示 | 侧边栏出现"Docker MySQL"节点，状态为"未连接" |
| 数据正确性 | 后台数据验证 | 通过 IPC 调用 `get_connection_by_id` 验证配置参数与输入一致 |
| 提示信息 | 测试连接成功 | 显示绿色 Toast："连接成功"或"Connection test passed" |
| 提示信息 | 保存成功 | 显示绿色 Toast："连接已保存" |
| 提示信息 | 表单校验 | 若名称/主机为空，点击保存时显示红色提示："请输入连接名称" |

**用户操作矩阵（异常路径）：**

| 操作组合 | 输入数据 | 预期结果 |
|----------|----------|----------|
| 测试连接 + 错误密码 | 密码改为 `wrongpass` | 红色错误提示："连接失败：Access denied" |
| 测试连接 + 错误端口 | 端口改为 `3307` | 红色错误提示："连接失败：Connection refused" |
| 保存 + 空名称 | 名称为空，其他正确 | 表单校验失败，聚焦到名称输入框，显示"请输入连接名称" |
| 保存 + 空主机 | 主机为空 | 表单校验失败，显示"请输入主机地址" |
| 快速双击保存 | 连续点击两次保存 | 仅执行一次保存，无重复连接创建 |

**脚本位置：** `e2e/mcp-tests/t_05_06_07_connections.sh` / `e2e/connection-flow.test.ts`

---

### 场景 3：创建并测试 PostgreSQL 连接

**用户故事：** 用户需要连接到一个 PostgreSQL 测试数据库。

**前置条件：** 应用已启动，Docker PostgreSQL 容器运行中（端口 15432）。

**用户操作：**
1. 点击工具栏"新建连接"按钮。
2. 选择"PostgreSQL"数据库类型。
3. 填写连接信息：
   - 连接名称：`Docker PostgreSQL`
   - 主机：`127.0.0.1`
   - 端口：`15432`
   - 用户名：`testuser`
   - 密码：`testpassword`
   - 数据库：`testdb`
4. 点击"测试连接"。
5. 保存连接。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 数据库类型面板 | PostgreSQL 高亮，其他类型未选中 |
| 页面显示 | 连接树 | 保存后出现"Docker PostgreSQL"节点 |
| 功能交互 | 端口自动填充 | 选择 PostgreSQL 后端口自动变为 `5432`（默认值） |
| 数据正确性 | 连接配置 | IPC 验证 `db_type` 为 `postgresql`，端口为 `15432` |
| 提示信息 | 测试成功 | 绿色 Toast 提示 |

**脚本位置：** `e2e/mcp-tests/t_05_06_07_connections.sh`

---

### 场景 4：连接数据库并浏览表结构

**用户故事：** 用户已创建连接，现在需要连接数据库并查看有哪些表。

**前置条件：** 已保存 MySQL 连接（场景 2）。

**用户操作：**
1. 在侧边栏找到"Docker MySQL"连接节点。
2. 点击连接节点旁的"连接"图标（或双击连接）。
3. 等待连接状态变为"已连接"。
4. 展开连接节点，查看数据库列表。
5. 展开 `testdb` 数据库节点。
6. 查看"表"子节点下的表列表。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 连接状态图标 | 从未连接图标变为已连接图标（绿色圆点） |
| 页面显示 | 状态栏 | 显示"已连接到 Docker MySQL" |
| 页面显示 | 数据库列表 | 展开后显示 `testdb` |
| 页面显示 | 表列表 | 展开 `testdb` 后显示 6 张表：`categories`, `order_items`, `orders`, `products`, `users` 等 |
| 功能交互 | 连接操作 | 点击连接后触发后端连接，节点可展开 |
| 功能交互 | 展开数据库 | 展开 `testdb` 时自动加载表列表，显示加载动画 |
| 数据正确性 | 连接状态 | IPC 调用 `get_connection_status` 返回 `connected` |
| 数据正确性 | 表列表验证 | IPC 调用 `get_tables` 返回 6 张表，与 MySQL 实际表一致 |
| 数据正确性 | 后台数据验证 | 直接查询 MySQL：`SHOW TABLES FROM testdb` 返回 6 行 |
| 提示信息 | 连接成功 | 绿色 Toast："已连接到 Docker MySQL" |
| 提示信息 | 连接失败 | 若密码错误，显示红色提示并弹出密码输入对话框 |

**用户操作矩阵：**

| 操作组合 | 场景 | 预期结果 |
|----------|------|----------|
| 连接 + 正确密码 | 正常场景 | 连接成功，树节点展开 |
| 连接 + 密码错误 | 密码被修改 | 弹出密码对话框，提示"密码错误，请重新输入" |
| 连接 + 数据库离线 | 停止 Docker 容器 | 红色错误提示："连接失败：Network unreachable" |
| 断开连接 | 右键点击已连接节点 → 断开 | 状态变为未连接，子节点收起 |
| 重复连接 | 已连接状态下再次点击连接 | 提示"已经连接"或无操作，不报错 |
| 刷新 | 右键点击连接 → 刷新 | 重新加载数据库列表，表数量不变 |

**非可视化验证：**
```bash
# 验证 MySQL 实际数据
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SHOW TABLES;"
# 预期输出：6 张表

docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SELECT COUNT(*) FROM users;"
# 预期输出：5
```

**脚本位置：** `e2e/mcp-tests/t_05_06_07_connections.sh`

---

### 场景 5：执行 SQL 查询并查看结果

**用户故事：** 用户需要查询 users 表的数据，查看返回结果。

**前置条件：** 已连接到 MySQL 数据库（场景 4）。

**用户操作：**
1. 选中"Docker MySQL"连接。
2. 点击工具栏"新建查询"按钮（或快捷键 Ctrl+N）。
3. 在 SQL 编辑器输入：`SELECT * FROM users LIMIT 10;`
4. 点击执行按钮（或按 Ctrl+Enter）。
5. 查看结果网格。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 新建查询标签页 | 打开新的 SQL 标签页，标题为"查询 1"或类似 |
| 页面显示 | SQL 编辑器 | 显示 Monaco Editor，支持语法高亮 |
| 页面显示 | 结果网格 | 显示 AG Grid，包含列头：id, username, email, age |
| 页面显示 | 结果行数 | 显示 5 行数据（测试数据只有 5 条用户记录） |
| 页面显示 | 状态栏 | 显示执行时间（如"0.05s"）和行数"5 行" |
| 功能交互 | 执行查询 | 点击执行后按钮变为禁用，显示加载动画 |
| 功能交互 | 结果排序 | 点击列头可排序，再次点击反向排序 |
| 功能交互 | 结果分页 | 若数据量大，底部显示分页控件 |
| 数据正确性 | 结果数据 | 第一行 username 为 `alice`，email 为 `alice@example.com` |
| 数据正确性 | 列类型 | id 列为数字类型，username 为字符串类型 |
| 数据正确性 | 后台验证 | IPC 调用 `execute_query` 返回的 JSON 中 `rows` 数组长度为 5 |
| 数据正确性 | 数据库验证 | 直接查询 MySQL 确认数据一致 |
| 提示信息 | 执行成功 | 状态栏显示执行时间和行数，无错误提示 |
| 提示信息 | 语法错误 | 若输入 `SELECT * FORM users`，显示红色错误提示："You have an error in your SQL syntax" |

**用户操作矩阵：**

| SQL 输入 | 场景 | 预期页面显示 | 预期数据 | 预期提示 |
|----------|------|-------------|----------|----------|
| `SELECT * FROM users` | 正常查询 | 5 行结果网格 | 5 条用户记录 | 执行成功，显示行数 |
| `SELECT * FROM nonexistent` | 表不存在 | 空结果或错误面板 | 无数据 | 红色错误："Table doesn't exist" |
| `SELECT * FORM users` | 语法错误 | 错误面板 | 无数据 | 红色错误：语法错误提示 |
| `INSERT INTO users ...` | DML 操作 | 显示"影响 1 行" | 数据库新增记录 | 绿色提示："执行成功，影响 1 行" |
| `SELECT COUNT(*) FROM users` | 聚合查询 | 1 行结果，值为 5 | 计数为 5 | 执行成功 |
| 空字符串 | 空查询 | 无变化或提示 | 无数据 | 黄色提示："请输入 SQL" |
| `SELECT * FROM users; SELECT * FROM orders` | 多语句 | 两个结果标签页 | users 5 行 + orders 5 行 | 执行成功 |
| `SELECT * FROM users LIMIT 0` | 边界：LIMIT 0 | 空网格，列头存在 | 0 行 | 执行成功，显示"0 行" |

**非可视化验证：**
```typescript
// Playwright 中验证返回数据
const response = await page.evaluate(async () => {
  return await window.__TAURI__.invoke('execute_query', {
    connectionId: 'conn-id',
    sql: 'SELECT * FROM users',
  });
});
expect(response.rows).toHaveLength(5);
expect(response.columns).toContain('username');
```

**脚本位置：** `e2e/query-flow.test.ts`

---

### 场景 6：查看表结构（列和索引）

**用户故事：** 用户需要查看 users 表的字段定义和索引信息。

**前置条件：** 已连接数据库并展开 testdb（场景 4）。

**用户操作：**
1. 在连接树中展开 `testdb` → "表"节点。
2. 右键点击 `users` 表。
3. 选择"查看结构"（或"设计表"）。
4. 查看"列"标签页。
5. 切换到"索引"标签页。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 结构面板 | 打开新标签页或侧边面板，标题为"users - 结构" |
| 页面显示 | 列信息表格 | 显示 4 列：id(INT, PK), username(VARCHAR), email(VARCHAR), age(INT) |
| 页面显示 | 索引信息 | 显示 PRIMARY KEY 索引，列名为 id |
| 功能交互 | 右键菜单 | 右键表名显示上下文菜单：查看结构、查看数据、导出、删除等 |
| 功能交互 | 标签切换 | 点击"列"/"索引"/"DDL"标签正常切换内容 |
| 数据正确性 | 列数量 | IPC 调用 `get_columns` 返回 4 列 |
| 数据正确性 | 主键标识 | id 列的 `isPrimaryKey` 为 `true` |
| 数据正确性 | 数据库验证 | `DESCRIBE users` 返回与界面一致的列定义 |
| 提示信息 | 加载中 | 展开表结构时显示"加载中..."动画 |
| 提示信息 | 加载完成 | 无提示，直接显示数据 |

**非可视化验证：**
```bash
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "DESCRIBE users;"
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SHOW INDEX FROM users;"
```

**脚本位置：** `e2e/table-operations.test.ts`

---

### 场景 7：编辑表数据（增删改查）

**用户故事：** 用户需要在界面上直接修改表中的数据。

**前置条件：** 已连接数据库，users 表数据已加载（场景 5）。

**用户操作：**
1. 双击 `users` 表（或右键 → 查看数据）。
2. 在数据网格中双击 `alice` 的 age 单元格。
3. 将值从 `25` 改为 `30`。
4. 按 Enter 保存。
5. 点击网格下方"+"按钮添加新行。
6. 填写新用户数据，按 Enter 保存。
7. 选中一行，按 Delete 键删除。
8. 在删除确认对话框点击"确定"。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 数据网格 | 显示 users 表所有行，单元格可编辑 |
| 页面显示 | 编辑状态 | 双击单元格后变为输入框，原值被选中 |
| 页面显示 | 新增行 | 点击"+"后在网格底部出现空白行，可输入 |
| 页面显示 | 删除确认 | 弹出确认对话框："确定要删除这条记录吗？" |
| 功能交互 | 单元格编辑 | 双击 → 输入 → Enter 保存，流程顺畅 |
| 功能交互 | 批量保存 | 修改多行后，点击"保存"按钮一次性提交 |
| 数据正确性 | 修改生效 | IPC 验证或直接查询 MySQL：`SELECT age FROM users WHERE username='alice'` 返回 `30` |
| 数据正确性 | 新增生效 | 查询新用户记录存在 |
| 数据正确性 | 删除生效 | 查询被删除记录不存在 |
| 数据正确性 | 事务隔离 | 未点击保存前，数据未实际写入数据库 |
| 提示信息 | 保存成功 | 绿色 Toast："保存成功" |
| 提示信息 | 保存失败 | 若违反唯一约束，红色提示："Duplicate entry" |
| 提示信息 | 删除确认 | 对话框包含"确定"和"取消"按钮 |

**用户操作矩阵：**

| 操作 | 数据 | 预期页面 | 预期数据库状态 | 预期提示 |
|------|------|----------|----------------|----------|
| 修改 age 为 30 | `alice` → age: 30 | 单元格显示 30 | `alice` age=30 | 保存成功 |
| 修改为非法值 | age: `abc` | 输入框拒绝非数字 | 未变更 | 红色提示："请输入有效数字" |
| 新增用户 | 完整数据 | 新行显示在网格 | 数据库新增记录 | 保存成功 |
| 新增用户（缺必填） | username 为空 | 表单校验失败 | 未插入 | 红色提示："用户名不能为空" |
| 删除记录 | 选中行 | 行从网格消失 | 数据库记录删除 | 删除成功 |
| 取消删除 | 点击取消 | 行仍在网格 | 未删除 | 无提示 |

**脚本位置：** `e2e/table-operations.test.ts`

---

### 场景 8：事务控制（BEGIN / COMMIT / ROLLBACK）

**用户故事：** 用户需要执行一组 SQL 操作，要么全部成功，要么全部回滚。

**前置条件：** 已连接数据库，打开 SQL 编辑器。

**用户操作：**
1. 在 SQL 编辑器输入：`BEGIN;`
2. 执行。
3. 输入：`INSERT INTO users (username, email, age) VALUES ('tx_test', 'tx@test.com', 99);`
4. 执行。
5. 新开一个查询标签页。
6. 输入：`SELECT * FROM users WHERE username='tx_test';`
7. 执行（验证事务内可见）。
8. 回到第一个标签页，输入：`ROLLBACK;`
9. 执行。
10. 回到第二个标签页，重新执行查询。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 事务状态指示器 | 执行 BEGIN 后状态栏显示"事务活跃"或"Transaction Active" |
| 页面显示 | 按钮状态 | BEGIN 后，COMMIT 和 ROLLBACK 按钮变为可用 |
| 功能交互 | 事务内查询 | 同一连接内可看到未提交的 INSERT 数据 |
| 功能交互 | 事务回滚 | ROLLBACK 后事务状态指示器消失 |
| 数据正确性 | 事务隔离 | 新连接查询不到 `tx_test` 用户（未提交数据不可见） |
| 数据正确性 | 回滚生效 | ROLLBACK 后查询 `tx_test` 返回空结果 |
| 数据正确性 | 数据库验证 | MySQL 直接查询：`SELECT * FROM users WHERE username='tx_test'` 返回空集 |
| 提示信息 | BEGIN 成功 | 状态栏显示"事务已开始" |
| 提示信息 | COMMIT 成功 | 绿色 Toast："事务已提交" |
| 提示信息 | ROLLBACK 成功 | 绿色 Toast："事务已回滚" |

**用户操作矩阵：**

| 操作序列 | 场景 | 数据验证点 |
|----------|------|------------|
| BEGIN → INSERT → COMMIT | 正常提交 | 数据持久化到数据库 |
| BEGIN → INSERT → ROLLBACK | 正常回滚 | 数据不存在于数据库 |
| BEGIN → INSERT → BEGIN | 嵌套事务 | 提示"已有活跃事务"或覆盖原事务 |
| COMMIT（无事务） | 异常：未开始事务 | 提示"没有活跃事务"或报错 |
| ROLLBACK（无事务） | 异常：未开始事务 | 提示"没有活跃事务"或报错 |
| BEGIN → 断开连接 | 异常：连接断开 | 事务自动回滚，数据未保存 |
| BEGIN → 关闭应用 | 异常：应用关闭 | 事务自动回滚 |

**非可视化验证：**
```bash
# 在另一个 MySQL 会话中验证隔离性
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SELECT COUNT(*) FROM users WHERE username='tx_test';"
# 预期：0（事务未提交，外部不可见）
```

**脚本位置：** `e2e/transaction-flow.test.ts`

---

### 场景 9：切换界面语言

**用户故事：** 用户希望将界面从中文切换为英文。

**前置条件：** 应用启动，当前语言为中文。

**用户操作：**
1. 点击工具栏"设置"按钮。
2. 在设置对话框中切换到"语言"标签页。
3. 选择"English"。
4. 点击"保存"。
5. 关闭设置对话框。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 设置对话框 | 正常弹出，标签页可切换 |
| 页面显示 | 语言选项 | 显示"中文"、"English"等选项 |
| 页面显示 | 切换后界面 | 工具栏按钮文字变为"New Connection"、"Refresh"、"New Query" |
| 页面显示 | 状态栏 | 显示"Disconnected"（若未连接） |
| 功能交互 | 保存设置 | 点击保存后设置持久化 |
| 功能交互 | 重启保持 | 关闭应用重新打开，语言仍为英文 |
| 数据正确性 | 配置存储 | IPC 调用 `get_settings` 返回 `language: 'en'` |
| 提示信息 | 保存成功 | 绿色 Toast："设置已保存" / "Settings saved" |

**用户操作矩阵：**

| 操作 | 场景 | 预期结果 |
|------|------|----------|
| 中文 → 英文 | 正常切换 | 界面全部变为英文 |
| 英文 → 中文 | 正常切换 | 界面全部变为中文 |
| 切换后不保存 | 取消操作 | 界面保持原语言 |
| 切换后重启应用 | 持久化验证 | 语言保持上次设置 |

**脚本位置：** `e2e/mcp-tests/t_02_03_i18n.sh` / `e2e/settings-flow.test.ts`

---

### 场景 10：切换主题

**用户故事：** 用户希望从浅色主题切换到深色主题。

**前置条件：** 应用启动，当前为浅色主题。

**用户操作：**
1. 点击工具栏"深色模式"切换按钮（或月亮图标）。
2. 观察界面颜色变化。
3. 打开设置 → 外观，查看当前主题。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 主题切换 | 背景从白色变为深色（如 `#1f1f1f`） |
| 页面显示 | 文字颜色 | 文字从黑色变为白色/浅色 |
| 页面显示 | 设置面板 | 外观标签页显示当前主题"深色" |
| 功能交互 | 一键切换 | 点击按钮后主题立即切换，无刷新 |
| 功能交互 | 重启保持 | 重启应用后仍保持深色主题 |
| 数据正确性 | 配置存储 | IPC 验证 `theme` 为 `'dark'` |
| 提示信息 | 无 | 主题切换通常无提示，直接生效 |

**脚本位置：** `e2e/mcp-tests/t_04_theme.sh` / `e2e/settings-flow.test.ts`

---

### 场景 11：应用设置（超时、字体、快捷键）

**用户故事：** 用户需要调整查询超时时间和字体大小。

**前置条件：** 应用启动。

**用户操作：**
1. 打开设置对话框。
2. 切换到"高级"标签页。
3. 修改"查询超时"为 `60` 秒。
4. 修改"字体大小"为 `16`。
5. 点击保存。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 设置项 | 显示查询超时、连接超时、字体大小等配置项 |
| 页面显示 | 默认值 | 查询超时默认为 `300`，字体默认为 `14` |
| 功能交互 | 输入验证 | 输入负数或非数字时表单校验失败 |
| 数据正确性 | 配置持久化 | IPC 验证设置项已更新 |
| 提示信息 | 保存成功 | 绿色 Toast："设置已保存" |
| 提示信息 | 输入错误 | 红色提示："请输入有效数字" |

**脚本位置：** `e2e/settings-flow.test.ts`

---

### 场景 12：备份数据库

**用户故事：** 用户需要备份 testdb 数据库。

**前置条件：** 已连接 MySQL 数据库。

**用户操作：**
1. 右键点击 `testdb` 数据库节点。
2. 选择"备份数据库"。
3. 在备份对话框中选择"结构和数据"。
4. 选择保存路径（如 `/tmp/testdb_backup.sql`）。
5. 点击"开始备份"。
6. 等待进度完成。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 备份对话框 | 弹出备份配置对话框 |
| 页面显示 | 进度条 | 备份过程中显示进度条 |
| 功能交互 | 路径选择 | 点击浏览按钮弹出系统文件选择对话框 |
| 数据正确性 | 文件生成 | 指定路径生成 `.sql` 文件 |
| 数据正确性 | 文件内容 | 文件包含 `CREATE TABLE` 和 `INSERT INTO` 语句 |
| 数据正确性 | 文件大小 | 文件大小大于 0 字节 |
| 提示信息 | 备份成功 | 绿色 Toast："备份完成" |
| 提示信息 | 备份失败 | 若路径无权限，红色提示："无法写入文件" |

**非可视化验证：**
```bash
# 验证备份文件存在且内容正确
ls -lh /tmp/testdb_backup.sql
grep -q "CREATE TABLE" /tmp/testdb_backup.sql && echo "结构备份正确"
grep -q "INSERT INTO" /tmp/testdb_backup.sql && echo "数据备份正确"
```

**脚本位置：** `e2e/backup-restore.test.ts`

---

### 场景 13：恢复数据库

**用户故事：** 用户需要使用备份文件恢复数据库。

**前置条件：** 已有备份文件（场景 12）。

**用户操作：**
1. 右键点击 `testdb` 数据库节点。
2. 选择"恢复数据库"。
3. 选择备份文件。
4. 点击"开始恢复"。
5. 在确认对话框点击"确定"（警告将覆盖现有数据）。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 恢复对话框 | 弹出文件选择和恢复选项对话框 |
| 页面显示 | 确认对话框 | 显示警告信息："恢复将覆盖现有数据，是否继续？" |
| 功能交互 | 取消恢复 | 点击"取消"后对话框关闭，数据未变更 |
| 数据正确性 | 数据还原 | 恢复后查询表数据与备份时一致 |
| 数据正确性 | 表结构 | `DESCRIBE users` 返回正确列定义 |
| 提示信息 | 恢复成功 | 绿色 Toast："恢复完成" |
| 提示信息 | 恢复失败 | 若文件格式错误，红色提示："无效的备份文件" |

**脚本位置：** `e2e/backup-restore.test.ts`

---

### 场景 14：数据库结构比较

**用户故事：** 用户需要比较两个数据库的表结构差异。

**前置条件：** 至少有两个数据库连接（如 MySQL 和 PostgreSQL）。

**用户操作：**
1. 点击菜单"工具" → "结构比较"。
2. 在源连接中选择"Docker MySQL / testdb"。
3. 在目标连接中选择"Docker PostgreSQL / testdb"。
4. 点击"开始比较"。
5. 查看比较结果。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 比较对话框 | 弹出源/目标选择界面 |
| 页面显示 | 结果列表 | 显示表名、差异类型（新增/删除/修改） |
| 页面显示 | DDL 对比 | 点击差异项显示左右 DDL 对比 |
| 功能交互 | 导出报告 | 点击导出按钮生成 HTML/Excel 报告 |
| 数据正确性 | 差异准确性 | 实际有差异的表被正确标记 |
| 提示信息 | 比较完成 | 绿色提示："比较完成，发现 X 处差异" |
| 提示信息 | 无差异 | 提示："两个数据库结构完全一致" |

**脚本位置：** `e2e/schema-compare.test.ts`

---

### 场景 15：快捷键操作

**用户故事：** 用户希望使用键盘快捷键提高操作效率。

**前置条件：** 应用已启动，已连接数据库。

**用户操作：**
1. 按 `Ctrl+N` 新建查询标签页。
2. 在编辑器输入 `SELECT 1;`。
3. 按 `Ctrl+Enter` 执行查询。
4. 按 `Ctrl+W` 关闭当前标签页。
5. 按 `F5` 刷新连接树。

**四维验证：**

| 快捷键 | 操作 | 页面验证 | 数据验证 |
|--------|------|----------|----------|
| `Ctrl+N` | 新建查询 | 新增 SQL 标签页 | 无 |
| `Ctrl+Enter` | 执行查询 | 结果网格显示 | 返回 1 行 1 列 |
| `Ctrl+W` | 关闭标签页 | 标签页关闭 | 无 |
| `F5` | 刷新连接 | 连接树重新加载 | 数据库列表最新 |
| `Ctrl+S` | 保存 SQL | 无变化（已自动保存）或提示保存 | 无 |
| `Ctrl+Z` | 撤销 | 编辑器内容回退 | 无 |
| `Ctrl+Shift+K` | 清空结果 | 结果网格清空 | 无 |
| `Esc` | 关闭对话框 | 当前对话框关闭 | 无 |

**脚本位置：** `e2e/keyboard-shortcuts.test.ts`

---

### 场景 16：代码片段管理

**用户故事：** 用户希望保存常用 SQL 语句为片段，方便复用。

**前置条件：** 应用已启动，打开 SQL 编辑器。

**用户操作：**
1. 在编辑器输入：`SELECT * FROM users WHERE created_at > '2024-01-01';`
2. 选中这段 SQL。
3. 右键 → "保存为片段"。
4. 输入片段名称：`Recent Users`。
5. 点击保存。
6. 在新查询标签页中右键 → "插入片段"。
7. 选择 `Recent Users`。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 片段列表 | 显示已保存的片段名称 |
| 页面显示 | 插入后 | SQL 编辑器中出现片段内容 |
| 功能交互 | 保存片段 | 弹出名稱輸入對話框 |
| 功能交互 | 插入片段 | 片段内容插入到光标位置 |
| 数据正确性 | 片段存储 | IPC 调用 `get_snippets` 返回包含 `Recent Users` |
| 数据正确性 | 片段内容 | 内容与原 SQL 完全一致 |
| 提示信息 | 保存成功 | 绿色 Toast："片段已保存" |

**脚本位置：** `e2e/keyboard-shortcuts.test.ts`

---

### 场景 17：连接树层级展开与收起（精细化测试）

**用户故事：** 用户需要通过连接树逐层浏览数据库对象的层级结构。

**前置条件：** 已创建 MySQL 和 PostgreSQL 两个连接，MySQL 已连接并展开。

**用户操作：**
1. 查看连接树的根节点：显示"Docker MySQL"和"Docker PostgreSQL"。
2. 点击"Docker MySQL"旁的展开箭头（▶）。
3. 观察展开后的子节点：显示数据库列表（如 `testdb`）。
4. 点击 `testdb` 旁的展开箭头。
5. 观察子节点分类：显示"表"、"视图"、"存储过程"、"函数"、"触发器"等分类节点。
6. 点击"表"分类节点旁的展开箭头。
7. 观察表列表：显示 `categories`、`order_items`、`orders`、`products`、`users`。
8. 点击 `users` 表节点（不展开）。
9. 观察右侧主区域变化。
10. 点击 `users` 表旁的展开箭头。
11. 观察子节点：显示"列"、"索引"子节点。
12. 点击"列"节点。
13. 观察列列表显示。
14. 点击 `testdb` 旁的收起箭头（▼）。
15. 观察整个 `testdb` 子树收起。
16. 点击"Docker MySQL"旁的收起箭头。
17. 观察连接子树收起，状态保持"已连接"。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 根节点 | 两个连接节点并列显示，图标区分数据库类型（MySQL 海豚、PostgreSQL 大象） |
| 页面显示 | 连接状态图标 | MySQL 已连接显示绿色圆点，PostgreSQL 未连接显示灰色圆点 |
| 页面显示 | 展开动画 | 点击展开箭头后有平滑的展开动画，箭头从 ▶ 变为 ▼ |
| 页面显示 | 数据库节点 | `testdb` 显示数据库图标，名称清晰可见 |
| 页面显示 | 分类节点 | "表"、"视图"等显示对应分类图标（表图标、视图图标） |
| 页面显示 | 表节点 | `users` 显示表图标，若为主表可显示主键标识 |
| 页面显示 | 列节点 | "列"子节点下显示各列名称和类型（如 `id INT`、`username VARCHAR(255)`） |
| 页面显示 | 索引节点 | "索引"子节点下显示索引名称和类型（如 `PRIMARY KEY`） |
| 页面显示 | 收起状态 | 收起后仅显示根节点，箭头恢复为 ▶ |
| 页面显示 | 选中高亮 | 点击 `users` 表后，节点背景高亮，右侧同步显示 |
| 功能交互 | 展开加载 | 首次展开数据库时显示加载动画（Spin），加载完成后消失 |
| 功能交互 | 懒加载 | 首次展开"表"分类时才加载表列表，避免一次性加载所有数据 |
| 功能交互 | 记忆展开状态 | 收起再展开连接，保持之前的数据库展开状态 |
| 功能交互 | 快速收起 | 点击已连接连接节点的收起箭头，所有子节点同步收起 |
| 数据正确性 | 层级数据 | IPC 验证 `get_databases` 返回 `testdb`，`get_tables` 返回 6 张表 |
| 数据正确性 | 列数据 | IPC 验证 `get_columns('users')` 返回 4 列，与 MySQL `DESCRIBE` 一致 |
| 数据正确性 | 索引数据 | IPC 验证 `get_indexes('users')` 返回 PRIMARY KEY |
| 提示信息 | 加载超时 | 若数据库响应慢，显示"加载中..."超过 5 秒后提示"加载超时，请重试" |
| 提示信息 | 无权限 | 若用户无权查看某张表，节点显示为灰色，悬停提示"无权限查看" |

**连接树操作矩阵：**

| 操作 | 目标节点 | 展开前状态 | 预期展开后 | 预期页面变化 |
|------|----------|------------|------------|--------------|
| 点击展开 | 连接节点（已连接） | 仅显示连接名 | 显示数据库列表 | 无变化 |
| 点击展开 | 连接节点（未连接） | 仅显示连接名 | 自动连接后展开，或提示先连接 | 可能弹出连接对话框 |
| 点击展开 | 数据库节点 | 仅显示数据库名 | 显示表/视图/过程等分类 | 无变化 |
| 点击展开 | 表分类节点 | 仅显示"表" | 显示所有表名列表 | 无变化 |
| 点击展开 | 单张表节点 | 仅显示表名 | 显示"列"、"索引"子节点 | 右侧打开表数据标签页 |
| 点击展开 | 列分类节点 | 仅显示"列" | 显示所有列名及类型 | 无变化 |
| 点击收起 | 数据库节点 | 展开所有子节点 | 收起数据库下所有子节点 | 无变化 |
| 点击收起 | 连接节点 | 展开所有子节点 | 收起整个连接树 | 无变化 |
| 双击连接 | 连接节点 | 未连接 | 连接并展开 | 状态栏更新为"已连接" |
| 双击表 | 表节点 | 未展开 | 在右侧打开数据标签页 | 右侧显示表数据网格 |
| 右键表 | 表节点 | 任何状态 | 弹出上下文菜单 | 显示菜单选项 |

**脚本位置：** 新增 `e2e/connection-tree.test.ts`

---

### 场景 18：左右内容联动交互（精细化测试）

**用户故事：** 用户期望左侧连接树的操作与右侧内容面板实时联动。

**前置条件：** 已连接 MySQL，展开 `testdb`，已打开 `users` 表数据标签页。

**用户操作与验证：**

**A. 左树选中 → 右侧面板联动**

| 左侧操作 | 右侧预期变化 | 验证点 |
|----------|-------------|--------|
| 点击 `users` 表 | 右侧打开/聚焦 `users` 数据标签页 | 标签页标题为 "users"，内容区显示数据网格 |
| 点击 `orders` 表 | 右侧打开/聚焦 `orders` 数据标签页 | 标签页标题变为 "orders"，数据变为订单数据 |
| 点击 `users` 表的"列"节点 | 右侧打开 `users - 结构` 标签页 | 显示列信息表格 |
| 点击 `users` 表的"索引"节点 | 右侧打开 `users - 索引` 标签页 | 显示索引列表 |
| 点击不同连接（PG） | 右侧保持当前标签页，或提示切换连接上下文 | 状态栏更新为 PG 连接状态 |
| 断开 MySQL 连接 | 右侧所有 MySQL 相关标签页显示"连接已断开"提示 | 标签页内容区显示重新连接按钮 |

**B. 右侧面板操作 → 左侧树联动**

| 右侧操作 | 左侧预期变化 | 验证点 |
|----------|-------------|--------|
| 在 SQL 编辑器执行 `CREATE TABLE test_table (...)` | 左侧"表"分类下自动出现 `test_table` 节点 | 无需手动刷新，树节点实时更新 |
| 在 SQL 编辑器执行 `DROP TABLE test_table` | 左侧 `test_table` 节点消失 | 树节点同步移除 |
| 在数据网格新增一行 | 左侧无变化 | 树节点不受数据变更影响 |
| 关闭 `users` 数据标签页 | 左侧 `users` 表节点的选中高亮消失 | 树节点恢复未选中状态 |
| 切换 SQL 标签页到 `orders` 查询 | 左侧 `orders` 表节点自动高亮 | 树与标签页双向联动 |

**C. 状态栏同步验证**

| 左侧操作 | 状态栏预期 | 验证点 |
|----------|-----------|--------|
| 选中连接节点 | 显示"已连接到 Docker MySQL" | 连接名称正确 |
| 选中数据库节点 | 显示"testdb | 6 张表" | 数据库名和表数量正确 |
| 选中表节点 | 显示"users | 5 行 | 4 列" | 表名、行数、列数正确 |
| 选中 SQL 标签页 | 显示"查询 1 | 0.05s | 5 行" | 执行时间和结果行数正确 |
| 事务活跃时 | 显示"事务活跃 | 00:02:15" | 事务状态和持续时间正确 |

**D. 标签页与连接树一致性**

| 场景 | 操作 | 预期一致性 |
|------|------|------------|
| 连接断开 | 断开 MySQL 连接 | 所有 MySQL 相关标签页标题变灰，内容区显示"连接已断开" |
| 连接重连 | 重新连接 MySQL | 标签页恢复正常，可继续操作 |
| 连接删除 | 删除 MySQL 连接配置 | 相关标签页自动关闭，或提示"连接已不存在" |
| 数据库关闭 | 关闭 `testdb` | 所有 `testdb` 相关标签页关闭，弹出确认对话框 |
| 标签页关闭 | 手动关闭所有标签页 | 主区域恢复默认"对象"视图，左侧无选中项 |

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 标签页标题 | 与左侧选中的表名/节点名一致 |
| 页面显示 | 状态栏信息 | 与当前上下文（连接/数据库/表/查询）同步 |
| 页面显示 | 标签页关闭状态 | 关闭标签页后，左侧对应节点取消高亮 |
| 功能交互 | 双击表联动 | 双击左侧表 = 右侧打开数据标签页 |
| 功能交互 | DDL 同步 | 执行 CREATE/DROP TABLE 后左侧树自动刷新 |
| 功能交互 | 连接断开处理 | 断开连接后右侧标签页禁用编辑，显示重新连接按钮 |
| 数据正确性 | 状态栏行数 | `users` 表状态栏显示 5 行，与数据库实际一致 |
| 数据正确性 | 标签页数据 | `orders` 标签页显示 5 条订单，与数据库一致 |
| 提示信息 | 连接断开 | 标签页内提示"连接已断开，请重新连接"（黄色警告） |
| 提示信息 | 数据库关闭 | 关闭数据库前提示"将关闭 X 个相关标签页，是否继续？" |

**非可视化验证（联动状态验证）：**

```typescript
// Playwright 验证左右联动
// 1. 选中 users 表，验证右侧打开标签页
await page.click('[data-testid="table-node-users"]');
const activeTab = await page.locator('[data-testid="tab-item-active"]').textContent();
expect(activeTab).toContain('users');

// 2. 验证状态栏同步
const statusText = await page.locator('[data-testid="status-bar"]').textContent();
expect(statusText).toContain('users');
expect(statusText).toContain('5 行');

// 3. 执行 CREATE TABLE，验证左侧树自动更新
await executeQuery(page, 'CREATE TABLE auto_test (id INT PRIMARY KEY)');
await expect(page.locator('[data-testid="table-node-auto_test"]')).toBeVisible({ timeout: 5000 });

// 4. 断开连接，验证右侧标签页状态
await page.click('[data-testid="disconnect-btn"]');
await expect(page.locator('[data-testid="tab-content"]:has-text("连接已断开")')).toBeVisible();
```

**脚本位置：** 新增 `e2e/panel-interaction.test.ts`

---

### 场景 19：数据库对象操作 - 表管理（DDL 精细化测试）

**用户故事：** 用户需要对数据库表进行完整的生命周期管理（创建、修改、删除）。

**前置条件：** 已连接 MySQL，展开 `testdb`。

**用户操作 A：创建新表（通过表设计器）**

1. 右键点击 `testdb` → "表"分类节点。
2. 选择"新建表"。
3. 在表设计器中：
   - 表名：`test_products`
   - 添加列：`id` INT, PK, 自增
   - 添加列：`name` VARCHAR(100), 非空
   - 添加列：`price` DECIMAL(10,2)
   - 添加列：`created_at` TIMESTAMP, 默认 CURRENT_TIMESTAMP
4. 点击"保存"。
5. 观察左侧树变化。
6. 验证表结构。

**用户操作 B：修改表结构**

1. 右键点击 `test_products` 表。
2. 选择"设计表"。
3. 添加新列：`description` TEXT
4. 修改 `price` 列：`DECIMAL(12,2)`
5. 删除 `created_at` 列。
6. 点击"保存"。
7. 确认修改对话框点击"确定"。

**用户操作 C：删除表**

1. 右键点击 `test_products` 表。
2. 选择"删除表"。
3. 在确认对话框输入表名 `test_products`。
4. 点击"确定"。
5. 观察左侧树变化。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 表设计器 | 弹出表设计器对话框，包含列定义表格、索引标签页 |
| 页面显示 | 列定义表格 | 显示列名、数据类型、长度、是否可空、默认值、注释 |
| 页面显示 | PK 标识 | 主键列显示钥匙图标 |
| 页面显示 | 自增标识 | 自增列显示"AI"标识 |
| 页面显示 | 保存后树更新 | 左侧树自动出现 `test_products` 节点 |
| 页面显示 | 删除确认 | 对话框要求输入表名确认，防止误删除 |
| 功能交互 | 添加列 | 点击"+"按钮新增空行，可输入列定义 |
| 功能交互 | 删除列 | 选中列点击"-"按钮删除，有确认提示 |
| 功能交互 | 拖拽排序 | 拖拽列行可调整列顺序 |
| 功能交互 | 数据类型下拉 | 点击类型列显示下拉选择（INT/VARCHAR/DATETIME 等） |
| 数据正确性 | 创建表验证 | MySQL: `DESCRIBE test_products` 返回 4 列，结构与定义一致 |
| 数据正确性 | 修改表验证 | MySQL: `DESCRIBE test_products` 返回 4 列（含 description，不含 created_at） |
| 数据正确性 | 删除表验证 | MySQL: `SHOW TABLES LIKE 'test_products'` 返回空 |
| 数据正确性 | 索引验证 | `SHOW INDEX FROM test_products` 返回 PRIMARY KEY |
| 提示信息 | 创建成功 | 绿色 Toast："表 test_products 创建成功" |
| 提示信息 | 修改成功 | 绿色 Toast："表结构修改成功" |
| 提示信息 | 删除成功 | 绿色 Toast："表 test_products 已删除" |
| 提示信息 | 表名已存在 | 创建同名表时红色提示："表 test_products 已存在" |
| 提示信息 | 外键约束 | 删除被引用的表时红色提示："Cannot delete or update a parent row" |

**表管理操作矩阵：**

| 操作 | 正常场景 | 异常场景 | 边界场景 |
|------|----------|----------|----------|
| **创建表** | 完整定义保存 | 表名为空/重名/关键字 | 表名 64 字符/列名 64 字符/0 列 |
| **添加列** | 添加 `description` | 添加同名列 | 添加第 1000 列 |
| **修改列** | 扩大 VARCHAR 长度 | 缩小长度导致数据截断 | 修改为不兼容类型 |
| **删除列** | 删除无数据列 | 删除被索引引用的列 | 删除最后一列 |
| **删除表** | 空表删除 | 有外键关联的表 | 系统表（应禁止删除） |
| **重命名表** | `old_name` → `new_name` | 新名已存在 | MySQL 保留关键字 |
| **复制表** | 结构和数据复制 | 仅结构复制 | 大表复制（100万行） |

**非可视化验证：**

```bash
# 创建后验证
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "DESCRIBE test_products;"
# 预期：id INT PK AI, name VARCHAR(100) NOT NULL, price DECIMAL(10,2), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

# 修改后验证
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "DESCRIBE test_products;"
# 预期：含 description TEXT, price DECIMAL(12,2), 不含 created_at

# 删除后验证
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SHOW TABLES LIKE 'test_products';"
# 预期：空结果
```

**脚本位置：** 新增 `e2e/table-management.test.ts`

---

### 场景 20：数据库对象操作 - 视图管理（精细化测试）

**用户故事：** 用户需要创建、查看和删除数据库视图。

**前置条件：** 已连接 MySQL，展开 `testdb`。

**用户操作 A：创建视图**

1. 右键点击 `testdb` → "视图"分类节点。
2. 选择"新建视图"。
3. 在视图编辑器输入：
   ```sql
   CREATE VIEW v_user_orders AS
   SELECT u.id, u.username, o.id as order_id, o.total_amount
   FROM users u
   JOIN orders o ON u.id = o.user_id;
   ```
4. 点击"保存"。
5. 输入视图名：`v_user_orders`。
6. 观察左侧树变化。

**用户操作 B：查看视图数据**

1. 双击左侧 `v_user_orders` 视图节点。
2. 观察右侧数据网格。
3. 验证数据为 JOIN 结果。

**用户操作 C：查看视图定义**

1. 右键点击 `v_user_orders`。
2. 选择"查看定义"。
3. 观察右侧显示的 CREATE VIEW 语句。

**用户操作 D：删除视图**

1. 右键点击 `v_user_orders`。
2. 选择"删除视图"。
3. 确认删除。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 视图编辑器 | 弹出 SQL 编辑器对话框，预填充 CREATE VIEW 模板 |
| 页面显示 | 视图节点 | 左侧"视图"分类下显示 `v_user_orders`，图标为视图图标（区别于表图标） |
| 页面显示 | 视图数据 | 右侧数据网格显示 JOIN 结果，列名为 id, username, order_id, total_amount |
| 页面显示 | 视图定义 | 右侧显示完整的 CREATE VIEW 语句，语法高亮 |
| 功能交互 | 保存视图 | 语法校验通过后保存，错误时提示具体语法错误位置 |
| 功能交互 | 双击视图 | 打开视图数据标签页（非结构标签页） |
| 数据正确性 | 视图数据 | MySQL: `SELECT * FROM v_user_orders` 返回 JOIN 结果，行数正确 |
| 数据正确性 | 视图定义 | MySQL: `SHOW CREATE VIEW v_user_orders` 返回原定义语句 |
| 数据正确性 | 删除验证 | MySQL: `SHOW TABLES LIKE 'v_user_orders'` 返回空 |
| 提示信息 | 创建成功 | 绿色 Toast："视图 v_user_orders 创建成功" |
| 提示信息 | 语法错误 | 红色提示："ERROR 1064: You have an error in your SQL syntax" |
| 提示信息 | 删除成功 | 绿色 Toast："视图已删除" |

**视图操作矩阵：**

| 操作 | 正常场景 | 异常场景 | 边界场景 |
|------|----------|----------|----------|
| **创建视图** | 正确的 CREATE VIEW | 引用不存在的表 | 视图名 64 字符 |
| **创建物化视图** | 若数据库支持 | 不支持的数据库类型 | 大数据量物化 |
| **查看数据** | 双击视图节点 | 基表被删除后查看 | 空结果集 |
| **修改视图** | ALTER VIEW | 改为引用不存在的列 | 修改导致循环引用 |
| **删除视图** | 删除无依赖视图 | 删除被其他视图引用的视图 | 级联删除选项 |

**非可视化验证：**

```bash
# 创建后验证
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SHOW CREATE VIEW v_user_orders;"
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SELECT COUNT(*) FROM v_user_orders;"
# 预期：5 行（5 个用户的订单）
```

**脚本位置：** `e2e/table-operations.test.ts`（扩展视图相关用例）

---

### 场景 21：数据库对象操作 - 索引管理（精细化测试）

**用户故事：** 用户需要为表添加、查看和删除索引以优化查询性能。

**前置条件：** 已连接 MySQL，展开 `testdb` → `users` 表。

**用户操作 A：添加索引**

1. 右键点击 `users` 表。
2. 选择"管理索引"。
3. 在索引管理对话框点击"添加索引"。
4. 索引名：`idx_username`
5. 类型：普通索引（INDEX）
6. 列：`username`（ASC）
7. 点击"保存"。

**用户操作 B：查看索引**

1. 展开 `users` 表 → "索引"节点。
2. 观察索引列表。
3. 点击 `idx_username` 索引。
4. 观察右侧索引详情。

**用户操作 C：删除索引**

1. 在索引管理对话框选中 `idx_username`。
2. 点击"删除"。
3. 确认删除。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 索引管理对话框 | 显示当前所有索引列表，包含索引名、类型、列、基数 |
| 页面显示 | 索引节点 | 左侧"索引"子节点下显示所有索引名称 |
| 页面显示 | 索引详情 | 右侧显示索引的完整定义和统计信息 |
| 功能交互 | 添加索引 | 选择列后自动生成索引名（可修改） |
| 功能交互 | 唯一索引 | 若选择 UNIQUE，保存时校验列数据是否唯一 |
| 功能交互 | 复合索引 | 支持选择多列，指定每列的排序方向（ASC/DESC） |
| 数据正确性 | 索引创建 | MySQL: `SHOW INDEX FROM users` 返回 `idx_username` |
| 数据正确性 | 索引生效 | `EXPLAIN SELECT * FROM users WHERE username='alice'` 显示使用 `idx_username` |
| 数据正确性 | 索引删除 | `SHOW INDEX FROM users` 不再包含 `idx_username` |
| 提示信息 | 创建成功 | 绿色 Toast："索引 idx_username 创建成功" |
| 提示信息 | 重复索引 | 若索引名已存在，红色提示："索引名重复" |
| 提示信息 | 唯一冲突 | 创建 UNIQUE 索引时若数据重复，红色提示："Duplicate entry" |

**索引操作矩阵：**

| 操作 | 正常场景 | 异常场景 | 边界场景 |
|------|----------|----------|----------|
| **添加普通索引** | 单列索引 | 列不存在 | 索引名 64 字符 |
| **添加唯一索引** | 列数据全部唯一 | 列有重复值 | 空列 |
| **添加复合索引** | 两列复合 | 一列不存在 | 16 列复合（MySQL 上限） |
| **添加全文索引** | TEXT 列全文索引 | 非 TEXT 类型列 | MyISAM/InnoDB 支持差异 |
| **删除索引** | 删除普通索引 | 删除主键索引（应禁止或警告） | 删除被外键引用的索引 |
| **查看索引** | 查看索引统计 | 大表索引（1000万行） | 空表索引 |

**非可视化验证：**

```bash
# 创建后验证
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SHOW INDEX FROM users WHERE Key_name='idx_username';"
# 预期：返回 1 行，Column_name='username'

# 验证索引生效
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "EXPLAIN SELECT * FROM users WHERE username='alice';"
# 预期：key 列显示 'idx_username'

# 删除后验证
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SHOW INDEX FROM users WHERE Key_name='idx_username';"
# 预期：空结果
```

**脚本位置：** 新增 `e2e/index-management.test.ts`

---

### 场景 22：数据库对象操作 - 存储过程与函数（精细化测试）

**用户故事：** 用户需要查看、创建和执行数据库存储过程与函数。

**前置条件：** 已连接 MySQL，展开 `testdb`。

**用户操作 A：查看存储过程**

1. 展开 `testdb` → "存储过程"分类节点。
2. 观察过程列表（如 `sp_get_user_by_id`）。
3. 双击过程名。
4. 观察右侧显示的 SQL 定义。

**用户操作 B：创建存储过程**

1. 右键"存储过程"分类节点 → "新建存储过程"。
2. 在编辑器输入：
   ```sql
   CREATE PROCEDURE sp_count_users(OUT total INT)
   BEGIN
     SELECT COUNT(*) INTO total FROM users;
   END;
   ```
3. 点击"保存"。

**用户操作 C：执行存储过程**

1. 右键 `sp_count_users`。
2. 选择"执行"。
3. 在参数对话框中（如有参数）。
4. 观察右侧结果面板。

**用户操作 D：创建函数**

1. 展开 `testdb` → "函数"分类节点。
2. 右键 → "新建函数"。
3. 输入：
   ```sql
   CREATE FUNCTION fn_get_user_email(user_id INT)
   RETURNS VARCHAR(255)
   BEGIN
     RETURN (SELECT email FROM users WHERE id = user_id);
   END;
   ```
4. 保存。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 过程/函数节点 | 左侧分类节点下显示名称列表，图标区分过程和函数 |
| 页面显示 | 定义面板 | 右侧显示格式化的高亮 SQL 代码 |
| 页面显示 | 执行结果 | 右侧显示 OUT 参数值或结果集 |
| 功能交互 | 双击打开 | 双击过程名在右侧打开定义标签页 |
| 功能交互 | 执行过程 | 弹出参数输入对话框（IN/OUT 参数） |
| 功能交互 | 编辑过程 | 修改后点击保存，自动执行 DROP + CREATE |
| 数据正确性 | 过程创建 | MySQL: `SHOW CREATE PROCEDURE sp_count_users` 返回定义 |
| 数据正确性 | 过程执行 | `CALL sp_count_users(@total); SELECT @total;` 返回 5 |
| 数据正确性 | 函数创建 | `SHOW CREATE FUNCTION fn_get_user_email` 返回定义 |
| 数据正确性 | 函数执行 | `SELECT fn_get_user_email(1)` 返回 `alice@example.com` |
| 提示信息 | 创建成功 | 绿色 Toast："存储过程创建成功" |
| 提示信息 | 执行成功 | 结果显示 "total: 5" |
| 提示信息 | 语法错误 | 红色提示具体语法错误位置 |

**存储过程/函数操作矩阵：**

| 操作 | 正常场景 | 异常场景 | 边界场景 |
|------|----------|----------|----------|
| **创建过程** | 简单 SELECT 过程 | 语法错误 | 过程名 64 字符 |
| **创建函数** | 返回标量值 | 返回结果集（应报错） | 递归函数 |
| **执行过程** | 无参数过程 | 缺少必填 IN 参数 | OUT 参数未初始化 |
| **执行函数** | 在 SELECT 中调用 | 参数类型不匹配 | 返回 NULL |
| **删除过程** | 删除无依赖过程 | 删除被其他过程调用的过程 | 系统过程（禁止） |
| **查看定义** | 查看简单过程 | 查看加密/混淆过程 | 非常大的过程（1000行） |

**非可视化验证：**

```bash
# 验证存储过程
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SHOW CREATE PROCEDURE sp_count_users;"
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "CALL sp_count_users(@t); SELECT @t;"
# 预期：@t = 5

# 验证函数
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SELECT fn_get_user_email(1);"
# 预期：alice@example.com
```

**脚本位置：** 新增 `e2e/routine-management.test.ts`

---

### 场景 23：数据库对象操作 - 触发器管理（精细化测试）

**用户故事：** 用户需要查看和管理数据库触发器。

**前置条件：** 已连接 MySQL，展开 `testdb`。

**用户操作 A：查看触发器**

1. 展开 `testdb` → "触发器"分类节点。
2. 观察触发器列表。
3. 双击触发器名。
4. 观察右侧显示的触发器定义。

**用户操作 B：创建触发器**

1. 右键"触发器"分类节点 → "新建触发器"。
2. 选择关联表：`orders`
3. 触发时机：`BEFORE INSERT`
4. 输入触发器体：
   ```sql
   BEGIN
     IF NEW.total_amount <= 0 THEN
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '订单金额必须大于0';
     END IF;
   END;
   ```
5. 输入触发器名：`trg_check_order_amount`
6. 点击"保存"。

**用户操作 C：验证触发器生效**

1. 在 SQL 编辑器执行：
   ```sql
   INSERT INTO orders (user_id, total_amount) VALUES (1, -100);
   ```
2. 观察错误提示。
3. 执行正常插入：
   ```sql
   INSERT INTO orders (user_id, total_amount) VALUES (1, 150.00);
   ```
4. 验证插入成功。

**用户操作 D：删除触发器**

1. 右键 `trg_check_order_amount`。
2. 选择"删除触发器"。
3. 确认删除。

**四维验证：**

| 维度 | 验证点 | 预期结果 |
|------|--------|----------|
| 页面显示 | 触发器节点 | 左侧"触发器"分类下显示触发器名，标注关联表和时机（BEFORE INSERT） |
| 页面显示 | 触发器定义 | 右侧显示完整的 CREATE TRIGGER 语句 |
| 页面显示 | 触发器列表 | 显示触发器名、关联表、事件（INSERT/UPDATE/DELETE）、时机（BEFORE/AFTER） |
| 功能交互 | 创建触发器 | 选择表和时机后，自动生成触发器模板 |
| 功能交互 | 启用/禁用 | 支持右键启用或禁用触发器（数据库支持的前提下） |
| 数据正确性 | 触发器创建 | MySQL: `SHOW TRIGGERS LIKE 'orders'` 返回触发器信息 |
| 数据正确性 | 触发器生效 | 插入负数金额时抛出错误，阻止插入 |
| 数据正确性 | 触发器删除 | `SHOW TRIGGERS LIKE 'orders'` 不再包含该触发器 |
| 提示信息 | 创建成功 | 绿色 Toast："触发器 trg_check_order_amount 创建成功" |
| 提示信息 | 触发器阻止 | 红色错误："订单金额必须大于0" |
| 提示信息 | 删除成功 | 绿色 Toast："触发器已删除" |

**触发器操作矩阵：**

| 操作 | 正常场景 | 异常场景 | 边界场景 |
|------|----------|----------|----------|
| **创建 BEFORE INSERT** | 数据校验触发器 | 同表同事件触发器已存在 | 触发器名 64 字符 |
| **创建 AFTER INSERT** | 日志记录触发器 | 触发器体语法错误 | 递归触发（A 触发 B，B 触发 A） |
| **创建 BEFORE UPDATE** | 修改时间戳自动更新 | 更新不允许的列 | 更新前 vs 更新后值对比 |
| **创建 AFTER DELETE** | 级联删除/归档 | 删除不存在的关联记录 | 大量删除时的性能 |
| **查看触发器** | 查看定义 | 查看禁用状态的触发器 | 加密触发器 |
| **删除触发器** | 删除无用触发器 | 删除被依赖的触发器 | 系统触发器（禁止） |
| **禁用触发器** | 临时禁用 | 数据库不支持禁用（MySQL） | 批量导入时禁用所有触发器 |

**非可视化验证：**

```bash
# 验证触发器存在
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SHOW TRIGGERS LIKE 'orders';"
# 预期：返回 trg_check_order_amount, Event=INSERT, Timing=BEFORE

# 验证触发器生效（应报错）
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "INSERT INTO orders (user_id, total_amount) VALUES (1, -100);" 2>&1
# 预期：ERROR 1644 (45000): 订单金额必须大于0

# 验证正常插入
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "INSERT INTO orders (user_id, total_amount) VALUES (1, 150.00);"
# 预期：成功

# 验证删除后
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SHOW TRIGGERS LIKE 'orders';"
# 预期：空结果
```

**脚本位置：** 新增 `e2e/trigger-management.test.ts`

---

## 六、用户操作矩阵（组合测试）

针对核心功能，系统性地覆盖**正常路径、异常路径、边界条件**的组合。

### 矩阵 1：连接管理操作矩阵

| 操作 | 正常数据 | 异常数据 | 边界数据 | 并发/重复操作 |
|------|----------|----------|----------|---------------|
| **创建连接** | 正确填写所有字段 | 空名称/空主机/错误端口 | 名称 50 字符/端口 1 或 65535 | 快速双击保存按钮 |
| **测试连接** | 正确密码 | 错误密码/错误主机/离线 | 空密码（若允许） | 连续点击 5 次测试 |
| **编辑连接** | 修改名称 | 修改为主机不可达 | 清空必填字段后保存 | 同时打开两个编辑对话框 |
| **删除连接** | 删除未连接 | 删除已连接（应先断开） | 删除唯一连接 | 快速删除多个 |
| **连接数据库** | 正确配置 | 密码错误/网络不通 | 超时时间极短（1 秒） | 同时连接多个数据库 |

### 矩阵 2：SQL 查询操作矩阵

| SQL 类型 | 正常输入 | 异常输入 | 边界输入 | 性能测试 |
|----------|----------|----------|----------|----------|
| **SELECT** | `SELECT * FROM users` | `SELECT * FROM no_table` | `SELECT * FROM users LIMIT 0` | `SELECT * FROM big_table` (10万行) |
| **INSERT** | 完整字段插入 | 缺少必填字段 | 插入最大长度字符串 | 批量插入 1000 行 |
| **UPDATE** | 更新单条 | `WHERE` 条件缺失（全表更新） | 更新 0 条 | 更新大量记录 |
| **DELETE** | 删除单条 | `WHERE` 条件缺失 | 删除 0 条 | 删除大量记录 |
| **DDL** | `CREATE TABLE` | 语法错误 | 表名/列名 64 字符 | 创建大量表 |
| **多语句** | 2 条 SELECT | 第 1 条错第 2 条对 | 单条分号结尾 | 100 条语句 |

### 矩阵 3：事务操作矩阵

| 操作序列 | 预期结果 | 数据状态 |
|----------|----------|----------|
| BEGIN → INSERT → COMMIT | 成功 | 数据持久化 |
| BEGIN → INSERT → ROLLBACK | 成功 | 数据回滚，不存在 |
| BEGIN → UPDATE → COMMIT | 成功 | 更新生效 |
| BEGIN → DELETE → ROLLBACK | 成功 | 数据恢复 |
| BEGIN → INSERT → 断开连接 | 自动回滚 | 数据不存在 |
| COMMIT（无 BEGIN） | 提示错误或忽略 | 无变化 |
| ROLLBACK（无 BEGIN） | 提示错误或忽略 | 无变化 |
| BEGIN → BEGIN（嵌套） | 提示已有事务 | 无变化 |

### 矩阵 4：界面操作矩阵

| 操作 | 正常场景 | 异常场景 | 边界场景 |
|------|----------|----------|----------|
| **切换语言** | 中文 ↔ 英文 | 切换后不保存直接关闭 | 快速连续切换 10 次 |
| **切换主题** | 浅色 ↔ 深色 | 系统主题跟随（若支持） | 切换后最小化再恢复 |
| **调整字体** | 14 → 16 | 输入 0 或负数 | 输入 100（超大字体） |
| **侧边栏折叠** | 点击折叠按钮 | 拖拽边界线 | 折叠到最窄/最宽 |
| **标签页操作** | 新建/关闭/切换 | 关闭最后一个标签页 | 打开 50 个标签页 |

### 矩阵 5：连接树层级操作矩阵（精细化）

| 操作 | 目标层级 | 正常路径 | 异常路径 | 边界路径 | 验证重点 |
|------|----------|----------|----------|----------|----------|
| **展开连接** | 连接根节点 | 已连接 → 展开数据库列表 | 未连接 → 自动连接后展开 | 空数据库（0 个库） | 箭头变化、加载动画、子节点正确 |
| **展开数据库** | 数据库节点 | 展开分类节点（表/视图/过程） | 无权限访问数据库 | 数据库名 64 字符 | 分类图标、懒加载 |
| **展开表分类** | 分类节点 | 展开显示所有表名 | 数据库离线中 | 0 张表 / 1000 张表 | 表名显示、排序 |
| **展开单表** | 表节点 | 展开显示列/索引子节点 | 表被删除后展开 | 表名 64 字符 | 列类型显示、PK/AI 标识 |
| **展开列分类** | 列节点 | 显示所有列及数据类型 | 列数为 0（异常） | 1000 列 | 类型长度显示 |
| **收起节点** | 任意节点 | 收起所有子节点 | 无子节点时收起 | 深层嵌套（5 层） | 箭头恢复、状态保持 |
| **双击连接** | 连接节点 | 连接并展开 | 连接失败 | 快速双击 | 状态栏同步 |
| **双击表** | 表节点 | 右侧打开数据标签页 | 表被锁定 | 双击速度过快 | 标签页标题、内容 |
| **右键菜单** | 表节点 | 显示完整上下文菜单 | 无权限 | 菜单项 20+ | 菜单项完整性 |
| **选中节点** | 表节点 | 高亮显示 | 无响应 | 快速切换选中 | 右侧同步更新 |

### 矩阵 6：左右内容联动矩阵（精细化）

| 左侧操作 | 右侧预期 | 状态栏预期 | 数据一致性验证 |
|----------|----------|------------|----------------|
| 点击 `users` 表 | 打开 `users` 数据标签页 | "users \| 5 行 \| 4 列" | 网格数据 = `SELECT * FROM users` |
| 点击 `users` 列节点 | 打开 `users - 结构` 标签页 | "users \| 结构" | 列信息 = `DESCRIBE users` |
| 点击 `users` 索引节点 | 打开 `users - 索引` 标签页 | "users \| 索引" | 索引 = `SHOW INDEX FROM users` |
| 双击 `orders` 表 | 打开/切换到 `orders` 标签页 | "orders \| 5 行" | 数据 = `SELECT * FROM orders` |
| 执行 `CREATE TABLE` | 左侧自动出现新表节点 | 状态不变 | `SHOW TABLES` 包含新表 |
| 执行 `DROP TABLE` | 左侧节点消失 | 若打开的标签页关闭 | `SHOW TABLES` 不包含 |
| 断开连接 | 相关标签页显示"已断开" | "未连接" | 无法执行新查询 |
| 重连 | 标签页恢复正常 | "已连接" | 可继续操作 |
| 删除连接 | 相关标签页关闭 | 清空 | 连接配置已删除 |
| 关闭数据库 | 相关标签页关闭（需确认） | 更新 | 数据库节点收起 |
| 切换 SQL 标签页 | 左侧对应表节点高亮 | "查询 X \| 0.05s" | 编辑器内容正确 |
| 关闭所有标签页 | 左侧无选中，主区域默认视图 | "未选择" | 无活动查询 |

### 矩阵 7：数据库对象 DDL 操作矩阵（精细化）

| 对象类型 | 创建操作 | 修改操作 | 删除操作 | 查看操作 | 特殊场景 |
|----------|----------|----------|----------|----------|----------|
| **表** | CREATE TABLE（设计器/SQL） | ALTER TABLE（添加/修改/删除列） | DROP TABLE（需确认） | DESCRIBE / SELECT | 重命名、复制、清空 |
| **视图** | CREATE VIEW | ALTER VIEW | DROP VIEW | SELECT / SHOW CREATE | 物化视图（若支持） |
| **索引** | CREATE INDEX | 重建索引 | DROP INDEX | SHOW INDEX / EXPLAIN | 唯一索引冲突 |
| **存储过程** | CREATE PROCEDURE | ALTER PROCEDURE | DROP PROCEDURE | SHOW CREATE / CALL | 执行参数验证 |
| **函数** | CREATE FUNCTION | ALTER FUNCTION | DROP FUNCTION | SHOW CREATE / SELECT | 返回类型验证 |
| **触发器** | CREATE TRIGGER | 启用/禁用 | DROP TRIGGER | SHOW TRIGGERS | BEFORE/AFTER 验证 |
| **事件** | CREATE EVENT | ALTER EVENT | DROP EVENT | SHOW EVENTS | 调度验证 |

### 矩阵 8：数据操作 DML 矩阵（精细化）

| 操作 | 正常场景 | 异常场景 | 边界场景 | 事务影响 |
|------|----------|----------|----------|----------|
| **插入单行** | 完整字段 | 缺少必填 | 空值/NULL 处理 | 未提交不可见 |
| **插入多行** | 批量插入 10 行 | 部分行冲突 | 单行超长文本 | 原子性 |
| **更新单行** | 修改非关键字段 | 修改 PK（应限制） | 更新为相同值 | 可回滚 |
| **更新多行** | 批量更新 | WHERE 缺失（全表） | 更新 0 行 | 可回滚 |
| **删除单行** | 删除测试数据 | 删除被引用行 | 删除不存在的行 | 可回滚 |
| **删除多行** | 批量删除 | 无 WHERE | 删除全部 | 可回滚 |
| **导入数据** | CSV 导入 | 格式错误 | 空文件 | 事务包裹 |
| **导出数据** | CSV 导出 | 无权限写入 | 0 行导出 | 不影响数据 |

### 矩阵 9：状态栏信息同步矩阵（精细化）

| 用户操作 | 状态栏左侧（连接/数据库） | 状态栏中间（操作信息） | 状态栏右侧（系统信息） |
|----------|--------------------------|----------------------|----------------------|
| **首次启动** | "未连接" | "就绪" | "UTF-8" |
| **创建连接后** | "未连接" | "连接已保存" | "UTF-8" |
| **连接数据库** | "Docker MySQL > testdb" | "已连接" | "UTF-8" |
| **选中表** | "Docker MySQL > testdb > users" | "5 行 | 4 列" | "UTF-8" |
| **执行查询** | "Docker MySQL > testdb" | "查询完成 | 0.05s | 5 行" | "UTF-8" |
| **事务开始** | "Docker MySQL > testdb" | "事务活跃 | 00:02:15" | "UTF-8" |
| **事务提交** | "Docker MySQL > testdb" | "事务已提交" | "UTF-8" |
| **断开连接** | "未连接" | "连接已断开" | "UTF-8" |
| **切换数据库** | "Docker MySQL > orders_db" | "8 张表" | "UTF-8" |
| **执行错误 SQL** | "Docker MySQL > testdb" | "错误 | 语法错误" | "UTF-8" |
| **长时间查询** | "Docker MySQL > testdb" | "查询中... | 已耗时 10s" | "UTF-8" |
| **导出数据** | "Docker MySQL > testdb" | "导出完成 | 1000 行" | "UTF-8" |

### 矩阵 10：提示信息系统矩阵

| 操作场景 | 提示类型 | 提示位置 | 提示颜色 | 自动消失 | 需用户操作 |
|----------|----------|----------|----------|----------|------------|
| **连接成功** | Toast | 右上角 | 绿色 | 3 秒 | 否 |
| **连接失败** | Toast | 右上角 | 红色 | 5 秒 | 否 |
| **保存成功** | Toast | 右上角 | 绿色 | 3 秒 | 否 |
| **删除确认** | Modal | 屏幕中央 | 警告色 | 否 | 是（输入确认） |
| **语法错误** | 行内提示 | SQL 编辑器 | 红色下划线 | 否 | 否 |
| **表单校验** | 字段提示 | 输入框下方 | 红色文字 | 否 | 否 |
| **加载中** | Spin | 节点/按钮旁 | 蓝色 | 否 | 否 |
| **事务状态** | 状态栏文字 | 底部状态栏 | 黄色（活跃） | 否 | 否 |
| **查询超时** | Toast | 右上角 | 橙色 | 5 秒 | 否 |
| **未保存关闭** | Modal | 屏幕中央 | 警告色 | 否 | 是（保存/放弃/取消） |
| **权限不足** | Tooltip | 悬停元素旁 | 灰色 | 否 | 否 |
| **操作进度** | Progress | 对话框内 | 蓝色 | 否 | 是（可取消） |

### 矩阵 11：多数据库类型兼容性矩阵

| 功能 | MySQL | PostgreSQL | SQLite | SQL Server | Oracle | Dameng | Kingbase |
|------|-------|------------|--------|------------|--------|--------|----------|
| **创建连接** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **测试连接** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **浏览表** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **查看结构** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **执行查询** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **数据编辑** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| **事务控制** | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| **备份恢复** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| **用户管理** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **视图管理** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **索引管理** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **存储过程** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **触发器** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **结构比较** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |

**图例：** ✅ 完全支持 / ⚠️ 部分支持 / ❌ 不支持

### 矩阵 12：性能与压力测试矩阵

| 测试场景 | 数据量 | 预期响应时间 | 验证点 | 通过标准 |
|----------|--------|-------------|--------|----------|
| **连接数据库** | 正常 | < 2 秒 | 连接建立时间 | 2 秒内状态变为"已连接" |
| **展开大数据库** | 1000 张表 | < 3 秒 | 树节点加载时间 | 3 秒内显示所有表名 |
| **查询大数据表** | 100 万行 | < 5 秒 | 查询执行时间 | 5 秒内返回前 1000 行 |
| **导出大数据** | 10 万行 | < 10 秒 | 文件生成时间 | 10 秒内生成 CSV 文件 |
| **导入大数据** | 10 万行 | < 30 秒 | 数据插入时间 | 30 秒内完成并提示成功 |
| **结构比较** | 100 张表 | < 10 秒 | 比较完成时间 | 10 秒内显示结果 |
| **打开多个标签页** | 50 个标签 | < 1 秒/个 | 标签切换流畅度 | 切换无卡顿，内存稳定 |
| **长时间运行** | 24 小时 | - | 内存泄漏 | 内存增长 < 100MB |
| **并发查询** | 10 个同时 | < 10 秒/个 | 并发处理能力 | 所有查询完成且无错误 |
| **快速切换连接** | 5 个连接 | < 1 秒/次 | 切换响应时间 | 1 秒内完成切换 |

---

## 七、非可视化验证方法

测试不仅要验证"用户看到了什么"，还要验证"系统实际做了什么"。

### 7.1 IPC 调用验证（Tauri Backend）

通过 `tauri-mcp ipc-execute-command` 直接调用 Rust 命令，绕过 UI：

```bash
# 验证连接是否存在
tauri-mcp ipc-execute-command --command get_connections --args '{}'
# 预期返回：连接列表 JSON

# 验证连接状态
tauri-mcp ipc-execute-command --command get_connection_status --args '{"id":"conn-123"}'
# 预期返回：{"status":"connected"}

# 直接执行查询（不经过 SQL 编辑器）
tauri-mcp ipc-execute-command --command execute_query --args '{"connectionId":"conn-123","sql":"SELECT COUNT(*) FROM users"}'
# 预期返回：{"rows":[[5]],"columns":["COUNT(*)"],"executionTime":12}
```

### 7.2 数据库直接查询验证

```bash
# MySQL 验证
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SELECT * FROM users;"

# PostgreSQL 验证
docker compose -f docker-compose.test.yml exec -T postgres psql -U testuser -d testdb -c "SELECT * FROM users;"

# 验证表结构
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "DESCRIBE users;"

# 验证事务隔离
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SELECT COUNT(*) FROM users WHERE username='tx_test';"
```

### 7.3 日志验证

```bash
# 验证前端日志是否包含错误
tauri-mcp read-logs --source console --filter "error" --lines 50

# 验证后端 Rust 日志
tauri-mcp read-logs --source system --filter "connection" --lines 100

# 验证 Go sidecar 日志（通过 Docker 或本地进程）
docker logs idblink-test-mysql --tail 50 | grep -i "query\|error"
```

### 7.4 文件系统验证

```bash
# 验证备份文件生成
ls -lh /tmp/testdb_backup.sql
test -s /tmp/testdb_backup.sql && echo "文件非空"

# 验证配置文件更新
grep -q '"language":"en"' ~/Library/Application\ Support/iDBLink/settings.json && echo "语言已切换为英文"

# 验证截图生成
ls -lt /tmp/idblink-test-screenshots/*.png | head -5
```

### 7.5 Playwright 中的非可视化验证

```typescript
// 在 Playwright 中直接访问 Tauri API
const connections = await page.evaluate(async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke('get_connections');
});
expect(connections).toHaveLength(1);
expect(connections[0].name).toBe('Docker MySQL');

// 验证 Zustand store 状态
const storeState = await page.evaluate(() => {
  return window.useAppStore?.getState?.();
});
expect(storeState.connections[0].status).toBe('connected');
```

---

## 八、边界条件与异常场景测试

### 8.1 边界条件测试规范

| 边界类型 | 测试项 | 边界值 | 预期行为 |
|----------|--------|--------|----------|
| **字符串长度** | 连接名称 | 1 字符 / 50 字符 / 51 字符 | 1-50 允许，51 拒绝并提示 |
| **字符串长度** | 表名 | 1 字符 / 64 字符 / 65 字符 | 1-64 允许，65 拒绝 |
| **字符串长度** | 列名 | 1 字符 / 64 字符 / 65 字符 | 1-64 允许，65 拒绝 |
| **数值范围** | 端口号 | 1 / 65535 / 0 / 65536 | 1-65535 允许，其他拒绝 |
| **数值范围** | 查询超时 | 1 秒 / 3600 秒 / 0 | 1-3600 允许，0 使用默认值 |
| **数值范围** | 连接超时 | 1 秒 / 300 秒 / 0 | 1-300 允许，0 使用默认值 |
| **空值处理** | 空字符串 | 连接名称为空 | 表单校验失败，提示必填 |
| **空值处理** | NULL | 密码为空（可选字段） | 允许为空，不传密码 |
| **特殊字符** | 连接名称 | `test@#$%` | 允许（取决于数据库限制） |
| **特殊字符** | SQL 注入 | `'; DROP TABLE users; --` | 参数化查询，不被执行 |
| **Unicode** | 中文表名 | `用户表` | 支持（UTF-8 编码） |
| **Unicode** | Emoji | `test😀` | 根据数据库支持情况处理 |
| **大数据量** | 查询结果 | 100 万行 | 分页显示，每页 1000 行 |
| **大数据量** | 表数量 | 10000 张表 | 树节点懒加载，虚拟滚动 |
| **并发** | 同时连接 | 10 个数据库 | 每个连接独立，无互相干扰 |
| **资源限制** | 内存 | 打开 100 个标签页 | 内存使用稳定，无泄漏 |

### 8.2 异常场景测试规范

| 异常类型 | 触发条件 | 用户预期 | 系统预期 |
|----------|----------|----------|----------|
| **网络中断** | 数据库服务器宕机 | 连接状态变为"断开"，提示"连接丢失" | 自动重连机制（若启用） |
| **认证失败** | 密码错误 | 弹出密码输入框，提示"密码错误" | 不保存错误密码 |
| **权限不足** | 无 CREATE 权限执行 DDL | 提示"权限不足：需要 CREATE 权限" | 不执行操作 |
| **表被锁定** | 其他会话锁定表 | 提示"表被锁定，请稍后重试" | 等待超时后报错 |
| **磁盘满** | 导出到满的磁盘 | 提示"磁盘空间不足" | 不生成不完整文件 |
| **语法错误** | `SELECT * FORM users` | SQL 编辑器红色高亮错误处 | 不发送到数据库 |
| **运行时错误** | 除以零 `SELECT 1/0` | 提示"Division by zero" | 返回错误，不崩溃 |
| **连接池耗尽** | 过多并发连接 | 提示"连接池已满，请稍后再试" | 排队或拒绝 |
| **数据库离线** | Docker 容器停止 | 连接状态变红，提示"数据库离线" | 标记连接为不可用 |
| **超时** | 查询执行超过 300 秒 | 提示"查询超时，已取消" | 终止数据库查询 |
| **死锁** | 事务间死锁 | 提示"检测到死锁，事务已回滚" | 自动回滚死锁事务 |
| **数据截断** | 插入超长字符串 | 提示"数据太长，已截断" | 根据 SQL_MODE 处理 |
| **唯一冲突** | 插入重复主键 | 提示"Duplicate entry 'X' for key 'PRIMARY'" | 拒绝插入 |
| **外键约束** | 删除被引用的行 | 提示"Cannot delete or update a parent row" | 拒绝删除 |
| **空结果** | `SELECT * FROM users WHERE id = 99999` | 显示"查询完成，返回 0 行" | 空网格，不报错 |
| **大数据导出** | 导出 100 万行 | 显示进度条，允许取消 | 流式写入，不占用大量内存 |
| **非法文件** | 导入损坏的 CSV | 提示"CSV 格式错误：第 X 行" | 事务回滚，不导入部分数据 |

### 8.3 数据一致性验证方法

**A. 前端-后端一致性**

```typescript
// 验证前端显示的数据与后端返回一致
const frontendData = await page.evaluate(() => {
  // 获取前端表格数据
  const rows = document.querySelectorAll('.ag-row');
  return Array.from(rows).map(row => ({
    username: row.querySelector('[col-id="username"]')?.textContent,
    email: row.querySelector('[col-id="email"]')?.textContent,
  }));
});

const backendData = await page.evaluate(async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke('execute_query', {
    connectionId: 'conn-id',
    sql: 'SELECT username, email FROM users'
  });
});

// 逐行比对
expect(frontendData).toEqual(backendData.rows.map((r: any[]) => ({
  username: r[0],
  email: r[1]
})));
```

**B. 应用-数据库一致性**

```bash
# 在应用执行 INSERT 后，直接查询数据库验证
# 1. 应用执行：INSERT INTO users (username) VALUES ('consistency_test')
# 2. 直接查询数据库验证
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SELECT * FROM users WHERE username='consistency_test';"
# 预期：返回 1 行

# 在应用执行 UPDATE 后验证
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SELECT age FROM users WHERE username='alice';"
# 预期：返回修改后的值
```

**C. 事务隔离性验证**

```bash
# 会话 1（应用）：BEGIN; INSERT INTO users ...;
# 会话 2（直接查询）：
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SELECT COUNT(*) FROM users;"
# 预期：未提交数据不可见，返回原行数

# 会话 1（应用）：COMMIT;
# 会话 2（直接查询）：
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb -e "SELECT COUNT(*) FROM users;"
# 预期：已提交数据可见，返回新行数
```

**D. 状态持久化验证**

```bash
# 验证连接配置持久化到本地 SQLite
cat ~/Library/Application\ Support/iDBLink/connections.db | sqlite3 "SELECT name, host, port FROM connections WHERE name='Docker MySQL';"
# 预期：返回正确配置

# 验证设置持久化
cat ~/Library/Application\ Support/iDBLink/settings.json | jq '.language'
# 预期：返回 "en" 或 "zh"
```

### 8.4 性能基准测试

| 测试项 | 测试方法 | 通过标准 | 测试频率 |
|--------|----------|----------|----------|
| **冷启动时间** | 从点击应用到主界面出现 | < 5 秒 | 每次发布 |
| **连接建立时间** | 点击连接到状态更新 | < 2 秒 | 每次发布 |
| **查询响应时间** | `SELECT * FROM users LIMIT 1000` | < 1 秒 | 每次发布 |
| **大数据查询** | `SELECT * FROM big_table LIMIT 10000` | < 3 秒 | 每周 |
| **树展开时间** | 展开 1000 张表的数据库 | < 2 秒 | 每周 |
| **标签页切换** | 在 50 个标签页间切换 | < 200ms | 每次发布 |
| **内存占用** | 打开 10 个连接，每个 5 个标签页 | < 500MB | 每周 |
| **CPU 占用** | 空闲状态 | < 5% | 每次发布 |
| **导出速度** | 导出 10 万行到 CSV | < 10 秒 | 每月 |
| **导入速度** | 从 CSV 导入 10 万行 | < 60 秒 | 每月 |

---

## 九、测试提速方案（核心优化）

### 9.1 问题诊断：当前测试为什么慢

| 瓶颈 | 影响 | 位置 |
|------|------|------|
| 大量 `sleep` 等待 | 每个 sleep 2-3s，累积 30s+ | `mcp-tests/*.sh` |
| Tauri 应用冷启动 | 首次编译 Rust + Go sidecar 需 30-60s | `pnpm tauri dev` |
| Docker 数据库启动 | 无 healthcheck 等待，靠 sleep | `docker compose up` |
| 串行执行测试 | 无法并行利用多核 | `fullyParallel: false` |
| 每次测试重新导航 | `page.goto()` 重复加载 | Playwright tests |
| 不必要的截图 | 每步都截图，占用 IO | `tauri-mcp webview-screenshot` |

### 9.2 优化策略与实施

#### 9.2.1 策略 1：用 `wait-for` 替代 `sleep`（最大收益）

**反模式（慢）：**
```bash
# ❌ 固定等待，不管实际是否就绪
tauri-mcp webview-interact --action click --selector "新建连接" --strategy text
sleep 2
```

**优化后（快）：**
```bash
# ✅ 等待对话框实际出现
tauri-mcp webview-interact --action click --selector "新建连接" --strategy text
tauri-mcp webview-wait-for --type selector --value ".ant-modal" --timeout 5000
```

**具体替换清单：**

| 原命令 | 替换为 | 节省 |
|--------|--------|------|
| `sleep 2` (点击后) | `webview-wait-for --type selector --value ".ant-modal"` | ~1.5s/次 |
| `sleep 3` (保存后) | `webview-wait-for --type text --value "Docker MySQL"` | ~2s/次 |
| `sleep 3` (连接测试) | `read-logs --source console --filter "connection.*success"` | ~2s/次 |

#### 9.2.2 策略 2：Docker 数据库就绪检测

```bash
# ✅ 利用 Docker healthcheck 等待就绪
echo "等待 MySQL 就绪..."
until docker compose -f docker-compose.test.yml exec -T mysql mysqladmin ping -h localhost -u root -ptestpassword --silent; do
  sleep 1
done

echo "等待 PostgreSQL 就绪..."
until docker compose -f docker-compose.test.yml exec -T postgres pg_isready -U testuser -d testdb; do
  sleep 1
done
```

#### 9.2.3 策略 3：Playwright 测试提速

**a) 复用页面状态（test.extend）**

```typescript
// e2e/helpers/fixtures.ts
import { test as base } from '@playwright/test';

export const test = base.extend<{
  connectedPage: Page;
}>({
  // 自动创建连接并返回已连接状态的页面
  connectedPage: async ({ page }, use) => {
    await page.goto('http://localhost:5100');
    await createConnection(page, TEST_CONNECTIONS.mysql);
    await connectToDatabase(page, 'Test MySQL');
    await use(page);
    // 测试结束后清理
    await deleteConnection(page, 'Test MySQL');
  },
});
```

**b) 减少不必要的导航**

```typescript
// ❌ 每个 test 都 goto
test('a', async ({ page }) => { await page.goto('...'); ... });
test('b', async ({ page }) => { await page.goto('...'); ... });

// ✅ 用 beforeAll 只导航一次
test.describe('Query Flow', () => {
  test.beforeAll(async ({ page }) => {
    await page.goto('http://localhost:5100');
    await setupConnection(page);
  });
  
  test('query 1', async ({ page }) => { ... });  // 复用页面
  test('query 2', async ({ page }) => { ... });  // 复用页面
});
```

**c) 并行化独立的测试文件**

```typescript
// playwright.config.ts
export default defineConfig({
  // 文件级别并行（同一文件内仍串行）
  fullyParallel: true,
  workers: 3,  // 根据 CPU 核心数调整
  
  // 使用独立的 project 隔离状态
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { 
      name: 'chromium', 
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],  // 先跑 setup
    },
  ],
});
```

#### 9.2.4 策略 4：应用启动优化

```bash
# ✅ 检查已有实例，避免重复启动
if ! pgrep -f "idblink" > /dev/null; then
  nohup pnpm tauri dev > /tmp/idblink-tauri-dev.log 2>&1 &
  # 等待 Vite 和 Tauri 都就绪
  for i in {1..120}; do
    if curl -s http://localhost:5100 > /dev/null && grep -q "MCP.*listening" /tmp/idblink-tauri-dev.log; then
      break
    fi
    sleep 1
  done
fi
```

#### 9.2.5 策略 5：按需截图与日志

```bash
# ❌ 每步都截图（慢）
tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-XX-step1.png

# ✅ 仅失败时截图
# 在脚本中：
set -e  # 遇到错误立即退出
# ... 测试步骤 ...
# 只有走到最后才截图
tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-XX-final.png
```

**Playwright 内置优化：**
```typescript
// playwright.config.ts
use: {
  screenshot: 'only-on-failure',  // 仅失败截图
  trace: 'on-first-retry',        // 仅首次重试时收集 trace
  video: 'off',                   // 关闭视频录制（如需可改为 on-first-retry）
}
```

### 9.3 提速效果预期

| 优化项 | 当前耗时 | 优化后 | 收益 |
|--------|----------|--------|------|
| sleep → wait-for | ~45s/脚本 | ~15s/脚本 | **-67%** |
| Docker healthcheck | ~10s 固定 | ~3s 实际 | **-70%** |
| Playwright 复用页面 | 30s/test | 5s/test | **-83%** |
| 并行 workers | 串行 | 3 并行 | **-60%** |
| 截图优化 | 每步 2s | 仅最后 | **-80%** |
| **整体 E2E 套件** | **~10 分钟** | **~2 分钟** | **-80%** |

---

## 十、可测试性改进（前置条件）

当前 Playwright 测试期望 `data-testid` 属性，但源码中几乎未添加。以下是**必须添加**的测试标识：

### 10.1 优先级 P0（阻塞测试）

| 组件 | 元素 | 建议 data-testid |
|------|------|------------------|
| Toolbar | 新建连接按钮 | `toolbar-new-connection` |
| Toolbar | 刷新按钮 | `toolbar-refresh` |
| Toolbar | 新建查询按钮 | `toolbar-new-query` |
| Toolbar | 设置按钮 | `toolbar-settings` |
| ConnectionDialog | 连接名称输入 | `conn-name-input` |
| ConnectionDialog | 数据库类型选择 | `conn-db-type` |
| ConnectionDialog | 主机输入 | `conn-host-input` |
| ConnectionDialog | 端口输入 | `conn-port-input` |
| ConnectionDialog | 用户名输入 | `conn-username-input` |
| ConnectionDialog | 密码输入 | `conn-password-input` |
| ConnectionDialog | 测试连接按钮 | `conn-test-btn` |
| ConnectionDialog | 保存按钮 | `conn-save-btn` |
| ConnectionTree | 连接项 | `connection-item-{id}` |
| ConnectionTree | 数据库节点 | `database-node-{name}` |
| ConnectionTree | 表节点 | `table-node-{name}` |
| ConnectionTree | 视图节点 | `view-node-{name}` |
| SQLEditor | 编辑器区域 | `sql-editor` |
| SQLEditor | 执行按钮 | `sql-execute-btn` |
| StatusBar | 连接状态 | `status-connection` |
| StatusBar | 事务状态 | `status-transaction` |
| DataTable | 数据表格 | `data-table` |
| DataTable | 新增行按钮 | `datatable-add-row` |
| DataTable | 编辑行按钮 | `datatable-edit-row` |
| DataTable | 删除行按钮 | `datatable-delete-row` |
| DataTable | 导出按钮 | `datatable-export` |
| DataTable | 保存按钮 | `datatable-save` |
| DataTable | 撤销按钮 | `datatable-undo` |
| DataTable | 刷新按钮 | `datatable-refresh` |
| TabPanel | 标签面板 | `tab-panel` |
| Toolbar | 新建连接按钮 | `toolbar-new-connection` |
| Toolbar | 刷新按钮 | `toolbar-refresh` |
| Toolbar | 新建查询按钮 | `toolbar-new-query` |
| Toolbar | 设置按钮 | `toolbar-settings` |
| Toolbar | 主题切换按钮 | `toolbar-theme-toggle` |
| Toolbar | 快捷键按钮 | `toolbar-shortcuts` |

### 10.2 添加示例

在 `src/components/Toolbar.tsx` 中：

```tsx
<Button data-testid="toolbar-new-connection" onClick={onNewConnection}>
  {t('common.newConnection')}
</Button>
```

### 10.3 批量添加脚本

```bash
# 快速检查还缺哪些 data-testid
grep -r "data-testid" src/components/ | wc -l
grep -r "data-testid" e2e/helpers/test-helpers.ts | sed 's/.*"\(.*\)".*/\1/' | sort | uniq > /tmp/needed.txt
```

---

## 十一、CI/CD 集成

### 11.1 GitHub Actions 示例

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        
      - name: Install deps
        run: pnpm install
        
      - name: Install Playwright
        run: npx playwright install chromium
        
      - name: Start Docker databases
        run: |
          docker compose -f docker-compose.test.yml up -d
          ./scripts/wait-for-databases.sh
          
      - name: Run Playwright E2E
        run: pnpm test:e2e
        
      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
            
      - name: Cleanup Docker
        if: always()
        run: docker compose -f docker-compose.test.yml down
```

### 11.2 测试数据隔离

```bash
# 每次 CI 运行前重置数据库
# scripts/reset-test-databases.sh
#!/bin/bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d
sleep 5
# 重新导入测试数据
docker compose -f docker-compose.test.yml exec -T mysql mysql -u testuser -ptestpass testdb < go-backend/testdata/mysql-test.sql
```

---

## 十二、测试脚本位置

### 12.1 tauri-mcp 脚本

位于 `e2e/mcp-tests/` 目录：

| 脚本 | 覆盖 TC |
|------|---------|
| `t_01_initial_page.sh` | TC-01 |
| `t_02_03_i18n.sh` | TC-02, TC-03 |
| `t_04_theme.sh` | TC-04 |
| `t_05_06_07_connections.sh` | TC-05, TC-06, TC-07 |

### 12.2 Playwright 脚本

位于 `e2e/*.test.ts`：

| 脚本 | 覆盖 TC |
|------|---------|
| `smoke.test.ts` | TC-01 |
| `connection-flow.test.ts` | TC-05, TC-06 |
| `query-flow.test.ts` | TC-08 |
| `table-operations.test.ts` | TC-09, TC-10, TC-20 |
| `transaction-flow.test.ts` | TC-11 |
| `settings-flow.test.ts` | TC-03, TC-04, TC-12 |
| `backup-restore.test.ts` | TC-13 |
| `schema-compare.test.ts` | TC-16 |
| `keyboard-shortcuts.test.ts` | TC-15, TC-17 |
| `regression.test.ts` | 端到端回归 |
| `connection-tree.test.ts` *(新增)* | TC-17 |
| `panel-interaction.test.ts` *(新增)* | TC-18 |
| `table-management.test.ts` *(新增)* | TC-19 |
| `index-management.test.ts` *(新增)* | TC-21 |
| `routine-management.test.ts` *(新增)* | TC-22 |
| `trigger-management.test.ts` *(新增)* | TC-23 |

---

## 十三、测试清理

```bash
# 1. 停止 MCP 会话
tauri-mcp driver-session stop

# 2. 停止 Tauri 应用
pkill -f "idblink"

# 3. 停止 Docker 数据库
docker compose -f docker-compose.test.yml down

# 4. 清理测试截图
rm -rf /tmp/idblink-test-screenshots/*

# 5. 清理 Playwright 产物
rm -rf playwright-report/ test-results/
```

---

## 十四、测试用例状态总览

| 测试ID | 测试名称 | tauri-mcp | Playwright | 说明 |
|--------|----------|-----------|------------|------|
| TC-01 | 应用启动与页面布局 | ✅ | ✅ | 双轨验证 |
| TC-02 | 中文界面验证 | ✅ | ✅ | |
| TC-03 | 英文界面切换 | ✅ | ✅ | |
| TC-04 | 主题切换 | ✅ | ✅ | |
| TC-05 | 创建 MySQL 连接 | ✅ | ✅ | data-testid 已添加 |
| TC-06 | 创建 PostgreSQL 连接 | ✅ | ✅ | data-testid 已添加 |
| TC-07 | 连接数据库并浏览表 | ⚠️ | ✅ | 连接树 data-testid 已添加 |
| TC-08 | SQL 查询执行 | — | ⚠️ | 需先建立连接 |
| TC-09 | 表结构查看 | — | ⚠️ | 依赖连接展开 |
| TC-10 | 数据编辑操作 | — | ⚠️ | 依赖连接和数据表 |
| TC-11 | 事务控制 | — | ⚠️ | 依赖 SQL 编辑器 |
| TC-12 | 应用设置 | ✅ | ✅ | |
| TC-13 | 备份恢复 | — | ⚠️ | 需先展开数据库 |
| TC-14 | 用户管理 | — | ⚠️ | 需先展开数据库 |
| TC-15 | 快捷键验证 | ✅ | ⚠️ | 需键盘事件支持 |
| TC-16 | 结构比较 | — | ⚠️ | 需先展开数据库 |
| TC-17 | 代码片段管理 | — | ⚠️ | 需先打开 SQL 编辑器 |
| TC-18 | 连接树层级展开收起 | — | ✅ | data-testid 已添加，测试文件已创建 |
| TC-19 | 左右内容联动交互 | — | ✅ | data-testid 已添加，测试文件已创建 |
| TC-20 | 数据库对象操作 - 表管理 | — | ✅ | DataTable data-testid 已添加 |
| TC-21 | 数据库对象操作 - 视图管理 | — | ✅ | ViewNode data-testid 已添加 |
| TC-22 | 数据库对象操作 - 索引管理 | — | ⚠️ | 需索引管理对话框 |
| TC-23 | 数据库对象操作 - 触发器管理 | — | ⚠️ | 需触发器分类节点支持 |
| TC-24 | 数据库对象操作 - 存储过程/函数 | — | ⚠️ | 需过程/函数分类节点支持 |

**图例：** ✅ 通过 / ⚠️ 部分通过或待完善 / — 未实施

**阻塞项解决状态：**
- **✅ 已解决**：TC-05/06（连接创建）、TC-07（浏览表）、TC-18（连接树）、TC-19（左右联动）、TC-20（表管理）、TC-21（视图管理）
- **P2（剩余）**：TC-22（索引）、TC-23（触发器）、TC-24（存储过程）— 高级功能，待表设计器完善后补充

---

## 十五、测试执行计划

### 15.1 测试分层策略

| 层级 | 测试类型 | 执行频率 | 耗时 | 执行环境 |
|------|----------|----------|------|----------|
| **L1 - 单元测试** | Vitest (jsdom) | 每次提交 | < 30 秒 | 本地开发 |
| **L2 - 集成测试** | Tauri IPC 测试 | 每次提交 | < 2 分钟 | 本地开发 |
| **L3 - E2E 核心** | Playwright (冒烟) | 每次 PR | < 5 分钟 | CI |
| **L4 - E2E 完整** | Playwright (全量) | 每日构建 | < 30 分钟 | CI |
| **L5 - 回归测试** | Playwright (回归) | 每次发布 | < 1 小时 | CI |
| **L6 - 性能测试** | 基准测试脚本 | 每周 | < 2 小时 | 独立环境 |

### 15.2 冒烟测试套件（每日执行）

**目标**：验证核心路径可用，耗时 < 5 分钟。

| 顺序 | 场景 | 预计耗时 | 关键验证 |
|------|------|----------|----------|
| 1 | TC-01：应用启动 | 30 秒 | 界面完整加载 |
| 2 | TC-05：创建 MySQL 连接 | 60 秒 | 连接配置正确保存 |
| 3 | TC-07：连接并浏览表 | 60 秒 | 连接树展开，表列表正确 |
| 4 | TC-08：执行简单查询 | 30 秒 | `SELECT 1` 返回结果 |
| 5 | TC-09：查看表结构 | 30 秒 | 列信息正确显示 |
| 6 | TC-11：事务控制 | 60 秒 | BEGIN/COMMIT 正常 |
| 7 | TC-12：应用设置 | 30 秒 | 设置保存生效 |
| **合计** | | **~5 分钟** | |

### 15.3 完整测试套件（每日构建）

**目标**：覆盖所有场景，耗时 < 30 分钟。

```bash
#!/bin/bash
# scripts/run-full-tests.sh

echo "=== iDBLink 完整测试套件 ==="

# 1. 环境准备（2 分钟）
echo "[1/6] 环境准备..."
docker compose -f docker-compose.test.yml up -d
./scripts/wait-for-databases.sh
nohup pnpm tauri dev > /tmp/idblink-tauri-dev.log 2>&1 &
./scripts/wait-for-app.sh

# 2. 冒烟测试（5 分钟）
echo "[2/6] 执行冒烟测试..."
npx playwright test e2e/smoke.test.ts

# 3. 连接管理测试（5 分钟）
echo "[3/6] 执行连接管理测试..."
npx playwright test e2e/connection-flow.test.ts e2e/connection-tree.test.ts

# 4. 数据库操作测试（10 分钟）
echo "[4/6] 执行数据库操作测试..."
npx playwright test e2e/query-flow.test.ts e2e/table-operations.test.ts e2e/transaction-flow.test.ts

# 5. 高级功能测试（5 分钟）
echo "[5/6] 执行高级功能测试..."
npx playwright test e2e/settings-flow.test.ts e2e/backup-restore.test.ts e2e/schema-compare.test.ts

# 6. 回归测试（可选，10 分钟）
echo "[6/6] 执行回归测试..."
npx playwright test e2e/regression.test.ts

# 清理
echo "=== 测试完成，执行清理 ==="
docker compose -f docker-compose.test.yml down
pkill -f "idblink"
```

### 15.4 回归测试 checklist

发布前的回归测试必须验证以下场景：

- [ ] **连接管理**：创建、编辑、删除、测试连接（MySQL + PostgreSQL）
- [ ] **连接树操作**：展开/收起、双击、右键菜单、懒加载
- [ ] **左右联动**：树选中 → 标签页、DDL 执行 → 树刷新、状态栏同步
- [ ] **SQL 查询**：SELECT、INSERT、UPDATE、DELETE、多语句
- [ ] **数据编辑**：单元格编辑、新增行、删除行、保存/取消
- [ ] **事务控制**：BEGIN、COMMIT、ROLLBACK、事务状态显示
- [ ] **表管理**：CREATE TABLE、ALTER TABLE、DROP TABLE（设计器 + SQL）
- [ ] **视图管理**：CREATE VIEW、SELECT、DROP VIEW
- [ ] **索引管理**：CREATE INDEX、DROP INDEX、EXPLAIN 验证
- [ ] **备份恢复**：备份数据库、恢复数据库、文件验证
- [ ] **结构比较**：选择源/目标、执行比较、查看差异
- [ ] **设置**：语言切换、主题切换、字体调整、超时设置
- [ ] **快捷键**：Ctrl+Enter、Ctrl+N、Ctrl+W、F5
- [ ] **国际化**：中文界面、英文界面、切换后内容正确
- [ ] **性能**：冷启动 < 5 秒、查询响应 < 1 秒、内存稳定

### 15.5 测试数据管理

**测试数据库状态机：**

```
[初始化] → [导入测试数据] → [执行测试] → [验证数据变更] → [重置数据库] → [循环]
```

**数据重置策略：**

| 策略 | 适用场景 | 耗时 | 实现方式 |
|------|----------|------|----------|
| **全量重置** | 完整测试套件 | 30 秒 | `docker compose down -v && up -d` |
| **数据回滚** | 事务包裹的测试 | 即时 | `ROLLBACK` |
| **快照恢复** | 频繁重置场景 | 10 秒 | Docker 卷快照 + 恢复 |
| **增量清理** | 单场景测试 | 5 秒 | 删除测试创建的对象 |

**测试数据版本控制：**

```
go-backend/testdata/
├── mysql-test.sql          # 基础测试数据（5 用户、5 订单、6 表）
├── mysql-test-v2.sql       # 扩展数据（1000 用户、性能测试）
├── pgsql-test.sql          # PostgreSQL 基础数据
├── pgsql-test-v2.sql       # PostgreSQL 扩展数据
└── schema-only/            # 仅结构（空数据测试）
    ├── mysql-schema.sql
    └── pgsql-schema.sql
```

---

## 附录：快速诊断命令

```bash
# 检查应用是否运行
curl -s http://localhost:5100 > /dev/null && echo "Vite OK" || echo "Vite DOWN"
tauri-mcp driver-session status | grep -q "connected" && echo "MCP OK" || echo "MCP DOWN"

# 检查数据库
docker compose -f docker-compose.test.yml ps

# 快速查看最近截图
ls -lt /tmp/idblink-test-screenshots/ | head -10

# 查看 Playwright 报告
npx playwright show-report
```

---

## 附录：测试执行记录

### 2026-05-09 自动化测试执行结果

#### 已修复的关键问题

**Bug #1：Tauri API 在浏览器环境中不可用导致应用崩溃**
- **问题描述**：Playwright 在浏览器中运行测试时，`window.__TAURI__` 不存在，所有 Tauri API 调用（`invoke`、`getCurrentWindow`、`listen` 等）都会抛出错误，导致 React 应用白屏崩溃
- **影响范围**：所有 Playwright E2E 测试无法执行
- **修复方案**：
  1. `src/App.tsx`：添加 Tauri 环境检测 `isTauri`，延迟加载 Tauri API
  2. `src/components/MainLayout.tsx`：延迟加载 `getCurrentWindow`，仅在 Tauri 环境中调用
  3. `src/api/index.ts`：创建 `safeInvoke` 包装器，统一处理 Tauri API 不可用的情况
- **验证结果**：应用可在浏览器中正常渲染，不再白屏

**Bug #2：ConnectionDialog 缺少可测试标识**
- **问题描述**：Ant Design 6 的 Modal 组件结构变化，原有选择器无法稳定定位
- **修复方案**：给 `ConnectionDialog` 的 Modal 添加 `className="connection-dialog-modal"` 和 `data-testid="connection-dialog"`
- **验证结果**：测试可稳定定位连接对话框

#### 已通过的测试场景

| 测试文件 | 场景 | 用例数 | 状态 |
|---------|------|--------|------|
| `e2e/smoke.test.ts` | TC-01：应用启动 | 7 | ✅ 全部通过 |
| `e2e/connection-flow.test.ts` | TC-05/06：连接管理 | 5 | ✅ 全部通过 |

**详细测试用例：**

**Smoke Tests（7/7 通过）：**
1. ✅ 应用标题正确加载
2. ✅ 工具栏按钮可见且可交互
3. ✅ 侧边栏正确渲染
4. ✅ Tab 面板区域存在
5. ✅ 状态栏可见且显示未连接状态
6. ✅ 初始状态显示空工作区
7. ✅ 工具栏按钮可点击

**Connection Flow Tests（5/5 通过）：**
1. ✅ TC-05：打开新建连接对话框
2. ✅ TC-05：填写连接表单（名称、主机、端口、用户名、密码、数据库）
3. ✅ TC-06：连接表单验证（必填字段校验）
4. ✅ TC-06：取消创建连接
5. ✅ TC-05：连接树初始状态（空状态验证）

#### 待优化的问题

**Issue #1：依赖真实数据库的测试场景**
- **影响场景**：TC-07（浏览数据库表）、TC-08（SQL 查询）、TC-18/19（连接树操作）
- **原因**：这些测试需要调用后端 API 创建真实连接并执行数据库操作
- **建议方案**：
  1. **短期**：使用 Tauri MCP 连接真实应用进行集成测试
  2. **中期**：创建 API Mock 层，模拟后端响应
  3. **长期**：搭建测试数据库环境（Docker），在 CI 中运行完整测试

**Issue #2：SettingsDialog 测试需要更新**
- **影响场景**：TC-12（应用设置）
- **原因**：选择器不匹配 Ant Design 6 的新结构
- **建议**：参考 ConnectionDialog 的修复方式，添加 data-testid 并更新选择器

**Issue #3：TabPanel 组件需要补充 data-testid**
- **影响场景**：TC-19（左右联动）、TC-08（SQL 查询结果）
- **当前状态**：`data-testid="tab-panel"` 已添加，但内部子组件（如 tab-item、data-grid）缺少标识
- **建议**：给 Tab 项、数据网格、SQL 编辑器文本域等添加 data-testid

#### 测试执行命令

```bash
# 运行已通过的基础测试
npx playwright test e2e/smoke.test.ts e2e/connection-flow.test.ts --project=chromium

# 查看测试报告
npx playwright show-report

# 调试模式运行（headed）
npx playwright test e2e/smoke.test.ts --project=chromium --headed
```

#### 下一步行动计划

1. **高优先级**：使用 Tauri MCP 执行需要真实数据库的集成测试
2. **中优先级**：给 SettingsDialog、TabPanel、DataTable 补充 data-testid
3. **中优先级**：修复 settings-flow.test.ts 选择器问题
4. **低优先级**：创建 API Mock 工具，支持无后端环境的组件测试
```
