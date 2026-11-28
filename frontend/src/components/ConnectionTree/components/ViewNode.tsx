import React, { useState } from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import { EyeOutlined, PlayCircleOutlined } from '@ant-design/icons';
import type { TableInfo } from '../../../types/api';
import { TABLE_NODE_STYLE, formatRowCount } from '../utils/tableTypeHelpers';
import { qualifiedTableName } from '../../../utils/qualifiedName';
import { QuickActionButton } from './QuickActionButton';
import { HighlightText } from './HighlightText';

interface ViewNodeProps {
  connId: string;
  database: string;
  view: TableInfo;
  schema?: string;
  /** 连接的库类型：决定视图名要不要带 schema（PG 系、SQL Server 要） */
  dbType?: string;
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
    dbType,
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
    // 打开、右键菜单都用带 schema 的名字（同表节点）
    const fullName = qualifiedTableName(view.table_name, schema, dbType);
    const isSelected = selectedTableId === view.table_name || selectedTableId === fullName;
    const backgroundColor = isSelected
      ? 'var(--row-selected-bg)'
      : hovered
        ? 'var(--row-hover-bg)'
        : 'transparent';

    return (
      <Dropdown menu={onContextMenu(connId, fullName, database)} trigger={['contextMenu']}>
        <span
          style={{
            ...TABLE_NODE_STYLE,
            width: '100%',
            background: backgroundColor,
            border: isSelected ? '1px solid var(--row-selected-bg)' : '1px solid transparent',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={(e) => {
            e.stopPropagation();
            onTableClick(fullName, database, schema);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (onViewOpen) {
              onViewOpen(fullName, database);
            } else {
              onTableOpen(fullName, database);
            }
          }}
          data-testid={`view-node-${view.table_name}`}
        >
          <EyeOutlined style={{ color: 'var(--color-warning)', fontSize: 12 }} />
          <span
            style={{
              fontSize: 12.5,
              fontFamily: 'var(--font-family-code)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <HighlightText text={view.table_name} query={searchQuery} />
          </span>
          {view.row_count != null && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                marginLeft: 'auto',
                paddingLeft: 8,
                fontFamily: 'var(--font-family-numeric)',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {formatRowCount(view.row_count)}
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
