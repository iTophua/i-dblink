import React, { useState } from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import { TableOutlined, PlayCircleOutlined, SwapOutlined } from '@ant-design/icons';
import type { TableInfo } from '../../../types/api';
import { TABLE_NODE_STYLE, formatRowCount } from '../utils/tableTypeHelpers';
import { QuickActionButton } from './QuickActionButton';
import { HighlightText } from './HighlightText';

interface TableNodeProps {
  connId: string;
  database: string;
  table: TableInfo;
  schema?: string;
  selectedTableId: string | null;
  searchQuery?: string;
  onTableClick: (tableName: string, database: string, schema?: string) => void;
  onTableOpen: (tableName: string, database: string) => void;
  onContextMenu: (connId: string, tableName: string, database?: string) => MenuProps;
  onNewQuery: (connId: string) => void;
}

export const TableNode = React.memo<TableNodeProps>(
  ({
    connId,
    database,
    table,
    schema,
    selectedTableId,
    searchQuery,
    onTableClick,
    onTableOpen,
    onContextMenu,
    onNewQuery,
  }) => {
    const { t } = useTranslation();
    const [hovered, setHovered] = useState(false);
    const isSelected = selectedTableId === table.table_name;
    const backgroundColor = isSelected
      ? 'var(--row-selected-bg)'
      : hovered
        ? 'var(--row-hover-bg)'
        : 'transparent';

    return (
      <Dropdown menu={onContextMenu(connId, table.table_name, database)} trigger={['contextMenu']}>
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
            onTableClick(table.table_name, database, schema);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onTableOpen(table.table_name, database);
          }}
          data-testid={`table-node-${table.table_name}`}
        >
          <TableOutlined style={{ color: 'var(--color-info)', fontSize: 12 }} />
          <span style={{ fontSize: 13 }}>
            <HighlightText text={table.table_name} query={searchQuery} />
          </span>
          {table.row_count != null && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>
              ({formatRowCount(table.row_count)})
            </span>
          )}
          {hovered && (
            <>
              <QuickActionButton
                icon={<PlayCircleOutlined />}
                tooltip={t('common.newQueryTooltip')}
                visible={hovered}
                onClick={(e) => {
                  e.stopPropagation();
                  onNewQuery(connId);
                }}
              />
              <QuickActionButton
                icon={<SwapOutlined style={{ fontSize: 10 }} />}
                tooltip={t('common.viewDataTooltip')}
                visible={hovered}
                onClick={(e) => {
                  e.stopPropagation();
                  onTableOpen(table.table_name, database);
                }}
              />
            </>
          )}
        </span>
      </Dropdown>
    );
  }
);
