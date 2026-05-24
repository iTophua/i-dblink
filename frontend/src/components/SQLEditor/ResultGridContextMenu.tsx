import React, { useMemo } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { App } from 'antd';
import { ContextMenu } from '../ContextMenu';
import type { MenuConfigItem, MenuContext, MenuItemConfig } from '../ContextMenu';
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
  const { t } = useTranslation();
  const { message } = App.useApp();

  const items = useMemo<MenuConfigItem[]>(() => {
    // 如果没有选中行但右键点击了某个单元格，使用当前行作为选中行
    const effectiveSelectedRows = selectedRows.length > 0
      ? selectedRows
      : menuTarget.rowData
        ? [menuTarget.rowData]
        : [];

    const ctx: MenuContext = {
      ...context,
      cellValue: menuTarget.cellValue,
      colName: menuTarget.colName,
      rowData: menuTarget.rowData,
      selectedRows: effectiveSelectedRows,
    };

    const handleCloseWithMessage = (msg?: string) => {
      onClose();
      if (msg) {
        message.success(msg);
      }
    };

    const result: MenuConfigItem[] = [
      createCopyCellValueItem(ctx, t, () => handleCloseWithMessage(t('common.copied'))),
      createCopyCellAsSqlLiteralItem(ctx, t, () => handleCloseWithMessage(t('common.copied'))),
      { type: 'divider' },
      createSetNullItem(ctx, t, onClose),
      createSetDefaultItem(ctx, t, onClose),
      { type: 'divider' },
      createQuickFilterItems(ctx, t, onClose),
      { type: 'divider' },
      createCopyAsInsertItem(ctx, t, () => handleCloseWithMessage(t('common.contextMenu.copyAsInsert') + ' ' + t('common.copied'))),
      createCopyAsSingleInsertItem(ctx, t, () => handleCloseWithMessage(t('common.contextMenu.copyAsSingleInsert') + ' ' + t('common.copied'))),
      createCopyAsUpdateItem(ctx, t, () => handleCloseWithMessage(t('common.contextMenu.copyAsUpdate') + ' ' + t('common.copied'))),
      createCopyAsDeleteItem(ctx, t, () => handleCloseWithMessage(t('common.contextMenu.copyAsDelete') + ' ' + t('common.copied'))),
      { type: 'divider' },
      createCopyRowAsJsonItem(ctx, t, () => handleCloseWithMessage(t('common.contextMenu.copyAsJson') + ' ' + t('common.copied'))),
    ];

    // ResultGrid 私有项：Add Row
    if (onAddRow && context.isEditable) {
      const addRowItem: MenuItemConfig = {
        key: 'add-row',
        icon: <PlusOutlined />,
        label: t('common.contextMenu.addNewRow'),
        onClick: () => {
          onAddRow();
          onClose();
        },
      };
      result.push({ type: 'divider' });
      result.push(addRowItem);
    }

    return result;
  }, [menuTarget, selectedRows, context, onAddRow, onClose, t, message]);

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
