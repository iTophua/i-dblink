import { useState, useCallback, useMemo } from 'react';
import { List, Tag, Typography, Empty, Button, Space, Popconfirm, Tooltip, message } from 'antd';
import {
  SearchOutlined,
  ClearOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  CaretRightOutlined,
  CopyOutlined,
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
  /** 重跑指定 SQL（若提供则显示"重跑"按钮） */
  onRerun?: (sql: string) => void;
  maxHistory?: number;
  storageKey?: string;
}

export function HistoryPanel({
  onSelect,
  onRerun,
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

    if (diffMins < 1) return t('common.justNow');
    if (diffMins < 60) return t('common.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('common.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
    return date.toLocaleDateString();
  };

  // 格式化执行耗时：ms / s
  const formatDuration = (ms?: number) => {
    if (ms === undefined || ms === null) return null;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // 复制 SQL 到剪贴板
  const handleCopy = useCallback((sql: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sql).then(
      () => message.success(t('common.copiedToClipboard')),
      () => message.error(t('common.copyFailed'))
    );
  }, [t]);

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
          <Tag style={{ background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>
            {' '}
            {history.length} {t('common.items')}
          </Tag>
          <Popconfirm
            title={t('common.confirmClear')}
            description={t('common.confirmClearHistory')}
            onConfirm={clearHistory}
            okText={t('common.logPanel.clear')}
            cancelText={t('common.cancel')}
          >
            <Button icon={<ClearOutlined />} size="small" danger>
              {t('common.logPanel.clear')}
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
            renderItem={(item) => {
              const dur = formatDuration(item.duration);
              return (
                <List.Item
                  onClick={() => onSelect(item.sql)}
                  className="hoverable"
                  style={{
                    padding: '10px 16px',
                    borderBottom: `1px solid var(--border)`,
                    borderLeft: `3px solid ${item.success ? 'var(--color-success)' : 'var(--color-error)'}`,
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
                        <Text strong style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.sql.length > 80 ? item.sql.substring(0, 80) + '...' : item.sql}
                        </Text>
                        <Tag color={item.success ? 'success' : 'error'} style={{ fontSize: 10, margin: 0, flexShrink: 0 }}>
                          {item.success ? t('common.success') : t('common.failed')}
                        </Tag>
                        {/* hover 时显示的操作按钮 */}
                        <Space size={0} style={{ flexShrink: 0 }}>
                          <Tooltip title={t('common.copySqlContent')}>
                            <Button
                              type="text"
                              size="small"
                              icon={<CopyOutlined />}
                              onClick={(e) => handleCopy(item.sql, e)}
                              style={{ padding: '0 4px', height: 20 }}
                            />
                          </Tooltip>
                          {onRerun && (
                            <Tooltip title={t('common.rerun')}>
                              <Button
                                type="text"
                                size="small"
                                icon={<CaretRightOutlined />}
                                onClick={(e) => { e.stopPropagation(); onRerun(item.sql); }}
                                style={{ padding: '0 4px', height: 20, color: 'var(--color-primary)' }}
                              />
                            </Tooltip>
                          )}
                        </Space>
                      </div>
                    }
                    description={
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        <Space size="middle">
                          <span>{formatTime(item.timestamp)}</span>
                          {dur && (
                            <span>
                              <ClockCircleOutlined style={{ marginRight: 2 }} />
                              {dur}
                            </span>
                          )}
                          {item.rowCount !== undefined && item.rowCount > 0 && (
                            <span>
                              → {item.rowCount} {t('common.rows')}
                            </span>
                          )}
                        </Space>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}

export default HistoryPanel;
