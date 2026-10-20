import { useState, useEffect, useMemo } from 'react';
import { Modal, Input, Tag, Empty } from 'antd';
import { SearchOutlined, TableOutlined, EyeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
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
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

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
      setSelectedIndex(0);
    }
  }, [open]);

  // 结果集可能随 connectionDatabases 变化而收缩，使用时钳制到有效范围
  const currentIndex = Math.min(selectedIndex, Math.max(results.length - 1, 0));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const item = results[currentIndex];
      if (item) {
        onSelectTable(item.connectionId, item.database, item.name);
        onClose();
      }
    }
  };

  return (
    <Modal
      title={t('common.mainLayout.globalSearch')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      transitionName=""
      maskTransitionName=""
      styles={{ body: { paddingTop: 12 } }}
    >
      <Input
        prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
        placeholder={t('common.searchTableOrView')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        autoFocus
        allowClear
        style={{ marginBottom: 12 }}
      />

      {results.length === 0 ? (
        <Empty
          description={
            query ? t('common.noMatchingResults') : t('common.enterKeywordToSearch')
          }
          style={{ padding: '32px 0' }}
        />
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {results.map((item, index) => (
            <div
              key={`${item.connectionId}::${item.database}::${item.name}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                background:
                  index === currentIndex ? 'var(--row-selected-bg)' : 'transparent',
                borderLeft:
                  index === currentIndex
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => {
                onSelectTable(item.connectionId, item.database, item.name);
                onClose();
              }}
            >
              {item.type === 'view' ? (
                <EyeOutlined style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
              ) : (
                <TableOutlined style={{ color: 'var(--color-info)', flexShrink: 0 }} />
              )}
              <span
                style={{
                  fontFamily: 'var(--font-family-code)',
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.name}
              </span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, flexShrink: 0 }}>
                <Tag style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>
                  {item.database}
                </Tag>
                <Tag
                  style={{ fontSize: 11, padding: '0 4px', margin: 0 }}
                  color={item.type === 'view' ? 'orange' : 'blue'}
                >
                  {item.type === 'view' ? t('common.view') : t('common.table')}
                </Tag>
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          padding: '8px 4px 0',
          borderTop: '1px solid var(--border-color)',
          fontSize: 11,
          color: 'var(--text-tertiary)',
          display: 'flex',
          gap: 16,
          marginTop: 4,
        }}
      >
        <span>{t('common.navigateUpDown')}</span>
        <span>{t('common.executeEnter')}</span>
        <span>{t('common.closeEsc')}</span>
      </div>
    </Modal>
  );
}
