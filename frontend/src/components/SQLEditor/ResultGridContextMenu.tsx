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
