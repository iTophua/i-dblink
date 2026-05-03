import { useState } from 'react';
import { Modal, Form, Input, Radio, Select, message } from 'antd';
import { api } from '../api';

interface CopyTableDialogProps {
  open: boolean;
  sourceTable: string;
  sourceDatabase?: string;
  connectionId: string;
  databases: string[];
  onCancel: () => void;
  onSuccess: () => void;
}

export function CopyTableDialog({
  open,
  sourceTable,
  sourceDatabase,
  connectionId,
  databases,
  onCancel,
  onSuccess,
}: CopyTableDialogProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const targetTable = values.targetTable;
      const targetDb = values.targetDatabase || sourceDatabase;
      const copyData = values.copyType === 'structure_and_data';

      // 1. 获取源表 DDL
      const ddlStatements = await api.getTableDDL(connectionId, sourceTable, sourceDatabase);

      // 2. 替换表名
      const newDdl = ddlStatements.map((s: string) =>
        s
          .replace(new RegExp(`\\\`${sourceTable}\\\``, 'g'), `\\\`${targetTable}\\\``)
          .replace(new RegExp(`"${sourceTable}"`, 'g'), `"${targetTable}"`)
          .replace(new RegExp(`\\[${sourceTable}\\]`, 'g'), `[${targetTable}]`)
      );

      // 3. 执行 DDL
      for (const stmt of newDdl) {
        await api.executeDDL(connectionId, stmt.trim(), targetDb);
      }

      // 4. 如果需要，复制数据
      if (copyData) {
        const escapeId = (name: string) => {
          if (name.includes(' ')) return `\`${name}\``;
          return name;
        };
        const sql = `INSERT INTO ${escapeId(targetTable)} SELECT * FROM ${escapeId(sourceTable)}`;
        await api.executeQuery(connectionId, sql, targetDb);
      }

      message.success(`表 "${targetTable}" 复制成功`);
      onSuccess();
      form.resetFields();
    } catch (err: any) {
      message.error(`复制表失败：${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title="复制表"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={500}
    >
      <Form form={form} layout="vertical" initialValues={{ targetTable: `${sourceTable}_copy`, copyType: 'structure_and_data' }}>
        <Form.Item label="源表">
          <Input value={sourceTable} disabled />
        </Form.Item>

        <Form.Item
          name="targetTable"
          label="目标表名"
          rules={[{ required: true, message: '请输入目标表名' }]}
        >
          <Input placeholder="例如：users_copy" />
        </Form.Item>

        <Form.Item name="targetDatabase" label="目标数据库">
          <Select placeholder="选择目标数据库" allowClear>
            {databases.map((db) => (
              <Select.Option key={db} value={db}>
                {db}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="copyType" label="复制内容">
          <Radio.Group>
            <Radio value="structure_only">仅结构</Radio>
            <Radio value="structure_and_data">结构和数据</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
}
