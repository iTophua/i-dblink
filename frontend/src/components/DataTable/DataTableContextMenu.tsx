import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ContextMenu } from '../ContextMenu';
import type { MenuConfigItem, MenuContext } from '../ContextMenu';
import {
  createCopyCellValueItem,
  createCopyCellAsSqlLiteralItem,
  createSetNullItem,
  createSetDefaultItem,
  createQuickFilterItems,
  createCopyAsInsertItem,
  createCopyAsSingleInsertItem,
  createCopyAsUpdateItem,
  createCopyAsDeleteItem,
  createCopyRowAsJsonItem,
} from '../ContextMenu/menuItems';
import { createPreviewCellItem } from './CellPreviewDialog';

interface DataTableContextMenuProps {
  menuState: { visible: boolean; x: number; y: number };
  menuTarget: { row?: number; col?: number; cellValue?: unknown; colName?: string; rowData?: Record<string, unknown> };
  selectedRows: Record<string, unknown>[];
  context: MenuContext & { onPreviewCell?: (value: unknown, colName: string, row?: number, col?: number) => void };
  onClose: () => void;
}

export function DataTableContextMenu({
  menuState,
  menuTarget,
  selectedRows,
  context,
  onClose,
}: DataTableContextMenuProps) {
  const { t } = useTranslation();

  const items = useMemo<MenuConfigItem[]>(() => {
    const ctx: MenuContext & { onPreviewCell?: (value: unknown, colName: string, row?: number, col?: number) => void } = {
      ...context,
      cellValue: menuTarget.cellValue,
      colName: menuTarget.colName,
      rowData: menuTarget.rowData,
      row: menuTarget.row,
      col: menuTarget.col,
      selectedRows,
    };

    return [
      createPreviewCellItem(ctx, t, onClose),
      createCopyCellValueItem(ctx, t, onClose),
      createCopyCellAsSqlLiteralItem(ctx, t, onClose),
      { type: 'divider' },
      createSetNullItem(ctx, t, onClose),
      createSetDefaultItem(ctx, t, onClose),
      { type: 'divider' },
      createQuickFilterItems(ctx, t, onClose),
      { type: 'divider' },
      createCopyAsInsertItem(ctx, t, onClose),
      createCopyAsSingleInsertItem(ctx, t, onClose),
      createCopyAsUpdateItem(ctx, t, onClose),
      createCopyAsDeleteItem(ctx, t, onClose),
      { type: 'divider' },
      createCopyRowAsJsonItem(ctx, t, onClose),
    ];
  }, [menuTarget, selectedRows, context, onClose, t]);

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
