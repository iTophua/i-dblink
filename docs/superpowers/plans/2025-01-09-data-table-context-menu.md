# 数据表右键菜单增强 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可复用的公共右键菜单系统，重构 DataTable 和 ResultGrid 使用该系统，并为 ResultGrid 添加直接追加新行功能。

**Architecture:** 采用混合式架构（Hook + 组件），提取公共菜单项工厂函数供 DataTable/ResultGrid 复用，各组件再扩展私有菜单项。ResultGrid 的新行插入改为直接在表格末尾追加空白行。

**Tech Stack:** React 19 + TypeScript + Glide Data Grid + Ant Design

---

## 文件结构

```
frontend/src/components/ContextMenu/
├── index.ts              # 统一导出
├── types.ts              # 类型定义
├── ContextMenu.tsx       # 通用菜单渲染组件
├── menuItems.ts          # 公共菜单项工厂函数
└── useContextMenu.ts     # 通用 Hook

frontend/src/components/DataTable/
├── DataTableContextMenu.tsx   # DataTable 专用菜单（组合公共+私有）
├── DataTable.tsx              # 修改：集成新菜单系统
└── ...

frontend/src/components/SQLEditor/
├── ResultGridContextMenu.tsx  # ResultGrid 专用菜单（组合公共+私有）
├── ResultGrid.tsx             # 修改：集成新菜单系统 + 直接追加新行
└── ...
```

---

## Task 1: 创建公共右键菜单类型定义

**Files:**
- Create: `frontend/src/components/ContextMenu/types.ts`

- [ ] **Step 1: 编写类型定义文件**

```typescript
import type { ReactNode } from 'react';
import type { DatabaseType, ColumnInfo, QueryResult } from '../../types/api';

export interface MenuItemConfig {
  key: string;
  type?: 'item';
  icon?: ReactNode;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  hidden?: boolean;
  shortcut?: string;
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

// 菜单项工厂函数的上下文参数
export interface MenuContext {
  dbType?: DatabaseType;
  tableName?: string;
  colName?: string;
  cellValue?: unknown;
  rowData?: Record<string, unknown>;
  selectedRows?: Record<string, unknown>[];
  columns?: ColumnInfo[];
  queryColumns?: string[];
  hiddenColumns?: Set<string>;
  isEditable?: boolean;
  // 回调
  onCopyToClipboard?: (text: string) => void;
  onSetWhereClause?: (where: string) => void;
  onSetOrderByClause?: (orderBy: string) => void;
  onHideColumn?: (colName: string) => void;
  onCellEdited?: (col: number, row: number, value: string) => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ContextMenu/types.ts
git commit -m "feat(context-menu): add shared type definitions"
```

---

## Task 2: 创建通用菜单渲染组件

**Files:**
- Create: `frontend/src/components/ContextMenu/ContextMenu.tsx`

- [ ] **Step 1: 编写 ContextMenu 组件**

```typescript
import React, { useCallback } from 'react';
import type { MenuConfigItem, MenuItemConfig } from './types';

interface ContextMenuProps {
  items: MenuConfigItem[];
  visible: boolean;
  x: number;
  y: number;
  onClose: () => void;
}

function MenuItem({ item }: { item: MenuItemConfig }) {
  const { icon, label, disabled, danger, onClick } = item;
  return (
    <div
      style={{
        padding: '6px 12px',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: danger ? 'var(--color-error)' : disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
        opacity: disabled ? 0.5 : 1,
      }}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--background-hover)';
      }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      {label}
    </div>
  );
}

export function ContextMenu({ items, visible, x, y, onClose }: ContextMenuProps) {
  if (!visible) return null;

  // 过滤 hidden 项和空组
  const visibleItems = items.filter((item) => {
    if (item.type === 'item') return !item.hidden;
    if (item.type === 'group') return item.items.some((i) => !i.hidden);
    return true; // divider
  });

  return (
    <>
      {/* 点击遮罩关闭 */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={onClose} />
      {/* 菜单 */}
      <div
        style={{
          position: 'fixed',
          top: y,
          left: x,
          zIndex: 2000,
          background: 'var(--background-card)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          padding: '4px 0',
          minWidth: 180,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {visibleItems.map((item, index) => {
          if (item.type === 'divider') {
            return <div key={`divider-${index}`} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />;
          }
          if (item.type === 'group') {
            return (
              <div key={item.label || `group-${index}`}>
                {item.label && (
                  <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                    {item.label}
                  </div>
                )}
                {item.items
                  .filter((i) => !i.hidden)
                  .map((subItem) => (
                    <MenuItem key={subItem.key} item={subItem} />
                  ))}
              </div>
            );
          }
          return <MenuItem key={item.key} item={item} />;
        })}
      </div>
    </>
  );
}

export default ContextMenu;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ContextMenu/ContextMenu.tsx
git commit -m "feat(context-menu): add generic ContextMenu component"
```

---

## Task 3: 创建通用 Hook

**Files:**
- Create: `frontend/src/components/ContextMenu/useContextMenu.ts`

- [ ] **Step 1: 编写 useContextMenu Hook**

```typescript
import { useState, useCallback } from 'react';
import type { ContextMenuState, ContextMenuTarget } from './types';

export interface UseContextMenuReturn {
  menuState: ContextMenuState;
  menuTarget: ContextMenuTarget;
  openMenu: (x: number, y: number, target: ContextMenuTarget) => void;
  closeMenu: () => void;
}

export function useContextMenu(): UseContextMenuReturn {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const [menuTarget, setMenuTarget] = useState<ContextMenuTarget>({});

  const openMenu = useCallback((x: number, y: number, target: ContextMenuTarget) => {
    setMenuState({ visible: true, x, y });
    setMenuTarget(target);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, visible: false }));
  }, []);

  return {
    menuState,
    menuTarget,
    openMenu,
    closeMenu,
  };
}

export default useContextMenu;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ContextMenu/useContextMenu.ts
git commit -m "feat(context-menu): add useContextMenu hook"
```

---

## Task 4: 创建公共菜单项工厂函数

**Files:**
- Create: `frontend/src/components/ContextMenu/menuItems.ts`

- [ ] **Step 1: 编写菜单项工厂函数**

```typescript
import { CopyOutlined, FilterOutlined } from '@ant-design/icons';
import type { MenuItemConfig, MenuGroupConfig, MenuContext } from './types';
import { escapeSqlValue, escapeSqlIdentifier } from '../../utils/sqlUtils';

// Helper: 复制到剪贴板
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// Helper: 获取可见列
function getVisibleColumns(ctx: MenuContext): string[] {
  const all = ctx.queryColumns || [];
  const hidden = ctx.hiddenColumns || new Set<string>();
  return all.filter((c) => !hidden.has(c));
}

// 1. Copy Cell Value
export function createCopyCellValueItem(ctx: MenuContext): MenuItemConfig {
  return {
    key: 'copy-cell-value',
    icon: <CopyOutlined />,
    label: 'Copy Cell Value',
    onClick: () => {
      const value = ctx.cellValue == null ? 'NULL' : String(ctx.cellValue);
      copyToClipboard(value);
    },
  };
}

// 2. Copy Cell as SQL Literal
export function createCopyCellAsSqlLiteralItem(ctx: MenuContext): MenuItemConfig {
  return {
    key: 'copy-cell-sql-literal',
    icon: <CopyOutlined />,
    label: 'Copy as SQL Literal',
    onClick: () => {
      const value = ctx.cellValue;
      const sql = escapeSqlValue(value, ctx.dbType);
      copyToClipboard(sql);
    },
  };
}

// 3. Set to NULL
export function createSetNullItem(ctx: MenuContext): MenuItemConfig {
  const colInfo = ctx.columns?.find((c) => c.column_name === ctx.colName);
  const canBeNull = colInfo?.is_nullable === 'YES';
  const isEditable = ctx.isEditable && canBeNull;

  return {
    key: 'set-null',
    icon: <CopyOutlined />,
    label: 'Set to NULL',
    disabled: !isEditable,
    onClick: () => {
      if (!isEditable || !ctx.onCellEdited || ctx.colName == null || ctx.rowData == null) return;
      const rowIdx = ctx.rowData.__row_index as number;
      const colIdx = ctx.queryColumns?.indexOf(ctx.colName) ?? -1;
      if (rowIdx >= 0 && colIdx >= 0) {
        ctx.onCellEdited(colIdx, rowIdx, 'NULL');
      }
    },
  };
}

// 4. Set to DEFAULT
export function createSetDefaultItem(ctx: MenuContext): MenuItemConfig {
  const colInfo = ctx.columns?.find((c) => c.column_name === ctx.colName);
  const hasDefault = colInfo?.column_default != null;
  const isEditable = ctx.isEditable && hasDefault;

  return {
    key: 'set-default',
    icon: <CopyOutlined />,
    label: 'Set to DEFAULT',
    disabled: !isEditable,
    onClick: () => {
      if (!isEditable || !ctx.onCellEdited || ctx.colName == null || ctx.rowData == null) return;
      const rowIdx = ctx.rowData.__row_index as number;
      const colIdx = ctx.queryColumns?.indexOf(ctx.colName) ?? -1;
      if (rowIdx >= 0 && colIdx >= 0) {
        ctx.onCellEdited(colIdx, rowIdx, 'DEFAULT');
      }
    },
  };
}

// 5. Quick Filter Items (Group)
export function createQuickFilterItems(ctx: MenuContext): MenuGroupConfig {
  const colName = ctx.colName;
  const value = ctx.cellValue;

  return {
    type: 'group',
    label: 'Quick Filter',
    items: [
      {
        key: 'quick-filter-eq',
        icon: <FilterOutlined />,
        label: 'Equals',
        disabled: colName == null,
        onClick: () => {
          if (!colName || !ctx.onSetWhereClause) return;
          const where = `${escapeSqlIdentifier(colName, ctx.dbType)} = ${escapeSqlValue(value, ctx.dbType)}`;
          ctx.onSetWhereClause(where);
        },
      },
      {
        key: 'quick-filter-ne',
        icon: <FilterOutlined />,
        label: 'Not Equals',
        disabled: colName == null,
        onClick: () => {
          if (!colName || !ctx.onSetWhereClause) return;
          const where = `${escapeSqlIdentifier(colName, ctx.dbType)} != ${escapeSqlValue(value, ctx.dbType)}`;
          ctx.onSetWhereClause(where);
        },
      },
      {
        key: 'quick-filter-like',
        icon: <FilterOutlined />,
        label: 'Contains',
        disabled: colName == null || value == null,
        onClick: () => {
          if (!colName || !ctx.onSetWhereClause) return;
          const where = `${escapeSqlIdentifier(colName, ctx.dbType)} LIKE '%${String(value).replace(/'/g, "''")}%'`;
          ctx.onSetWhereClause(where);
        },
      },
    ],
  };
}

// 6. Copy as INSERT
export function createCopyAsInsertItem(ctx: MenuContext): MenuItemConfig {
  const hasRows = (ctx.selectedRows?.length ?? 0) > 0;
  return {
    key: 'copy-as-insert',
    icon: <CopyOutlined />,
    label: 'Copy as INSERT',
    disabled: !hasRows || !ctx.tableName,
    onClick: () => {
      if (!ctx.tableName || !ctx.selectedRows?.length) return;
      const cols = getVisibleColumns(ctx);
      const vals = ctx.selectedRows.map((r) => `(${cols.map((c) => escapeSqlValue(r[c], ctx.dbType)).join(', ')})`);
      const sql = `INSERT INTO ${escapeSqlIdentifier(ctx.tableName, ctx.dbType)} (${cols.map((c) => escapeSqlIdentifier(c, ctx.dbType)).join(', ')})\nVALUES\n${vals.join(',\n')};`;
      copyToClipboard(sql);
    },
  };
}

// 7. Copy as UPDATE
export function createCopyAsUpdateItem(ctx: MenuContext): MenuItemConfig {
  const hasRows = (ctx.selectedRows?.length ?? 0) > 0;
  const pkCol = ctx.columns?.find((c) => c.column_key === 'PRI');
  return {
    key: 'copy-as-update',
    icon: <CopyOutlined />,
    label: 'Copy as UPDATE',
    disabled: !hasRows || !ctx.tableName || !pkCol,
    onClick: () => {
      if (!ctx.tableName || !ctx.selectedRows?.length || !pkCol) return;
      const sqls = ctx.selectedRows.map((r) => {
        const setters = getVisibleColumns(ctx)
          .filter((c) => c !== pkCol.column_name)
          .map((c) => `${escapeSqlIdentifier(c, ctx.dbType)} = ${escapeSqlValue(r[c], ctx.dbType)}`)
          .join(', ');
        return `UPDATE ${escapeSqlIdentifier(ctx.tableName, ctx.dbType)} SET ${setters} WHERE ${escapeSqlIdentifier(pkCol.column_name, ctx.dbType)} = ${escapeSqlValue(r[pkCol.column_name], ctx.dbType)}`;
      });
      copyToClipboard(sqls.join('\n'));
    },
  };
}

// 8. Copy as DELETE
export function createCopyAsDeleteItem(ctx: MenuContext): MenuItemConfig {
  const hasRows = (ctx.selectedRows?.length ?? 0) > 0;
  const pkCol = ctx.columns?.find((c) => c.column_key === 'PRI');
  return {
    key: 'copy-as-delete',
    icon: <CopyOutlined />,
    label: 'Copy as DELETE',
    disabled: !hasRows || !ctx.tableName || !pkCol,
    onClick: () => {
      if (!ctx.tableName || !ctx.selectedRows?.length || !pkCol) return;
      const sqls = ctx.selectedRows.map((r) => {
        return `DELETE FROM ${escapeSqlIdentifier(ctx.tableName, ctx.dbType)} WHERE ${escapeSqlIdentifier(pkCol.column_name, ctx.dbType)} = ${escapeSqlValue(r[pkCol.column_name], ctx.dbType)}`;
      });
      copyToClipboard(sqls.join('\n'));
    },
  };
}

// 9. Copy Row as JSON
export function createCopyRowAsJsonItem(ctx: MenuContext): MenuItemConfig {
  const hasRows = (ctx.selectedRows?.length ?? 0) > 0;
  return {
    key: 'copy-row-json',
    icon: <CopyOutlined />,
    label: 'Copy as JSON',
    disabled: !hasRows,
    onClick: () => {
      if (!ctx.selectedRows?.length) return;
      const json = ctx.selectedRows.map((r) => {
        const obj: Record<string, unknown> = {};
        getVisibleColumns(ctx).forEach((c) => {
          obj[c] = r[c];
        });
        return obj;
      });
      copyToClipboard(JSON.stringify(json.length === 1 ? json[0] : json, null, 2));
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ContextMenu/menuItems.ts
git commit -m "feat(context-menu): add menu item factory functions"
```

---

## Task 5: 创建 ContextMenu 统一导出

**Files:**
- Create: `frontend/src/components/ContextMenu/index.ts`

- [ ] **Step 1: 编写 index.ts**

```typescript
export { ContextMenu } from './ContextMenu';
export { useContextMenu } from './useContextMenu';
export * from './types';
export * from './menuItems';
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ContextMenu/index.ts
git commit -m "feat(context-menu): add index exports"
```

---

## Task 6: 创建 DataTable 专用右键菜单组件

**Files:**
- Create: `frontend/src/components/DataTable/DataTableContextMenu.tsx`

- [ ] **Step 1: 编写 DataTableContextMenu 组件**

```typescript
import React, { useMemo } from 'react';
import { ContextMenu } from '../ContextMenu';
import type { MenuConfigItem, MenuContext } from '../ContextMenu';
import {
  createCopyCellValueItem,
  createCopyCellAsSqlLiteralItem,
  createSetNullItem,
  createSetDefaultItem,
  createQuickFilterItems,
  createCopyAsInsertItem,
  createCopyAsUpdateItem,
  createCopyAsDeleteItem,
  createCopyRowAsJsonItem,
} from '../ContextMenu/menuItems';

interface DataTableContextMenuProps {
  menuState: { visible: boolean; x: number; y: number };
  menuTarget: { row?: number; col?: number; cellValue?: unknown; colName?: string; rowData?: Record<string, unknown> };
  selectedRows: Record<string, unknown>[];
  context: MenuContext;
  onClose: () => void;
}

export function DataTableContextMenu({
  menuState,
  menuTarget,
  selectedRows,
  context,
  onClose,
}: DataTableContextMenuProps) {
  const items = useMemo<MenuConfigItem[]>(() => {
    const ctx: MenuContext = {
      ...context,
      cellValue: menuTarget.cellValue,
      colName: menuTarget.colName,
      rowData: menuTarget.rowData,
      selectedRows,
    };

    return [
      createCopyCellValueItem(ctx),
      createCopyCellAsSqlLiteralItem(ctx),
      { type: 'divider' },
      createSetNullItem(ctx),
      createSetDefaultItem(ctx),
      { type: 'divider' },
      createQuickFilterItems(ctx),
      { type: 'divider' },
      createCopyAsInsertItem(ctx),
      createCopyAsUpdateItem(ctx),
      createCopyAsDeleteItem(ctx),
      { type: 'divider' },
      createCopyRowAsJsonItem(ctx),
    ];
  }, [menuTarget, selectedRows, context]);

  return (
    <ContextMenu
      items={items}
      visible={menuState.visible}
      x={menuState.x}
      y={menuState.y}
      onClose={onClose}
    />
  );
}

export default DataTableContextMenu;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DataTable/DataTableContextMenu.tsx
git commit -m "feat(data-table): add DataTableContextMenu component"
```

---

## Task 7: 重构 DataTable.tsx 集成新右键菜单系统

**Files:**
- Modify: `frontend/src/components/DataTable.tsx`

- [ ] **Step 1: 添加导入**

在文件顶部添加：
```typescript
import { useContextMenu } from './ContextMenu';
import { DataTableContextMenu } from './DataTable/DataTableContextMenu';
```

- [ ] **Step 2: 替换旧的 context menu state**

替换第 67 行的 state：
```typescript
// 旧的：
const [contextMenu, setCtx] = useState<{ v: boolean; x: number; y: number; rowIdx: number; colIdx: number }>({ v: false, x: 0, y: 0, rowIdx: -1, colIdx: -1 });

// 新的：
const { menuState, menuTarget, openMenu, closeMenu } = useContextMenu();
```

- [ ] **Step 3: 修改右键菜单事件处理**

替换 onCellContextMenu 处理（约第 482 行）：
```typescript
// 旧的：
onCellContextMenu={(col, row, bounds) => setCtx({ v: true, x: bounds.x, y: bounds.y, rowIdx: row, colIdx: col })}

// 新的：
onCellContextMenu={(col, row, bounds) => {
  if (row >= 0 && filteredRows[row]) {
    const clickedRow = filteredRows[row];
    const isInSelection = selectedRows.some((r) => r.__row_id__ === clickedRow.__row_id__);
    if (!isInSelection) {
      setSelectedRows([clickedRow]);
    }
  }
  const colId = getVisibleColumns()[col];
  openMenu(bounds.x, bounds.y, {
    row,
    col,
    cellValue: row >= 0 && colId ? filteredRows[row]?.[colId] : undefined,
    colName: colId,
    rowData: row >= 0 ? filteredRows[row] : undefined,
  });
}}
```

- [ ] **Step 4: 替换旧的 Context Menu JSX**

替换约第 492-503 行的 context menu JSX：
```tsx
// 旧的 Context Menu JSX（删除）

// 新的：
<DataTableContextMenu
  menuState={menuState}
  menuTarget={menuTarget}
  selectedRows={selectedRows}
  context={{
    dbType,
    tableName,
    columns,
    queryColumns: getVisibleColumns(),
    hiddenColumns,
    isEditable: true,
    onCopyToClipboard: (text) => navigator.clipboard.writeText(text),
    onSetWhereClause: (where) => { setWhereClause(where); setCurrentPage(1); loadData(); },
    onCellEdited: handleCellEdited,
  }}
  onClose={closeMenu}
/>
```

- [ ] **Step 5: 删除旧的 closeCtx 和相关函数**

删除第 299 行的 `closeCtx` 和第 300-321 行的 `ctxCopyInsert`、`ctxCopyUpdate`（这些逻辑已移到 menuItems.ts）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DataTable.tsx
git commit -m "refactor(data-table): integrate new context menu system"
```

---

## Task 8: 修改 ResultGrid 的 Add Row 行为（直接追加）

**Files:**
- Modify: `frontend/src/components/SQLEditor/ResultGrid.tsx`

- [ ] **Step 1: 修改 Add Row 为直接追加**

替换约第 339 行的 Add Row 按钮逻辑：
```typescript
// 旧的：
{isEditable && <Button size="small" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)} style={{ fontSize: 11, height: 22 }}>{t('common.addNewRow')}</Button>}

// 新的：
{isEditable && (
  <Button
    size="small"
    icon={<PlusOutlined />}
    onClick={() => {
      const newRow = queryResult.columns.map(() => null);
      setNewRows((prev) => [...prev, newRow]);
      message.success(`${t('common.newRowAdded')}, ${t('common.pleaseClickSubmit')} ${t('common.toSaveToDatabase')}`);
    }}
    style={{ fontSize: 11, height: 22 }}
  >
    {t('common.addNewRow')}
  </Button>
)}
```

- [ ] **Step 2: 删除 Add Row Modal**

删除第 371-390 行的 Add Row Modal 组件。

- [ ] **Step 3: 删除 Add Row 相关 state**

检查并删除 `addModalOpen` 和 `addForm` 相关的 state（在文件开头部分）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SQLEditor/ResultGrid.tsx
git commit -m "feat(result-grid): change add row to direct append without modal"
```

---

## Task 9: 创建 ResultGrid 专用右键菜单组件

**Files:**
- Create: `frontend/src/components/SQLEditor/ResultGridContextMenu.tsx`

- [ ] **Step 1: 编写 ResultGridContextMenu 组件**

```typescript
import React, { useMemo } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { ContextMenu } from '../ContextMenu';
import type { MenuConfigItem, MenuContext, MenuItemConfig } from '../ContextMenu';
import {
  createCopyCellValueItem,
  createCopyCellAsSqlLiteralItem,
  createSetNullItem,
  createSetDefaultItem,
  createQuickFilterItems,
  createCopyAsInsertItem,
  createCopyAsUpdateItem,
  createCopyAsDeleteItem,
  createCopyRowAsJsonItem,
} from '../ContextMenu/menuItems';

interface ResultGridContextMenuProps {
  menuState: { visible: boolean; x: number; y: number };
  menuTarget: { row?: number; col?: number; cellValue?: unknown; colName?: string; rowData?: Record<string, unknown> };
  selectedRows: Record<string, unknown>[];
  context: MenuContext;
  onClose: () => void;
  onAddRow?: () => void;
}

export function ResultGridContextMenu({
  menuState,
  menuTarget,
  selectedRows,
  context,
  onClose,
  onAddRow,
}: ResultGridContextMenuProps) {
  const items = useMemo<MenuConfigItem[]>(() => {
    const ctx: MenuContext = {
      ...context,
      cellValue: menuTarget.cellValue,
      colName: menuTarget.colName,
      rowData: menuTarget.rowData,
      selectedRows,
    };

    const result: MenuConfigItem[] = [
      createCopyCellValueItem(ctx),
      createCopyCellAsSqlLiteralItem(ctx),
      { type: 'divider' },
      createSetNullItem(ctx),
      createSetDefaultItem(ctx),
      { type: 'divider' },
      createQuickFilterItems(ctx),
      { type: 'divider' },
      createCopyAsInsertItem(ctx),
      createCopyAsUpdateItem(ctx),
      createCopyAsDeleteItem(ctx),
      { type: 'divider' },
      createCopyRowAsJsonItem(ctx),
    ];

    // ResultGrid 私有项：Add Row
    if (onAddRow && context.isEditable) {
      const addRowItem: MenuItemConfig = {
        key: 'add-row',
        icon: <PlusOutlined />,
        label: 'Add New Row',
        onClick: () => {
          onAddRow();
          onClose();
        },
      };
      result.push({ type: 'divider' });
      result.push(addRowItem);
    }

    return result;
  }, [menuTarget, selectedRows, context, onAddRow, onClose]);

  return (
    <ContextMenu
      items={items}
      visible={menuState.visible}
      x={menuState.x}
      y={menuState.y}
      onClose={onClose}
    />
  );
}

export default ResultGridContextMenu;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SQLEditor/ResultGridContextMenu.tsx
git commit -m "feat(result-grid): add ResultGridContextMenu component"
```

---

## Task 10: 重构 ResultGrid.tsx 集成新右键菜单系统

**Files:**
- Modify: `frontend/src/components/SQLEditor/ResultGrid.tsx`

- [ ] **Step 1: 添加导入**

在文件顶部添加：
```typescript
import { useContextMenu } from '../ContextMenu';
import { ResultGridContextMenu } from './ResultGridContextMenu';
```

- [ ] **Step 2: 替换旧的 context menu state**

替换第 34 行的 state：
```typescript
// 旧的：
interface CtxState { v: boolean; x: number; y: number; }

// 使用 useContextMenu hook 替代
const { menuState, menuTarget, openMenu, closeMenu } = useContextMenu();
```

- [ ] **Step 3: 修改右键菜单事件处理**

替换 onCellContextMenu 处理（约第 352 行）：
```typescript
// 旧的：
onCellContextMenu={(col, row, bounds) => setCtx({ v: true, x: bounds.left, y: bounds.top })}

// 新的：
onCellContextMenu={(col, row, bounds) => {
  const colName = queryResult.columns[col];
  const rowData = row >= 0 && row < queryResult.rows.length ? queryResult.rows[row] : undefined;
  openMenu(bounds.left, bounds.top, {
    row,
    col,
    cellValue: rowData?.[col],
    colName,
    rowData: rowData ? { ...rowData, __row_index: row } : undefined,
  });
}}
```

- [ ] **Step 4: 替换旧的 Context Menu JSX**

替换约第 357-369 行的 context menu JSX：
```tsx
// 旧的 Context Menu JSX（删除）

// 新的：
<ResultGridContextMenu
  menuState={menuState}
  menuTarget={menuTarget}
  selectedRows={selectedRows}
  context={{
    dbType,
    tableName,
    columns: tableColumns,
    queryColumns: queryResult.columns,
    isEditable,
    onCopyToClipboard: (text) => navigator.clipboard.writeText(text),
    onCellEdited: handleCellEdited,
  }}
  onClose={closeMenu}
  onAddRow={() => {
    const newRow = queryResult.columns.map(() => null);
    setNewRows((prev) => [...prev, newRow]);
    message.success(`${t('common.newRowAdded')}, ${t('common.pleaseClickSubmit')} ${t('common.toSaveToDatabase')}`);
  }}
/>
```

- [ ] **Step 5: 删除旧的 context menu 相关代码**

删除：
- 第 34 行的 `CtxState` 接口
- 所有 `setCtx` 和 `closeCtx` 的使用
- 第 258-285 行的 `closeCtx`、`copyAsInsert`、`copyAsUpdate`、`copyAsDelete` 函数
- 旧的 context menu JSX（第 357-369 行）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SQLEditor/ResultGrid.tsx
git commit -m "refactor(result-grid): integrate new context menu system"
```

---

## Task 11: 运行测试和类型检查

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
cd /Users/itophua/AI/AiProjects/i-dblink/frontend
pnpm exec -- tsc --noEmit
```

Expected: 无新错误（可能仍有既有错误）

- [ ] **Step 2: 运行 ESLint**

```bash
cd /Users/itophua/AI/AiProjects/i-dblink/frontend
pnpm lint
```

Expected: 无新错误

- [ ] **Step 3: 运行测试**

```bash
cd /Users/itophua/AI/AiProjects/i-dblink/frontend
pnpm test
```

Expected: 307 tests passed

- [ ] **Step 4: Commit（如果测试通过）**

```bash
git add .
git commit -m "test: verify context menu system integration"
```

---

## Spec Coverage Check

| Spec 需求 | 实现任务 | 状态 |
|-----------|----------|------|
| 公共类型定义 | Task 1 | ✅ |
| 通用菜单渲染组件 | Task 2 | ✅ |
| 通用 Hook | Task 3 | ✅ |
| 公共菜单项工厂函数（8个） | Task 4 | ✅ |
| 统一导出 | Task 5 | ✅ |
| DataTable 集成 | Task 6, 7 | ✅ |
| ResultGrid 集成 | Task 8, 9, 10 | ✅ |
| ResultGrid 直接追加新行 | Task 8 | ✅ |
| 条件显示/禁用 | Task 4（工厂函数内实现） | ✅ |
| 测试验证 | Task 11 | ✅ |

---

## Placeholder Scan

- 无 TBD/TODO
- 无 "implement later"
- 所有代码片段完整
- 所有文件路径精确
- 类型名称一致（MenuContext, MenuConfigItem 等）
