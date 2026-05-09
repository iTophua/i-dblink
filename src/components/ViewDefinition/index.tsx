import { useState, useEffect } from 'react';
import { Tabs, Card, Table, Spin, Typography } from 'antd';
import { CodeOutlined, ColumnWidthOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import type { ColumnsType } from 'antd/es/table';
import type { ColumnInfo } from '../../types/api';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';

const { Text } = Typography;

interface ViewDefinitionProps {
  connectionId: string;
  viewName: string;
  database?: string;
}

export function ViewDefinition({ connectionId, viewName, database }: ViewDefinitionProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('ddl');
  const [ddl, setDdl] = useState<string>('');
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadViewDefinition = async () => {
      setLoading(true);
      try {
        const [ddlLines, colData] = await Promise.all([
          api.getTableDDL(connectionId, viewName, database),
          api.getColumns(connectionId, viewName, database),
        ]);
        setDdl(ddlLines.join('\n'));
        setColumns(colData);
      } catch (err) {
        console.error('Failed to load view definition:', err);
      } finally {
        setLoading(false);
      }
    };

    loadViewDefinition();
  }, [connectionId, viewName, database]);

  const columnDefs: ColumnsType<ColumnInfo> = [
    {
      title: t('common.name'),
      dataIndex: 'column_name',
      width: 200,
    },
    {
      title: t('common.type'),
      dataIndex: 'data_type',
      width: 200,
    },
    {
      title: t('common.nullable'),
      dataIndex: 'is_nullable',
      width: 100,
      render: (val: string) => (val === 'YES' ? t('common.yes') : t('common.no')),
    },
    {
      title: t('common.default'),
      dataIndex: 'column_default',
      render: (val: string | null) => val || 'NULL',
    },
    {
      title: t('common.comment'),
      dataIndex: 'comment',
      render: (val: string | null) => val || '-',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255,255,255,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <Spin tip={t('common.loadingViewDefinition')} />
        </div>
      )}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
        }}
      >
        <Text strong style={{ fontSize: 14 }}>
          {t('common.viewDefinition')}: {viewName}
        </Text>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '12px 16px' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'ddl',
              label: (
                <span>
                  <CodeOutlined /> {t('common.viewDefinition.ddl')}
                </span>
              ),
              children: (
                <Card size="small" style={{ height: 400, padding: 0 }}>
                  <Editor
                    height="100%"
                    defaultLanguage="sql"
                    language="sql"
                    value={ddl}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 14,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                    }}
                    theme="vs-dark"
                  />
                </Card>
              ),
            },
            {
              key: 'columns',
              label: (
                <span>
                  <ColumnWidthOutlined /> {t('common.tableStructure.columns')}
                </span>
              ),
              children: (
                <Table
                  rowKey="column_name"
                  columns={columnDefs}
                  dataSource={columns}
                  size="small"
                  pagination={false}
                  scroll={{ y: 400 }}
                />
              ),
            },
          ]}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

export default ViewDefinition;
