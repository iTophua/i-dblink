# P1 — 交互补齐详细规格

> **目标**: 对标 Navicat Premium 核心交互功能，补齐数据操作效率工具  
> **预估总时间**: ~28 小时

---

## P1-1: 结果网格列统计 (SUM/AVG/COUNT/MIN/MAX)

**优先级**: 🟡 中高  
**预估**: 4 小时  
**涉及文件**:
- `src/components/SQLEditor/ResultGrid.tsx`

### 现状

ResultGrid 仅显示查询结果数据，无列统计功能。Navicat 在结果网格底部有统计栏，选中数值列后显示 SUM/AVG/COUNT/MIN/MAX。

### 规格说明

在 `ResultGrid` 组件底部，查询结果数据网格下方添加一行统计栏:

```
| 记录: 1,234 | 选中: 15 | id: SUM=45,678 AVG=37.1 MIN=1 MAX=99 | name: COUNT=1,234 | ...
```

#### 实现细节

1. **数据来源**: 取 `queryResult.rows` 和 `queryResult.columns`
2. **统计算法**:
   - 对于数值类型列 (`number`, `int`, `float`, `decimal`, `double` 等)，计算 SUM/AVG/MIN/MAX
   - 对于所有列，计算 COUNT (非 NULL 行数)
   - NULL 值不计入 SUM/AVG
3. **显示位置**: AG Grid 下方，使用固定高度 (28px) 的 flex 行
4. **视觉设计**:
   ```
   ┌─────────────────────────────────────────────────────┐
   │  ... AG Grid 数据 ...                              │
   ├─────────────────────────────────────────────────────┤
   │ 记录: 1,234 | id: SUM=45,678 AVG=37.1 MIN=1 ... │ ← 新增
   └─────────────────────────────────────────────────────┘
   ```
5. **数字类型判断**:
   ```typescript
   function isNumericColumn(values: unknown[]): boolean {
     const sample = values.filter(v => v !== null && v !== undefined).slice(0, 100);
     if (sample.length === 0) return false;
     return sample.every(v => typeof v === 'number' || !isNaN(Number(v)));
   }
   ```

#### 计算逻辑

```typescript
interface ColumnStats {
  columnName: string;
  count: number;      // 非 NULL 行数
  sum?: number;        // 仅数值列
  avg?: number;        // 仅数值列
  min?: number;        // 仅数值列
  max?: number;        // 仅数值列
  nullCount: number;   // NULL 行数
}

function computeColumnStats(
  columns: string[],
  rows: unknown[][]
): ColumnStats[] {
  return columns.map((col, colIdx) => {
     const values = rows.map(r => r[colIdx]);
     const nonNull = values.filter(v => v !== null && v !== undefined);
     const numericValues = nonNull.map(Number).filter(n => !isNaN(n));
     const isNumeric = numericValues.length > 0 && numericValues.length >= nonNull.length * 0.8;
     
     return {
       columnName: col,
       count: nonNull.length,
       nullCount: values.length - nonNull.length,
       ...(isNumeric ? {
         sum: numericValues.reduce((a, b) => a + b, 0),
         avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
         min: Math.min(...numericValues),
         max: Math.max(...numericValues),
       } : {}),
     };
  });
}
```

#### 渲染

统计栏使用 `flex` 横向排列，每列一个统计标签。数值列显示 SUM/AVG/MIN/MAX，非数值列仅显示 COUNT:

```typescript
<div style={{ 
  height: 28, 
  display: 'flex', 
  alignItems: 'center', 
  padding: '0 12px',
  background: 'var(--background-toolbar)',
  borderTop: '1px solid var(--border-color)',
  gap: 8,
  fontSize: 11, 
  color: 'var(--text-secondary)',
  overflowX: 'auto',
}}>
  <span>记录: {totalRows.toLocaleString()}</span>
  {stats.map(stat => (
    <Tag key={stat.columnName} style={{ margin: 0, fontSize: 10 }}>
      {stat.columnName}: 
      {stat.sum !== undefined && ` SUM=${formatNumber(stat.sum)}`}
      {stat.avg !== undefined && ` AVG=${formatNumber(stat.avg, 2)}`}
      {stat.min !== undefined && ` MIN=${formatNumber(stat.min)}`}
      {stat.max !== undefined && ` MAX=${formatNumber(stat.max)}`}
      {!stat.sum && ` COUNT=${stat.count}`}
    </Tag>
  ))}
</div>
```

#### 性能考虑

- 行数超过 10000 时，采样前 5000 行计算统计值
- 使用 `useMemo` 缓存计算结果
- 大数据集使用 Web Worker 可选

### 验收标准

- [x] SQL 查询结果下方显示统计栏
- [x] 数值列显示 SUM/AVG/MIN/MAX/COUNT
- [x] 非数值列显示 COUNT 和 NULL 计数
- [x] 大数据集 (>10000行) 统计正常，不卡顿
- [x] 无结果时不显示统计栏

---

## P1-2: DataTable 单元格右键增强

**优先级**: 🟡 中  
**预估**: 4 小时  
**涉及文件**:
- `src/components/DataTable.tsx`

### 现状

DataTable 有基本右键菜单（新增行、编辑行、删除行），但缺少 Navicat 中常用的单元格操作。

### 规格说明

在现有右键菜单基础上增加以下项:

| 菜单项 | 快捷键 | 功能 |
|--------|--------|------|
| 复制单元格值 | Ctrl+C | 复制当前单元格文本到剪贴板 |
| 复制为 SQL INSERT | — | 生成 INSERT 语句 |
| 复制为 SQL UPDATE | — | 生成 UPDATE 语句 |
| 设置为 NULL | — | 将选中单元格设为 NULL |
| 按此列筛选 | — | 将该列值设为 WHERE 条件 |
| 按此列升序 | — | 设置 ORDER BY col ASC |
| 按此列降序 | — | 设置 ORDER BY col DESC |

#### 实现

在 `DataTable.tsx` 中现有 `contextMenu` 状态附近增加单元格右键菜单:

```typescript
const [cellContextMenu, setCellContextMenu] = useState<{
  visible: boolean;
  x: number;
  y: number;
  colId: string;
  value: any;
  rowNode: any;
}>({ visible: false, x: 0, y: 0, colId: '', value: null, rowNode: null });
```

AG Grid 的 `onCellContextMenu` 事件:

```typescript
onCellContextMenu={(e) => {
  e.event?.preventDefault();
  setCellContextMenu({
    visible: true,
    x: (e.event as MouseEvent).clientX,
    y: (e.event as MouseEvent).clientY,
    colId: e.column.getColId(),
    value: e.value,
    rowNode: e.node,
  });
}}
```

菜单项内容:

```typescript
const cellMenuItems: MenuProps['items'] = [
  { key: 'copy-value', label: '复制单元格值', icon: <CopyOutlined /> },
  { key: 'copy-insert', label: '复制为 INSERT' },
  { key: 'copy-update', label: '复制为 UPDATE' },
  { type: 'divider' },
  { key: 'set-null', label: '设为 NULL', disabled: !primaryKey /* 无主键时禁用 */ },
  { type: 'divider' },
  { key: 'filter-column', label: '按此列筛选' },
  { key: 'sort-asc', label: '按此列升序 ↑' },
  { key: 'sort-desc', label: '按此列降序 ↓' },
];
```

各菜单项的实现:

- **复制单元格值**: `navigator.clipboard.writeText(String(value))`
- **复制为 INSERT**: 复用 `escapeSqlValue` 和 `escapeIdentifier` 函数
- **复制为 UPDATE**: 需要 `primaryKey` 来确定 WHERE 条件
- **设为 NULL**: 修改单元格值为 null，标记为 modified
- **按此列筛选**: 设置 `whereClause` 为 `colId = 'value'`，调用 `loadData`
- **排序**: 设置 `orderByClause` 并调用 `loadData`

### 验收标准

- [x] 右键单元格显示增强菜单
- [x] "复制单元格值"正确复制到剪贴板
- [x] "复制为 INSERT/UPDATE" 生成正确 SQL
- [x] "按此列筛选" 在数据中筛选
- [x] "按此列升序/降序" 正确排序
- [x] 与现有行级右键菜单互不冲突

---

## P1-3: SQL 错误行高亮

**优先级**: 🟡 中  
**预估**: 3 小时  
**涉及文件**:
- `src/components/SQLEditor.tsx`

### 现状

当 SQL 执行出错时，错误信息显示在结果面板中，但编辑器中无相关标记。Navicat 会在编辑器中高亮错误行。

### 规格说明

#### 1. 错误行号解析

Go 后端返回的错误格式通常为:
- MySQL: `Error 1064: You have an error in your SQL syntax near '...' at line 3`
- PostgreSQL: `ERROR: syntax error at or near "SELEC" at character 10`
- SQLite: `near "SELEC": syntax error`

需要从错误消息中提取行号:

```typescript
function parseErrorLine(errorMsg: string): number | null {
  // MySQL: "at line N"
  const mysqlMatch = errorMsg.match(/at line (\d+)/i);
  if (mysqlMatch) return parseInt(mysqlMatch[1], 10);
  
  // PostgreSQL/SQLite: "LINE N:"
  const pgMatch = errorMsg.match(/LINE (\d+):/i);
  if (pgMatch) return parseInt(pgMatch[1], 10);
  
  // 通用: "line N"
  const genericMatch = errorMsg.match(/line (\d+)/i);
  if (genericMatch) return parseInt(genericMatch[1], 10);
  
  return null;
}
```

#### 2. Monaco Editor 错误标记

使用 `monaco.editor.setModelMarkers` API:

```typescript
// 在 SQLEditor.tsx 中
const editorRef = useRef<any>(null);

const onEditorMount: OnMount = (editor, monaco) => {
  editorRef.current = editor;
  // ... 现有逻辑
};

// 执行查询出错后
const highlightError = useCallback((errorMsg: string, sql: string) => {
  if (!editorRef.current) return;
  const monaco = (window as any).monaco;
  if (!monaco) return;
  
  const errorLine = parseErrorLine(errorMsg);
  if (errorLine === null) return;
  
  const model = editorRef.current.getModel();
  if (!model) return;
  
  monaco.editor.setModelMarkers(model, 'sql-error', [{
    severity: monaco.MarkerSeverity.Error,
    message: errorMsg,
    startLineNumber: errorLine,
    startColumn: 1,
    endLineNumber: errorLine,
    endColumn: model.getLineMaxColumn(errorLine),
  }]);
}, []);

// 成功执行后清除标记
const clearErrorMarkers = useCallback(() => {
  if (!editorRef.current) return;
  const monaco = (window as any).monaco;
  if (!monaco) return;
  
  const model = editorRef.current.getModel();
  if (model) {
    monaco.editor.setModelMarkers(model, 'sql-error', []);
  }
}, []);
```

#### 3. 集成

在查询执行成功时调用 `clearErrorMarkers()`，失败时调用 `highlightError(errorMsg, sql)`。

### 验收标准

- [x] SQL 语法错误时，编辑器错误行显示红色波浪线
- [x] 悬停红色波浪线时显示完整错误信息
- [x] 成功执行后清除错误标记
- [x] MySQL、PostgreSQL、SQLite 三种错误格式都能解析行号

---

## P1-4: 连接树表行数显示

**优先级**: 🟡 中  
**预估**: 3 小时  
**涉及文件**:
- `src/components/ConnectionTree/EnhancedConnectionTree.tsx`
- `src/hooks/useApi.ts`
- Go 后端: `go-backend/api/metadata.go`

### 现状

连接树中表节点仅显示表名，不显示行数。Navicat 在表名旁显示行数。

### 规格说明

#### 1. 后端 — 已支持

`TableInfo` 类型定义中已有 `row_count?: number` 字段:

```typescript
// src/types/api.ts
export interface TableInfo {
  table_name: string;
  table_type: string;
  row_count?: number;  // ← 已有
  comment?: string;
  // ...
}
```

Go 后端 `getTablesCategorized` 中 MySQL 使用 `SHOW TABLE STATUS` 已经返回 `Row_count`，PG 使用 `pg_class.reltuples`。需要确认所有数据库类型都返回了 `row_count`。

#### 2. 前端显示

在 `TableNode` 和 `ViewNode` 组件中，如果 `table.row_count !== undefined`，在表名后显示行数:

```typescript
// TableNode 中
<span style={{ fontSize: 12 }}>{table.table_name}</span>
{table.row_count !== undefined && (
  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>
    ({formatRowCount(table.row_count)})
  </span>
)}
```

#### 3. 行数格式化

```typescript
function formatRowCount(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${(count / 1_000).toFixed(0)}K`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
```

### 验收标准

- [x] 连接树中表名后显示行数（如 `users (15.2K)`）
- [x] 行数超过 10000 时使用 K/M/B 缩写
- [x] 行数为 0 时正常显示 `(0)`
- [x] `row_count` 为 undefined 时不显示行数

---

## P1-5: 触发器节点

**优先级**: 🟡 中  
**预估**: 3 小时  
**涉及文件**:
- `src/components/ConnectionTree/EnhancedConnectionTree.tsx`
- `src/hooks/useApi.ts`
- Go 后端 `triggers.go` (已存在)

### 现状

后端 `api.getTriggers` 已存在且前端 `api/index.ts` 中已封装。但连接树中没有触发器文件夹。

### 规格说明

#### 1. ConnectionDatabases 类型扩展

在 `useApi.ts` 或 `MainLayout.tsx` 中 `connectionDatabases` 的类型增加 `triggers` 字段:

```typescript
interface DatabaseInfo {
  database: string;
  tables: TableInfo[];
  loaded: boolean;
  loadFailed?: boolean;
  procedures?: string[];
  functions?: string[];
  triggers?: TriggerInfo[];  // ← 新增
  routinesLoaded?: boolean;
}
```

#### 2. 触发器类型

```typescript
// src/types/api.ts 新增
export interface TriggerInfo {
  name: string;
  event: string;       // INSERT, UPDATE, DELETE
  timing: string;      // BEFORE, AFTER
  table: string;
}
```

#### 3. 连接树触发器文件夹

在 `EnhancedConnectionTree` 中，跟 `procedures` 和 `functions` 类似的模式，在数据库节点下添加"触发器"文件夹:

```typescript
const triggersFolderKey = `triggers::${connId}::${db.database}`;

const triggersNode = {
  key: triggersFolderKey,
  title: db.routinesLoaded ? (
    <span>
      <ThunderboltOutlined style={{ color: 'var(--color-warning)', fontSize: 12 }} />
      触发器 ({db.triggers?.length || 0})
    </span>
  ) : ...,
  isLeaf: false,
  children: ...
};
```

触发器节点可以双击查看触发器定义（类似存储过程）。

#### 4. 加载触发器数据

在 `useApi.ts` 中的 `loadDatabaseTables` 或类似方法中，同时调用 `api.getTriggers` 加载触发器列表。

### 验收标准

- [x] 连接树数据库节点下显示"触发器"文件夹
- [x] 触发器列表正确加载
- [x] 双击触发器可查看触发器定义
- [x] MySQL 和 PostgreSQL 都能正确显示触发器

---

## P1-6: TableDesigner 数据库类型适配

**优先级**: 🟡 中  
**预估**: 4 小时  
**涉及文件**:
- `src/components/TableDesigner/index.tsx`

### 现状

`TableDesigner` 中的 `COMMON_TYPES` 硬编码了 MySQL 特有的类型列表（如 `MEDIUMTEXT`, `LONGBLOB`, `ENGINE=InnoDB`），对 PG/SQLite 等数据库不适用。

### 规格说明

#### 1. 数据库类型 → 字段类型映射

```typescript
const DB_TYPE_FIELDS: Record<string, string[]> = {
  mysql: [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT',
    'VARCHAR', 'CHAR', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'TINYTEXT',
    'DECIMAL', 'FLOAT', 'DOUBLE',
    'BOOLEAN',
    'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR',
    'JSON', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'BINARY',
    'ENUM', 'SET',
  ],
  postgresql: [
    'SMALLINT', 'INTEGER', 'BIGINT', 'SERIAL', 'BIGSERIAL',
    'VARCHAR', 'CHAR', 'TEXT',
    'DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION',
    'BOOLEAN',
    'DATE', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIME', 'TIMETZ',
    'JSON', 'JSONB', 'UUID',
    'BYTEA', 'INET', 'CIDR', 'MACADDR',
    'ARRAY', 'HSTORE',
  ],
  sqlite: [
    'INTEGER', 'REAL', 'TEXT', 'BLOB', 'NUMERIC', 'BOOLEAN',
    'VARCHAR', 'CHAR', 'DATETIME', 'DATE', 'TIMESTAMP',
  ],
  dameng: [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
    'VARCHAR', 'CHAR', 'TEXT', 'CLOB',
    'DECIMAL', 'NUMBER', 'FLOAT', 'DOUBLE',
    'BOOLEAN',
    'DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE',
    'BLOB', 'CLOB', 'BFILE',
  ],
  kingbase: 'postgresql', // 复用 PG 类型
  highgo: 'postgresql',
  vastbase: 'postgresql',
};
```

#### 2. 修改 TableDesigner 组件

- 通过 `useAppStore` 获取当前连接的 `db_type`
- 根据连接的数据库类型选择对应的字段类型列表
- `generateCreateTableSQL` 根据数据库类型调整后缀语法
- `generateAlterTableSQL` 使用正确的标识符转义

#### 3. 默认值切换

不同数据库的默认值语法不同:
- MySQL: `DEFAULT CURRENT_TIMESTAMP`
- PostgreSQL: `DEFAULT NOW()`
- SQLite: 没有真正的 DEFAULT CURRENT_TIMESTAMP 支持

### 验收标准

- [x] 切换 PostgreSQL 连接后，新建表设计器显示 PG 类型列表
- [x] 切换 SQLite 连接后，显示 SQLite 类型列表
- [x] 生成的 CREATE TABLE DDL 语法与对应数据库兼容
- [x] PG 不生成 `ENGINE=InnoDB`
- [x] PG/SQLite 不生成 `COMMENT` 语法

---

## P1-7: 连接颜色标记

**优先级**: 🟢 低  
**预估**: 3 小时  
**涉及文件**:
- `src/types/api.ts` — ConnectionInput/ConnectionOutput 增加 `color` 字段
- `src/stores/appStore.ts` — Connection 类型增加 `color`
- `src/components/ConnectionDialog.tsx` — 添加颜色选择器
- `src/stores/appStore.ts` — 存储 Rust (需要在 `storage.rs` 中增加 color 字段)
- `src/components/ConnectionTree/EnhancedConnectionTree.tsx` — 显示颜色标记
- `src/components/TabPanel/index.tsx` — 标签页显示颜色标记
- Rust: `src-tauri/src/storage.rs` — 增加 color 字段

### 规格说明

#### 1. 模型变更

```typescript
// types/api.ts
export interface ConnectionInput {
  // ... 现有字段
  color?: string;  // ← 新增, 例如 '#1890ff'
}
```

#### 2. 连接对话框

在 `ConnectionDialog.tsx` 的"常规"标签页中添加颜色选择器:

```typescript
<Form.Item label="标记颜色">
  <ColorPicker
    value={form.getFieldValue('color') || '#1890ff'}
    onChange={(color) => form.setFieldValue('color', color)}
  />
</Form.Item>
```

#### 3. 连接树显示

在 `EnhancedConnectionTree.tsx` 的连接节点中显示颜色圆点:

```typescript
{conn.color && (
  <span style={{
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: conn.color,
    display: 'inline-block',
    marginLeft: 4,
  }} />
)}
```

#### 4. 标签页显示

在 `TabPanel/index.tsx` 中，数据标签页的图标旁显示颜色标记。

### 验收标准

- [x] 连接对话框可选择颜色
- [x] 连接树中颜色标记清晰可见
- [x] 数据标签页标题旁显示颜色标记
- [x] 颜色持久化到 Rust Storage

---

## P1-8: 数据库属性面板

**优先级**: 🟢 低  
**预估**: 4 小时  
**涉及文件**:
- ✅ 已创建 `src/components/DatabaseProperties/index.tsx`
- ✅ `src/components/ConnectionTree/EnhancedConnectionTree.tsx`
- ✅ `src/components/MainLayout.tsx`

### 实现说明

已完整实现数据库属性面板功能:

- 右键数据库 → "数据库属性" 打开属性面板 (Modal)
- 显示数据库名、字符集、表数量、视图数量、总行数、数据/索引大小、存储引擎、排序规则、服务器版本
- 表统计表格展示每张表的详细信息
- 视图统计列表展示所有视图

### 验收标准

- [x] 右键数据库 → "数据库属性" 打开属性面板 (Modal)
- [x] 显示数据库名、字符集、表数量、视图数量
- [x] MySQL 特有信息 (引擎、大小) 正确显示
- [x] PG/SQLite 属性正确显示

---

## P1 验收清单

全部 P1 任务完成后:

- [x] `pnpm lint` 无错误
- [x] `pnpm exec tsc --noEmit` 无类型错误
- [x] 结果网格下方显示列统计
- [x] 数据表格右键菜单有完整操作
- [x] SQL 错误时编辑器标记错误行
- [x] 连接树显示表行数
- [x] 连接树显示触发器节点
- [x] TableDesigner 根据数据库类型显示不同字段类型
- [x] 连接颜色标记在树和标签页中可见
- [x] 数据库属性面板可正常打开并显示信息

**P1 全部任务已完成 ✅**