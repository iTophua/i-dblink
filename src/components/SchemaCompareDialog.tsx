import React, { useEffect, useState } from 'react';
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
} from 'antd';
import {
  DiffOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api';
import type { ConnectionOutput } from '../types/api';

const { Panel } = Collapse;
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
          msg.info('两个数据库结构完全一致，无差异');
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '结构比较失败';
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
      msg.success(`${tableName} 结构同步成功`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '执行失败';
      msg.error(errorMessage);
    } finally {
      setExecuting(false);
    }
  };

  const diffTypeTag: Record<string, { color: string; text: string }> = {
    added: { color: 'green', text: '新增' },
    modified: { color: 'orange', text: '修改' },
    missing: { color: 'red', text: '缺失' },
  };

  const columnColumns: ColumnsType<DiffColumn> = [
    {
      title: '列名',
      dataIndex: 'column_name',
      key: 'column_name',
      width: 150,
    },
    {
      title: '源定义',
      dataIndex: 'source_def',
      key: 'source_def',
      ellipsis: true,
    },
    {
      title: '目标定义',
      dataIndex: 'target_def',
      key: 'target_def',
      ellipsis: true,
    },
    {
      title: '差异类型',
      dataIndex: 'diff_type',
      key: 'diff_type',
      width: 100,
      render: (type: string) => {
        const config = diffTypeTag[type];
        return config ? (
          <Tag color={config.color}>{config.text}</Tag>
        ) : (
          <Tag>{type}</Tag>
        );
      },
    },
  ];

  const indexColumns: ColumnsType<DiffIndex> = [
    {
      title: '索引名',
      dataIndex: 'index_name',
      key: 'index_name',
      width: 150,
    },
    {
      title: '列名',
      dataIndex: 'column_name',
      key: 'column_name',
      width: 150,
    },
    {
      title: '唯一',
      dataIndex: 'is_unique',
      key: 'is_unique',
      width: 80,
      render: (val: boolean) => (
        <Tag color={val ? 'gold' : 'default'}>{val ? '是' : '否'}</Tag>
      ),
    },
    {
      title: '差异类型',
      dataIndex: 'diff_type',
      key: 'diff_type',
      width: 100,
      render: (type: string) => {
        const config = diffTypeTag[type];
        return config ? (
          <Tag color={config.color}>{config.text}</Tag>
        ) : (
          <Tag>{type}</Tag>
        );
      },
    },
  ];

  const fkColumns: ColumnsType<DiffForeignKey> = [
    {
      title: '约束名',
      dataIndex: 'constraint_name',
      key: 'constraint_name',
      width: 150,
    },
    {
      title: '列名',
      dataIndex: 'column_name',
      key: 'column_name',
      width: 150,
    },
    {
      title: '引用表',
      dataIndex: 'referenced_table',
      key: 'referenced_table',
      width: 150,
    },
    {
      title: '引用列',
      dataIndex: 'referenced_column',
      key: 'referenced_column',
      width: 150,
    },
    {
      title: '差异类型',
      dataIndex: 'diff_type',
      key: 'diff_type',
      width: 100,
      render: (type: string) => {
        const config = diffTypeTag[type];
        return config ? (
          <Tag color={config.color}>{config.text}</Tag>
        ) : (
          <Tag>{type}</Tag>
        );
      },
    },
  ];

  const targetConns = selectedConn
    ? connections.filter((c) => c.id !== selectedConn)
    : connections;

  return (
    <Modal
      title={
        <Space>
          <DiffOutlined />
          数据库结构比较
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={1000}
      footer={null}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Form form={form} layout="vertical">
          <Form.Item
            name="sourceConnectionId"
            label="源数据库"
            rules={[{ required: true, message: '请选择源数据库' }]}
          >
            <Select
              placeholder="选择源数据库连接"
              onChange={(val) => setSelectedConn(val)}
            >
              {connections.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name} ({c.db_type})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="sourceDatabase"
            label="源数据库名"
            rules={[{ required: true, message: '请输入源数据库名' }]}
          >
            <Input placeholder="例如: mydb" />
          </Form.Item>

          <Form.Item
            name="targetConnectionId"
            label="目标数据库"
            rules={[{ required: true, message: '请选择目标数据库' }]}
          >
            <Select placeholder="选择目标数据库连接">
              {targetConns.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name} ({c.db_type})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="targetDatabase"
            label="目标数据库名"
            rules={[{ required: true, message: '请输入目标数据库名' }]}
          >
            <Input placeholder="例如: mydb" />
          </Form.Item>

          <Form.Item
            name="tableName"
            label="指定表名（可选）"
            tooltip="留空则比较整个数据库的所有表"
          >
            <Input placeholder="例如: users" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              icon={<DiffOutlined />}
              onClick={handleCompare}
              loading={loading}
              block
            >
              比较结构
            </Button>
          </Form.Item>
        </Form>

        {diffs.length > 0 && (
          <Collapse defaultActiveKey={[]}>
            {diffs.map((diff) => (
              <Panel
                header={
                  <Space>
                    <Text strong>{diff.table_name}</Text>
                    {diff.has_diffs ? (
                      <Tag color="orange">
                        {diff.column_diffs.length + diff.index_diffs.length + diff.foreign_key_diffs.length} 处差异
                      </Tag>
                    ) : (
                      <Tag color="green">结构一致</Tag>
                    )}
                  </Space>
                }
                key={diff.table_name}
              >
                {diff.column_diffs.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <Title level={5}>列差异 ({diff.column_diffs.length})</Title>
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
                    <Title level={5}>索引差异 ({diff.index_diffs.length})</Title>
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
                    <Title level={5}>外键差异 ({diff.foreign_key_diffs.length})</Title>
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
                    <Title level={5}>同步 SQL 预览</Title>
                    <pre
                      style={{
                        background: '#f5f5f5',
                        padding: 12,
                        borderRadius: 4,
                        fontSize: 12,
                        maxHeight: 200,
                        overflow: 'auto',
                      }}
                    >
                      {diff.alter_sql.join('\n')}
                    </pre>
                    <Button
                      type="primary"
                      icon={<ThunderboltOutlined />}
                      loading={executing}
                      onClick={() => handleExecuteSQL(diff.alter_sql.join('\n'), diff.table_name)}
                      style={{ marginTop: 8 }}
                    >
                      执行同步
                    </Button>
                  </div>
                )}
              </Panel>
            ))}
          </Collapse>
        )}
      </Space>
    </Modal>
  );
};
