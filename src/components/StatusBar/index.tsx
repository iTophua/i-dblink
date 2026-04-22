import React from 'react';
import { Layout, Space, Typography, Divider } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import type { Connection } from '../../stores/appStore';

type StatusBarProps = {
  selectedConnectionId: string | null;
  connections: Connection[];
  selectedTable: string | null;
};

export function StatusBar({ selectedConnectionId, connections, selectedTable }: StatusBarProps) {
  const { Footer } = Layout;
  const { Text } = Typography;

  const selectedConnection = selectedConnectionId
    ? connections.find(c => c.id === selectedConnectionId)
    : null;
  const isConnected = selectedConnection?.status === 'connected';

  return (
    <Footer
      style={{
        height: 28,
        lineHeight: '28px',
        padding: '0 8px',
        background: 'var(--background-toolbar)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 12,
        color: 'var(--text-secondary)',
      }}
      className="status-bar-enhanced"
    >
      <Space>
        <Text>
          {isConnected ? (
            <span>
              <CheckCircleOutlined style={{ color: 'var(--color-success)', marginRight: 4 }} />
              已连接：{selectedConnection?.name || '未知'}
            </span>
          ) : selectedConnection ? (
            <span style={{ color: 'var(--text-tertiary)' }}>
              未连接：{selectedConnection.name}
            </span>
          ) : (
            '未连接'
          )}
        </Text>
        {selectedTable && <Text>表：{selectedTable}</Text>}
      </Space>
      <Space separator={<Divider orientation="vertical" style={{ margin: '0 8px' }} />}>
        <Text>UTF-8</Text>
        <Text>v1.0.0</Text>
      </Space>
    </Footer>
  );
}

export default StatusBar;
