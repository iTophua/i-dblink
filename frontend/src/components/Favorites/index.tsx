import React, { useState, useEffect } from 'react';
import { Drawer, List, Button, Input, Tag, Empty, Space, App, Tabs } from 'antd';
import {
  StarFilled,
  DeleteOutlined,
  TableOutlined,
  CodeOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';

interface Favorite {
  id: string;
  type: string;
  name: string;
  connection_id?: string;
  database?: string;
  table_name?: string;
  sql_text?: string;
  tags: string;
  created_at: string;
}

interface FavoritesProps {
  open: boolean;
  onClose: () => void;
  onSelectTable?: (connectionId: string, database: string, tableName: string) => void;
  onSelectQuery?: (sql: string) => void;
}

export function Favorites({ open, onClose, onSelectTable, onSelectQuery }: FavoritesProps) {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const loadFavorites = async () => {
    setLoading(true);
    try {
      const result = await api.getFavorites();
      setFavorites(result || []);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`${t('common.favoritesLoadFailed')}: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadFavorites();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDelete = (id: string) => {
    modal.confirm({
      title: t('common.confirmDelete'),
      okText: t('common.delete'),
      okType: 'danger' as const,
      cancelText: t('common.cancel'),
      transitionName: '',
      maskTransitionName: '',
      onOk: async () => {
        try {
          await api.deleteFavorite(id);
          setFavorites((prev) => prev.filter((f) => f.id !== id));
          message.success(t('common.deleteSuccess'));
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          message.error(`${t('common.dataGrid.deleteFailed')}: ${errorMsg}`);
        }
      },
    });
  };

  const filteredFavorites = favorites.filter((f) => {
    if (activeTab !== 'all' && f.type !== activeTab) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <Drawer
      title={
        <Space>
          <StarFilled style={{ color: '#faad14' }} />
          {t('common.favorites')}
        </Space>
      }
      placement="right"
      width={380}
      onClose={onClose}
      open={open}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ padding: '8px 12px' }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 8 }}
        />
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="small"
          items={[
            { key: 'all', label: t('common.all') },
            { key: 'table', label: t('common.table') },
            { key: 'query', label: t('common.query') },
          ]}
        />
      </div>
      {filteredFavorites.length === 0 ? (
        <Empty description={t('common.noFavorites')} style={{ marginTop: 40 }} />
      ) : (
        <List
          loading={loading}
          dataSource={filteredFavorites}
          renderItem={(item) => (
            <List.Item
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                margin: '2px 12px',
              }}
              onClick={() => {
                if (
                  item.type === 'table' &&
                  onSelectTable &&
                  item.connection_id &&
                  item.database &&
                  item.table_name
                ) {
                  onSelectTable(item.connection_id, item.database, item.table_name);
                  onClose();
                } else if (item.type === 'query' && onSelectQuery && item.sql_text) {
                  onSelectQuery(item.sql_text);
                  onClose();
                }
              }}
              actions={[
                <Button
                  key="delete"
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item.id);
                  }}
                />,
              ]}
            >
              <List.Item.Meta
                avatar={
                  item.type === 'table' ? (
                    <TableOutlined
                      style={{ fontSize: 16, color: 'var(--color-primary, #1677ff)' }}
                    />
                  ) : (
                    <CodeOutlined
                      style={{ fontSize: 16, color: 'var(--color-success, #52c41a)' }}
                    />
                  )
                }
                title={item.name}
                description={
                  <Space size={4} wrap>
                    {item.database && (
                      <Tag
                        color="blue"
                        style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}
                      >
                        {item.database}
                      </Tag>
                    )}
                    {item.table_name && (
                      <Tag style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>
                        {item.table_name}
                      </Tag>
                    )}
                    {item.sql_text && (
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--text-tertiary, #999)',
                          maxWidth: 200,
                          display: 'inline-block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.sql_text}
                      </span>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  );
}

export default Favorites;
