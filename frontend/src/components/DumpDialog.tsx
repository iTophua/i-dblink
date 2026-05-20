import { useState } from 'react';
import { Modal, Form, Checkbox, Radio, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { getDialect } from '../utils/sqlDialects';
import type { DatabaseType } from '../types/api';

interface DumpDialogProps {
  open: boolean;
  tableName: string;
  database?: string;
  connectionId: string;
  dbType?: DatabaseType;
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
  dbType,
  onCancel,
  onSuccess,
}: DumpDialogProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const dialect = getDialect(dbType);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      let sqlContent = '';

      if (values.includeDrop) {
        const tableRef = dialect.buildTableRef(tableName, database);
        sqlContent += dialect.buildDropTable(tableRef, true) + '\n\n';
      }

      // 获取 DDL
      const ddlStatements = await api.getTableDDL(connectionId, tableName, database);
      if (values.includeCreate) {
        sqlContent += ddlStatements.join('\n\n') + '\n\n';
      }

      if (values.dumpType === 'structure_and_data' && values.includeData) {
        // 流式导出数据
        const result = await api.streamExportTable(connectionId, tableName, database, 1000);
        if (result && result.rows && result.columns) {
          const colStr = result.columns.map((c: string) => dialect.escapeIdentifier(c)).join(', ');
          const tableRef = dialect.buildTableRef(tableName, database);
          
          for (const row of result.rows) {
            const vals = result.columns.map((col: string) => {
              const v = (row as Record<string, unknown>)[col];
              return dialect.escapeValue(v);
            });
            sqlContent += `INSERT INTO ${tableRef} (${colStr}) VALUES (${vals.join(', ')});\n`;
          }
        }
      }

      downloadFile(sqlContent, `${tableName}.sql`);

      message.success(t('common.sqlFileExportedSuccessfully'));
      onSuccess();
    } catch (err: any) {
      message.error(`${t('common.importExport.exportFailed')}: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={t('common.dumpSqlFile')}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      width={500}
      transitionName=""
      maskTransitionName=""
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
        <Form.Item name="dumpType" label={t('common.dumpContent')}>
          <Radio.Group>
            <Radio value="structure_only">{t('common.structureOnly')}</Radio>
            <Radio value="structure_and_data">{t('common.structureAndData')}</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item label={t('common.include')}>
          <Form.Item name="includeDrop" valuePropName="checked" noStyle>
            <Checkbox>DROP TABLE IF EXISTS</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name="includeCreate" valuePropName="checked" noStyle>
            <Checkbox>CREATE TABLE</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name="includeData" valuePropName="checked" noStyle>
            <Checkbox>{t('common.includeData')}</Checkbox>
          </Form.Item>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default DumpDialog;
