import { useState, useEffect, useMemo } from 'react';
import { Modal, Input, List, Tag, Empty } from 'antd';
import { SearchOutlined, TableOutlined, EyeOutlined } from '@ant-design/icons';
import type { TableInfo } from '../types/api';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onSelectTable: (connectionId: string, database: string, tableName: string) => void;
  connectionDatabases?: Record<string, { database: string; tables: TableInfo[] }[]>;
}

export function GlobalSearch({ open, onClose, onSelectTable, connectionDatabases = {} }: GlobalSearchProps) {
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
      title="全局搜索"
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索表名、视图名..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        style={{ marginBottom: 16 }}
      />

      {results.length === 0 ? (
        query ? (
          <Empty description="未找到匹配结果" />
        ) : (
          <Empty description="输入关键词开始搜索" />
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
                    <EyeOutlined style={{ color: '#1890ff' }} />
                  ) : (
                    <TableOutlined style={{ color: '#52c41a' }} />
                  )
                }
                title={item.name}
                description={
                  <span>
                    <Tag style={{ fontSize: 11, padding: '0 4px' }}>{item.database}</Tag>
                    {' '}
                    <Tag style={{ fontSize: 11, padding: '0 4px' }} color={item.type === 'view' ? 'blue' : 'green'}>
                      {item.type === 'view' ? '视图' : '表'}
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
