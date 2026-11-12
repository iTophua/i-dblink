import { useState, useEffect, useCallback } from 'react';
import { Button, Descriptions, Spin, Typography } from 'antd';
import {
  DatabaseOutlined,
  TableOutlined,
  EyeOutlined,
  SettingOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { DDLViewer } from '../DDLViewer';
import { getErrorMessage } from '../../utils/getErrorMessage';

const { Text } = Typography;

interface DatabasePropertiesProps {
  connectionId: string;
  databaseName: string;
}

interface StatItem {
  key: string;
  label: string;
  value: string | number;
  icon: React.ReactNode;
}

export function DatabaseProperties({ connectionId, databaseName }: DatabasePropertiesProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState<StatItem[]>([]);
  const [serverInfo, setServerInfo] = useState<Record<string, unknown> | null>(null);
  const [ddl, setDdl] = useState<string>('');
  const [ddlLoading, setDdlLoading] = useState(false);
  const [ddlError, setDdlError] = useState<string>('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadProperties = async () => {
      setLoading(true);
      setLoadFailed(false);
      setLoadError('');
      try {
        const [categorized, server] = await Promise.all([
          api.getTablesCategorized(connectionId, databaseName),
          api.getServerInfo(connectionId, databaseName),
        ]);
        if (cancelled) return;

        setServerInfo(server);

        const tables = categorized.tables || [];
        const views = categorized.views || [];
        const totalRows = tables.reduce((sum, t) => sum + (t.row_count || 0), 0);
        const totalDataSize = tables.reduce((sum, t) => {
          const size = parseFloat(t.data_size || '0');
          return sum + (isNaN(size) ? 0 : size);
        }, 0);
        const totalIndexSize = tables.reduce((sum, t) => {
          const size = parseFloat(t.index_size || '0');
          return sum + (isNaN(size) ? 0 : size);
        }, 0);

        // 原写法 tables[0]?.engine || isMySQL ? ... 会先做 || 再做三元，
        // 导致任意库都显示 InnoDB；这里显式括号并优先使用真实引擎
        const serverType = String(server?.server_type || '').toLowerCase();
        const isMySQL = serverType.includes('mysql');
        const engine = tables.find((table) => table.engine)?.engine || (isMySQL ? 'InnoDB' : '-');

        const items: StatItem[] = [
          {
            key: 'name',
            label: t('common.databaseName'),
            value: databaseName,
            icon: <DatabaseOutlined />,
          },
          {
            key: 'tables',
            label: t('common.erDiagram.tableCount'),
            value: tables.length,
            icon: <TableOutlined />,
          },
          {
            key: 'views',
            label: t('common.viewCount'),
            value: views.length,
            icon: <EyeOutlined />,
          },
          {
            key: 'rows',
            label: t('common.totalRows'),
            value: totalRows.toLocaleString(),
            icon: <BarChartOutlined />,
          },
          {
            key: 'dataSize',
            label: t('common.dataSize'),
            value: formatBytes(totalDataSize),
            icon: <SettingOutlined />,
          },
          {
            key: 'indexSize',
            label: t('common.indexSize'),
            value: formatBytes(totalIndexSize),
            icon: <SettingOutlined />,
          },
          {
            key: 'engine',
            label: t('common.storageEngine'),
            value: engine,
            icon: <SettingOutlined />,
          },
          {
            key: 'charset',
            label: t('common.databaseProperties.charset'),
            value: (server?.character_set as string) || '-',
            icon: <Text style={{ fontSize: 12 }}>{String(server?.character_set || '-')}</Text>,
          },
          {
            key: 'collation',
            label: t('common.databaseProperties.collation'),
            value: (server?.collation as string) || '-',
            icon: <Text style={{ fontSize: 12 }}>{String(server?.collation || '-')}</Text>,
          },
          {
            key: 'version',
            label: t('common.serverVersion'),
            value: (server?.version as string) || '-',
            icon: <ClockCircleOutlined />,
          },
        ];

        setStats(items);
      } catch (err) {
        if (!cancelled) {
          setLoadFailed(true);
          setLoadError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const loadDdl = async () => {
      setDdlLoading(true);
      setDdlError('');
      try {
        const result = await api.getDatabaseDDL(connectionId, databaseName);
        if (!cancelled) setDdl(result);
      } catch (err: unknown) {
        if (!cancelled) setDdlError(getErrorMessage(err));
      } finally {
        if (!cancelled) setDdlLoading(false);
      }
    };

    loadProperties();
    loadDdl();

    return () => {
      cancelled = true;
    };
  }, [connectionId, databaseName, reloadToken, t]);

  const retry = useCallback(() => setReloadToken((value) => value + 1), []);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 240,
        }}
      >
        <Spin tip={t('common.loadingDatabaseProperties')} size="large" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          height: 240,
          color: 'var(--color-error)',
          fontSize: 12,
        }}
      >
        <ExclamationCircleOutlined style={{ fontSize: 20 }} />
        <span>{loadError || t('common.loadFailed')}</span>
        <Button size="small" icon={<ReloadOutlined />} onClick={retry}>
          {t('common.settingsUi.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* 概览：库名 + 版本/字符集，替代原来嵌套的两层 Card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '2px 0 16px',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-primary-alpha-15)',
            color: 'var(--color-primary)',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          <DatabaseOutlined />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{databaseName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {[serverInfo?.version, serverInfo?.character_set].filter(Boolean).join(' · ') || '-'}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
        {t('common.basicInfo')}
      </div>
      <Descriptions
        bordered
        size="small"
        column={2}
        items={stats.map((item) => ({
          key: item.key,
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {item.icon}
              {item.label}
            </span>
          ),
          children: item.value,
        }))}
      />

      <div style={{ fontSize: 14, fontWeight: 600, margin: '20px 0 10px' }}>{t('common.ddl')}</div>
      {ddlLoading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : ddlError ? (
        <div style={{ fontSize: 12, color: 'var(--color-error)', padding: '8px 0' }}>
          {ddlError}
        </div>
      ) : (
        <DDLViewer ddl={ddl} connectionId={connectionId} maxHeight={200} />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default DatabaseProperties;
