import { useState, useEffect, useCallback } from 'react';
import { Tabs, Table, Spin, Empty, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { KeyOutlined, LinkOutlined, InfoCircleOutlined, CodeOutlined } from '@ant-design/icons';
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
  }, [connectionId, tableName, database, getColumns, getIndexes, getForeignKeys, getTableInfo, getCreateTableSQL]);

  useEffect(() => {
    if (connectionId && tableName) {
      loadStructure();
    }
  }, [loadStructure]);

  const columnDefs: ColumnsType<ColumnInfo> = [
    {
      title: '列名',
      dataIndex: 'column_name',
      key: 'column_name',
      minWidth: 150,
      render: (text: string, record: ColumnInfo) => (
        <span>
          {record.column_key === 'PRI' && <KeyOutlined style={{ color: '#faad14', marginRight: 4 }} />}
          {text}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'data_type',
      key: 'data_type',
      width: 140,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '可空',
      dataIndex: 'is_nullable',
      key: 'is_nullable',
      width: 60,
      render: (val: string) => val === 'YES' ? '是' : '否',
    },
    {
      title: '默认值',
      dataIndex: 'column_default',
      key: 'column_default',
      width: 120,
      ellipsis: true,
    },
    {
      title: '键',
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
      title: '注释',
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
    },
  ];

  const indexDefs: ColumnsType<IndexInfo> = [
    {
      title: '索引名',
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
      title: '列名',
      dataIndex: 'column_name',
      key: 'column_name',
      width: 140,
    },
    {
      title: '唯一',
      dataIndex: 'is_unique',
      key: 'is_unique',
      width: 60,
      render: (val: boolean) => val ? '是' : '否',
    },
    {
      title: '主键',
      dataIndex: 'is_primary',
      key: 'is_primary',
      width: 60,
      render: (val: boolean) => val ? <Tag color="gold">是</Tag> : '否',
    },
    {
      title: '顺序',
      dataIndex: 'seq_in_index',
      key: 'seq_in_index',
      width: 60,
    },
  ];

  const fkDefs: ColumnsType<ForeignKeyInfo> = [
    {
      title: '约束名',
      dataIndex: 'constraint_name',
      key: 'constraint_name',
      width: 180,
    },
    {
      title: '本表列',
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
      title: '引用表',
      dataIndex: 'referenced_table',
      key: 'referenced_table',
      width: 140,
      render: (text: string) => <Tag color="green">{text}</Tag>,
    },
    {
      title: '引用列',
      dataIndex: 'referenced_column',
      key: 'referenced_column',
      width: 120,
      render: (text: string) => <Tag color="green">{text}</Tag>,
    },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>;
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
                信息
              </span>
            ),
            children: tableInfo ? (
              <div style={{ padding: '4px 0' }}>
                <table style={{ width: '100%', fontSize: 11, lineHeight: '18px' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500, width: 100 }}>表名</td>
                      <td>{tableInfo.table_name}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>引擎</td>
                      <td><Tag color="blue">{tableInfo.engine || '-'}</Tag></td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>行数</td>
                      <td>{tableInfo.row_count?.toLocaleString() || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>数据大小</td>
                      <td>{tableInfo.data_length ? `${(tableInfo.data_length / 1024).toFixed(2)} KB` : '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>索引大小</td>
                      <td>{tableInfo.index_length ? `${(tableInfo.index_length / 1024).toFixed(2)} KB` : '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>排序规则</td>
                      <td><Tag color="green">{tableInfo.collation || '-'}</Tag></td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>创建时间</td>
                      <td>{tableInfo.create_time || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>更新时间</td>
                      <td>{tableInfo.update_time || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>注释</td>
                      <td>{tableInfo.comment || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : <Empty description="暂无表信息" />,
          },
          {
            key: 'columns',
            label: `列 (${columns.length})`,
            children: columns.length > 0 ? (
              <Table
                columns={columnDefs}
                dataSource={columns}
                rowKey="column_name"
                size="small"
                pagination={false}
                scroll={{ x: 'max-content' }}
                className="table-compact"
              />
            ) : <Empty description="暂无列信息" />,
          },
          {
            key: 'indexes',
            label: `索引 (${indexes.length})`,
            children: indexes.length > 0 ? (
              <Table
                columns={indexDefs}
                dataSource={indexes}
                rowKey={(record) => `${record.index_name}-${record.column_name}`}
                size="small"
                pagination={false}
                scroll={{ x: 'max-content' }}
                className="table-compact"
              />
            ) : <Empty description="暂无索引" />,
          },
          {
            key: 'foreign_keys',
            label: `外键 (${foreignKeys.length})`,
            children: foreignKeys.length > 0 ? (
              <Table
                columns={fkDefs}
                dataSource={foreignKeys}
                rowKey={(record) => `${record.constraint_name}-${record.column_name}`}
                size="small"
                pagination={false}
                scroll={{ x: 'max-content' }}
                className="table-compact"
              />
            ) : <Empty description="暂无外键" />,
          },
          {
            key: 'sql',
            label: (
              <span>
                <CodeOutlined style={{ marginRight: 4 }} />
                SQL 预览
              </span>
            ),
            children: createTableSQL ? (
              <div style={{ padding: '8px 0' }}>
                <pre style={{
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  overflow: 'auto',
                  maxHeight: 300,
                }}>
                  {createTableSQL}
                </pre>
              </div>
            ) : <Empty description="暂无 SQL" />,
          },
        ]}
      />
    </div>
  );
}
