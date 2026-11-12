import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Segmented, Tag, Typography } from 'antd';
import { DashboardOutlined, CloudServerOutlined } from '@ant-design/icons';
import { ProcessListContent } from './ProcessListContent';
import { ServerStatusContent } from './ServerStatusContent';
import { useAppStore } from '../../stores/appStore';

const { Text } = Typography;

interface ConnectionMonitorPanelProps {
  connectionId: string;
  connectionName?: string;
  /** 从库级入口打开时带上库过滤 */
  database?: string;
  databases?: string[];
  /** 入口指定默认子页（进程 / 服务器状态） */
  initialView?: 'process' | 'server';
}

/**
 * 连接监控：进程管理 + 服务器状态合并为一个 Tab。
 *
 * 顶部不再叠第二套 Tab 栏：页头一行放连接信息 + 分段切换，内容区直接开始，
 * 避免与工作区主标签栏形成两层相同样式的导航。进程页默认按入口库过滤。
 */
export const ConnectionMonitorPanel: React.FC<ConnectionMonitorPanelProps> = ({
  connectionId,
  connectionName,
  database,
  databases = [],
  initialView = 'process',
}) => {
  const { t } = useTranslation();
  const [view, setView] = useState<'process' | 'server'>(initialView);
  const [dbFilter, setDbFilter] = useState<string | undefined>(database);
  const connected = useAppStore(
    (state) => state.connections.find((c) => c.id === connectionId)?.status === 'connected'
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px 4px',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            flexShrink: 0,
            background: connected ? 'var(--color-success)' : 'var(--text-disabled)',
            boxShadow: connected
              ? '0 0 0 3px var(--color-success-alpha-15, rgba(5,150,105,0.15))'
              : undefined,
          }}
        />
        <Text strong style={{ fontSize: 13 }}>
          {connectionName || connectionId}
        </Text>
        {view === 'process' && dbFilter && (
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>
            {dbFilter}
          </Tag>
        )}
        <span style={{ flex: 1 }} />
        <Segmented
          size="small"
          value={view}
          onChange={(value) => setView(value as 'process' | 'server')}
          options={[
            {
              value: 'process',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <DashboardOutlined />
                  {t('common.processList.title')}
                </span>
              ),
            },
            {
              value: 'server',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CloudServerOutlined />
                  {t('common.serverStatus.title')}
                </span>
              ),
            },
          ]}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {view === 'process' ? (
          <ProcessListContent
            connectionId={connectionId}
            database={dbFilter}
            databases={databases}
            onDatabaseChange={setDbFilter}
          />
        ) : (
          <ServerStatusContent connectionId={connectionId} />
        )}
      </div>
    </div>
  );
};
