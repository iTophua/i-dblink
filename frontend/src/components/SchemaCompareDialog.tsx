import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Modal,
  Form,
  Select,
  Input,
  Button,
  Table,
  Tag,
  Space,
  Collapse,
  Typography,
  App,
  Row,
  Col,
} from 'antd';
import { DiffOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api';
import type { ConnectionOutput } from '../types/api';
import { DDLViewer } from './DDLViewer';
import { appModal } from '../utils/appModal';
import { syncStatements } from '../utils/schemaSync';

const { Text, Title } = Typography;

interface DiffColumn {
  column_name: string;
  source_def?: string;
  target_def?: string;
  diff_type: string;
}

interface DiffIndex {
  index_name: string;
  /** 索引里的第一列（兼容旧后端）；完整列序看 column_names */
  column_name: string;
  column_names?: string[];
  is_unique: boolean;
  is_primary?: boolean;
  diff_type: string;
}

interface DiffForeignKey {
  constraint_name: string;
  column_name: string;
  column_names?: string[];
  referenced_table: string;
  referenced_column: string;
  referenced_columns?: string[];
  diff_type: string;
}

interface SchemaDiff {
  table_name: string;
  column_diffs: DiffColumn[];
  index_diffs: DiffIndex[];
  foreign_key_diffs: DiffForeignKey[];
  has_diffs: boolean;
  alter_sql: string[];
  /** 目标库里没有这张表：后端只给提示，不给可执行语句 */
  table_missing?: boolean;
}

/** 差异之外，后端一并说明的情况 */
interface CompareSummary {
  /** 没比成的表。非空时 diffs 不完整，不能当成「无差异」 */
  errors: string[];
  /** 目标库里有、源库里没有的表（同步不会碰） */
  targetOnlyTables: string[];
  /** 两边是不是同一种库。不是的话同步语句没做方言转换，只能看不能执行 */
  syncSupported: boolean;
}

/** 后端的空列表可能序列化成 null（Go 的 nil 切片）：统一成数组，免得读 .length 时崩掉 */
function normalizeDiff(diff: SchemaDiff): SchemaDiff {
  return {
    ...diff,
    column_diffs: diff.column_diffs ?? [],
    index_diffs: diff.index_diffs ?? [],
    foreign_key_diffs: diff.foreign_key_diffs ?? [],
    alter_sql: diff.alter_sql ?? [],
  };
}

export interface SchemaCompareDialogProps {
  open: boolean;
  onClose: () => void;
  connections: ConnectionOutput[];
}

export const SchemaCompareDialog: React.FC<SchemaCompareDialogProps> = ({
  open,
  onClose,
  connections,
}) => {
  const { t } = useTranslation();
  const { message: msg } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [diffs, setDiffs] = useState<SchemaDiff[]>([]);
  const [executing, setExecuting] = useState(false);
  /**
   * 最近一次比对所用的目标。差异是针对它算出来的，「执行同步」也必须发给它——
   * 此前这里用的是源连接，差异只有一条语句时会直接改到源库上。
   */
  const [comparedTarget, setComparedTarget] = useState<{
    connectionId: string;
    database: string;
    connectionName: string;
  } | null>(null);
  const [summary, setSummary] = useState<CompareSummary | null>(null);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setDiffs([]);
        setSummary(null);
        form.resetFields();
        setComparedTarget(null);
      });
    }
  }, [open, form]);

  const handleCompare = async () => {
    const values = await form.validateFields();
    setComparedTarget({
      connectionId: values.targetConnectionId,
      database: values.targetDatabase,
      connectionName:
        connections.find((c) => c.id === values.targetConnectionId)?.name ??
        values.targetConnectionId,
    });
    setLoading(true);
    setSummary(null);
    try {
      const resp = await api.compareSchema({
        sourceConnectionId: values.sourceConnectionId,
        sourceDatabase: values.sourceDatabase,
        targetConnectionId: values.targetConnectionId,
        targetDatabase: values.targetDatabase,
        tableName: values.tableName || undefined,
      });
      if (resp.diffs) {
        setDiffs(resp.diffs.map(normalizeDiff));
        const next: CompareSummary = {
          errors: resp.errors ?? [],
          targetOnlyTables: resp.target_only_tables ?? [],
          syncSupported: resp.sync_supported !== false,
        };
        setSummary(next);
        // 有表没比成的时候不能说「完全一致」
        if (resp.diffs.length === 0 && next.errors.length === 0) {
          msg.info(t('common.schemasIdentical'));
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('common.schemaCompareFailed');
      msg.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 执行同步：只跑新增类语句，逐条发到目标库；执行前确认目标是谁
  const handleExecuteSQL = async (alterSql: string[], tableName: string) => {
    const target = comparedTarget;
    const statements = syncStatements(alterSql);
    if (!target || statements.length === 0) return;

    appModal.confirm({
      title: t('common.executeSync'),
      content: t('common.schemaSyncConfirm', {
        n: statements.length,
        table: tableName,
        db: target.database,
        conn: target.connectionName,
      }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setExecuting(true);
        try {
          let failed = false;
          for (const [index, statement] of statements.entries()) {
            try {
              await api.executeDDL(target.connectionId, statement, target.database);
            } catch (err: unknown) {
              // 中途失败就停：后面的语句可能依赖这一条（比如先加列再建索引）
              failed = true;
              const reason = err instanceof Error ? err.message : String(err);
              msg.error(
                `${t('common.schemaSyncStatementFailed', { n: index + 1, sql: statement })}\n${reason}`
              );
              break;
            }
          }
          if (!failed) msg.success(t('common.schemaSyncSuccess', { table: tableName }));
        } finally {
          setExecuting(false);
        }
      },
    });
  };

  const diffTypeTag: Record<string, { color: string; text: string }> = {
    added: { color: 'green', text: t('common.added') },
    modified: { color: 'orange', text: t('common.modified') },
    missing: { color: 'red', text: t('common.missing') },
  };

  const columnColumns: ColumnsType<DiffColumn> = [
    {
      title: t('common.tableStructure.columnName'),
      dataIndex: 'column_name',
      key: 'column_name',
      width: 150,
    },
    {
      title: t('common.sourceDefinition'),
      dataIndex: 'source_def',
      key: 'source_def',
      ellipsis: true,
    },
    {
      title: t('common.targetDefinition'),
      dataIndex: 'target_def',
      key: 'target_def',
      ellipsis: true,
    },
    {
      title: t('common.diffType'),
      dataIndex: 'diff_type',
      key: 'diff_type',
      width: 100,
      render: (type: string) => {
        const config = diffTypeTag[type];
        return config ? <Tag color={config.color}>{config.text}</Tag> : <Tag>{type}</Tag>;
      },
    },
  ];

  const indexColumns: ColumnsType<DiffIndex> = [
    {
      title: t('common.tableStructure.indexName'),
      dataIndex: 'index_name',
      key: 'index_name',
      width: 150,
    },
    {
      title: t('common.tableStructure.columnName'),
      dataIndex: 'column_name',
      key: 'column_name',
      width: 200,
      render: (_: string, record: DiffIndex) =>
        (record.column_names ?? [record.column_name]).join(', '),
    },
    {
      title: t('common.tableStructure.unique'),
      dataIndex: 'is_unique',
      key: 'is_unique',
      width: 80,
      render: (val: boolean) => (
        <Tag color={val ? 'gold' : 'default'}>{val ? t('common.yes') : t('common.no')}</Tag>
      ),
    },
    {
      title: t('common.diffType'),
      dataIndex: 'diff_type',
      key: 'diff_type',
      width: 100,
      render: (type: string) => {
        const config = diffTypeTag[type];
        return config ? <Tag color={config.color}>{config.text}</Tag> : <Tag>{type}</Tag>;
      },
    },
  ];

  const fkColumns: ColumnsType<DiffForeignKey> = [
    {
      title: t('common.constraintName'),
      dataIndex: 'constraint_name',
      key: 'constraint_name',
      width: 150,
    },
    {
      title: t('common.tableStructure.columnName'),
      dataIndex: 'column_name',
      key: 'column_name',
      width: 160,
      render: (_: string, record: DiffForeignKey) =>
        (record.column_names ?? [record.column_name]).join(', '),
    },
    {
      title: t('common.referencedTable'),
      dataIndex: 'referenced_table',
      key: 'referenced_table',
      width: 150,
    },
    {
      title: t('common.referencedColumn'),
      dataIndex: 'referenced_column',
      key: 'referenced_column',
      width: 160,
      render: (_: string, record: DiffForeignKey) =>
        (record.referenced_columns ?? [record.referenced_column]).join(', '),
    },
    {
      title: t('common.diffType'),
      dataIndex: 'diff_type',
      key: 'diff_type',
      width: 100,
      render: (type: string) => {
        const config = diffTypeTag[type];
        return config ? <Tag color={config.color}>{config.text}</Tag> : <Tag>{type}</Tag>;
      },
    },
  ];

  // 目标可以是同一个连接：同一个实例上两个库之间对比是最常见的场景
  const targetConns = connections;

  return (
    <Modal
      title={
        <Space>
          <DiffOutlined />
          {t('common.schemaStructureComparison')}
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={1000}
      transitionName=""
      maskTransitionName=""
      footer={[
        <Button key="close" onClick={onClose}>
          {t('common.close')}
        </Button>,
        <Button
          key="compare"
          type="primary"
          icon={<DiffOutlined />}
          loading={loading}
          onClick={handleCompare}
        >
          {t('common.compareStructure')}
        </Button>,
      ]}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--background-toolbar)',
          }}
        >
          <Form form={form} layout="vertical">
            <Row gutter={12}>
              <Col span={12}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  {t('common.sourceDatabase')}
                </div>
                <Form.Item
                  name="sourceConnectionId"
                  label={t('common.selectSourceConnection')}
                  rules={[{ required: true, message: t('common.pleaseSelectSourceDatabase') }]}
                >
                  <Select data-testid="schema-compare-source-conn">
                    {connections.map((c) => (
                      <Select.Option key={c.id} value={c.id}>
                        {c.name} ({c.db_type})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item
                  name="sourceDatabase"
                  label={t('common.sourceDatabaseName')}
                  rules={[{ required: true, message: t('common.pleaseEnterSourceDatabaseName') }]}
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder={t('common.exampleDb')} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  {t('common.targetDatabase')}
                </div>
                <Form.Item
                  name="targetConnectionId"
                  label={t('common.selectTargetConnection')}
                  rules={[{ required: true, message: t('common.pleaseSelectTargetDatabase') }]}
                >
                  <Select data-testid="schema-compare-target-conn">
                    {targetConns.map((c) => (
                      <Select.Option key={c.id} value={c.id}>
                        {c.name} ({c.db_type})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item
                  name="targetDatabase"
                  label={t('common.targetDatabaseName')}
                  rules={[{ required: true, message: t('common.pleaseEnterTargetDatabaseName') }]}
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder={t('common.exampleDb')} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="tableName"
              label={t('common.specifyTableNameOptional')}
              tooltip={t('common.leaveEmptyCompareAllTables')}
              style={{ marginTop: 12, marginBottom: 0 }}
            >
              <Input placeholder={t('common.exampleUsers')} />
            </Form.Item>
          </Form>
        </div>

        {summary && summary.errors.length > 0 && (
          <Alert
            type="warning"
            showIcon
            title={t('common.schemaCompareIncomplete', { count: summary.errors.length })}
            description={
              <ul style={{ margin: 0, paddingInlineStart: 18, maxHeight: 120, overflow: 'auto' }}>
                {summary.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            }
          />
        )}
        {summary && !summary.syncSupported && (
          <Alert type="info" showIcon title={t('common.schemaCompareCrossDialect')} />
        )}
        {summary && summary.targetOnlyTables.length > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }} data-testid="schema-compare-target-only">
            {t('common.schemaCompareTargetOnly', {
              count: summary.targetOnlyTables.length,
              tables: summary.targetOnlyTables.join(', '),
            })}
          </Text>
        )}

        {diffs.length > 0 && (
          <Collapse
            defaultActiveKey={diffs.filter((diff) => diff.has_diffs).map((diff) => diff.table_name)}
            items={diffs.map((diff) => ({
              key: diff.table_name,
              label: (
                <Space>
                  <Text strong>{diff.table_name}</Text>
                  {diff.has_diffs ? (
                    diff.table_missing ? (
                      <Tag color="red">{t('common.schemaCompareTableMissing')}</Tag>
                    ) : (
                      <Tag color="orange">
                        {t('common.differencesCount', {
                          count:
                            diff.column_diffs.length +
                            diff.index_diffs.length +
                            diff.foreign_key_diffs.length,
                        })}
                      </Tag>
                    )
                  ) : (
                    <Tag color="green">{t('common.schemasMatch')}</Tag>
                  )}
                </Space>
              ),
              children: (
                <>
                  {diff.column_diffs.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <Title level={5}>
                        {t('common.columnDifferences', { count: diff.column_diffs.length })}
                      </Title>
                      <Table
                        dataSource={diff.column_diffs}
                        columns={columnColumns}
                        rowKey={(r) => r.column_name}
                        size="small"
                        pagination={false}
                        scroll={{ y: 200 }}
                      />
                    </div>
                  )}

                  {diff.index_diffs.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <Title level={5}>
                        {t('common.indexDifferences', { count: diff.index_diffs.length })}
                      </Title>
                      <Table
                        dataSource={diff.index_diffs}
                        columns={indexColumns}
                        rowKey={(r) => r.index_name}
                        size="small"
                        pagination={false}
                        scroll={{ y: 150 }}
                      />
                    </div>
                  )}

                  {diff.foreign_key_diffs.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <Title level={5}>
                        {t('common.foreignKeyDifferences', {
                          count: diff.foreign_key_diffs.length,
                        })}
                      </Title>
                      <Table
                        dataSource={diff.foreign_key_diffs}
                        columns={fkColumns}
                        rowKey={(r) => r.constraint_name}
                        size="small"
                        pagination={false}
                        scroll={{ y: 150 }}
                      />
                    </div>
                  )}

                  {diff.alter_sql.length > 0 && (
                    <div>
                      <Title level={5}>{t('common.syncSqlPreview')}</Title>
                      <DDLViewer ddl={diff.alter_sql.join('\n')} maxHeight={200} />
                      {/* 只有注释的（目标库多出的、两边不同的、缺表的）没有可执行语句，不给按钮 */}
                      {syncStatements(diff.alter_sql).length > 0 && (
                        <Button
                          type="primary"
                          icon={<ThunderboltOutlined />}
                          loading={executing}
                          onClick={() => handleExecuteSQL(diff.alter_sql, diff.table_name)}
                          disabled={!summary?.syncSupported}
                          style={{ marginTop: 8 }}
                          data-testid="schema-compare-execute"
                        >
                          {t('common.executeSync')}
                        </Button>
                      )}
                      <Text
                        type="secondary"
                        style={{ display: 'block', marginTop: 6, fontSize: 12 }}
                      >
                        {diff.table_missing
                          ? t('common.schemaCompareTableMissingHint')
                          : t('common.schemaSyncHint')}
                      </Text>
                    </div>
                  )}
                </>
              ),
            }))}
          />
        )}
      </Space>
    </Modal>
  );
};
