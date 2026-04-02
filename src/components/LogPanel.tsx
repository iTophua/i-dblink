import { useState } from 'react';
import { Tabs, Button, Space } from 'antd';
import { InfoCircleOutlined, WarningOutlined, LineChartOutlined, ClearOutlined, DownloadOutlined } from '@ant-design/icons';
import { theme } from 'antd';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'ERROR' | 'WARN' | 'OK';
  connection?: string;
  message: string;
}

interface LogPanelProps {
  onCollapse: () => void;
}

const initialLogs: LogEntry[] = [
  { id: '1', timestamp: '10:23:45', level: 'INFO', message: '应用已启动' },
  { id: '2', timestamp: '10:23:46', level: 'INFO', message: '加载连接配置完成' },
];

export function LogPanel({ onCollapse }: LogPanelProps) {
  const [activeTab, setActiveTab] = useState<'messages' | 'errors' | 'explain'>('messages');
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);

  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';

  const filteredLogs = logs.filter(log => {
    if (activeTab === 'errors') return log.level === 'ERROR' || log.level === 'WARN';
    if (activeTab === 'explain') return false;
    return true;
  });

  const levelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return '#ff4d4f';
      case 'WARN': return '#faad14';
      case 'OK': return '#52c41a';
      default: return isDarkMode ? '#bfbfbf' : '#595959';
    }
  };

  const handleClear = () => setLogs([]);

  const handleExport = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'logs.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{
      height: 180,
      borderTop: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        height: 32,
        borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: isDarkMode ? '#141414' : '#fafafa',
      }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as any)}
          size="small"
          style={{ flex: 1 }}
          tabBarStyle={{ margin: 0, borderBottom: 'none' }}
          items={[
            { key: 'messages', label: <span><InfoCircleOutlined style={{ marginRight: 4 }} />消息</span> },
            { key: 'errors', label: <span><WarningOutlined style={{ marginRight: 4 }} />错误</span> },
            { key: 'explain', label: <span><LineChartOutlined style={{ marginRight: 4 }} />执行计划</span> },
          ]}
        />
        <Space size="small">
          <Button icon={<ClearOutlined />} size="small" type="text" onClick={handleClear} />
          <Button icon={<DownloadOutlined />} size="small" type="text" onClick={handleExport} />
          <a onClick={onCollapse} style={{ fontSize: 12, color: isDarkMode ? '#177ddc' : '#1890ff' }}>隐藏</a>
        </Space>
      </div>
      <div style={{
        flex: 1,
        padding: '4px 12px',
        overflow: 'auto',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}>
        {filteredLogs.length === 0 ? (
          <div style={{ color: isDarkMode ? '#595959' : '#bfbfbf', padding: '16px 0', textAlign: 'center' }}>
            暂无日志
          </div>
        ) : (
          filteredLogs.map(log => (
            <div key={log.id} style={{ padding: '2px 0', color: levelColor(log.level) }}>
              <span style={{ opacity: 0.6 }}>[{log.timestamp}]</span>{' '}
              <span style={{ fontWeight: 500 }}>[{log.level}]</span>{' '}
              {log.connection && <span style={{ opacity: 0.8 }}>[{log.connection}]</span>}{' '}
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
