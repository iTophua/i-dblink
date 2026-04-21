import { useState, useCallback, useMemo } from 'react';
import { List, Tag, Typography, Empty, Button, Space, Popconfirm } from 'antd';
import { SearchOutlined, ClearOutlined, ReloadOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { theme } from 'antd';
import { GlobalInput } from '../GlobalInput';

const { Text } = Typography;

interface HistoryItem {
  sql: string;
  timestamp: number;
  success: boolean;
  duration?: number;
  rowCount?: number;
}

interface HistoryPanelProps {
  onSelect: (sql: string) => void;
  maxHistory?: number;
  storageKey?: string;
}

export function HistoryPanel({ onSelect, maxHistory = 50, storageKey = 'sql-history' }: HistoryPanelProps) {
  const [searchText, setSearchText] = useState('');
  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';

  // 从 localStorage 加载历史记录
  const loadHistory = useCallback((): HistoryItem[] => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, [storageKey]);

  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);

  // 添加历史记录
  const addHistory = useCallback((item: Omit<HistoryItem, 'timestamp'>) => {
    const newItem: HistoryItem = {
      ...item,
      timestamp: Date.now(),
    };

    setHistory(prev => {
      const updated = [newItem, ...prev].slice(0, maxHistory);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  }, [maxHistory, storageKey]);

  // 清空历史记录
  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  // 过滤历史记录
  const filteredHistory = useMemo(() => {
    if (!searchText) return history;
    return history.filter(item =>
      item.sql.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [history, searchText]);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString();
  };

  // 暴露 addHistory 方法供外部调用
  useMemo(() => {
    window.__sqlHistoryApi = { addHistory };
  }, [addHistory]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: isDarkMode ? '#1f1f1f' : '#fff' }}>
      {/* 工具栏 */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: isDarkMode ? '#141414' : '#fafafa',
        flexShrink: 0,
      }}>
        <Space size="small">
          <GlobalInput
            placeholder="搜索 SQL..."
            prefix={<SearchOutlined style={{ color: '#999' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            size="small"
            style={{ width: 180 }}
          />
        </Space>

        <Space size="small">
          <Tag color="blue">{history.length} 条</Tag>
          <Popconfirm
            title="确认清空"
            description="确定要清空所有历史记录吗？"
            onConfirm={clearHistory}
            okText="清空"
            cancelText="取消"
          >
            <Button icon={<ClearOutlined />} size="small" danger>
              清空
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {filteredHistory.length === 0 ? (
          <Empty
            description={searchText ? '未找到匹配的 SQL' : '暂无历史记录'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 40 }}
          />
        ) : (
          <List
            dataSource={filteredHistory}
            renderItem={(item) => (
              <List.Item
                onClick={() => onSelect(item.sql)}
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
                    <ClockCircleOutlined
                      style={{
                        fontSize: 16,
                        color: item.success ? '#52c41a' : '#ff4d4f',
                      }}
                    />
                  }
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong style={{ fontSize: 12 }}>
                        {item.sql.length > 60 ? item.sql.substring(0, 60) + '...' : item.sql}
                      </Text>
                      <Tag color={item.success ? 'success' : 'error'} style={{ fontSize: 10 }}>
                        {item.success ? '成功' : '失败'}
                      </Tag>
                    </div>
                  }
                  description={
                    <div style={{ fontSize: 11, color: '#999' }}>
                      <Space size="small">
                        <span>{formatTime(item.timestamp)}</span>
                        {item.duration && <span>{item.duration}ms</span>}
                        {item.rowCount !== undefined && <span>{item.rowCount} 行</span>}
                      </Space>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );
}

export default HistoryPanel;
