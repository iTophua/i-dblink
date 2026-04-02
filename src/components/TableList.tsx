import { useState, useMemo, useEffect } from 'react';
import { List, Input, Tag, Typography, Spin, Empty, Button, Space, message } from 'antd';
import { TableOutlined, SearchOutlined, ReloadOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { theme } from 'antd';

const { Text } = Typography;

export interface TableData {
  table_name: string;
  table_type: string;
  row_count?: number;
  comment?: string;
}

interface TableListProps {
  connectionId: string;
  onTableSelect?: (tableName: string) => void;
}

export function TableList({ connectionId, onTableSelect }: TableListProps) {
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [tables, setTables] = useState<TableData[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';

  const loadTables = async () => {
    try {
      setLoading(true);
      const result = await invoke<TableData[]>('get_tables', { connectionId });
      setTables(result);
    } catch (error: any) {
      console.error('Failed to load tables:', error);
      message.error(`加载表列表失败：${error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, [connectionId]);

  const filteredTables = useMemo(() => {
    if (!searchText) return tables;
    return tables.filter((table) =>
      table.table_name.toLowerCase().includes(searchText.toLowerCase()) ||
      table.comment?.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [tables, searchText]);

  const tableCount = filteredTables.filter(t => t.table_type === 'BASE TABLE').length;
  const viewCount = filteredTables.filter(t => t.table_type === 'VIEW').length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: isDarkMode ? '#1f1f1f' : '#fff' }}>
      <div style={{
        padding: '4px 8px',
        borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: isDarkMode ? '#141414' : '#fafafa',
        flexShrink: 0,
      }}>
        <Space size="small">
          <Button icon={<ReloadOutlined />} size="small" onClick={loadTables} loading={loading}>
            刷新
          </Button>
          <div style={{ width: 1, height: 16, background: isDarkMode ? '#434343' : '#d9d9d9', margin: '0 4px' }} />
          <Input
            placeholder="搜索表名或注释..."
            prefix={<SearchOutlined style={{ color: '#999' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            size="small"
            style={{ width: 160 }}
          />
        </Space>

        <Space size="small">
          <Tag color="blue">表 {tableCount}</Tag>
          <Tag color="purple">视图 {viewCount}</Tag>
          <Button
            icon={viewMode === 'list' ? <UnorderedListOutlined /> : <AppstoreOutlined />}
            size="small"
            type="text"
            onClick={() => setViewMode(prev => prev === 'list' ? 'grid' : 'list')}
          />
        </Space>
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#999' }}>加载中...</div>
          </div>
        ) : filteredTables.length === 0 ? (
          searchText ? (
            <Empty description="未找到匹配的表" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Empty description="暂无表" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )
        ) : viewMode === 'list' ? (
          <List
            dataSource={filteredTables}
            renderItem={(table) => (
              <List.Item
                onClick={() => onTableSelect?.(table.table_name)}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  borderBottom: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(24,144,255,0.1)' : '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <List.Item.Meta
                  avatar={
                    table.table_type === 'VIEW'
                      ? <TableOutlined style={{ fontSize: 18, color: '#1890ff' }} />
                      : <TableOutlined style={{ fontSize: 18, color: '#52c41a' }} />
                  }
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong>{table.table_name}</Text>
                      {table.table_type === 'VIEW' && (
                        <Tag color="purple" style={{ fontSize: 10 }}>视图</Tag>
                      )}
                    </div>
                  }
                  description={
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {table.comment && <div style={{ marginBottom: 2 }}>{table.comment}</div>}
                      {table.row_count !== undefined && `${table.row_count.toLocaleString()} 行`}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {filteredTables.map((table) => (
              <div
                key={table.table_name}
                onClick={() => onTableSelect?.(table.table_name)}
                style={{
                  padding: 16,
                  cursor: 'pointer',
                  borderRadius: 8,
                  border: `1px solid ${isDarkMode ? '#434343' : '#e8e8e8'}`,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#1890ff';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(24,144,255,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isDarkMode ? '#434343' : '#e8e8e8';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {table.table_type === 'VIEW'
                    ? <TableOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                    : <TableOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                  }
                  <Text strong style={{ fontSize: 14 }}>{table.table_name}</Text>
                </div>
                {table.comment && <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{table.comment}</div>}
                {table.row_count !== undefined && (
                  <div style={{ fontSize: 12, color: '#999' }}>{table.row_count.toLocaleString()} 行</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!loading && tables.length > 0 && (
        <div style={{
          padding: '8px 16px',
          borderTop: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}`,
          fontSize: 12,
          color: '#999',
          textAlign: 'right',
          flexShrink: 0,
        }}>
          共 {filteredTables.length} 个对象
          {searchText && `（过滤自 ${tables.length} 个）`}
        </div>
      )}
    </div>
  );
}
