# iDBLink 数据表格迁移方案：AG Grid → Glide Data Grid

**版本**：v2.0 | **日期**：2026-05-21 | **涵盖组件**：`DataTable.tsx` + `SQLEditor/ResultGrid.tsx`

---

## 一、迁移范围与目标

### 1.1 范围

| 组件 | 当前行数 | AG Grid 依赖度 | 迁移后 |
|------|:------:|:--:|:------:|
| `DataTable.tsx` | ~2900 | 🔴 重度 | `GlideDataTable.tsx` |
| `ResultGrid.tsx` | ~1100 | 🟡 中度 | `GlideResultGrid.tsx` |
| `ColumnFilterHeader.tsx` | ~50 | 🟢 轻度 | Glide overlay 替代 |
| `ExplainPlanGrid` | ~100 | 🟢 轻度 | 内嵌于 ResultGrid |
| `style.css` | ~35 条 `.ag-*` | — | 替换为 Glide `Theme` |
| `DataTable.css` | ~15 条 `.ag-*` | — | 替换为 Glide `Theme` |

### 1.2 核心收益

| 维度 | 迁移前 (AG Grid) | 迁移后 (Glide Data Grid) |
|------|-----------------|--------------------------|
| 范围选择 | ~400 行自建指针事件系统，bug 频发 | 1 行 `gridSelection` prop，原生实现 |
| 行虚拟化 | DOM 虚拟化，`getDisplayedRowAtIndex` 陷阱 | Canvas 原生虚拟化，零 DOM 陷阱 |
| 渲染性能 | 万行可用，十万行吃力 | 百万行流畅 |
| 列拖拽排序 | ❌ 需要 `suppressMovableColumns={false}` | ✅ 原生支持 `onColumnMoved` |
| Bundle 体积 | ~200KB | ~150KB |

### 1.3 ResultGrid 需求变更

| 现有功能 | 迁移后 |
|----------|--------|
| `checkboxSelection: isEditable`（复选框列） | ❌ 去掉，改用 `gridSelection` 原生拖拽选择 |
| `headerCheckboxSelection: isEditable`（全选复选框） | ❌ 去掉 |
| 自建右键菜单（绝对定位 div） | ✅ Glide `onCellContextMenu` + Ant Design `Dropdown` |
| `enableRangeSelection={true}`（Community 中无效） | ✅ Glide `gridSelection` 原生有效 |

---

## 二、架构对比

### 2.1 核心范式差异

```
AG Grid Community                    Glide Data Grid
─────────────────                    ────────────────
DOM-based rendering                  Canvas-based rendering
<AgGridReact> JSX 组件               <DataEditor /> JSX 组件
ColDef[] 声明式列定义                GridColumn[] 声明式列定义
cellRenderer: React组件               drawCell: Canvas 绘制回调
cellEditor: 内置/自定义               GridCellKind 类型系统 + getCellsForAddition
cellClassRules: 条件类名              drawCell 内手写条件绘制逻辑
api.deselectAll + node.setSelected    gridSelection prop 直接控制
applyTransaction({update})            直接修改 data 引用 + 依赖刷新
```

### 2.2 关键差异及影响

| 差异点 | 影响 | 应对策略 |
|--------|------|----------|
| Canvas 渲染 | React 组件不能直接作为 cellRenderer | 用 `ReactDOM.createRoot` 嵌入 React 组件到 Canvas overlay；简单渲染用 Canvas 2D API 直接绘制 |
| 无 `ColDef` 系统 | 列定义方式完全不同 | 新建 `buildGridColumns()` 工具函数，从现有 `columns: ColumnInfo[]` 转换 |
| 无内置排序/筛选 | 点击列头不会自动排序 | 在 `onHeaderClicked` 中手动排序 `rowData`；保持现有 WHERE/ORDER BY 外部过滤 |
| 数据不可变 | `applyTransaction` 不可用 | 所有修改直接更新 `rowData` state，依赖 React 重新传入 |
| 无 `localeText` | 国际化需自建 | 利用现有的 `useTranslation()` 体系，在 drawHeader / drawCell 中手动绘制文本 |

---

## 三、DataTable.tsx 功能迁移对照

### 3.1 AG Grid Props → Glide Props

| AG Grid prop | Glide Data Grid prop / 替代 |
|-------------|---------------------------|
| `key={gridKey}` | `key={dataKey}` (rowData 引用变化时重渲染) |
| `onGridReady` | 通过 `ref` 获取 `DataEditor` 实例 |
| `onColumnResized` | `onColumnResize` |
| `rowData` | `rows={rowData.length}` + `getCellContent` |
| `columnDefs` | `columns: GridColumn[]` |
| `defaultColDef` | 直接设置在 `GridColumn` 或 `drawCell` 默认绘制 |
| `components` | ❌ 无对应，自定义头用 `drawHeader` |
| `context` | `drawCell` / `drawHeader` 闭包捕获外部 state |
| `getRowId` | `rowMarker` prop |
| `onCellValueChanged` | `onCellEdited` |
| `onCellDoubleClicked` | 自建双击检测（记录上次点击时间） |
| `onCellFocused` | 不需要（Glide 自动管理编辑状态） |
| `onSelectionChanged` | `onGridSelectionChange` |
| `onSortChanged` | `onHeaderClicked` → 手动排序 |
| `onCellContextMenu` | `onCellContextMenu` (Glide 原生) |
| `rowSelection="multiple"` | `gridSelection` prop |
| `suppressRowClickSelection` | `rangeSelect="cell"` 或 `"rect"` |
| `suppressPaginationPanel` | 外部 Ant Design `Pagination` |
| `suppressCellFocus` | Glide 默认行为 |
| `stopEditingWhenCellsLoseFocus` | Glide 默认行为 |
| `animateRows={false}` | ✅ 无动画（Canvas 默认） |
| `headerHeight={24}` | `headerHeight={24}` prop |
| `rowHeight={22}` | `rowHeight={22}` prop |
| `rowBuffer={10}` | `overscrollY` prop |
| `domLayout="normal"` | 默认行为 |
| `suppressColumnVirtualisation` | ✅ Canvas 原生列虚拟化 |
| `suppressRowVirtualisation` | ✅ Canvas 原生行虚拟化 |
| `debounceVerticalScrollbar` | ✅ 原生处理 |
| `suppressScrollOnNewData` | ✅ 原生处理 |
| `suppressAnimationFrame` | ✅ 原生处理 |
| `localeText` | 不需要（`drawCell` / `drawHeader` 中使用 `t()`） |

### 3.2 列系统

| AG Grid 功能 | Glide Data Grid 实现 |
|-------------|---------------------|
| `columnDefs: ColDef[]` | `columns: GridColumn[]`，从 `ColumnInfo[]` 转换 |
| `field`, `headerName` | `GridColumn.id`, `GridColumn.title` |
| `width`, `minWidth`, `maxWidth` | `GridColumn.width`（固定）或省略（自动均分） |
| `sortable: true` | 自建：`onHeaderClicked` 切换排序状态，排序后更新 `rowData` |
| `filter: true` | 自建：列头右键/按钮打开筛选 popover（保持现有 `ColumnFilterHeader` UI） |
| `resizable: true` | ✅ 原生：`onColumnResize` 回调 |
| `editable: true` | ✅ 原生：`GridColumn.editable` 或 `cell.editable` |
| `hide: true`（列可见性） | 动态过滤 `columns` prop（传入的 `GridColumn[]` 实时变化） |
| 列拖拽排序 | ✅ 原生：`onColumnMoved` 回调，更新列顺序 state |
| `headerTooltip` | 自建：`drawHeader` 中绘制 tooltip 图标，hover 显示 |
| `headerComponent: ColumnFilterHeader` | 自建：列头点击弹出 Ant Design `Popover`，内含筛选控件 |
| `cellEditor: agCheckboxCellEditor` | `GridCellKind.Boolean` + `onCellEdited` 自动切换 true/false |
| `cellEditor: agDateStringCellEditor` | `GridCellKind.Text` + 自定义 DatePicker overlay 在 `onCellEdited` 前 |
| `cellEditor: agSelectCellEditor` | `GridCellKind.Text` + 自定义 Select overlay，读取 ENUM 值列表 |

#### 列可见性实现（动态显示/隐藏列）

```ts
// 替代 AG Grid 的 hide: true
const visibleColumns = useMemo(() => {
  return allColumns.filter(col => !hiddenColumns.has(col.id));
}, [allColumns, hiddenColumns]);

// Glide Data Grid 接收过滤后的 columns
<DataEditor columns={visibleColumns} ... />
```

#### 列拖拽排序实现

```ts
// Glide Data Grid 原生回调
const onColumnMoved = useCallback((startIndex: number, endIndex: number) => {
  setColumnOrder(prev => {
    const next = [...prev];
    const [moved] = next.splice(startIndex, 1);
    next.splice(endIndex, 0, moved);
    return next;
  });
}, []);
```

### 3.3 单元格渲染

| AG Grid 功能 | Glide Data Grid 实现 |
|-------------|---------------------|
| `DataCellRenderer` (NULL 斜体, 布尔 ✓/✗) | `drawCell` 回调：检测 value === null → 灰色斜体 "NULL"；`kind === Boolean` → "✓"/"✗" |
| `StatusCellRenderer` (+, ✎, ✗) | `drawCell` 回调：检测 `row.__status__`，绘制彩色状态符号 |
| `cellClassRules` | `drawCell` 回调内执行条件判断，应用不同 `ctx.fillStyle` / `ctx.strokeStyle` |

#### `drawCell` 实现（DataTable 专用）

```ts
const drawCell: DrawCellCallback = (args) => {
  const { cell, rect, ctx, theme } = args;
  const row = rowData[args.row];
  const colId = columns[args.col]?.id;

  // 1. 条件样式（替代 cellClassRules）
  if (cell.displayData === null || cell.displayData === undefined) {
    ctx.fillStyle = theme.textLight;     // 灰
    ctx.font = 'italic 12px sans-serif'; // 斜体
    ctx.fillText('NULL', rect.x + 8, rect.y + 16);
    args.preventDefault(); // 阻止默认绘制
    return;
  }

  // 2. 选中列高亮（column-selected）
  if (selectedColumn === colId) {
    ctx.fillStyle = 'rgba(24, 144, 255, 0.08)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  // 3. 范围选中高亮（cell-selection / drag-selected）
  // gridSelection 由 Glide 自动绘制背景，这里叠加自定义样式
  if (isInSelectionRange(args.row, args.col)) {
    ctx.strokeStyle = 'rgba(24, 144, 255, 0.35)';
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  }

  // 4. 修改状态高亮（modified-cell）
  if (row?.__status__ === 'modified') {
    ctx.fillStyle = 'rgba(24, 144, 255, 0.1)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  // 5. 删除状态（deleted）
  if (row?.__status__ === 'deleted') {
    ctx.fillStyle = theme.textLight;
    ctx.fillText(String(cell.displayData), rect.x + 8, rect.y + 16);
    // 删除线
    ctx.strokeStyle = theme.textLight;
    ctx.beginPath();
    ctx.moveTo(rect.x + 8, rect.y + rect.height / 2);
    ctx.lineTo(rect.x + rect.width - 16, rect.y + rect.height / 2);
    ctx.stroke();
    return;
  }

  // 6. 正常值
  ctx.fillStyle = theme.textDark;
  ctx.font = '12px sans-serif';
  ctx.fillText(String(cell.displayData), rect.x + 8, rect.y + 16);
};
```

### 3.4 选择系统（核心简化）

这是迁移的**最大收益点**。

| AG Grid 功能 | Glide Data Grid 实现 |
|-------------|---------------------|
| 自建 ~400 行指针事件系统 | `gridSelection` prop，原生支持 |
| `handlePointerDown/Move/Up` | ❌ 全部删除 |
| `processMove` (rAF) | ❌ 删除 |
| `isDraggingRef` / `hasMoved` | ❌ 删除 |
| `dragSelectRange` state | ❌ 删除，改用 `gridSelection` |
| `cellSelectionRange` state | ❌ 删除，改用 `gridSelection` |
| `deselectAll()` / `setNodesSelected()` | `GridSelection` 对象直接控制 |
| `onSelectionChanged` | `onGridSelectionChange` 回调 |
| `selectedRows` state | `onGridSelectionChange` → `getCells()` 提取 `Set<number>` row indices |

#### `gridSelection` 使用示例

```ts
// 选择行为配置
const [gridSelection, setGridSelection] = useState<GridSelection>({
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
});

// 列全选：点击列头 → 选中整列
const onHeaderClicked: HeaderClickedCallback = (col, _args) => {
  if (_args.isSelected) {
    setGridSelection(prev => ({
      ...prev,
      columns: CompactSelection.empty(),
    }));
  } else {
    setGridSelection(prev => ({
      ...prev,
      columns: CompactSelection.fromSingleSelection(col),
    }));
  }
};

// 拖拽范围选择（Glide 原生处理！无需任何自定义代码）

// 提取选中的行数据（替代 getSelectedRowsFromRange）
const getSelectedRows = (): RowData[] => {
  const selectedIndices = gridSelection.rows.toArray();
  return selectedIndices.map(i => rowData[i]).filter(Boolean);
};

// 删除按钮 disabled
const hasSelection = gridSelection.rows.length > 0 || gridSelection.columns.length > 0;
```

### 3.5 编辑系统

| AG Grid 功能 | Glide Data Grid 实现 |
|-------------|---------------------|
| `onCellValueChanged` | `onCellEdited` 回调，参数含 `(cell, newValue)` |
| `editable: true` / `cellEditor` | `GridColumn` 上设置 `kind` 类型系统 |
| `agCheckboxCellEditor` | `GridCellKind.Boolean`，点击自动切换 |
| `agDateStringCellEditor` | 自定义：`onCellEdited` 前弹出 `DatePicker` |
| `agSelectCellEditor` (ENUM) | 自定义：双击时根据 ENUM 值弹出 `Select` overlay |
| `stopEditing()` | Glide 自动管理编辑状态 |
| `getEditingCells()` | `getCells()` 筛选 `editing: true` |
| 单元格级回滚 | 在 `onCellEdited` 中执行 UPDATE SQL，失败则恢复原值 |

### 3.6 排序与筛选

| AG Grid 功能 | Glide Data Grid 实现 |
|-------------|---------------------|
| 列头点击排序 | `onHeaderClicked` → 切换排序方向 → `sortModel` state → 对 `rowData` 排序 |
| 排序图标（▲/▼） | `drawHeader` 中根据 `sortModel` 绘制 |
| 多列排序 | 手动维护 `sortModel: {colId, dir}[]`，排序函数级联 |
| 快速筛选 (`quickFilterText`) | 外部 `Input` 组件，输入后过滤 `rowData`（保持现有 UI） |
| WHERE / ORDER BY 手动输入 | ✅ 保持现有 UI（`SqlInput` 组件），不依赖 Grid |

### 3.7 右键菜单

| AG Grid 功能 | Glide Data Grid 实现 |
|-------------|---------------------|
| `onCellContextMenu` | `onCellContextMenu` 回调（Glide 原生支持） |
| 复制行 / 删除行 | Ant Design `Dropdown`，置于回调返回的坐标 |
| 复制为 INSERT / UPDATE | 保持现有逻辑，从 `getSelectedRows()` 提取数据 |
| 删除选中行 | 保持现有逻辑，从 `getSelectedRows()` 提取数据 |

### 3.8 复制粘贴

| AG Grid 功能 | Glide Data Grid 实现 |
|-------------|---------------------|
| Cmd+C 复制 | 自建：`document.addEventListener('copy', ...)`，从 `gridSelection` 提取数据 |
| Cmd+V 粘贴 | 自建：`document.addEventListener('paste', ...)`，解析文本 → 更新 `rowData` |

### 3.9 样式系统

| AG Grid 功能 | Glide Data Grid 实现 |
|-------------|---------------------|
| `.ag-theme-alpine` | 自定义 `Theme` 对象 |
| `.ag-theme-alpine-dark` | 根据 `isDark` 切换两套 `Theme` |
| `.ag-theme-compact` CSS 变量 | `Theme` 对象中设置 `fontSize`, `cellHorizontalPadding` 等 |
| `rowHeight={22}`, `headerHeight={24}` | `Theme` 或直接 props |
| 行选中背景色 | `Theme.accentColor` + `Theme.bgCell` |
| 行悬停背景色 | `Theme.bgCellMedium` |
| 表头样式 | `Theme.bgHeader` + `Theme.textHeader` |
| 单元格边框 | `Theme.borderColor` + `Theme.cellBorderWidth` |
| 滚动条样式 | Glide 使用浏览器原生滚动条，CSS 仍需 `::-webkit-scrollbar` |

#### 主题示例

```ts
import { Theme } from '@glideapps/glide-data-grid';

const lightTheme: Partial<Theme> = {
  accentColor: '#1890ff',
  accentLight: 'rgba(24, 144, 255, 0.08)',
  textDark: '#0f0f0f',
  textMedium: '#595959',
  textLight: '#8c8c8c',
  textBubble: '#ffffff',
  bgIconHeader: '#fafafa',
  fgIconHeader: '#595959',
  bgCell: '#ffffff',
  bgCellMedium: '#f5f5f5',
  bgHeader: '#fafafa',
  bgHeaderHasFocus: '#e6f7ff',
  bgHeaderHovered: '#f0f0f0',
  borderColor: '#d9d9d9',
  drilldownBorder: '#d9d9d9',
  linkColor: '#1890ff',
  cellBorderWidth: 1,
  headerFontStyle: '600 12px',
  baseFontStyle: '12px',
  editorFontSize: '12px',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
};

const darkTheme: Partial<Theme> = {
  ...lightTheme,
  accentColor: '#177ddc',
  accentLight: 'rgba(24, 144, 255, 0.15)',
  textDark: '#e0e0e0',
  textMedium: '#a0a0a0',
  textLight: '#666666',
  bgIconHeader: '#141414',
  fgIconHeader: '#a0a0a0',
  bgCell: '#1f1f1f',
  bgCellMedium: '#2a2a2a',
  bgHeader: '#141414',
  bgHeaderHasFocus: '#111a2c',
  bgHeaderHovered: '#1a1a1a',
  borderColor: '#303030',
};
```

---

## 四、ResultGrid.tsx → GlideResultGrid 逐功能映射

### 4.1 列定义系统

```
AG Grid (ResultGrid)                         Glide Data Grid
─────────────────────                        ────────────────
checkboxSelection: isEditable                ❌ 删除，改用 gridSelection
headerCheckboxSelection: isEditable          ❌ 删除
field: String(i)  (数字索引 field)           id: String(i)
headerName: col                              title: col
flex: 1                                      width: (动态计算或固定)
sortable: true                               onHeaderClicked 自建排序
filter: true                                 外部 WHERE 输入框
editable: isEditable                         GridColumn 上不设全局 editable，
                                             在 getCellContent 中按 needEditable 判断
valueFormatter: NULL 显示                    drawCell 中判断 null → 灰色斜体 "NULL"
cellClassRules: null-cell / cell-modified    drawCell 中条件绘制
```

### 4.2 选择系统

```
AG Grid (ResultGrid)                         Glide Data Grid
─────────────────────                        ────────────────
rowSelection="multiple"                      gridSelection prop
onSelectionChanged → setSelectedRowIndices   onGridSelectionChange → Set<number>
enableRangeSelection={true} (Enterprise)     gridSelection 原生支持拖拽范围选择
event.api.getSelectedRows()                  gridSelection.rows.toArray() → 索引数组
```

去掉复选框后，用户直接点击行（或拖拽）即可选中。选中行通过 Glide 内置行选中背景色高亮。全列选中通过点击表头实现。

### 4.3 编辑系统

```
AG Grid (ResultGrid)                         Glide Data Grid
─────────────────────                        ────────────────
editable: isEditable                         动态：needEditable 判断
onCellValueChanged                            onCellEdited(newValue, ...args)
  → setModifiedRows(Map)                      → setModifiedRows(Map)
  → setNewRows (新行)                         → setNewRows
applyTransaction({update})                   ❌ 不需要，直接更新 rowData
```

`needEditable` 逻辑保持：
```ts
const needEditable = !!(tableName && primaryKeyCol && connectionId);
```

### 4.4 行状态渲染

ResultGrid 有三种行状态需要视觉区分：

| 状态 | 检测条件 | Glide `drawCell` 绘制 |
|------|---------|----------------------|
| 已删除 | `deletedRowIndices.has(rowId)` | 灰色文字 + 删除线 |
| 已修改 | `modifiedRows.has(rowId)` | 蓝色浅底色 `rgba(24,144,255,0.1)` |
| 新增行 | `row.__isNew === true` | 绿色浅底色 + 行号列显示 `+` 符号 |

#### `drawCell`（ResultGrid 专用）

```ts
const drawCell: DrawCellCallback = (args) => {
  const { cell, rect, ctx, theme, row, col } = args;
  const rowData = allRowData[row];
  if (!rowData) return;

  const rowId = rowData.__id as number;
  const isDeleted = deletedRowIndices.has(rowId);
  const isModified = !isDeleted && modifiedRows.has(rowId);
  const isNew = rowData.__isNew === true;

  // 1. 删除行：灰色 + 删除线
  if (isDeleted) {
    ctx.fillStyle = theme.textLight;
    ctx.font = '12px sans-serif';
    const text = cell.displayData ?? 'NULL';
    ctx.fillText(String(text), rect.x + 8, rect.y + 18);
    ctx.strokeStyle = theme.textLight;
    ctx.beginPath();
    ctx.moveTo(rect.x + 8, rect.y + rect.height / 2);
    ctx.lineTo(rect.x + rect.width - 16, rect.y + rect.height / 2);
    ctx.stroke();
    return;
  }

  // 2. 新增行：绿色底色
  if (isNew) {
    ctx.fillStyle = 'rgba(82, 196, 26, 0.08)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  // 3. 修改行：蓝色底色
  if (isModified) {
    ctx.fillStyle = 'rgba(24, 144, 255, 0.1)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  // 4. 选中行背景 — Glide 默认绘制，这里只需叠加修改/删除/新增的状态色

  // 5. NULL 值
  if (cell.displayData === null || cell.displayData === undefined) {
    ctx.fillStyle = theme.textLight;
    ctx.font = 'italic 12px sans-serif';
    ctx.fillText('NULL', rect.x + 8, rect.y + 18);
    return;
  }

  // 6. 正常值
  ctx.fillStyle = theme.textDark;
  ctx.font = '12px sans-serif';
  ctx.fillText(String(cell.displayData), rect.x + 8, rect.y + 18);
};
```

#### 行状态渲染优先级

```
┌──────────────────────────────────────────────────────────┐
│  __rowNum__  │  col_0    │  col_1    │  col_2    │ ...  │
├──────────────┼───────────┼───────────┼───────────┼──────┤
│  1           │  Alice    │  30       │  NY       │      │  ← 正常行
│  2           │  Bob      │  25       │  LA       │      │  ← 选中行(Glide 自动浅蓝底)
│  3  ✎        │  Charlie  │  28       │  SF       │      │  ← 修改行(蓝底叠加)
│  4  ──────── │  Diana    │  22       │  TX       │      │  ← 删除行(灰+删除线)
│  5  +        │  Eve      │  35       │  CA       │      │  ← 新增行(绿底)
└──────────────┴───────────┴───────────┴───────────┴──────┘
```

绘制优先级（从低到高）：
1. 默认背景
2. 选中行背景（`gridSelection` — Glide 自动绘制）
3. 状态叠加：新增（绿 8%） / 修改（蓝 10%） / 删除（灰+删除线）

### 4.5 行号列

```
AG Grid (ResultGrid)                         Glide Data Grid
─────────────────────                        ────────────────
ColDef { headerName: '#', valueGetter,       GridColumn { id: '__rowNum__', title: '#',
  pinned: 'left', width: 60 }                  width: 50 }
valueGetter: rowIndex + 1                    drawCell 中：args.row + 1
checkboxSelection: isEditable                ❌ 删除
```

### 4.6 右键菜单

```
AG Grid (ResultGrid)                         Glide Data Grid
─────────────────────                        ────────────────
onContextMenu (React div 事件)               onCellContextMenu (Glide 原生)
自建绝对定位 div 菜单                        Ant Design Dropdown 置于回调坐标
copyAsInsert / copyAsUpdate / copyAsDelete   保持现有逻辑不变
```

### 4.7 编辑操作工具栏

保持现有 Ant Design 工具栏，不依赖 Grid：

```
[导出 ▼]  [提交] [撤销] [SQL] [新增行] [删除选中行]
```

- 提交：遍历 `modifiedRows` + `deletedRowIndices` + `newRows` → 生成 SQL → `executeQuery`
- 撤销：清空三个状态 Map/Set
- SQL：`Modal.info` 预览生成的 SQL
- 新增行：`Modal` 表单（使用 `tableColumns` 动态生成字段）
- 删除选中行：`gridSelection.rows` → `setDeletedRowIndices`

### 4.8 底部操作 SQL 栏

保持现有实现：
```tsx
{operationSql && (
  <div style={{ ... }}>
    <span>SQL ▶</span>
    {operationSql}
  </div>
)}
```

`operationSql` 生成逻辑（`useEffect` 监听 `modifiedRows`/`deletedRowIndices`）完全不变。

---

## 五、ExplainPlanGrid 迁移

执行计划表格是最简单的场景（只读、无交互）：

```
AG Grid                               Glide Data Grid
────────                              ────────────────
<AgGridReact columnDefs={colDefs}     <DataEditor columns={glideColumns}
  rowData={rowData}                     rows={data.length}
  defaultColDef={{ sortable, filter,    getCellContent={...} />
  resizable }} />                     无排序/筛选/编辑/选择
```

---

## 六、全列选择实现

Glide Data Grid 的 `gridSelection.columns` 使用 `CompactSelection` 表示。

```
用户点击列头
  → onHeaderClicked 回调
    → 判断当前列是否已被选中
      → 未选中：创建 CompactSelection.fromSingleSelection(colIndex)
      → 已选中：CompactSelection.empty() 取消选择
  → 更新 gridSelection.columns
  → drawCell 中检测当前列 index 是否在 gridSelection.columns 中 → 应用列选中样式
```

---

## 七、迁移阶段规划

### Phase 1：基础搭建（2-3 天）
- [ ] 安装 `@glideapps/glide-data-grid`，验证版本兼容
- [ ] 移除 `ag-grid-community` / `ag-grid-react` 依赖
- [ ] 创建 `GlideDataTable.tsx` 新组件，实现最简渲染
  - `DataEditor` + `columns` + `rowData` props 传入
  - `getCellContent` 回调——从 `rowData` 提取值
  - 基础主题配置（light/dark）

### Phase 2：列系统（1-2 天）
- [ ] `buildGridColumns()` — ColumnInfo[] → GridColumn[]
- [ ] 列可见性 toggle（`hiddenColumns` Set → 过滤 columns）
- [ ] 列拖拽排序（`onColumnMoved`）
- [ ] 列宽拖拽调整（`onColumnResize`）
- [ ] 自定义列头（`drawHeader`）：排序图标、筛选按钮、列名 tooltip

### Phase 3：单元格渲染（1-2 天）
- [ ] `drawCell` 核心逻辑（NULL 值灰色斜体、布尔值 ✓/✗、状态行着色）
- [ ] 状态列（`__status__`）：+ / ✎ / ✗ 符号绘制
- [ ] Cell types：Boolean / Date / Enum / Text 映射

### Phase 4：选择系统（1-2 天）⭐ 核心收益
- [ ] `gridSelection` 状态替换所有自建选择逻辑
- [ ] `onGridSelectionChange` 回调
- [ ] 删除 ~400 行指针事件代码
- [ ] `getSelectedRows()` 工具函数
- [ ] 全列选择（列头点击选中整列）
- [ ] 拖拽范围选择（Glide 原生，仅需配置 `rangeSelect` 行为）

### Phase 5：编辑系统（1-2 天）
- [ ] `onCellEdited` → UPDATE SQL（复用现有 `onCellValueChanged` 逻辑）
- [ ] Boolean cell editor
- [ ] Date cell editor（DatePicker overlay）
- [ ] Enum cell editor（Select overlay）
- [ ] 新增行（`handleAddRow`）
- [ ] 批量列编辑（`startColumnEdit` / `commitColumnEdit`）

### Phase 6：交互功能（1-2 天）
- [ ] 右键菜单（`onCellContextMenu` + Ant Design Dropdown）
- [ ] 复制粘贴（Cmd+C / Cmd+V）
- [ ] 键盘 Delete 删除选中行
- [ ] 排序（`onHeaderClicked` → 排序 → 重新渲染）
- [ ] 筛选（外部 WHERE/ORDER BY 保持现有）

### Phase 7：ResultGrid 迁移（3-4 天）⭐ 新增

#### 7.1 基础渲染
- [ ] 创建 `GlideResultGrid.tsx`，实现 `DataEditor` 渲染
- [ ] `getCellContent` — 从 `queryResult.rows` 提取值
- [ ] 行号列（`#` 列）
- [ ] 动态列生成（`queryResult.columns`）

#### 7.2 编辑系统
- [ ] `onCellEdited` — 写入 `modifiedRows` 或 `newRows`
- [ ] `needEditable` 判断 — 阻止只读结果集的编辑
- [ ] 渲染修改/删除/新增状态（`drawCell`）

#### 7.3 选择系统
- [ ] `gridSelection` — 替代 `checkboxSelection` + `selectedRowIndices`
- [ ] 拖拽多行选择（Glide 原生）
- [ ] `onGridSelectionChange` → 提取选中行索引
- [ ] 删除按钮 `disabled` → `gridSelection.rows.length === 0`

#### 7.4 右键菜单
- [ ] `onCellContextMenu` → 定位 + 显示 Ant Design `Dropdown`
- [ ] 复制为 INSERT / UPDATE / DELETE
- [ ] 删除选中行（标记为删除状态）

#### 7.5 保持不变的模块
- [ ] 工具栏（导出下拉、提交/撤销/SQL/新增行按钮）
- [ ] 底部操作 SQL 预览栏
- [ ] 新增行 Modal 表单
- [ ] `extractSingleTableName` + `generateInsertSql` 等工具函数
- [ ] `exportToCsv/Json/Txt/Xml/Md` + `downloadBlob`

### Phase 8：ExplainPlanGrid 迁移（0.5 天）
- [ ] 简单 `DataEditor` 只读渲染
- [ ] 多行文本（`wrapText`）— Glide 无内置换行，用 `drawCell` 多行绘制或接受单行截断

### Phase 9：打磨与测试（2-3 天）
- [ ] DataTable + ResultGrid 统一主题
- [ ] 暗色主题完善
- [ ] 性能测试（10 万行 × 50 列）
- [ ] 与现有 ImportWizard / Export 集成测试
- [ ] 单元测试更新（移除 AG Grid mock，新增 Glide mock）
- [ ] Playwright E2E 测试更新（选择器变更）
- [ ] 回归测试（数据浏览、SQL 查询、编辑、导出全流程）

**总预估**：**16-25 个工作日**（1 人全职）

---

## 八、风险清单

| 风险 | 等级 | 缓解措施 |
|------|:--:|----------|
| Canvas 渲染无法嵌入 React 组件 | 🔴 高 | 简单 cellRenderer 用 Canvas 2D API 替代；复杂交互（DatePicker/Select）用 `ReactDOM.createRoot` overlay |
| Glide Data Grid API 不稳定/有 bug | 🟡 中 | 锁定版本号；核心功能提前手工验证 |
| `drawCell` 无法完美复现 `cellClassRules` | 🟡 中 | 条件分支 + 样式在 Canvas 中均为手写，接受微妙视觉差异 |
| 排序/筛选性能不如 AG Grid 内置 | 🟢 低 | 客户端排序万行级别足够；大数据量走服务端 SQL |
| 迁移期间功能回退 | 🔴 高 | 新旧组件并行保留 1 个迭代，通过 feature flag 切换 |
| 团队学习曲线 | 🟡 中 | Canvas API 对前端团队可能陌生；`drawCell` 参数复杂 |

---

## 九、保留方案（零迁移成本）

如果迁移风险不可接受，建议在现有 AG Grid 方案上做以下优化：

1. 启用 `rowMultiSelectWithClick` + 移除 `suppressRowClickSelection` — Shift+Click 原生多选
2. 将拖拽选择简化为纯行选择（不追踪列维度）— 删除 ~200 行复杂逻辑
3. 添加 `checkboxSelection: true` 作为备选选择入口
4. 修复已完成的 `forEachNode` + `setNodesSelected` 修复（已完成）

---

## 十、包变更

```diff
# package.json
- "ag-grid-community": "^35.3.0"
- "ag-grid-react": "^35.3.0"
+ "@glideapps/glide-data-grid": "^6.0.0"

# 移除 (DataTable.tsx)
- import 'ag-grid-community/styles/ag-grid.css'
- import 'ag-grid-community/styles/ag-theme-alpine.css'
- import './DataTable.css'

# 移除 (ResultGrid.tsx)
- import 'ag-grid-community/styles/ag-grid.css'
- import 'ag-grid-community/styles/ag-theme-alpine.css'

# 移除 (main.tsx)
- import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
- ModuleRegistry.registerModules([AllCommunityModule])

# 新增 (所有使用 Grid 的组件)
+ import DataEditor, { GridCellKind, GridColumn, Theme, CompactSelection, GridSelection, ... } from '@glideapps/glide-data-grid'
```

---

## 十一、影响范围

```
受影响的文件：
├── frontend/src/components/DataTable.tsx          ← 完全重写（~2900 → ~2200 行）
├── frontend/src/components/DataTable.css          ← 全部替换（移除 .ag-* 选择器）
├── frontend/src/components/DataTable/ColumnFilterHeader.tsx  ← 改为 Glide overlay 组件
├── frontend/src/components/SQLEditor/ResultGrid.tsx          ← 完全重写（~1100 → ~800 行）
├── frontend/src/style.css                         ← 移除 ~35 条 .ag-* 规则，新增 Glide 主题变量
├── frontend/src/main.tsx                          ← 移除 AllCommunityModule 注册
├── frontend/package.json                          ← 移除 ag-grid-*, 添加 @glideapps/glide-data-grid

不受影响的文件：
├── frontend/src/components/DataTable/ImportWizard.tsx  ← 纯 Ant Design，不变
├── frontend/src/components/DataTable/utils.ts          ← 纯工具函数，不变
├── frontend/src/utils/exportUtils.ts                   ← 纯导出逻辑，不变
├── frontend/src/utils/sqlUtils.ts                      ← 纯 SQL 工具，不变
├── frontend/src/stores/*.ts                            ← Zustand stores，不变
├── frontend/src/api/index.ts                           ← Wails bindings，不变
```

---

## 十二、ResultGrid 关键差异速查表

| 现有关注点 | Glide 解决方案 |
|-----------|---------------|
| 复选框选择列 (`checkboxSelection`) | `gridSelection` 原生拖拽选择，无复选框 |
| `enableRangeSelection={true}` 实际无效（Community） | `gridSelection` 原生有效 |
| `headerCheckboxSelection` 全选 | 点击列头 → `CompactSelection.fromSingleSelection` 全列选择 |
| `selectedRowIndices: Set<number>` 手动维护 | `gridSelection.rows.toArray()` 自动维护 |
| `event.api.getSelectedRows()` 取选中行 | `gridSelection.rows.toArray()` → `rowData[indices]` |
| `cellClassRules: null-cell / cell-modified` | `drawCell` 内条件绘制 |
| `onContextMenu` React div 事件 | Glide `onCellContextMenu` 原生事件 |
