import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Drawer,
  Descriptions,
  Progress,
  Button,
  Space,
  Tag,
  Typography,
  App,
  Switch,
  Spin,
  Card,
  Row,
  Col,
  Divider,
} from 'antd';
import {
  ReloadOutlined,
  SyncOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  HddOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { api } from '../api';

const { Text } = Typography;

interface ConnectionStats {
  current: number;
  max: number;
  active: number;
  idle: number;
}

interface MemoryStats {
  used: string;
  total: string;
  bufferPool?: string;
}

interface ServerStatusData {
  version: string;
  uptime: string;
  connections: ConnectionStats;
  memory?: MemoryStats;
  variables?: Record<string, string>;
  error?: string;
}

interface ServerStatusPanelProps {
  open: boolean;
  connectionId: string;
  onClose: () => void;
}

export const ServerStatusPanel: React.FC<ServerStatusPanelProps> = ({
  open,
  connectionId,
  onClose,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [status, setStatus] = useState<ServerStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const result = await api.getServerStatus(connectionId);
      if (result.error) {
        message.error(result.error);
      }
      setStatus(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      message.error(t('common.serverStatus.fetchFailed') + ': ' + errMsg);
    } finally {
      setLoading(false);
    }
  }, [connectionId, message, t]);

  useEffect(() => {
    if (open) {
      fetchStatus();
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, fetchStatus]);

  useEffect(() => {
    if (autoRefresh && open) {
      intervalRef.current = setInterval(fetchStatus, 10000);
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
  }, [autoRefresh, open, fetchStatus]);

  const connectionPercent =
    status && status.connections.max > 0
      ? Math.round((status.connections.current / status.connections.max) * 100)
      : 0;

  const connectionStatusColor =
    connectionPercent > 80 ? '#ff4d4f' : connectionPercent > 50 ? '#faad14' : '#52c41a';

  return (
    <Drawer
      title={
        <Space>
          <CloudServerOutlined />
          <span>{t('common.serverStatus.title')}</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={560}
      extra={
        <Space>
          <Switch
            checked={autoRefresh}
            onChange={setAutoRefresh}
            checkedChildren={<SyncOutlined spin />}
            unCheckedChildren={<SyncOutlined />}
            size="small"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('common.serverStatus.autoRefresh')}
          </Text>
        </Space>
      }
      footer={
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button icon={<ReloadOutlined />} onClick={fetchStatus} loading={loading}>
            {t('common.refresh')}
          </Button>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </Space>
      }
    >
      <Spin spinning={loading && !status}>
        {status ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 基本信息 */}
            <Card
              size="small"
              title={
                <Space>
                  <DatabaseOutlined />
                  <span>{t('common.serverStatus.basicInfo')}</span>
                </Space>
              }
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label={t('common.serverStatus.version')}>
                  <Tag color="blue">{status.version}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('common.serverStatus.uptime')}>
                  {status.uptime || 'N/A'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 连接数 */}
            <Card
              size="small"
              title={
                <Space>
                  <CloudServerOutlined />
                  <span>{t('common.serverStatus.connections')}</span>
                </Space>
              }
            >
              <div style={{ marginBottom: 8 }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text>
                    {t('common.serverStatus.current')}: <Text strong>{status.connections.current}</Text>
                    {' / '}
                    {t('common.serverStatus.max')}: <Text strong>{status.connections.max}</Text>
                  </Text>
                  <Tag
                    color={connectionPercent > 80 ? 'error' : connectionPercent > 50 ? 'warning' : 'success'}
                  >
                    {connectionPercent}%
                  </Tag>
                </Space>
              </div>
              <Progress
                percent={connectionPercent}
                strokeColor={connectionStatusColor}
                size="small"
                showInfo={false}
              />
              <Divider style={{ margin: '12px 0 8px' }} />
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary">{t('common.serverStatus.active')}: </Text>
                  <Tag color="green">{status.connections.active}</Tag>
                </Col>
                <Col span={12}>
                  <Text type="secondary">{t('common.serverStatus.idle')}: </Text>
                  <Tag>{status.connections.idle}</Tag>
                </Col>
              </Row>
            </Card>

            {/* 内存 */}
            {status.memory && (status.memory.total || status.memory.used || status.memory.bufferPool) && (
              <Card
                size="small"
                title={
                  <Space>
                    <HddOutlined />
                    <span>{t('common.serverStatus.memory')}</span>
                  </Space>
                }
              >
                <Descriptions column={1} size="small">
                  {status.memory.used && (
                    <Descriptions.Item label={t('common.serverStatus.memoryUsed')}>
                      {status.memory.used}
                    </Descriptions.Item>
                  )}
                  {status.memory.total && (
                    <Descriptions.Item label={t('common.serverStatus.memoryTotal')}>
                      {status.memory.total}
                    </Descriptions.Item>
                  )}
                  {status.memory.bufferPool && (
                    <Descriptions.Item label={t('common.serverStatus.bufferPool')}>
                      {status.memory.bufferPool}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            )}

            {/* 关键变量 */}
            {status.variables && Object.keys(status.variables).length > 0 && (
              <Card
                size="small"
                title={
                  <Space>
                    <SettingOutlined />
                    <span>{t('common.serverStatus.variables')}</span>
                  </Space>
                }
              >
                <div
                  style={{
                    maxHeight: 240,
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    fontSize: 12,
                  }}
                >
                  {Object.entries(status.variables)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '2px 0',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                          {key}
                        </Text>
                        <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{value}</Text>
                      </div>
                    ))}
                </div>
              </Card>
            )}
          </Space>
        ) : (
          !loading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Text type="secondary">{t('common.serverStatus.noData')}</Text>
            </div>
          )
        )}
      </Spin>
    </Drawer>
  );
};
