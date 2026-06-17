import { useState, useEffect } from 'react';
import { Card, Spin, Typography, Descriptions } from 'antd';
import {
  DatabaseOutlined,
  TableOutlined,
  EyeOutlined,
  SettingOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { DDLViewer } from '../DDLViewer';

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
  const [stats, setStats] = useState<StatItem[]>([]);
  const [serverInfo, setServerInfo] = useState<Record<string, unknown> | null>(null);
  const [ddl, setDdl] = useState<string>('');
  const [ddlLoading, setDdlLoading] = useState(false);
  const [ddlError, setDdlError] = useState<string>('');

  useEffect(() => {
    const loadProperties = async () => {
      setLoading(true);
      try {
        const [categorized, server] = await Promise.all([
          api.getTablesCategorized(connectionId, databaseName),
          api.getServerInfo(connectionId, databaseName),
        ]);

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

        const engine =
          tables[0]?.engine || (server?.server_type || '').includes('mysql') ? 'InnoDB' : '-';

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
            value: server?.character_set || '-',
            icon: <Text style={{ fontSize: 12 }}>{server?.character_set || '-'}</Text>,
          },
          {
            key: 'collation',
            label: t('common.databaseProperties.collation'),
            value: server?.collation || '-',
            icon: <Text style={{ fontSize: 12 }}>{server?.collation || '-'}</Text>,
          },
          {
            key: 'version',
            label: t('common.serverVersion'),
            value: server?.version || '-',
            icon: <ClockCircleOutlined />,
          },
        ];

        setStats(items);
      } catch (err) {
        console.error('Failed to load database properties:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProperties();

    const loadDdl = async () => {
      setDdlLoading(true);
      setDdlError('');
      try {
        const result = await api.getDatabaseDDL(connectionId, databaseName);
        setDdl(result);
      } catch (err: any) {
        setDdlError(err.message || String(err));
      } finally {
        setDdlLoading(false);
      }
    };
    loadDdl();
  }, [connectionId, databaseName]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Spin tip={t('common.loadingDatabaseProperties')} size="large" />
      </div>
    );
  }

  return (
    <div>
      <Card title={t('common.basicInfo')} style={{ marginBottom: 16 }}>
        <Descriptions bordered column={2} size="small">
          {stats.map((item) => (
            <Descriptions.Item
              key={item.key}
              label={
                <span>
                  {item.icon}
                  <span style={{ marginLeft: 8 }}>{item.label}</span>
                </span>
              }
            >
              {item.value}
            </Descriptions.Item>
          ))}
        </Descriptions>
      </Card>

      <Card title={t('common.ddl')} size="small">
        {ddlLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : ddlError ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {ddlError}
          </Text>
        ) : (
          <DDLViewer ddl={ddl} maxHeight={200} />
        )}
      </Card>
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
