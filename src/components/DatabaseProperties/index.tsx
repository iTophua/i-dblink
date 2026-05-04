import { useState, useEffect } from 'react';
import { Card, Table, Spin, Typography, Tag, Descriptions } from 'antd';
import {
  DatabaseOutlined,
  TableOutlined,
  EyeOutlined,
  SettingOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { TableInfo } from '../../types/api';

const { Text, Title } = Typography;

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
  const [tableStats, setTableStats] = useState<{ tables: TableInfo[]; views: TableInfo[] }>({
    tables: [],
    views: [],
  });
  const [serverInfo, setServerInfo] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const loadProperties = async () => {
      setLoading(true);
      try {
        const [categorized, server] = await Promise.all([
          api.getTablesCategorized(connectionId, databaseName),
          api.getServerInfo(connectionId, databaseName),
        ]);

        setTableStats(categorized);
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

        const engine = tables[0]?.engine || (server?.server_type || '').includes('mysql') ? 'InnoDB' : '-';

        const items: StatItem[] = [
          {
            key: 'name',
            label: t('common.databaseName'),
            value: databaseName,
            icon: <DatabaseOutlined />,
          },
          {
            key: 'tables',
            label: t('common.tableCount'),
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
            label: t('common.charset'),
            value: server?.character_set || '-',
            icon: <Text style={{ fontSize: 12 }}>{server?.character_set || '-'}</Text>,
          },
          {
            key: 'collation',
            label: t('common.collation'),
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
  }, [connectionId, databaseName]);

  const sizeColumns: ColumnsType<TableInfo> = [
    {
      title: t('common.tableName'),
      dataIndex: 'table_name',
      width: 200,
    },
    {
      title: t('common.rowCount'),
      dataIndex: 'row_count',
      width: 120,
      render: (val: number) => (val ? val.toLocaleString() : '-'),
    },
    {
      title: t('common.dataSize'),
      dataIndex: 'data_size',
      width: 120,
      render: (val: string) => (val ? formatBytes(parseFloat(val)) : '-'),
    },
    {
      title: t('common.indexSize'),
      dataIndex: 'index_size',
      width: 120,
      render: (val: string) => (val ? formatBytes(parseFloat(val)) : '-'),
    },
    {
      title: t('common.engine'),
      dataIndex: 'engine',
      width: 100,
      render: (val: string) => (val ? <Tag color="blue">{val}</Tag> : '-'),
    },
    {
      title: t('common.comment'),
      dataIndex: 'comment',
      ellipsis: true,
      render: (val: string) => val || '-',
    },
  ];

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
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        <DatabaseOutlined style={{ marginRight: 8 }} />
        {t('common.databaseProperties')}: {databaseName}
      </Title>

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

      <Card title={t('common.tableStatistics')} style={{ marginBottom: 16 }}>
        <Table
          rowKey="table_name"
          columns={sizeColumns}
          dataSource={tableStats.tables}
          size="small"
          pagination={{ pageSize: 20 }}
          scroll={{ y: 400 }}
        />
      </Card>

      {tableStats.views.length > 0 && (
        <Card title={`${t('common.viewStatistics')} (${tableStats.views.length})`}>
          <Table
            rowKey="table_name"
            columns={[
              {
                title: t('common.viewName'),
                dataIndex: 'table_name',
                width: 200,
              },
              {
                title: t('common.comment'),
                dataIndex: 'comment',
                ellipsis: true,
                render: (val: string) => val || '-',
              },
            ]}
            dataSource={tableStats.views}
            size="small"
            pagination={false}
          />
        </Card>
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
