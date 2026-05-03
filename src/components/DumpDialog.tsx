import { useState } from 'react';
import { Modal, Form, Checkbox, Radio, message } from 'antd';
import { api } from '../api';

interface DumpDialogProps {
  open: boolean;
  tableName: string;
  database?: string;
  connectionId: string;
  onCancel: () => void;
  onSuccess: () => void;
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/sql;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DumpDialog({
  open,
  tableName,
  database,
  connectionId,
  onCancel,
  onSuccess,
}: DumpDialogProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      let sqlContent = '';

      if (values.includeDrop) {
        sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n\n`;
      }

      // 获取 DDL
      const ddlStatements = await api.getTableDDL(connectionId, tableName, database);
      if (values.includeCreate) {
        sqlContent += ddlStatements.join('\n\n') + '\n\n';
      }

      if (values.dumpType === 'structure_and_data' && values.includeData) {
        // 流式导出数据
        const result = await api.streamExportTable(connectionId, tableName, database, 1000);
        if (result && result.rows) {
          for (const row of result.rows) {
            const columns = Object.keys(row).join(', ');
            const values = Object.values(row)
              .map((v) => {
                if (v === null || v === undefined) return 'NULL';
                if (typeof v === 'string') return `'${String(v).replace(/'/g, "''")}'`;
                return String(v);
              })
              .join(', ');
            sqlContent += `INSERT INTO \`${tableName}\` (${columns}) VALUES (${values});\n`;
          }
        }
      }

      downloadFile(sqlContent, `${tableName}.sql`);

      message.success('SQL 文件导出成功');
      onSuccess();
    } catch (err: any) {
      message.error(`导出失败：${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="转储 SQL 文件"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      width={500}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          dumpType: 'structure_and_data',
          includeDrop: true,
          includeCreate: true,
          includeData: true,
        }}
      >
        <Form.Item name="dumpType" label="转储内容">
          <Radio.Group>
            <Radio value="structure_only">仅结构</Radio>
            <Radio value="structure_and_data">结构和数据</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item label="包含">
          <Form.Item name="includeDrop" valuePropName="checked" noStyle>
            <Checkbox>DROP TABLE IF EXISTS</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name="includeCreate" valuePropName="checked" noStyle>
            <Checkbox>CREATE TABLE</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name="includeData" valuePropName="checked" noStyle>
            <Checkbox>INSERT 数据</Checkbox>
          </Form.Item>
        </Form.Item>
      </Form>
    </Modal>
  );
}
