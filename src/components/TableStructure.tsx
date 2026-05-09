import { useState, useEffect, useCallback } from 'react';
import { Tabs, Table, Spin, Empty, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { KeyOutlined, LinkOutlined, InfoCircleOutlined, CodeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../hooks/useApi';
import type { ColumnInfo, IndexInfo, ForeignKeyInfo } from '../types/api';

const { Text } = Typography;

interface TableInfo {
  table_name: string;
  engine?: string;
  row_count?: number;
  data_length?: number;
  index_length?: number;
  create_time?: string;
  update_time?: string;
  collation?: string;
  comment?: string;
}

interface TableStructureProps {
  connectionId: string;
  tableName: string;
  database?: string;
}

export function TableStructure({ connectionId, tableName, database }: TableStructureProps) {
  const { t } = useTranslation();
  const { getColumns, getIndexes, getForeignKeys, getTableInfo, getCreateTableSQL } = useDatabase();
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([]);
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [createTableSQL, setCreateTableSQL] = useState('');

  const loadStructure = useCallback(async () => {
    setLoading(true);
    try {
      const [cols, idxs, fks, info, sql] = await Promise.all([
        getColumns(connectionId, tableName, database),
        getIndexes(connectionId, tableName, database),
        getForeignKeys(connectionId, tableName, database),
        getTableInfo(connectionId, tableName, database).catch(() => null),
        getCreateTableSQL(connectionId, tableName, database).catch(() => ''),
      ]);
      setColumns(cols);
      setIndexes(idxs);
      setForeignKeys(fks);
      setTableInfo(info);
      setCreateTableSQL(sql);
    } catch (error) {
      console.error('Failed to load table structure:', error);
    } finally {
      setLoading(false);
    }
  }, [
    connectionId,
    tableName,
    database,
    getColumns,
    getIndexes,
    getForeignKeys,
    getTableInfo,
    getCreateTableSQL,
  ]);

  useEffect(() => {
    if (connectionId && tableName) {
      loadStructure();
    }
  }, [loadStructure]);

  const columnDefs: ColumnsType<ColumnInfo> = [
    {
      title: t('common.tableStructure.columnName'),
      dataIndex: 'column_name',
      key: 'column_name',
      minWidth: 150,
      render: (text: string, record: ColumnInfo) => (
        <span>
          {record.column_key === 'PRI' && (
            <KeyOutlined style={{ color: '#faad14', marginRight: 4 }} />
          )}
          {text}
        </span>
      ),
    },
    {
      title: t('common.type'),
      dataIndex: 'data_type',
      key: 'data_type',
      width: 140,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: t('common.nullable'),
      dataIndex: 'is_nullable',
      key: 'is_nullable',
      width: 60,
      render: (val: string) => (val === 'YES' ? t('common.yes') : t('common.no')),
    },
    {
      title: t('common.defaultValue'),
      dataIndex: 'column_default',
      key: 'column_default',
      width: 120,
      ellipsis: true,
    },
    {
      title: t('common.key'),
      dataIndex: 'column_key',
      key: 'column_key',
      width: 60,
      render: (val?: string) => {
        if (val === 'PRI') return <Tag color="gold">PRI</Tag>;
        if (val === 'UNI') return <Tag color="green">UNI</Tag>;
        if (val === 'MUL') return <Tag color="blue">MUL</Tag>;
        return null;
      },
    },
    {
      title: t('common.comment'),
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
    },
  ];

  const indexDefs: ColumnsType<IndexInfo> = [
    {
      title: t('common.tableStructure.indexName'),
      dataIndex: 'index_name',
      key: 'index_name',
      width: 180,
      render: (text: string, record: IndexInfo) => (
        <span>
          {record.is_primary && <KeyOutlined style={{ color: '#faad14', marginRight: 4 }} />}
          {text}
        </span>
      ),
    },
    {
      title: t('common.tableStructure.columnName'),
      dataIndex: 'column_name',
      key: 'column_name',
      width: 140,
    },
    {
      title: t('common.tableStructure.unique'),
      dataIndex: 'is_unique',
      key: 'is_unique',
      width: 60,
      render: (val: boolean) => (val ? t('common.yes') : t('common.no')),
    },
    {
      title: t('common.primaryKey'),
      dataIndex: 'is_primary',
      key: 'is_primary',
      width: 60,
      render: (val: boolean) => (val ? <Tag color="gold">{t('common.yes')}</Tag> : t('common.no')),
    },
    {
      title: t('common.sequence'),
      dataIndex: 'seq_in_index',
      key: 'seq_in_index',
      width: 60,
    },
  ];

  const fkDefs: ColumnsType<ForeignKeyInfo> = [
    {
      title: t('common.constraintName'),
      dataIndex: 'constraint_name',
      key: 'constraint_name',
      width: 180,
    },
    {
      title: t('common.thisTableColumn'),
      dataIndex: 'column_name',
      key: 'column_name',
      width: 120,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '',
      key: 'arrow',
      width: 30,
      render: () => <LinkOutlined style={{ color: '#999' }} />,
    },
    {
      title: t('common.referencedTable'),
      dataIndex: 'referenced_table',
      key: 'referenced_table',
      width: 140,
      render: (text: string) => <Tag color="green">{text}</Tag>,
    },
    {
      title: t('common.referencedColumn'),
      dataIndex: 'referenced_column',
      key: 'referenced_column',
      width: 120,
      render: (text: string) => <Tag color="green">{text}</Tag>,
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '8px 12px' }}>
      <style>{`
        .table-compact .ant-table-row td {
          padding: 4px 8px !important;
        }
        .table-compact .ant-table-thead th {
          padding: 4px 8px !important;
        }
      `}</style>
      <Tabs
        size="small"
        items={[
          {
            key: 'info',
            label: (
              <span>
                <InfoCircleOutlined style={{ marginRight: 4 }} />
                {t('common.info')}
              </span>
            ),
            children: tableInfo ? (
              <div style={{ padding: '4px 0' }}>
                <table style={{ width: '100%', fontSize: 11, lineHeight: '18px' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500, width: 100 }}>
                        {t('common.tableName')}
                      </td>
                      <td>{tableInfo.table_name}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>{t('common.engine')}</td>
                      <td>
                        <Tag color="blue">{tableInfo.engine || '-'}</Tag>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>
                        {t('common.tableList.rowCount')}
                      </td>
                      <td>{tableInfo.row_count?.toLocaleString() || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>{t('common.dataSize')}</td>
                      <td>
                        {tableInfo.data_length
                          ? `${(tableInfo.data_length / 1024).toFixed(2)} KB`
                          : '-'}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>{t('common.indexSize')}</td>
                      <td>
                        {tableInfo.index_length
                          ? `${(tableInfo.index_length / 1024).toFixed(2)} KB`
                          : '-'}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>
                        {t('common.databaseProperties.collation')}
                      </td>
                      <td>
                        <Tag color="green">{tableInfo.collation || '-'}</Tag>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>
                        {t('common.createTime')}
                      </td>
                      <td>{tableInfo.create_time || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>
                        {t('common.updateTime')}
                      </td>
                      <td>{tableInfo.update_time || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>{t('common.comment')}</td>
                      <td>{tableInfo.comment || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty description={t('common.noTableInfo')} />
            ),
          },
          {
            key: 'columns',
            label: `${t('common.tableStructure.columns')} (${columns.length})`,
            children:
              columns.length > 0 ? (
                <Table
                  columns={columnDefs}
                  dataSource={columns}
                  rowKey="column_name"
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  className="table-compact"
                />
              ) : (
                <Empty description={t('common.noColumnInfo')} />
              ),
          },
          {
            key: 'indexes',
            label: `${t('common.tableStructure.indexes')} (${indexes.length})`,
            children:
              indexes.length > 0 ? (
                <Table
                  columns={indexDefs}
                  dataSource={indexes}
                  rowKey={(record) => `${record.index_name}-${record.column_name}`}
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  className="table-compact"
                />
              ) : (
                <Empty description={t('common.noIndexes')} />
              ),
          },
          {
            key: 'foreign_keys',
            label: `${t('common.foreignKeys')} (${foreignKeys.length})`,
            children:
              foreignKeys.length > 0 ? (
                <Table
                  columns={fkDefs}
                  dataSource={foreignKeys}
                  rowKey={(record) => `${record.constraint_name}-${record.column_name}`}
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  className="table-compact"
                />
              ) : (
                <Empty description={t('common.noForeignKeys')} />
              ),
          },
          {
            key: 'sql',
            label: (
              <span>
                <CodeOutlined style={{ marginRight: 4 }} />
                {t('common.importExport.sqlPreview')}
              </span>
            ),
            children: createTableSQL ? (
              <div style={{ padding: '8px 0' }}>
                <pre
                  style={{
                    background: '#f5f5f5',
                    padding: 12,
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    overflow: 'auto',
                    maxHeight: 300,
                  }}
                >
                  {createTableSQL}
                </pre>
              </div>
            ) : (
              <Empty description={t('common.noSql')} />
            ),
          },
        ]}
      />
    </div>
  );
}
