import { useState, useCallback, useMemo } from 'react';
import { List, Tag, Typography, Empty, Button, Space, Popconfirm } from 'antd';
import {
  SearchOutlined,
  ClearOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../hooks/useThemeColors';
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

export function HistoryPanel({
  onSelect,
  maxHistory = 50,
  storageKey = 'sql-history',
}: HistoryPanelProps) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const tc = useThemeColors();

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
  const addHistory = useCallback(
    (item: Omit<HistoryItem, 'timestamp'>) => {
      const newItem: HistoryItem = {
        ...item,
        timestamp: Date.now(),
      };

      setHistory((prev) => {
        const updated = [newItem, ...prev].slice(0, maxHistory);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        return updated;
      });
    },
    [maxHistory, storageKey]
  );

  // 清空历史记录
  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  // 过滤历史记录
  const filteredHistory = useMemo(() => {
    if (!searchText) return history;
    return history.filter((item) => item.sql.toLowerCase().includes(searchText.toLowerCase()));
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
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--background-card)',
      }}
    >
      {/* 工具栏 */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid var(--border)`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--background-toolbar)',
          flexShrink: 0,
        }}
      >
        <Space size="small">
          <GlobalInput
            placeholder={t('common.searchSql')}
            prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            size="small"
            style={{ width: 180 }}
          />
        </Space>

        <Space size="small">
          <Tag color="blue">            {history.length} {t('common.items')}</Tag>
          <Popconfirm
            title={t('common.confirmClear')}
            description={t('common.confirmClearHistory')}
            onConfirm={clearHistory}
            okText={t('common.clear')}
            cancelText={t('common.cancel')}
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
            description={searchText ? t('common.noMatchingSql') : t('common.noHistory')}
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
                  borderBottom: `1px solid var(--border)`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--row-hover-bg)';
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
                        color: item.success ? 'var(--color-success)' : 'var(--color-error)',
                      }}
                    />
                  }
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong style={{ fontSize: 12 }}>
                        {item.sql.length > 60 ? item.sql.substring(0, 60) + '...' : item.sql}
                      </Text>
                      <Tag color={item.success ? 'success' : 'error'} style={{ fontSize: 10 }}>
                        {item.success ? t('common.success') : t('common.failed')}
                      </Tag>
                    </div>
                  }
                  description={
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
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
