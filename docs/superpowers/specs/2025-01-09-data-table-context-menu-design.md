# 数据表右键菜单增强 - 公共菜单系统设计

## 1. 背景与目标

### 1.1 现状
- `DataTable.tsx` 和 `ResultGrid.tsx` 各自实现了独立的右键菜单逻辑
- 菜单项重复且不一致（如 DataTable 有 Copy as INSERT/UPDATE/Delete，ResultGrid 也有类似功能但实现不同）
- 缺乏单元格级操作（如 Set to NULL、Copy Cell Value）
- 缺乏列头级操作（Sort、Hide Column 等）

### 1.2 目标
1. 提取公共右键菜单逻辑为可复用系统
2. 支持单元格、行、列头三级右键菜单
3. 菜单项可配置、可扩展，支持条件显示/禁用
4. 第一阶段实现 MVP（最常用操作）

---

## 2. 架构设计

### 2.1 目录结构

```
frontend/src/components/ContextMenu/
├── index.ts                 # 统一导出
├── types.ts                 # 类型定义
├── ContextMenu.tsx          # 通用菜单渲染组件
├── menuItems.ts             # 公共菜单项工厂函数
└── useContextMenu.ts        # 通用 Hook（定位、显隐控制）

frontend/src/components/DataTable/
├── DataTableContextMenu.tsx  # DataTable 专用菜单（组合公共+私有）
└── ...

frontend/src/components/SQLEditor/
├── ResultGridContextMenu.tsx # ResultGrid 专用菜单（组合公共+私有）
└── ...
```

### 2.2 核心类型

```typescript
// types.ts
export interface MenuItemConfig {
  key: string;
  type?: 'item';  // 默认
  icon?: React.ReactNode;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  hidden?: boolean;
  shortcut?: string;  // 如 "Ctrl+C"
  onClick: () => void;
}

export interface MenuDividerConfig {
  type: 'divider';
}

export interface MenuGroupConfig {
  type: 'group';
  label?: string;
  items: MenuItemConfig[];
}

export type MenuConfigItem = MenuItemConfig | MenuDividerConfig | MenuGroupConfig;

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

export interface ContextMenuTarget {
  row?: number;
  col?: number;
  cellValue?: unknown;
  colName?: string;
  rowData?: Record<string, unknown>;
}
```

### 2.3 公共菜单项工厂函数

```typescript
// menuItems.ts
// 所有工厂函数接收统一上下文参数
interface MenuContext {
  dbType?: DatabaseType;
  tableName?: string;
  colName?: string;
  cellValue?: unknown;
  rowData?: Record<string, unknown>;
  selectedRows?: Record<string, unknown>[];
  columns?: ColumnInfo[];
  queryColumns?: string[];
  hiddenColumns?: Set<string>;
  // 回调函数
  onExecuteQuery?: (sql: string) => Promise<QueryResult>;
  onCopyToClipboard?: (text: string) => void;
  onRefresh?: () => void;
  onSetWhereClause?: (where: string) => void;
  onSetOrderByClause?: (orderBy: string) => void;
  onHideColumn?: (colName: string) => void;
  onCellEdited?: (col: number, row: number, value: string) => void;
}

// 工厂函数签名
export function createCopyCellValueItem(ctx: MenuContext): MenuItemConfig;
export function createCopyCellAsSqlLiteralItem(ctx: MenuContext): MenuItemConfig;
export function createSetNullItem(ctx: MenuContext): MenuItemConfig;
export function createSetDefaultItem(ctx: MenuContext): MenuItemConfig;
export function createQuickFilterItems(ctx: MenuContext): MenuGroupConfig;
export function createCopyRowAsJsonItem(ctx: MenuContext): MenuItemConfig;
export function createDuplicateRowItem(ctx: MenuContext): MenuItemConfig;
export function createCopyAsInsertItem(ctx: MenuContext): MenuItemConfig;
export function createCopyAsUpdateItem(ctx: MenuContext): MenuItemConfig;
export function createCopyAsDeleteItem(ctx: MenuContext): MenuItemConfig;
export function createSortColumnItems(ctx: MenuContext): MenuGroupConfig;
export function createHideColumnItem(ctx: MenuContext): MenuItemConfig;
export function createCopyColumnNameItem(ctx: MenuContext): MenuItemConfig;
export function createViewStatisticsItem(ctx: MenuContext): MenuItemConfig;
```

### 2.4 通用组件

```typescript
// ContextMenu.tsx
interface ContextMenuProps {
  items: MenuConfigItem[];
  visible: boolean;
  x: number;
  y: number;
  onClose: () => void;
  // 可选：自定义样式
  className?: string;
  style?: React.CSSProperties;
}

// useContextMenu.ts
interface UseContextMenuReturn {
  menuState: ContextMenuState;
  menuTarget: ContextMenuTarget;
  openMenu: (x: number, y: number, target: ContextMenuTarget) => void;
  closeMenu: () => void;
}

export function useContextMenu(): UseContextMenuReturn;
```

---

## 3. 第一阶段实现（MVP）

### 3.1 公共菜单项（8 个）

**单元格级：**
1. **Copy Cell Value** - 复制单元格原始值
2. **Copy Cell as SQL Literal** - 复制为 SQL 字符串（自动转义引号）
3. **Set to NULL** - 执行 UPDATE SET col = NULL（需确认）
4. **Set to DEFAULT** - 执行 UPDATE SET col = DEFAULT（需确认）

**行级：**
5. **Copy as INSERT** - 复制 INSERT 语句（复用现有逻辑）
6. **Copy as UPDATE** - 复制 UPDATE 语句（复用现有逻辑）
7. **Copy as DELETE** - 复制 DELETE 语句
8. **Copy Row as JSON** - 复制为 JSON 对象

### 3.2 条件显示规则

| 菜单项 | 条件 | 状态 |
|--------|------|------|
| Copy Cell Value | 始终 | 可用 |
| Copy Cell as SQL Literal | 始终 | 可用 |
| Set to NULL | `editable === true` 且列可空 | 可用/禁用 |
| Set to DEFAULT | `editable === true` 且列有默认值 | 可用/禁用 |
| Copy as INSERT | `selectedRows.length > 0` | 可用/禁用 |
| Copy as UPDATE | `selectedRows.length > 0` 且存在 PK | 可用/禁用 |
| Copy as DELETE | `selectedRows.length > 0` | 可用/禁用 |
| Copy Row as JSON | `selectedRows.length > 0` | 可用/禁用 |

### 3.3 菜单分组结构

```
├─ Copy Cell Value
├─ Copy Cell as SQL Literal
├─ ────────────────
├─ Set to NULL          [禁用: 不可编辑 或 列非空]
├─ Set to DEFAULT       [禁用: 不可编辑 或 无默认值]
├─ ────────────────
├─ Quick Filter →       [子菜单: Equals / Not Equals / Contains]
├─ ────────────────
├─ Copy as INSERT       [禁用: 无选择行]
├─ Copy as UPDATE       [禁用: 无选择行 或 无主键]
├─ Copy as DELETE       [禁用: 无选择行]
├─ ────────────────
├─ Copy Row as JSON     [禁用: 无选择行]
```

---

## 4. 私有菜单扩展

公共菜单系统完成后，DataTable 和 ResultGrid 可各自扩展私有菜单项：

### DataTable 私有项
- **Duplicate Row** - 克隆行（新行插入）
- **Open Row Detail** - 弹窗显示完整行

### ResultGrid 私有项
- **Add Row** - 在表格末尾直接插入新空行（不弹窗，与 DataTable 的 Add Row 行为一致）
- **Submit Changes** - 提交修改到数据库
- **Undo Changes** - 撤销未提交修改
- **View Full Text** - 长文本弹窗查看

---

## 5. 实现顺序

1. **Phase 1**: 基础架构（types + ContextMenu 组件 + useContextMenu hook）
2. **Phase 2**: 公共菜单项工厂函数（menuItems.ts）
3. **Phase 3**: 重构 DataTable 右键菜单（使用公共系统 + 私有扩展）
4. **Phase 4**: 重构 ResultGrid 右键菜单（使用公共系统 + 私有扩展）
5. **Phase 5**: 列头右键菜单（Sort / Hide / Copy Column Name）

---

## 6. 依赖

- 复用现有工具函数：`escapeSqlValue`, `escapeSqlIdentifier`（`sqlUtils.ts`）
- 复用现有 API：`executeQuery`（`useApi.ts`）
- 新增依赖：无（使用现有 Ant Design 图标）

---

## 7. 测试策略

- 单元测试：菜单项工厂函数的输入/输出
- 组件测试：ContextMenu 组件的渲染和交互
- 集成测试：DataTable 右键菜单完整流程
