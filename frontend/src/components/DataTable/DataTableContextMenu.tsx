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
