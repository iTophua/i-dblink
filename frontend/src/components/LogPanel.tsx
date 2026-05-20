import { useState } from 'react';
import { Tabs, Button, Space } from 'antd';
import {
  InfoCircleOutlined,
  WarningOutlined,
  LineChartOutlined,
  ClearOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';

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

export function LogPanel({ onCollapse }: LogPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'messages' | 'errors' | 'explain'>('messages');
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    { id: '1', timestamp: '10:23:45', level: 'INFO', message: t('common.appStarted') },
    { id: '2', timestamp: '10:23:46', level: 'INFO', message: t('common.connectionConfigLoaded') },
  ]);
  const tc = useThemeColors();

  const filteredLogs = logs.filter((log) => {
    if (activeTab === 'errors') return log.level === 'ERROR' || log.level === 'WARN';
    if (activeTab === 'explain') return false;
    return true;
  });

  const levelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return tc.error;
      case 'WARN':
        return tc.warning;
      case 'OK':
        return tc.success;
      default:
        return tc.textTertiary;
    }
  };

  const handleClear = () => setLogs([]);

  const handleExport = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'logs.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div
      style={{
        height: 130,
        borderTop: `1px solid ${tc.border}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 28,
          borderBottom: `1px solid ${tc.border}`,
          padding: '0 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: tc.backgroundToolbar,
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'messages' | 'errors' | 'explain')}
          size="small"
          style={{ flex: 1 }}
          tabBarStyle={{ margin: 0, borderBottom: 'none' }}
          items={[
            {
              key: 'messages',
              label: (
                <span>
                  <InfoCircleOutlined style={{ marginRight: 4 }} />
                  {t('common.messages')}
                </span>
              ),
            },
            {
              key: 'errors',
              label: (
                <span>
                  <WarningOutlined style={{ marginRight: 4 }} />
                  {t('common.errors')}
                </span>
              ),
            },
            {
              key: 'explain',
              label: (
                <span>
                  <LineChartOutlined style={{ marginRight: 4 }} />
                  {t('common.resultGrid.explainPlan')}
                </span>
              ),
            },
          ]}
        />
        <Space size="small">
          <Button icon={<ClearOutlined />} size="small" type="text" onClick={handleClear} />
          <Button icon={<DownloadOutlined />} size="small" type="text" onClick={handleExport} />
          <a onClick={onCollapse} style={{ fontSize: 12, color: tc.primary }}>
            {t('common.hide')}
          </a>
        </Space>
      </div>
      <div
        style={{
          flex: 1,
          padding: '2px 8px',
          overflow: 'auto',
          fontSize: 11,
          fontFamily: tc.isDark ? "'JetBrains Mono', 'Fira Code', monospace" : undefined,
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: tc.textDisabled, padding: '8px 0', textAlign: 'center' }}>
            {t('common.logPanel.noLogs')}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} style={{ padding: '1px 0', color: levelColor(log.level) }}>
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
