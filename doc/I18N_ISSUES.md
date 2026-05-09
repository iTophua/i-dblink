# iDBLink 国际化 (i18n) 问题分析报告

## 问题 1：命名空间不匹配（最严重，~40 个键）

代码中用 `t('common.xxx')` 访问，翻译文件中实际位于 `common.mainLayout.xxx` → **运行时不渲染**

典型例子（在 DOM 中直接看到 raw key）：

| 代码中的调用 | 翻译文件实际位置 | 表现 |
|-------------|----------------|------|
| `t('common.noConnections')` | `common.mainLayout.noConnections` | 显示 raw key |
| `t('common.searchPlaceholder')` | `common.mainLayout.searchPlaceholder` | 显示 raw key |
| `t('common.connectionPasswordPrompt')` | `common.mainLayout.connectionPasswordPrompt` | 显示 raw key |
| `t('common.connect')` / `disconnected` / `connected` | `common.mainLayout.connect` 等 | 显示 raw key |

**修复方案 A**：代码改为 `t('common.mainLayout.xxx')`（推荐，因为翻译文件有组织）
**修复方案 B**：翻译文件展平，所有键放在 `common` 根下

## 问题 2：翻译文件完全缺失（~288 个键）

代码中使用但 zh-CN 和 en-US 都未定义，按模块分布：

| 模块 | 缺失数量 | 示例 |
|------|---------|------|
| 数据导入导出 | ~25 | `common.importWizard`, `common.exportFormat`, `common.delimiter` |
| 备份恢复 | ~15 | `common.backup`, `common.restore`, `common.backupSuccess` |
| AG Grid 数据网格 | ~20 | `common.filter`, `common.avg`, `common.pinLeft` |
| SQL 编辑器 | ~30 | `common.querySuccess`, `common.transactionStarted`, `common.sqlExecutionFailed` |
| 结果网格 | ~20 | `common.addNewRow`, `common.submit`, `common.noDataReturned` |
| 表结构 / 属性 | ~30 | `common.databaseProperties`, `common.engine`, `common.rowCount` |
| 表操作 | ~20 | `common.copyTable`, `common.dumpSql`, `common.truncateTable` |
| ER 图 | ~10 | `common.erDiagramExported`, `common.filterTable` |
| 连接树 / 欢迎页 | ~15 | `common.connectionTreeEmpty`, `common.noConnection` |
| 连接对话框 | ~20 | `common.sslConfigDescription`, `common.sshTunnelDescription` |
| 表设计器 | ~5 | `common.pleaseEnterTableName` |
| 代码片段 | ~15 | `common.snippets`, `common.category` |
| 其他 | ~60+ | `common.globalSearch`, `common.cellValueCopied` 等 |

## 问题 3：en-US 落后 zh-CN（16 个键）

以下键在 zh-CN 中有翻译但 en-US 缺失：
`common.pressKeys`, `common.pressComboKeys`, `common.pressEnterToConfirm`, `common.pressEscToCancel`, `common.cutLabel`, `common.copyLabel`, `common.pasteLabel`, `common.deleteLabel`, `common.selectAllLabel`, `common.selectFilePlaceholder`, `common.pageSize`, `common.uiLanguage`, `common.tableDesigner`, `common.app.title`, `common.app.untitledQuery`, `common.app.untitledTab`
