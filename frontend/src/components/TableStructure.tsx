import { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, Table, Spin, Empty, Tag, Dropdown, Input, Select, Checkbox, Button, Space, App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { KeyOutlined, LinkOutlined, InfoCircleOutlined, ArrowUpOutlined, ArrowDownOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../hooks/useApi';
import { api } from '../api';
import { useAppStore } from '../stores/appStore';
import type { ColumnInfo, IndexInfo, ForeignKeyInfo } from '../types/api';

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

const COMMON_TYPES = [
  'VARCHAR(255)',
  'INT',
  'BIGINT',
  'DECIMAL(10,2)',
  'TEXT',
  'DATETIME',
  'TIMESTAMP',
  'DATE',
  'BOOLEAN',
  'FLOAT',
  'DOUBLE',
  'BLOB',
  'JSON',
];

interface NewColumnData {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string;
  comment: string;
}

export function TableStructure({ connectionId, tableName, database }: TableStructureProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { getColumns, getIndexes, getForeignKeys, getTableInfo } = useDatabase();
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([]);
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [ddl, setDdl] = useState<string>('');

  // Inline insert state
  const [insertingIndex, setInsertingIndex] = useState<number | null>(null);
  const [insertPosition, setInsertPosition] = useState<'before' | 'after'>('after');
  const [referenceColumn, setReferenceColumn] = useState<string>('');
  const [newColumnData, setNewColumnData] = useState<NewColumnData>({
    column_name: '',
    data_type: 'VARCHAR(255)',
    is_nullable: 'YES',
    column_default: '',
    comment: '',
  });

  const dbType = useAppStore((s) => s.connections.find((c) => c.id === connectionId)?.db_type);
  const supportsColumnPosition = dbType === 'mysql' || dbType === 'mariadb';

  const loadStructure = useCallback(async () => {
    setLoading(true);
    try {
      const [cols, idxs, fks, info, ddlResult] = await Promise.all([
        getColumns(connectionId, tableName, database),
        getIndexes(connectionId, tableName, database),
        getForeignKeys(connectionId, tableName, database),
        getTableInfo(connectionId, tableName, database).catch(() => null),
        api.getTableDDL(connectionId, tableName, database).catch(() => []),
      ]);
      setColumns(cols);
      setIndexes(idxs);
      setForeignKeys(fks);
      setTableInfo(info);
      setDdl(Array.isArray(ddlResult) ? ddlResult.join('\n') : String(ddlResult));
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
  ]);

  useEffect(() => {
    if (connectionId && tableName) {
      loadStructure();
    }
  }, [loadStructure]);

  const handleSaveInsert = async () => {
    if (!newColumnData.column_name.trim()) {
      message.error(t('common.required'));
      return;
    }

    try {
      const tableRef = database ? `\`${database}\`.\`${tableName}\`` : `\`${tableName}\``;
      const nullableStr = newColumnData.is_nullable === 'YES' ? '' : ' NOT NULL';
      const defaultStr = newColumnData.column_default ? ` DEFAULT ${newColumnData.column_default}` : '';
      const commentStr = newColumnData.comment ? ` COMMENT '${newColumnData.comment}'` : '';
      const colDef = `\`${newColumnData.column_name}\` ${newColumnData.data_type}${nullableStr}${defaultStr}${commentStr}`;

      let sql: string;
      if (supportsColumnPosition && referenceColumn) {
        if (insertPosition === 'before') {
          const colIndex = columns.findIndex((c) => c.column_name === referenceColumn);
          if (colIndex > 0) {
            const prevColumn = columns[colIndex - 1].column_name;
            sql = `ALTER TABLE ${tableRef} ADD COLUMN ${colDef} AFTER \`${prevColumn}\`;`;
          } else {
            sql = `ALTER TABLE ${tableRef} ADD COLUMN ${colDef} FIRST;`;
          }
        } else {
          sql = `ALTER TABLE ${tableRef} ADD COLUMN ${colDef} AFTER \`${referenceColumn}\`;`;
        }
      } else {
        sql = `ALTER TABLE ${tableRef} ADD COLUMN ${colDef};`;
      }

      await api.executeDDL(connectionId, sql, database);
      message.success(t('common.tableStructureUpdated'));
      setInsertingIndex(null);
      setNewColumnData({
        column_name: '',
        data_type: 'VARCHAR(255)',
        is_nullable: 'YES',
        column_default: '',
        comment: '',
      });
      loadStructure();
    } catch (error: any) {
      message.error(t('common.executeFailed') + ': ' + error.message);
    }
  };

  const handleCancelInsert = () => {
    setInsertingIndex(null);
    setNewColumnData({
      column_name: '',
      data_type: 'VARCHAR(255)',
      is_nullable: 'YES',
      column_default: '',
      comment: '',
    });
  };

  const getColumnMenu = useCallback(
    (columnName: string): MenuProps => ({
      items: [
        {
          key: 'insert-above',
          label: (
            <span>
              <ArrowUpOutlined style={{ marginRight: 4 }} />
              {t('common.insertColumnAbove')}
            </span>
          ),
          disabled: !supportsColumnPosition || insertingIndex !== null,
        },
        {
          key: 'insert-below',
          label: (
            <span>
              <ArrowDownOutlined style={{ marginRight: 4 }} />
              {t('common.insertColumnBelow')}
            </span>
          ),
          disabled: !supportsColumnPosition || insertingIndex !== null,
        },
      ],
      onClick: ({ key }) => {
        if (insertingIndex !== null) return;
        if (key === 'insert-above' || key === 'insert-below') {
          const idx = columns.findIndex((c) => c.column_name === columnName);
          const insertIdx = key === 'insert-above' ? idx : idx + 1;
          setReferenceColumn(columnName);
          setInsertPosition(key === 'insert-above' ? 'before' : 'after');
          setInsertingIndex(insertIdx);
        }
      },
    }),
    [t, supportsColumnPosition, insertingIndex, columns]
  );

  const isNewRow = (record: ColumnInfo) => record.column_name === '__new__';

  const columnDefs: ColumnsType<ColumnInfo> = [
    {
      title: t('common.tableStructure.columnName'),
      dataIndex: 'column_name',
      key: 'column_name',
      minWidth: 150,
      render: (_text: string, record: ColumnInfo) => {
        if (isNewRow(record)) {
          return (
            <Input
              size="small"
              value={newColumnData.column_name}
              onChange={(e) =>
                setNewColumnData((prev) => ({ ...prev, column_name: e.target.value }))
              }
              placeholder={t('common.newColumnName')}
              autoFocus
              style={{ minWidth: 120 }}
            />
          );
        }
        return (
          <Dropdown menu={getColumnMenu(record.column_name)} trigger={['contextMenu']}>
            <span style={{ cursor: 'context-menu' }}>
              {record.column_key === 'PRI' && (
                <KeyOutlined style={{ color: '#faad14', marginRight: 4 }} />
              )}
              {record.column_name}
            </span>
          </Dropdown>
        );
      },
    },
    {
      title: t('common.type'),
      dataIndex: 'data_type',
      key: 'data_type',
      width: 140,
      render: (_text: string, record: ColumnInfo) => {
        if (isNewRow(record)) {
          return (
            <Select
              size="small"
              value={newColumnData.data_type}
              onChange={(value) =>
                setNewColumnData((prev) => ({ ...prev, data_type: value }))
              }
              options={COMMON_TYPES.map((t) => ({ label: t, value: t }))}
              style={{ width: 130 }}
              showSearch
              allowClear
              placeholder={t('common.newColumnType')}
            />
          );
        }
        return <Tag color="blue">{record.data_type}</Tag>;
      },
    },
    {
      title: t('common.nullable'),
      dataIndex: 'is_nullable',
      key: 'is_nullable',
      width: 60,
      render: (_val: string, record: ColumnInfo) => {
        if (isNewRow(record)) {
          return (
            <Checkbox
              checked={newColumnData.is_nullable === 'YES'}
              onChange={(e) =>
                setNewColumnData((prev) => ({
                  ...prev,
                  is_nullable: e.target.checked ? 'YES' : 'NO',
                }))
              }
            >
              {t('common.yes')}
            </Checkbox>
          );
        }
        return record.is_nullable === 'YES' ? t('common.yes') : t('common.no');
      },
    },
    {
      title: t('common.defaultValue'),
      dataIndex: 'column_default',
      key: 'column_default',
      width: 120,
      render: (_text: string, record: ColumnInfo) => {
        if (isNewRow(record)) {
          return (
            <Input
              size="small"
              value={newColumnData.column_default}
              onChange={(e) =>
                setNewColumnData((prev) => ({ ...prev, column_default: e.target.value }))
              }
              placeholder={t('common.newColumnDefault')}
            />
          );
        }
        return record.column_default || '-';
      },
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
      render: (_text: string, record: ColumnInfo) => {
        if (isNewRow(record)) {
          return (
            <Input
              size="small"
              value={newColumnData.comment}
              onChange={(e) =>
                setNewColumnData((prev) => ({ ...prev, comment: e.target.value }))
              }
              placeholder={t('common.newColumnComment')}
            />
          );
        }
        return record.comment || '-';
      },
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_, record: ColumnInfo) => {
        if (isNewRow(record)) {
          return (
            <Space size={4}>
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={handleSaveInsert}
                title={t('common.save')}
              />
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={handleCancelInsert}
                title={t('common.cancel')}
              />
            </Space>
          );
        }
        return null;
      },
    },
  ];

  const tableData = useMemo(() => {
    if (insertingIndex === null) return columns;
    const insertRow: ColumnInfo = {
      column_name: '__new__',
      data_type: '',
      is_nullable: 'YES',
      column_default: '',
      comment: '',
      ordinal_position: insertingIndex + 1,
    } as ColumnInfo;
    const result = [...columns];
    result.splice(insertingIndex, 0, insertRow);
    return result;
  }, [columns, insertingIndex]);

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
        destroyInactiveTabPane
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
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>{t('common.createTime')}</td>
                      <td>{tableInfo.create_time || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 500 }}>{t('common.updateTime')}</td>
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
              columns.length > 0 || insertingIndex !== null ? (
                <Table
                  columns={columnDefs}
                  dataSource={tableData}
                  rowKey={(record) =>
                    record.column_name === '__new__'
                      ? '__new__'
                      : record.column_name
                  }
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
            key: 'ddl',
            label: t('common.ddl'),
            children: ddl ? (
              <pre
                style={{
                  background: 'var(--background-card)',
                  padding: 12,
                  borderRadius: 6,
                  overflow: 'auto',
                  maxHeight: 'calc(100vh - 240px)',
                  fontSize: 12,
                  border: '1px solid var(--border-color)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {ddl}
              </pre>
            ) : (
              <Empty description={t('common.noData')} />
            ),
          },
        ]}
      />
    </div>
  );
}

export default TableStructure;
