import React from 'react';
import { Layout, Space, Typography, Divider } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import type { Connection } from '../../stores/appStore';

type StatusBarProps = {
  isDarkMode: boolean;
  selectedConnectionId: string | null;
  connections: Connection[];
  selectedTable: string | null;
};

export function StatusBar({ isDarkMode, selectedConnectionId, connections, selectedTable }: StatusBarProps) {
  const { Footer } = Layout;
  const { Text } = Typography;

  return (
    <Footer
      style={{
        height: 28,
        lineHeight: '28px',
        padding: '0 8px',
        background: isDarkMode ? '#141414' : '#fafafa',
        borderTop: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 12,
        color: isDarkMode ? '#bfbfbf' : '#595959',
      }}
    >
      <Space>
        <Text>
          {selectedConnectionId ? (
            <span>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 4 }} />
              已连接：{connections.find(c => c.id === selectedConnectionId)?.name || '未知'}
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
