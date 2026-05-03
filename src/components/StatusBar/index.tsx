import React, { useState, useEffect } from 'react';
import { Layout, Space, Typography, Divider, Tag } from 'antd';
import { CheckCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { Connection } from '../../stores/appStore';
import { api } from '../../api';

type StatusBarProps = {
  selectedConnectionId: string | null;
  connections: Connection[];
  selectedTable: string | null;
  selectedDatabase?: string;
  transactionActive?: boolean;
  transactionStartTime?: number | null;
  resultRows?: number;
  executionTime?: number;
  isQuerying?: boolean;
};

export function StatusBar({
  selectedConnectionId,
  connections,
  selectedTable,
  selectedDatabase,
  transactionActive,
  transactionStartTime,
  resultRows,
  executionTime,
  isQuerying,
}: StatusBarProps) {
  const { Footer } = Layout;
  const { Text } = Typography;

  const [txDuration, setTxDuration] = useState<number>(0);

  useEffect(() => {
    if (!transactionActive || !transactionStartTime) {
      setTxDuration(0);
      return;
    }
    const timer = setInterval(() => {
      setTxDuration(Math.floor((Date.now() - transactionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [transactionActive, transactionStartTime]);

  const selectedConnection = selectedConnectionId
    ? connections.find((c) => c.id === selectedConnectionId)
    : null;
  const isConnected = selectedConnection?.status === 'connected';

  const [serverInfo, setServerInfo] = useState<{
    version?: string;
    server_type?: string;
    character_set?: string;
  } | null>(null);

  useEffect(() => {
    if (!isConnected || !selectedConnectionId) {
      setServerInfo(null);
      return;
    }

    api
      .getServerInfo(selectedConnectionId, selectedDatabase)
      .then((info) => {
        setServerInfo(info);
      })
      .catch(() => {
        // 忽略错误，不显示服务器信息
      });
  }, [isConnected, selectedConnectionId, selectedDatabase]);

  const dbTypeLabel = selectedConnection?.db_type?.toUpperCase() || '';

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
            <span style={{ color: 'var(--text-tertiary)' }}>未连接：{selectedConnection.name}</span>
          ) : (
            '未连接'
          )}
        </Text>
        {selectedDatabase && (
          <Text>库：{selectedDatabase}</Text>
        )}
        {selectedTable && <Text>表：{selectedTable}</Text>}
        {isQuerying && (
          <Tag color="processing" style={{ margin: 0, fontSize: 11, height: 20, lineHeight: '20px' }}>
            查询中...
          </Tag>
        )}
        {isConnected && dbTypeLabel && (
          <Tag color="blue" style={{ margin: 0, fontSize: 11, height: 20, lineHeight: '20px' }}>
            {dbTypeLabel}
          </Tag>
        )}
        {isConnected && serverInfo?.version && (
          <Text style={{ fontSize: 11 }} title={serverInfo.version}>
            {serverInfo.version.split('\n')[0].substring(0, 30)}
            {serverInfo.version.length > 30 ? '...' : ''}
          </Text>
        )}
        {transactionActive && (
          <Tag color="orange" style={{ margin: 0, fontSize: 11, height: 20, lineHeight: '20px' }}>
            事务中 {txDuration > 0 ? `${txDuration}s` : ''}
          </Tag>
        )}
        {resultRows !== undefined && resultRows > 0 && (
          <Text style={{ fontSize: 11 }}>行数：{resultRows.toLocaleString()}</Text>
        )}
        {executionTime !== undefined && executionTime > 0 && (
          <Text style={{ fontSize: 11 }}>
            耗时：
            {executionTime < 1000 ? `${executionTime}ms` : `${(executionTime / 1000).toFixed(2)}s`}
          </Text>
        )}
      </Space>
      <Space separator={<Divider orientation="vertical" style={{ margin: '0 8px' }} />}>
        {isConnected && serverInfo?.character_set && <Text>{serverInfo.character_set}</Text>}
        {!isConnected && <Text>UTF-8</Text>}
        <Text>v1.0.0</Text>
        <QuestionCircleOutlined style={{ fontSize: 11, cursor: 'help' }} />
      </Space>
    </Footer>
  );
}

export default StatusBar;
