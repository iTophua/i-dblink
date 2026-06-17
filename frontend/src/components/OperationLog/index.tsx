import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, List, Tag, Empty, Button, Space, Select, Spin, App } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  LinkOutlined,
  DisconnectOutlined,
  SearchOutlined,

  CheckCircleOutlined,
  CloseCircleOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { api } from '../../api';

interface OperationLogProps {
  open: boolean;
  onClose: () => void;
}

interface HistoryRecord {
  id: string;
  connection_id: string;
  action: string;
  success: boolean;
  error_message: string;
  created_at: string;
}

const actionIconMap: Record<string, React.ReactNode> = {
  connect: <LinkOutlined style={{ color: 'var(--color-success)' }} />,
  disconnect: <DisconnectOutlined style={{ color: 'var(--text-tertiary)' }} />,
  query: <SearchOutlined style={{ color: 'var(--color-primary)' }} />,
};

const actionLabelMap: Record<string, string> = {
  connect: 'common.mainLayout.connect',
  disconnect: 'common.mainLayout.disconnectConnection',
  query: 'common.executeQuery',
};

export const OperationLog: React.FC<OperationLogProps> = ({ open, onClose }) => {
  const { t, i18n } = useTranslation();
  const { message, modal } = App.useApp();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getConnectionHistory(200);
      setRecords((result || []) as HistoryRecord[]);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchHistory();
    }
  }, [open, fetchHistory]);

  const filteredRecords =
    filter === 'all' ? records : records.filter((r) => r.action === filter);

  const handleClear = useCallback(() => {
    modal.confirm({
      title: t('common.operationLog.clearTitle'),
      content: t('common.operationLog.clearConfirm'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.clearConnectionHistory();
          setRecords([]);
          message.success(t('common.operationLog.cleared'));
        } catch {
          message.error(t('common.operationLog.clearFailed'));
        }
      },
    });
  }, [modal, message, t]);

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const isToday =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      const lang = i18n.language || 'zh-CN';
      const time = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (isToday) return time;
      return `${d.toLocaleDateString(lang, { month: '2-digit', day: '2-digit' })} ${time}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <Drawer
      title={
        <Space>
          <span>{t('common.operationLog.title')}</span>
          <Select
            size="small"
            value={filter}
            onChange={setFilter}
            style={{ width: 100 }}
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'connect', label: t('common.mainLayout.connect') },
              { value: 'disconnect', label: t('common.mainLayout.disconnectConnection') },
              { value: 'query', label: t('common.executeQuery') },
            ]}
          />
        </Space>
      }
      open={open}
      onClose={onClose}
      width={420}
      placement="right"
      extra={
        <Button
          size="small"
          danger
          icon={<ClearOutlined />}
          onClick={handleClear}
          disabled={records.length === 0}
        >
          {t('common.operationLog.clear')}
        </Button>
      }
      styles={{ body: { padding: 0 } }}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : filteredRecords.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('common.operationLog.empty')}
          style={{ marginTop: 60 }}
        />
      ) : (
        <List
          dataSource={filteredRecords}
          style={{ height: '100%' }}
          renderItem={(item) => (
            <List.Item
              style={{
                padding: '8px 16px',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <List.Item.Meta
                avatar={
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: item.success ? 'rgba(82,196,26,0.1)' : 'rgba(255,77,79,0.1)',
                      fontSize: 14,
                    }}
                  >
                    {actionIconMap[item.action] || <SearchOutlined />}
                  </span>
                }
                title={
                  <Space size={4}>
                    <span style={{ fontSize: 12 }}>{t(actionLabelMap[item.action] || item.action)}</span>
                    {item.success ? (
                      <Tag color="success" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                        <CheckCircleOutlined /> {t('common.success')}
                      </Tag>
                    ) : (
                      <Tag color="error" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                        <CloseCircleOutlined /> {t('common.error')}
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {formatTime(item.created_at)}
                    </div>
                    {item.error_message && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--color-error)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 300,
                        }}
                      >
                        {item.error_message}
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  );
};
