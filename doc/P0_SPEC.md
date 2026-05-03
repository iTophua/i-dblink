# P0 — 体验修复详细规格

> **目标**: 消除用户点击后看到「功能开发中」的负面体验，补全可复用现有组件的视图浏览功能  
> **预估总时间**: ~14 小时

---

## P0-1: 禁用/隐藏未实现菜单项

**优先级**: 🔴 最高  
**预估**: 2 小时  
**涉及文件**:
- `src/components/ConnectionTree/EnhancedConnectionTree.tsx`
- `src/components/TabPanel/index.tsx`
- `src/components/MainLayout.tsx`

### 现状问题

用户点击菜单项后收到 `message.info('功能开发中...')` 提示，体验差。应直接禁用这些菜单项并显示 Tooltip "即将推出"。

### 实现规格

#### 1. EnhancedConnectionTree.tsx — 数据库右键菜单 (line ~612-645)

当前 `getDatabaseMenu` 中以下项点击后显示"功能开发中":
- `dump-structure` → 转储 SQL 文件 → 仅结构
- `dump-full` → 转储 SQL 文件 → 结构和数据
- `run-sql-file` → 运行 SQL 文件
- `db-properties` → 数据库属性

**改为**: 这些菜单项添加 `disabled: true`，点击时不再弹出 message:

```typescript
// 修改前
{ key: 'dump-structure', label: '转储 SQL 文件 → 仅结构' },
{ key: 'dump-full', label: '转储 SQL 文件 → 结构和数据' },
{ type: 'divider' },
{ key: 'run-sql-file', label: '运行 SQL 文件' },
{ type: 'divider' },
{ key: 'db-properties', label: '数据库属性' },

// 修改后
{ key: 'dump-structure', label: '转储 SQL 文件 → 仅结构', disabled: true },
{ key: 'dump-full', label: '转储 SQL 文件 → 结构和数据', disabled: true },
{ type: 'divider' },
{ key: 'run-sql-file', label: '运行 SQL 文件', disabled: true },
{ type: 'divider' },
{ key: 'db-properties', label: '数据库属性', disabled: true },
```

同时在 `onClick` 中**移除** `else { message.info('功能开发中...') }` 分支（line ~641），因为 disabled 项不会触发 onClick。

#### 2. EnhancedConnectionTree.tsx — 表右键菜单 (line ~649-741)

当前 `getTableMenu` 中以下项点击后显示"功能开发中":
- `copy-table` → 复制表 → 仅结构
- `copy-table-data` → 复制表 → 结构和数据
- `dump-table` → 转储 SQL 文件
- `import-csv` → 导入 CSV (连接树中的)
- `export-csv` → 导出 CSV (连接树中的)

**改为**: 添加 `disabled: true`

```typescript
{ key: 'copy-table', label: '复制表 → 仅结构', disabled: true },
{ key: 'copy-table-data', label: '复制表 → 结构和数据', disabled: true },
{ type: 'divider' },
// ... truncate/drop 保持可用
{ type: 'divider' },
{ key: 'dump-table', label: '转储 SQL 文件', disabled: true },
{ key: 'import-csv', label: '导入 CSV', disabled: true },
{ key: 'export-csv', label: '导出 CSV', disabled: true },
```

同时移除 `onClick` 中的 `else { message.info('功能开发中...') }` 分支。

#### 3. EnhancedConnectionTree.tsx — 视图菜单 (line ~743-781)

**特殊处理**: "打开视图" 和 "设计视图" 不禁用，改为实现功能（见 P0-2/P0-3）。其余项禁用:

```typescript
{ key: 'rename-view', label: '重命名视图', disabled: true },
// ...
{ key: 'view-dependencies', label: '查看依赖关系', disabled: true },
{ key: 'view-properties', label: '属性', disabled: true },
```

#### 4. EnhancedConnectionTree.tsx — 空白状态 (line ~1879)

```typescript
// 修改前
onClick: () => message.info('导入功能开发中...'),

// 修改后 — 暂时隐藏该按钮
// 删除 secondaryAction 或设置 disabled
secondaryAction={{
  label: '导入连接',
  onClick: () => {},  // 留空但不禁用按钮，后续实现
  icon: <FolderOutlined />,
  disabled: true,  // 如果 EnhancedEmptyState 支持 disabled 属性
}}
```

如果 `EnhancedEmptyState` 组件不支持 disabled，则暂时移除 `secondaryAction`。

#### 5. TabPanel/index.tsx — TableList 回调 (line ~886-890)

```typescript
// 修改前
onTableCopy={(tableName) => {
  message.info('复制表功能开发中...');
}}
onTableDump={(tableName) => {
  message.info('转储SQL功能开发中...');
}}

// 修改后: 这些回调不会被触发（TableList 中相应菜单项应禁用）
// 但为安全起见，可以保留但改为更友好的提示:
onTableCopy={(tableName) => {
  message.warning('复制表功能即将推出');
}}
onTableDump={(tableName) => {
  message.warning('转储 SQL 功能即将推出');
}}
```

#### 6. MainLayout.tsx — 工具菜单 (line ~965-969)

当前 `data-sync`/`backup`/`restore`/`model-designer` 仅 console.log。

**方案 A（推荐）**: 在 `Toolbar/index.tsx` 中将这些菜单项设为 disabled:

```typescript
// toolsMenuItems 中
{ key: 'data-sync', icon: <SyncOutlined />, label: '数据同步... (S)', disabled: true },
{ key: 'backup', icon: <DatabaseOutlined />, label: '备份数据库... (B)', disabled: true },
{ key: 'restore', icon: <DatabaseOutlined />, label: '恢复数据库... (R)', disabled: true },
{ type: 'divider' },
{ key: 'model-designer', label: '模型设计器... (M)', disabled: true },
```

**方案 B**: 保留可点击但显示一个更友好的 Modal 提示（不推荐，因为会造成期望落差）。

### 验收标准

- [x] 点击任何连接树右键菜单项不再出现「功能开发中」提示
- [x] 未实现的菜单项显示为灰色/disabled 状态
- [x] 已实现的菜单项（打开表、设计表、清空、删除、维护、新建查询、断开连接、编辑、复制连接配置）仍然正常工作
- [x] 运行 `pnpm lint` 和 `pnpm exec tsc --noEmit` 无错误

---

## P0-2: 视图数据浏览

**优先级**: 🔴 高  
**预估**: 4 小时  
**涉及文件**:
- `src/components/ConnectionTree/EnhancedConnectionTree.tsx`
- `src/components/MainLayout.tsx`
- `src/components/TabPanel/index.tsx`

### 现状问题

右键视图菜单的"打开视图（浏览数据）"和"设计视图"返回 `message.info('视图功能开发中...')`。但实际上视图的数据浏览可以完全复用 `DataTable` 组件，因为 `SELECT * FROM view_name` 和 `SELECT * FROM table_name` 在 API 层面没有区别。

### 实现规格

#### 1. EnhancedConnectionTree.tsx — getViewMenu 修改

将视图的 `onTableOpen` 和 `onOpenDesigner` 传入 getViewMenu:

```typescript
const getViewMenu = useCallback(
  (connId: string, viewName: string, database?: string): MenuProps => ({
    items: [
      { key: 'open-view', label: '打开视图（浏览数据）' },        // ← 可用
      { key: 'design-view', label: '设计视图' },                  // → P0-3
      { type: 'divider' },
      { key: 'rename-view', label: '重命名视图', disabled: true },
      { key: 'drop-view', label: '删除视图', danger: true },
      { type: 'divider' },
      { key: 'view-dependencies', label: '查看依赖关系', disabled: true },
      { key: 'view-properties', label: '属性', disabled: true },
    ],
    onClick: async ({ key }) => {
      if (key === 'open-view') {
        // 直接调用 onTableOpen，DataTable 对视图完全兼容
        onTableOpen(viewName, database);
      } else if (key === 'design-view') {
        // P0-3 实现
        onOpenDesigner?.(viewName, database);
      } else if (key === 'drop-view') {
        // 已有实现，保持不变
        Modal.confirm({ ... });
      }
      // 移除 else { message.info(...) } 分支
    },
  }),
  [onTableOpen, onOpenDesigner, onDatabaseRefresh]
);
```

#### 2. ViewNode 双击行为

当前 `ViewNode` 的双击已经调用 `onTableOpen`，所以双击视图节点已经可以打开数据。但需要确认 `onTableOpen` 在处理视图时不做表名验证。

**检查**: `MainLayout.tsx` 中 `handleTableOpen` 方法是否对视图有效。视图打开后应该建立 `connectionDatabases` 中对应数据库的 `tables` 中包含该视图（因为 `getTablesCategorized` API 返回的 `views` 数组已经在连接树中展示）。

#### 3. Tab 中显示视图标识

在 `TabPanel/index.tsx` 中，视图打开的数据标签页需要显示视图图标而非表图标:

```typescript
// 在 openedTables 的数据结构中增加 isView 字段
interface OpenedTable {
  name: string;
  connectionId: string;
  connectionName: string;
  database?: string;
  isDirty?: boolean;
  isView?: boolean;  // ← 新增
}
```

在标签页渲染中:
```typescript
{table.isView ? <EyeOutlined /> : <TableOutlined />}
```

### 验收标准

- [x] 右键视图 → "打开视图（浏览数据）" 能正常打开数据标签页
- [x] 双击视图节点能打开数据标签页
- [x] 视图数据标签页显示 `EyeOutlined` 图标而非 `TableOutlined`
- [x] 视图数据支持分页、排序、筛选（继承 DataTable 全部功能）

---

## P0-3: 视图定义查看

**优先级**: 🟡 中  
**预估**: 3 小时  
**涉及文件**:
- `src/components/ConnectionTree/EnhancedConnectionTree.tsx`
- `src/components/TabPanel/index.tsx`
- `src/components/MainLayout.tsx`
- 新建 `src/components/ViewDefinition.tsx`

### 现状问题

视图的"设计视图"功能未实现。应该展示 `CREATE VIEW` 语句（类似 Navicat 的视图设计器信息标签页）。

### 实现规格

#### 1. 后端 API — 已存在

`api.getTableDDL` 已支持视图的 DDL 获取:
```typescript
// api/index.ts line 220-222
async getTableDDL(connectionId: string, tableName: string, database?: string): Promise<string[]> {
  return await invoke('get_table_ddl', { connectionId, table_name: tableName, database });
}
```

Go 后端 `go-backend/api/getddl.go` 应该已经支持视图的 DDL。需要确认。

#### 2. 新建 ViewDefinition 组件

创建 `src/components/ViewDefinition.tsx`:

```typescript
interface ViewDefinitionProps {
  connectionId: string;
  viewName: string;
  database?: string;
}
```

功能:
- 调用 `api.getTableDDL(connectionId, viewName, database)` 获取 CREATE VIEW 语句
- 在只读 Monaco Editor 中显示 DDL
- 显示视图的列信息 (`api.getColumns`)

#### 3. 集成到 TabPanel

在 `TabPanel` 中增加视图定义标签页类型:

```typescript
interface OpenedViewDefTab {
  key: string;
  title: string;
  connectionId: string;
  database?: string;
  viewName: string;
}
```

#### 4. 连接树触发

在 `EnhancedConnectionTree` 的 `getViewMenu` 中，`design-view` 菜单项打开视图定义标签页。

### 验收标准

- [x] 右键视图 → "设计视图" 打开视图定义标签页
- [x] 标签页显示 `CREATE VIEW ... AS SELECT ...` DDL
- [x] 标签页显示视图的列信息
- [x] 连接双击视图节点和设计视图都能正常工作

---

## P0-4: 状态栏增强

**优先级**: 🟡 中  
**预估**: 2 小时  
**涉及文件**:
- `src/components/StatusBar/index.tsx`
- `src/components/MainLayout.tsx`
- `src/stores/appStore.ts` (可能需要添加事务开始时间)

### 现状问题

状态栏显示: 连接名、表名、数据库类型、版本号、事务状态、行数、耗时、字符集。

缺少:
1. 事务持续时间（仅显示"事务中"标签，不显示已开多长时间）
2. 查询进度的视觉反馈（正在查询时无动画）
3. 当前数据库显式标识

### 实现规格

#### 1. 事务持续时间

在 `appStore.ts` 中记录事务开始时间:

```typescript
// 在 AppState 中增加
transactionStartTime: number | null; // 事务开始的时间戳

// beginTransaction 成功后设置
setTransactionStartTime: (time: number | null) => void;
```

在 `StatusBar` 中增加计时器:

```typescript
const [txDuration, setTxDuration] = useState<number>(0);

useEffect(() => {
  if (!transactionActive || !transactionStartTime) {
    setTxDuration(0);
    return;
  }
  const timer = setInterval(() => {
    setTxDuration(Math.floor((Date.now() - transactionStartTime) / 1000));
  }, 1000);
  return () => clearInterval(timer);
}, [transactionActive, transactionStartTime]);

// 渲染
{transactionActive && (
  <Tag color="orange">
    事务中 {txDuration > 0 ? `${txDuration}s` : ''}
  </Tag>
)}
```

#### 2. 查询中指示器

在 StatusBar 中增加查询进行中的脉冲动画:

```typescript
{isQuerying && (
  <Tag color="processing" style={{ animation: 'pulse 1s infinite' }}>
    查询中...
  </Tag>
)}
```

需要在 `MainLayout.tsx` 中将查询状态传递给 StatusBar。

#### 3. 当前数据库标识

已有 `selectedDatabase` prop，只需确保显示:

```typescript
{selectedDatabase && (
  <Text style={{ fontSize: 11 }}>
    数据库：{selectedDatabase}
  </Text>
)}
```

### 验收标准

- [x] 开启事务后，状态栏显示"事务中 Xs"并实时更新
- [x] 查询执行中，状态栏显示"查询中..."动画
- [x] 当前数据库名显示在状态栏中

---

## P0-5: TableDesigner 保存到数据库

**优先级**: 🟡 中  
**预估**: 3 小时  
**涉及文件**:
- `src/components/TableDesigner/index.tsx`

### 现状问题

`TableDesigner` 组件在 `generateCreateTableSQL` 和 `generateAlterTableSQL` 中生成了正确的 DDL，但"保存"按钮仅调用 `onSave(sql)` 回调，而该回调在 `TabPanel` 中**未连接到实际执行逻辑**。

### 实现规格

#### 1. 修改 TableDesigner 的 onSave 回调

当前 `TableDesigner` 的 `onSave` 传递生成的 SQL 字符串。需要在父组件中将 SQL 通过 `api.executeDDL` 发送到后端。

#### 2. TabPanel 中的集成

在 `TabPanel/index.tsx` 中创建表设计器标签页时：

```typescript
<TableDesigner
  connectionId={tab.connectionId}
  database={tab.database}
  tableName={tab.tableName}
  onSave={async (sql: string) => {
    try {
      // 分号分割，逐条执行
      const statements = sql.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        if (stmt.trim()) {
          await api.executeDDL(tab.connectionId, stmt.trim(), tab.database);
        }
      }
      message.success(isEditMode ? '表结构已更新' : '表已创建');
      // 刷新连接树
      window.dispatchEvent(new CustomEvent('refresh-connection-tree', {
        detail: { connectionId: tab.connectionId }
      }));
    } catch (err: any) {
      message.error(`执行失败：${err.message || err}`);
    }
  }}
  onCancel={() => handleCloseTab(tab.key)}
/>
```

#### 3. 修复 escapeIdentifier

当前 `TableDesigner/index.tsx` 中的 `escapeIdentifier` 只使用 MySQL 反引号:

```typescript
function escapeIdentifier(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}
```

需要替换为根据数据库类型选择引号（与 `DataTable.tsx` 中的实现一致）:

```typescript
function escapeIdentifier(name: string, dbType?: string): string {
  const { open, close } = (() => {
    switch (dbType) {
      case 'postgresql':
      case 'kingbase':
      case 'highgo':
      case 'vastbase':
      case 'oracle':
      case 'dameng':
        return { open: '"', close: '"' };
      case 'sqlserver':
        return { open: '[', close: ']' };
      default:
        return { open: '`', close: '`' };
    }
  })();
  const escapeQuote = (n: string): string => {
    // ... 各数据库的引号转义
  };
  return `${open}${escapeQuote(name)}${close}`;
}
```

**重要**: 需要将 `dbType` prop 传入 `TableDesigner`，可通过 `useAppStore` 获取当前连接的 db_type。

#### 4. PostgreSQL/SQLite 的 CREATE TABLE 语法差异

当前生成的 SQL 包含 `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`，这是 MySQL 专有语法。需要根据 db_type 条件生成:

```typescript
function generateCreateTableSQL(tableName: string, columns: ..., indexes: ..., foreignKeys: ..., dbType?: string): string {
  // ... 列和约束定义
  
  // MySQL 特有后缀
  const tableSuffix = dbType === 'mysql' || dbType === 'mariadb' 
    ? '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;' 
    : '\n);';
  
  return `CREATE TABLE ... (\n${parts.join(',\n')}${tableSuffix}`;
}
```

同理 `COMMENT '注释'` 语法也只有 MySQL 支持。

### 验收标准

- [x] 新建表模式下，填写列定义后点击"保存"，DDL 被执行并在数据库中创建表
- [x] 编辑模式下，修改列后点击"保存"，ALTER TABLE 语句被执行
- [x] 连接树自动刷新，显示新创建/修改的表
- [x] 非 MySQL 数据库（PG、SQLite 等）生成的 DDL 语法正确
- [x] 标识符转义根据数据库类型正确选择

---

## P0 验收清单

全部 P0 任务完成后，需确认：

- [x] `pnpm lint` 无错误
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] 所有右键菜单项: 已实现的可用，未实现的 disabled
- [x] 视图可以双击或右键打开数据
- [x] 视图可以右键查看定义
- [x] 状态栏显示事务持续时间
- [x] TableDesigner 保存后数据实际写入数据库
- [x] MySQL/PG/SQLite 各类型数据库的 DDL 生成正确

**P0 全部任务已完成 ✅**