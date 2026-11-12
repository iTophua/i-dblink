import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Tabs, Table, Spin, Tag, App, Button, Input, Descriptions, Tooltip, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  KeyOutlined,
  LinkOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import { useDatabase } from '../hooks/useApi';
import { useTableScrollHeight } from '../hooks/useTableScrollHeight';
import { api } from '../api';
import type { ColumnInfo, IndexInfo, ForeignKeyInfo, CheckConstraintInfo } from '../types/api';
import { DDLViewer } from './DDLViewer';
import { EnhancedEmptyState } from './LoadingStates';

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

export const TableStructure = memo(function TableStructure({
  connectionId,
  tableName,
  database,
}: TableStructureProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const { message } = App.useApp();
  const { getColumns, getIndexes, getForeignKeys, getTableInfo } = useDatabase();
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([]);
  const [checkConstraints, setCheckConstraints] = useState<CheckConstraintInfo[]>([]);
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [ddl, setDdl] = useState<string>('');
  const [columnSearch, setColumnSearch] = useState('');
  const [activeKey, setActiveKey] = useState('columns');
  const { tableScrollHeight, containerRef, toolbarRef } = useTableScrollHeight([
    columns.length,
    indexes.length,
    foreignKeys.length,
    checkConstraints.length,
  ]);
  const tableHeight = Math.max(160, tableScrollHeight - 52);

  const loadStructure = useCallback(async () => {
    setLoading(true);
    try {
      const [cols, idxs, fks, info, ddlResult, ccs] = await Promise.all([
        getColumns(connectionId, tableName, database).catch((err) => {
          console.error('Failed to load columns:', err);
          return [] as ColumnInfo[];
        }),
        getIndexes(connectionId, tableName, database).catch((err) => {
          console.error('Failed to load indexes:', err);
          return [] as IndexInfo[];
        }),
        getForeignKeys(connectionId, tableName, database).catch((err) => {
          console.error('Failed to load foreign keys:', err);
          return [] as ForeignKeyInfo[];
        }),
        getTableInfo(connectionId, tableName, database).catch(() => null),
        api.getTableDDL(connectionId, tableName, database).catch(() => []),
        api.getCheckConstraints(connectionId, tableName, database).catch(() => []),
      ]);
      setColumns(cols);
      setIndexes(idxs);
      setForeignKeys(fks);
      setTableInfo(info);
      setDdl(Array.isArray(ddlResult) ? ddlResult.join('\n') : String(ddlResult));
      setCheckConstraints(ccs);
    } catch (error) {
      console.error('Failed to load table structure:', error);
      message.error(t('common.failedToLoadTableStructure'));
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
    message,
    t,
  ]);

  useEffect(() => {
    if (connectionId && tableName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换表后加载结构数据
      loadStructure();
    }
  }, [loadStructure, connectionId, tableName]);

  const columnDefs: ColumnsType<ColumnInfo> = [
    {
      title: t('common.tableStructure.columnName'),
      dataIndex: 'column_name',
      key: 'column_name',
      minWidth: 150,
      ellipsis: true,
      render: (_text: string, record: ColumnInfo) => (
        <span>
          {record.column_key === 'PRI' && (
            <KeyOutlined style={{ color: tc.warning, marginRight: 4 }} />
          )}
          {record.column_name}
        </span>
      ),
    },
    {
      title: t('common.type'),
      dataIndex: 'data_type',
      key: 'data_type',
      width: 140,
      ellipsis: true,
      render: (_text: string, record: ColumnInfo) => (
        <Tag style={{ background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>{record.data_type}</Tag>
      ),
    },
    {
      title: t('common.nullable'),
      dataIndex: 'is_nullable',
      key: 'is_nullable',
      width: 60,
      render: (_val: string, record: ColumnInfo) =>
        record.is_nullable === 'YES' ? t('common.yes') : t('common.no'),
    },
    {
      title: t('common.defaultValue'),
      dataIndex: 'column_default',
      key: 'column_default',
      width: 120,
      ellipsis: true,
      render: (_text: string, record: ColumnInfo) => record.column_default || '-',
    },
    {
      title: t('common.key'),
      dataIndex: 'column_key',
      key: 'column_key',
      width: 60,
      render: (val?: string) => {
        if (val === 'PRI') return <Tag color="gold">PRI</Tag>;
        if (val === 'UNI') return <Tag color="green">UNI</Tag>;
        if (val === 'MUL') return <Tag style={{ background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>MUL</Tag>;
        return null;
      },
    },
    {
      title: t('common.comment'),
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
      render: (_text: string, record: ColumnInfo) => record.comment || '-',
    },
  ];

  const tableData = useMemo(() => {
    const q = columnSearch.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter((column) =>
      [column.column_name, column.data_type, column.comment]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [columns, columnSearch]);

  const handleCopyDdl = useCallback(() => {
    if (!ddl) return;
    navigator.clipboard.writeText(ddl).then(
      () => message.success(t('common.copiedToClipboard')),
      () => message.error(t('common.copyFailed'))
    );
  }, [ddl, message, t]);

  const indexDefs: ColumnsType<IndexInfo> = [
    {
      title: t('common.tableStructure.indexName'),
      dataIndex: 'index_name',
      key: 'index_name',
      width: 180,
      render: (text: string, record: IndexInfo) => (
        <span>
          {record.is_primary && <KeyOutlined style={{ color: tc.warning, marginRight: 4 }} />}
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
      render: (text: string) => <Tag style={{ background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>{text}</Tag>,
    },
    {
      title: '',
      key: 'arrow',
      width: 30,
      render: () => <LinkOutlined style={{ color: tc.textTertiary }} />,
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

  const checkConstraintDefs: ColumnsType<CheckConstraintInfo> = [
    {
      title: t('common.constraintName'),
      dataIndex: 'constraint_name',
      key: 'constraint_name',
      width: 200,
    },
    {
      title: t('common.checkConstraints'),
      dataIndex: 'check_clause',
      key: 'check_clause',
      render: (text: string) => <code style={{ fontSize: 12 }}>{text}</code>,
    },
  ];

  if (loading && columns.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '8px 12px' }}
    >
      {/* 工具栏：列搜索 / 复制 DDL / 刷新 */}
      <div
        ref={toolbarRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '2px 0 8px',
          flexShrink: 0,
        }}
      >
        {activeKey === 'columns' && (
          <Input
            allowClear
            size="small"
            value={columnSearch}
            onChange={(e) => setColumnSearch(e.target.value)}
            prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
            placeholder={t('common.tableStructure.searchColumns')}
            style={{ width: 220 }}
          />
        )}
        <span style={{ flex: 1 }} />
        <Space size={6}>
          <Tooltip title={t('common.tableStructure.copyDdl')}>
            <Button
              size="small"
              icon={<CopyOutlined />}
              disabled={!ddl}
              onClick={handleCopyDdl}
            >
              {t('common.ddl')}
            </Button>
          </Tooltip>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={loadStructure}>
            {t('common.refresh')}
          </Button>
        </Space>
      </div>
      <Tabs
        size="small"
        activeKey={activeKey}
        onChange={setActiveKey}
        destroyOnHidden
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        items={[
          {
            key: 'columns',
            label: `${t('common.tableStructure.columns')} (${columns.length})`,
            children:
              columns.length > 0 ? (
                <Table
                  columns={columnDefs}
                  dataSource={tableData}
                  rowKey={(record, index) => `${record.column_name}-${index}`}
                  size="small"
                  pagination={false}
                  loading={loading}
                  scroll={{ x: 'max-content', y: tableHeight }}
                  className="table-compact"
                  locale={{
                    emptyText: <EnhancedEmptyState title={t('common.noColumnInfo')} />,
                  }}
                />
              ) : (
                <EnhancedEmptyState
                  title={t('common.noColumnInfo')}
                  action={{
                    label: t('common.refresh'),
                    onClick: loadStructure,
                    icon: <ReloadOutlined />,
                  }}
                />
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
                  rowKey={(record, index) => `${record.index_name}-${record.column_name}-${index}`}
                  size="small"
                  pagination={false}
                  loading={loading}
                  scroll={{ x: 'max-content', y: tableHeight }}
                  className="table-compact"
                />
              ) : (
                <EnhancedEmptyState title={t('common.noIndexes')} />
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
                  rowKey={(record, index) => `${record.constraint_name}-${record.column_name}-${index}`}
                  size="small"
                  pagination={false}
                  loading={loading}
                  scroll={{ x: 'max-content', y: tableHeight }}
                  className="table-compact"
                />
              ) : (
                <EnhancedEmptyState title={t('common.noForeignKeys')} />
              ),
          },
          {
            key: 'check_constraints',
            label: `${t('common.checkConstraints')} (${checkConstraints.length})`,
            children:
              checkConstraints.length > 0 ? (
                <Table
                  columns={checkConstraintDefs}
                  dataSource={checkConstraints}
                  rowKey={(record, index) => `${record.constraint_name}-${index}`}
                  size="small"
                  pagination={false}
                  loading={loading}
                  scroll={{ x: 'max-content', y: tableHeight }}
                  className="table-compact"
                />
              ) : (
                <EnhancedEmptyState title={t('common.noCheckConstraints')} />
              ),
          },
          {
            key: 'info',
            label: (
              <span>
                <InfoCircleOutlined style={{ marginRight: 4 }} />
                {t('common.info')}
              </span>
            ),
            children: tableInfo ? (
              <Descriptions
                bordered
                size="small"
                column={2}
                style={{ padding: '4px 0' }}
                items={[
                  {
                    key: 'tableName',
                    label: t('common.tableName'),
                    children: tableInfo.table_name,
                  },
                  {
                    key: 'engine',
                    label: t('common.engine'),
                    children: tableInfo.engine || '-',
                  },
                  {
                    key: 'rowCount',
                    label: t('common.tableList.rowCount'),
                    children: tableInfo.row_count?.toLocaleString() || '-',
                  },
                  {
                    key: 'dataSize',
                    label: t('common.dataSize'),
                    children: tableInfo.data_length
                      ? `${(tableInfo.data_length / 1024).toFixed(2)} KB`
                      : '-',
                  },
                  {
                    key: 'indexSize',
                    label: t('common.indexSize'),
                    children: tableInfo.index_length
                      ? `${(tableInfo.index_length / 1024).toFixed(2)} KB`
                      : '-',
                  },
                  {
                    key: 'collation',
                    label: t('common.databaseProperties.collation'),
                    children: tableInfo.collation || '-',
                  },
                  {
                    key: 'createTime',
                    label: t('common.createTime'),
                    children: tableInfo.create_time || '-',
                  },
                  {
                    key: 'updateTime',
                    label: t('common.updateTime'),
                    children: tableInfo.update_time || '-',
                  },
                  {
                    key: 'comment',
                    label: t('common.comment'),
                    children: tableInfo.comment || '-',
                    span: 2,
                  },
                ]}
              />
            ) : (
              <EnhancedEmptyState title={t('common.noTableInfo')} />
            ),
          },
          {
            key: 'ddl',
            label: t('common.ddl'),
            children: ddl ? (
              <div style={{ height: tableHeight, display: 'flex', flexDirection: 'column' }}>
                <DDLViewer
                  ddl={ddl}
                  connectionId={connectionId}
                  style={{ flex: 1, minHeight: 0 }}
                />
              </div>
            ) : (
              <EnhancedEmptyState title={t('common.noData')} />
            ),
          },
        ]}
      />
    </div>
  );
});

export default TableStructure;
