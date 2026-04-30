# iDBLink 开发计划

> **版本**: v2.8 | **更新日期**: 2026-04-30
>
> 本文档基于 `ui-improvements-vs-navicat.md` v2.1 整理，列出已实现功能、进行中的功能和待办任务。

---

## 一、本轮迭代完成（v2.8，2026-04-30）

本轮共完成 **1 项功能**，涵盖 P2 优先级。

### 1.1 Ctrl+Z 撤销单元格修改（P2 → ✅）
- **undoLastCellEdit 函数**：新建撤销单元格编辑函数，移除 pendingChanges 中的最后一条更新。
- **键盘事件监听**：在 handleKeyDown 中添加 Ctrl+Z 支持，调用 undoLastCellEdit。
- **输入框保护**：避免在输入框中触发 Ctrl+Z 撤销。
- **用户反馈**：撤销成功时显示成功消息，无内容可撤销时显示提示。

---

## 二、上一轮完成（v2.7，2026-04-30）

上一轮共完成 **5 项功能**，涵盖 P0/P1/P2 各优先级。

### 2.1 SQL 内容持久化（P0 → ✅）
### 2.2 状态栏增强（P1 → ✅）
### 2.3 getServerInfo API（P1 → ✅）
### 2.4 获取建表语句 getTableDDL（P2 → ✅）
### 2.5 触发器/事件管理（P2 → ✅）

---

## 三、上一轮完成（v2.1，2026-04-28）

本轮共完成 **14 项功能**，涵盖 P0/P1/P2 各优先级。

### 1.1 事务控制（P1 → ✅）
- **Go 后端**：`Manager` 增加事务状态管理（`txMap`），新增 `BeginTransaction`/`CommitTransaction`/`RollbackTransaction`/`HasTransaction`；所有查询/DDL 在有活跃事务时自动使用 `tx` 执行（通过 `db.Executor` 接口统一 `*sql.DB` / `*sql.Tx`）。
- **Rust 后端**：新增 4 个 Tauri 命令转发到 Go Sidecar。
- **前端**：`SQLEditor` 工具栏新增「开始事务」「提交」「回滚」按钮，事务状态与 UI 同步。

### 1.2 SQL 编辑器增强（P1 → ✅）
- **注释/取消注释**：工具栏新增「注释」按钮，调用 Monaco 原生 `editor.action.commentLine`（等同 `Ctrl+/`）。
- **大小写转换**：工具栏新增「大小写」下拉按钮，支持「转大写」「转小写」，通过 `executeEdits` 替换选中文本。

### 1.3 单元格大文本编辑器（P1 → ✅）
- `DataTable` 中双击 TEXT/BLOB/LONGTEXT/MEDIUMTEXT/BYTEA/CLOB 等类型的单元格时，弹出 Modal 大文本编辑框（`Input.TextArea` 12 行）。
- 确认后自动标记行为 modified 并加入 pending changes。

### 1.4 列头筛选（P2 → ✅）
- 新建 `ColumnFilterHeader` 自定义 AG Grid Header Component。
- 每个列头右侧显示筛选图标，点击弹出 Popover，显示该列从当前 `rowData` 中提取的去重值列表（带搜索框）。
- 支持多选勾选，确定后通过 AG Grid `setFilterModel` 应用筛选。

### 1.5 ER 图节点展示列详情（P2 → ✅）
- 创建自定义 `TableNode` 组件（React Flow custom node）。
- 每个表节点显示：表名标题栏 + 列列表（列名、类型、PK 金色钥匙图标/FK 蓝色链接图标）。
- 节点高度根据列数量自适应，布局算法按高度动态计算网格位置避免重叠。

### 1.6 窗口标题动态更新（P2 → ✅）
- `TabPanel` 新增 `onActiveTabChange` 回调和 `getActiveTabInfo()` ref 方法。
- `MainLayout` 监听活跃 Tab 变化，动态更新窗口标题：`连接名 > 数据库 > 表名 - iDBLink`。
- 同时更新 `document.title` 和 Tauri 原生窗口标题。

### 1.7 导出到 Excel(xlsx)（P2 → ✅）
- 安装 `xlsx` (SheetJS) 库，新建 `src/utils/exportUtils.ts` 统一封装导出。
- `DataTable` 和 `ResultGrid` 导出下拉菜单均新增「导出 Excel (.xlsx)」选项。

### 1.8 导入向导前端（P1 → ✅）
- 新建 `ImportWizard` 三步导入向导组件（选择文件 → 字段映射 → 确认导入）。
- 支持 CSV/Excel/JSON 拖拽上传，自动匹配同名字段，手动下拉选择目标列。
- 导入模式：追加(INSERT)、替换(TRUNCATE+INSERT)、更新(UPDATE by PK)。
- `DataTable` toolbar 新增「导入」按钮。

### 1.9 其他已完成的功能（本轮之前）
- 表设计器 ALTER 模式、保存执行 DDL
- 右键菜单危险操作实际执行（truncate/drop table/drop view）
- 存储过程/函数详情查看
- 大数据结果集上限配置
- 标签页拖拽排序
- 工作区记忆（sidebar/tab 恢复）
- SQL 代码格式化（sql-formatter）
- 结果集导出（CSV/JSON）
- DataTable dirty-state UX（黄色状态栏、待处理更改统计）
- 系统数据库置灰、连接状态指示增强

---

## 二、进行中的功能

*当前无进行中功能，所有已认领任务均已完成。*

---

## 三、待办任务（按优先级排序）

### 🔴 P0 - 必须实现（阻塞日常使用）

*当前暂无 P0 阻塞项。*

### 🟠 P1 - 重要功能（显著提升体验）

| # | 功能 | 说明 | 预估工作量 | 依赖 |
|---|------|------|-----------|------|
| ~~1~~ | ~~**标签页浮动窗口**~~ | ~~拖拽 Tab 脱离为独立窗口（Tauri 多窗口 API `Window` + `WebviewWindow`）~~ | ~~2-3 天~~ | ~~Tauri v2 多窗口~~ | ✅ 已完成 (v2.6)，基础实现，支持创建独立窗口 |
| 2 | **SQL 参数提示** | Monaco Signature Help，函数参数提示（需注册 `signatureHelpProvider`） | 1-2 天 | Monaco API |
| ~~3~~ | ~~**代码片段系统**~~ | ~~内置常用查询模板（创建表、分页查询等），支持用户自定义，基于 localStorage~~ | ~~1-2 天~~ | ~~无~~ | ✅ 已完成 (v2.3)，存储在后端 SQLite |
| ~~4~~ | ~~**SQL 内容持久化**~~ | ~~重启后恢复 SQL 编辑器中的文本内容（workspaceStore 扩展）~~ | ~~0.5 天~~ | ~~workspaceStore~~ | ✅ 已完成 (v2.2) |
| ~~5~~ | ~~**状态栏丰富信息**~~ | ~~显示数据库版本、字符集、事务状态、行数统计、执行时间~~ | ~~1-2 天~~ | ~~后端 API~~ | ✅ 已完成 (v2.2) |
| ~~6~~ | ~~**智能补全增强**~~ | ~~Schema/数据库前缀补全（`db.table.column`）~~ | ~~1 天~~ | ~~Monaco 补全~~ | ✅ 已完成 (v2.4) |
| ~~7~~ | ~~**流式导出完整表**~~ | ~~不带 LIMIT 的流式导出（后端分批查询+前端流式写入）~~ | ~~2 天~~ | ~~后端 API~~ | ✅ 已完成 (v2.5)，当前实现为移除 LIMIT 限制 |

### 🟡 P2 - 体验优化（锦上添花）

| # | 功能 | 说明 | 预估工作量 |
|---|------|------|-----------|
| ~~16~~ | ~~**Ctrl+Z 撤销单元格修改**~~ | ~~DataTable 支持 Ctrl+Z 撤销最后一次单元格编辑~~ | ~~1 天~~ | ✅ 已完成 (v2.8)，支持 Ctrl+Z 撤销单元格编辑 |
| 8 | **快捷键冲突检测** | 配置快捷键时检测冲突，支持单键恢复默认 | 1 天 |
| 10 | **命令行终端 Tab** | 内建数据库原生命令行终端（如 mysql.exe/psql） | 2-3 天 |
| 11 | **数据同步/结构同步** | 对比两个数据库/表的结构或数据差异，生成同步脚本 | 3-5 天 |
| 12 | **备份恢复向导** | 数据库级 SQL 备份（导出所有表结构和数据）、恢复 | 2-3 天 |
| 13 | **数据库迁移工具** | 跨数据库类型迁移（如 MySQL → PostgreSQL），自动类型映射 | 5-7 天 |
| 14 | **导出 TXT/XML/Markdown** | 扩展导出格式支持 | 0.5 天 |
| 15 | **每页行数选择器** | DataTable 分页栏增加 10/50/100/500/1000/全部 选择 | 0.5 天 |
| 16 | **Ctrl+Z 撤销单元格修改** | DataTable 支持 Ctrl+Z 撤销最后一次单元格编辑 | 1 天 |
| ~~17~~ | ~~**触发器/事件节点**~~ | ~~连接树中增加触发器(Trigger)和事件(Event)对象类型节点~~ | ~~1-2 天~~ | ✅ 后端 API 已完成 (v2.2)，前端集成待做 |
| 18 | **表维护子菜单** | 右键菜单增加优化(OPTIMIZE)/修复(REPAIR)/分析(ANALYZE) | 1 天 |
| ~~~~ | ~~**获取建表语句**~~ | ~~获取完整建表语句~~ | ~~1 天~~ | ✅ 已完成 (v2.2) |

---

## 四、技术债务

| 项目 | 说明 | 优先级 |
|------|------|--------|
| **组件拆分** | DataTable.tsx (~2300 行)、SQLEditor.tsx (~1800 行)、MainLayout.tsx (~1100 行) 需要拆分 | 中 |
| **SQL 注入防护** | `ImportWizard` 和 `DataTable` 中的动态 SQL 拼接需使用参数化查询替代字符串拼接 | 高 |
| **类型安全** | 部分 `any` 类型（如 AG Grid 事件参数）需要替换为具体类型 | 低 |
| **测试覆盖** | 零测试覆盖，需添加单元测试和 E2E 测试 | 高 |
| **代码格式化** | 项目无 ESLint/Prettier 配置，建议添加 | 低 |

---

## 五、后端 API 待补充

| 接口 | 用途 | 优先级 |
|------|------|------|
| ~~`getTriggers(connectionId, database)`~~ | ~~获取触发器列表~~ | ~~P1~~ | ✅ 已完成 (v2.2) |
| ~~`getEvents(connectionId, database)`~~ | ~~获取事件列表（MySQL）~~ | ~~P2~~ | ✅ 已完成 (v2.2) |
| ~~`getTableDDL(connectionId, tableName, database)`~~ | ~~获取完整建表语句~~ | ~~P1~~ | ✅ 已完成 (v2.2) |
| ~~`getServerInfo(connectionId)`~~ | ~~获取服务器版本、字符集等信息（用于状态栏）~~ | ~~P1~~ | ✅ 已完成 (v2.2) |
| `copyTable(connectionId, sourceTable, targetTable, withData, database)` | 复制表 | P2 |
| `optimizeTable / analyzeTable / repairTable` | 表维护操作 | P2 |
| `exportTable(connectionId, tableName, format, options, database)` | 流式导出完整表 | P1 |
| `exportQueryResult(connectionId, sql, format, options, database)` | 导出查询结果 | P1 |

---

## 六、开发约定

1. **修改代码前先阅读相关文件**，不确定时先问，不要猜测。
2. **每次只做最小必要的修改**。
3. **代码注释用中文**。
4. **TypeScript / Go / Rust 全部编译通过后再提交**。
5. **更新 AGENTS.md 或本文档**时，同步更新相关章节。
6. **新增组件**优先放在 `src/components/` 下，大组件拆分子目录（如 `DataTable/`）。
7. **新增工具函数**优先放在 `src/utils/` 下。
8. **后端 API 变更**需同步更新：Go 路由 → Rust 命令 → 前端 `api/index.ts`。

---

*文档版本: v2.1*  
*更新日期: 2026-04-28*
