import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Table, Button, Space, Tag, Tooltip, Typography, App, Switch } from 'antd';
import {
  ReloadOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api';

const { Text } = Typography;

interface ProcessItem {
  id: string;
  user: string;
  host?: string;
  database?: string;
  command?: string;
  state?: string;
  info?: string;
  time?: string;
  start_time?: string;
  duration?: string;
  serial?: string;
}

interface ProcessListPanelProps {
  open: boolean;
  connectionId: string;
  database?: string;
  onClose: () => void;
}

export const ProcessListPanel: React.FC<ProcessListPanelProps> = ({
  open,
  connectionId,
  database,
  onClose,
}) => {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProcesses = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const result = await api.getProcessList(connectionId, database);
      setProcesses(result || []);
    } catch (err: any) {
      message.error(t('common.processList.fetchFailed') + ': ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  }, [connectionId, database, message, t]);

  useEffect(() => {
    if (open) {
      fetchProcesses();
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, fetchProcesses]);

  useEffect(() => {
    if (autoRefresh && open) {
      intervalRef.current = setInterval(fetchProcesses, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, open, fetchProcesses]);

  const handleKill = useCallback(
    (record: ProcessItem) => {
      modal.confirm({
        title: t('common.processList.confirmKillTitle'),
        content: t('common.processList.confirmKillContent', {
          id: record.id,
          user: record.user,
          query: record.info ? record.info.substring(0, 100) : '',
        }),
        okText: t('common.processList.kill'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        transitionName: '',
        maskTransitionName: '',
        onOk: async () => {
          try {
            await api.killProcess(connectionId, database || '', record.id, record.serial || '');
            message.success(t('common.processList.killSuccess', { id: record.id }));
            fetchProcesses();
          } catch (err: any) {
            message.error(t('common.processList.killFailed') + ': ' + (err.message || err));
          }
        },
      });
    },
    [connectionId, database, modal, message, t, fetchProcesses]
  );

  const columns: ColumnsType<ProcessItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      sorter: (a, b) => Number(a.id) - Number(b.id),
    },
    {
      title: t('common.processList.user'),
      dataIndex: 'user',
      key: 'user',
      width: 120,
    },
    {
      title: t('common.processList.host'),
      dataIndex: 'host',
      key: 'host',
      width: 150,
      render: (val: string | undefined) => val || '-',
    },
    {
      title: t('common.processList.database'),
      dataIndex: 'database',
      key: 'database',
      width: 120,
      render: (val: string | undefined) => val || '-',
    },
    {
      title: t('common.processList.command'),
      dataIndex: 'command',
      key: 'command',
      width: 100,
      render: (val: string | undefined) => {
        if (!val) return '-';
        const color = val === 'Sleep' || val === 'sleep' ? 'default' : 'processing';
        return <Tag color={color}>{val}</Tag>;
      },
    },
    {
      title: t('common.processList.time'),
      dataIndex: 'time',
      key: 'time',
      width: 80,
      sorter: (a, b) => Number(a.time || 0) - Number(b.time || 0),
      render: (val: string | undefined) => val || '-',
    },
    {
      title: t('common.processList.state'),
      dataIndex: 'state',
      key: 'state',
      width: 120,
      render: (val: string | undefined) => {
        if (!val) return '-';
        const colorMap: Record<string, string> = {
          active: 'green',
          idle: 'default',
          'idle in transaction': 'orange',
          waiting: 'red',
          running: 'green',
          sleeping: 'default',
        };
        const color = colorMap[val.toLowerCase()] || 'default';
        return <Tag color={color}>{val}</Tag>;
      },
    },
    {
      title: t('common.processList.info'),
      dataIndex: 'info',
      key: 'info',
      ellipsis: true,
      render: (val: string | undefined) => {
        if (!val) return '-';
        return (
          <Tooltip title={val} placement="topLeft" overlayStyle={{ maxWidth: 500 }}>
            <Text
              style={{ fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', color: 'var(--text-secondary)' }}
              ellipsis
            >
              {val}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: t('common.processList.action'),
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_: unknown, record: ProcessItem) => (
        <Button
          type="link"
          danger
          size="small"
          icon={<StopOutlined />}
          onClick={() => handleKill(record)}
        >
          {t('common.processList.kill')}
        </Button>
      ),
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <span>{t('common.processList.title')}</span>
          {database && <Tag color="blue">{database}</Tag>}
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={1100}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Switch
              checked={autoRefresh}
              onChange={setAutoRefresh}
              checkedChildren={<SyncOutlined spin />}
              unCheckedChildren={<SyncOutlined />}
              size="small"
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('common.processList.autoRefresh')}
            </Text>
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchProcesses} loading={loading}>
              {t('common.refresh')}
            </Button>
            <Button onClick={onClose}>{t('common.close')}</Button>
          </Space>
        </Space>
      }
      transitionName=""
      maskTransitionName=""
    >
      <Table<ProcessItem>
        columns={columns}
        dataSource={processes}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 960, y: 400 }}
        pagination={false}
        locale={{ emptyText: t('common.processList.noProcesses') }}
      />
    </Modal>
  );
};
