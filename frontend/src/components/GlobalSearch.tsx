import { useState, useEffect, useMemo } from 'react';
import { Modal, Input, List, Tag, Empty } from 'antd';
import { SearchOutlined, TableOutlined, EyeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import type { TableInfo } from '../types/api';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onSelectTable: (connectionId: string, database: string, tableName: string) => void;
  connectionDatabases?: Record<string, { database: string; tables: TableInfo[] }[]>;
}

export function GlobalSearch({
  open,
  onClose,
  onSelectTable,
  connectionDatabases = {},
}: GlobalSearchProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return [];

    const q = query.toLowerCase();
    const items: Array<{
      type: 'table' | 'view';
      name: string;
      connectionId: string;
      database: string;
    }> = [];

    for (const [connId, dbs] of Object.entries(connectionDatabases)) {
      for (const db of dbs) {
        for (const table of db.tables) {
          if (table.table_name.toLowerCase().includes(q)) {
            items.push({
              type: table.table_type.toUpperCase() === 'VIEW' ? 'view' : 'table',
              name: table.table_name,
              connectionId: connId,
              database: db.database,
            });
          }
        }
      }
    }

    return items.slice(0, 50);
  }, [query, connectionDatabases]);

  useEffect(() => {
    if (open) {
      setQuery('');
    }
  }, [open]);

  return (
    <Modal
      title={t('common.mainLayout.globalSearch')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      transitionName=""
      maskTransitionName=""
    >
      <Input
        prefix={<SearchOutlined />}
        placeholder={t('common.searchTableOrView')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        style={{ marginBottom: 16 }}
      />

      {results.length === 0 ? (
        query ? (
          <Empty description={t('common.noMatchingResults')} />
        ) : (
          <Empty description={t('common.enterKeywordToSearch')} />
        )
      ) : (
        <List
          size="small"
          dataSource={results}
          renderItem={(item) => (
            <List.Item
              style={{ cursor: 'pointer' }}
              onClick={() => {
                onSelectTable(item.connectionId, item.database, item.name);
                onClose();
              }}
            >
              <List.Item.Meta
                avatar={
                  item.type === 'view' ? (
                    <EyeOutlined style={{ color: tc.primary }} />
                  ) : (
                    <TableOutlined style={{ color: tc.primary }} />
                  )
                }
                title={item.name}
                description={
                  <span>
                    <Tag style={{ fontSize: 11, padding: '0 4px' }}>{item.database}</Tag>{' '}
                    <Tag
                      style={{ fontSize: 11, padding: '0 4px' }}
                      color={item.type === 'view' ? 'blue' : 'green'}
                    >
                      {item.type === 'view' ? t('common.view') : t('common.table')}
                    </Tag>
                  </span>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  );
}
