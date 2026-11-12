import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
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

const { Text, Title } = Typography;

interface DiffColumn {
  column_name: string;
  source_def?: string;
  target_def?: string;
  diff_type: string;
}

interface DiffIndex {
  index_name: string;
  column_name: string;
  is_unique: boolean;
  diff_type: string;
}

interface DiffForeignKey {
  constraint_name: string;
  column_name: string;
  referenced_table: string;
  referenced_column: string;
  diff_type: string;
}

interface SchemaDiff {
  table_name: string;
  column_diffs: DiffColumn[];
  index_diffs: DiffIndex[];
  foreign_key_diffs: DiffForeignKey[];
  has_diffs: boolean;
  alter_sql: string[];
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
  const [selectedConn, setSelectedConn] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setDiffs([]);
        form.resetFields();
        setSelectedConn(null);
      });
    }
  }, [open, form]);

  const handleCompare = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      const resp = await api.compareSchema({
        sourceConnectionId: values.sourceConnectionId,
        sourceDatabase: values.sourceDatabase,
        targetConnectionId: values.targetConnectionId,
        targetDatabase: values.targetDatabase,
        tableName: values.tableName || undefined,
      });
      if (resp.diffs) {
        setDiffs(resp.diffs);
        if (resp.diffs.length === 0) {
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

  const handleExecuteSQL = async (sql: string, tableName: string) => {
    if (!selectedConn) return;
    setExecuting(true);
    try {
      await api.executeDDL(selectedConn, sql);
      msg.success(t('common.schemaSyncSuccess', { table: tableName }));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('common.sqlEditor.executeFailed');
      msg.error(errorMessage);
    } finally {
      setExecuting(false);
    }
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
      width: 150,
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
      width: 150,
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
      width: 150,
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

  const targetConns = selectedConn ? connections.filter((c) => c.id !== selectedConn) : connections;

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
                  <Select onChange={(val) => setSelectedConn(val)}>
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
                  rules={[
                    { required: true, message: t('common.pleaseEnterSourceDatabaseName') },
                  ]}
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
                  <Select>
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
                  rules={[
                    { required: true, message: t('common.pleaseEnterTargetDatabaseName') },
                  ]}
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

        {diffs.length > 0 && (
          <Collapse
            defaultActiveKey={diffs.filter((diff) => diff.has_diffs).map((diff) => diff.table_name)}
            items={diffs.map((diff) => ({
              key: diff.table_name,
              label: (
                <Space>
                  <Text strong>{diff.table_name}</Text>
                  {diff.has_diffs ? (
                    <Tag color="orange">
                      {t('common.differencesCount', {
                        count:
                          diff.column_diffs.length +
                          diff.index_diffs.length +
                          diff.foreign_key_diffs.length,
                      })}
                    </Tag>
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
                      {t('common.foreignKeyDifferences', { count: diff.foreign_key_diffs.length })}
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
                    <Button
                      type="primary"
                      icon={<ThunderboltOutlined />}
                      loading={executing}
                      onClick={() => handleExecuteSQL(diff.alter_sql.join('\n'), diff.table_name)}
                      style={{ marginTop: 8 }}
                    >
                      {t('common.executeSync')}
                    </Button>
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
