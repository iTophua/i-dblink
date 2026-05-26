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

// Menu context for factory functions
export interface MenuContext {
  dbType?: DatabaseType;
  tableName?: string;
  row?: number;
  col?: number;
  colName?: string;
  cellValue?: unknown;
  rowData?: Record<string, unknown>;
  selectedRows?: Record<string, unknown>[];
  columns?: ColumnInfo[];
  queryColumns?: string[];
  hiddenColumns?: Set<string>;
  isEditable?: boolean;
  // Callbacks
  onCopyToClipboard?: (text: string) => void;
  onSetWhereClause?: (where: string) => void;
  onSetOrderByClause?: (orderBy: string) => void;
  onHideColumn?: (colName: string) => void;
  onCellEdited?: (col: number, row: number, value: string) => void;
}
