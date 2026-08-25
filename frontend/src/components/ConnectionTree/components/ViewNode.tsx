import React, { useState } from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import { EyeOutlined, PlayCircleOutlined } from '@ant-design/icons';
import type { TableInfo } from '../../../types/api';
import { TABLE_NODE_STYLE, formatRowCount } from '../utils/tableTypeHelpers';
import { QuickActionButton } from './QuickActionButton';
import { HighlightText } from './HighlightText';

interface ViewNodeProps {
  connId: string;
  database: string;
  view: TableInfo;
  schema?: string;
  selectedTableId: string | null;
  searchQuery?: string;
  onTableClick: (tableName: string, database: string, schema?: string) => void;
  onTableOpen: (tableName: string, database: string) => void;
  onViewOpen?: (viewName: string, database: string) => void;
  onContextMenu: (connId: string, tableName: string, database?: string) => MenuProps;
  onNewQuery: (connId: string) => void;
}

export const ViewNode = React.memo<ViewNodeProps>(
  ({
    connId,
    database,
    view,
    schema,
    selectedTableId,
    searchQuery,
    onTableClick,
    onTableOpen,
    onViewOpen,
    onContextMenu,
    onNewQuery,
  }) => {
    const { t } = useTranslation();
    const [hovered, setHovered] = useState(false);
    const isSelected = selectedTableId === view.table_name;
    const backgroundColor = isSelected
      ? 'var(--row-selected-bg)'
      : hovered
        ? 'var(--row-hover-bg)'
        : 'transparent';

    return (
      <Dropdown menu={onContextMenu(connId, view.table_name, database)} trigger={['contextMenu']}>
        <span
          style={{
            ...TABLE_NODE_STYLE,
            background: backgroundColor,
            border: isSelected ? '1px solid var(--row-selected-bg)' : '1px solid transparent',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={(e) => {
            e.stopPropagation();
            onTableClick(view.table_name, database, schema);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (onViewOpen) {
              onViewOpen(view.table_name, database);
            } else {
              onTableOpen(view.table_name, database);
            }
          }}
          data-testid={`view-node-${view.table_name}`}
        >
          <EyeOutlined style={{ color: 'var(--color-warning)', fontSize: 12 }} />
          <span style={{ fontSize: 13 }}>
            <HighlightText text={view.table_name} query={searchQuery} />
          </span>
          {view.row_count != null && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>
              ({formatRowCount(view.row_count)})
            </span>
          )}
          {hovered && (
            <QuickActionButton
              icon={<PlayCircleOutlined />}
              tooltip={t('common.newQueryTooltip')}
              visible={hovered}
              onClick={(e) => {
                e.stopPropagation();
                onNewQuery(connId);
              }}
            />
          )}
        </span>
      </Dropdown>
    );
  }
);
