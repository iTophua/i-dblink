import React, { useState } from 'react';
import { Modal, Form, Input, Radio, message, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../api';

interface CopyTableDialogProps {
  open: boolean;
  sourceTable: string;
  sourceDatabase?: string;
  connectionId: string;
  dbType?: string;
  databases: string[];
  onCancel: () => void;
  onSuccess: () => void;
}

function replaceTableNameInDDL(ddl: string, sourceTable: string, targetTable: string): string {
  // 使用字符串分割替换，避免正则特殊字符问题
  return ddl.split(sourceTable).join(targetTable);
}

function getIdentifierQuotes(dbType?: string): { open: string; close: string } {
  switch (dbType) {
    case 'postgresql':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
    case 'oracle':
    case 'dameng':
      return { open: '"', close: '"' };
    case 'sqlserver':
      return { open: '[', close: ']' };
    default:
      return { open: '`', close: '`' };
  }
}

const CopyTableDialog: React.FC<CopyTableDialogProps> = ({
  open,
  sourceTable,
  sourceDatabase,
  connectionId,
  dbType,
  databases,
  onCancel,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const targetTable = values.targetTable;
      const targetDatabase = values.targetDatabase || sourceDatabase;
      const copyType = values.copyType;

      const { open: openQuote, close: closeQuote } = getIdentifierQuotes(dbType);
      const escapeId = (name: string) => openQuote + name + closeQuote;

      // 1. 复制结构
      const ddlStatements = await api.getTableDDL(connectionId, sourceTable, sourceDatabase);
      const newDdl = ddlStatements.map((s: string) =>
        replaceTableNameInDDL(s, sourceTable, targetTable)
      );

      for (const stmt of newDdl) {
        if (stmt.trim()) {
          await api.executeDDL(connectionId, stmt.trim(), targetDatabase);
        }
      }

      // 2. 复制数据（如果选择了结构和数据）
      if (copyType === 'structure_data') {
        if (targetDatabase === sourceDatabase) {
          // 同数据库：使用 INSERT INTO ... SELECT
          const insertSql = `INSERT INTO ${escapeId(targetTable)} SELECT * FROM ${escapeId(sourceTable)}`;
          await api.executeQuery(connectionId, insertSql, targetDatabase);
        } else {
          // 跨数据库：先查询源表数据，再插入目标表
          const selectSql = `SELECT * FROM ${escapeId(sourceTable)}`;
          const result = await api.executeQuery(connectionId, selectSql, sourceDatabase);

          if (result.rows && result.rows.length > 0) {
            const colNames = result.columns || [];
            for (const row of result.rows) {
              const values = row.map((v: any) => {
                if (v === null || v === undefined) return 'NULL';
                if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
                return String(v);
              });

              const insertSql = `INSERT INTO ${escapeId(targetTable)} (${colNames.map((c: string) => escapeId(c)).join(', ')}) VALUES (${values.join(', ')})`;
              await api.executeQuery(connectionId, insertSql, targetDatabase);
            }
          }
        }
      }

      message.success(`${t('common.tableCopied')}: "${sourceTable}" → "${targetTable}"`);
      onSuccess();
    } catch (err: any) {
      message.error(`${t('common.copyTable.copyFailed')}: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onCancel();
    form.resetFields();
  };

  return (
    <Modal
      title={t('common.copyTable')}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText={t('common.copy')}
      cancelText={t('common.cancel')}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          targetTable: sourceTable + '_copy',
          targetDatabase: sourceDatabase,
          copyType: 'structure',
        }}
      >
        <Form.Item label={t('common.copyTable.sourceTable')}>
          <Input value={sourceTable} disabled />
        </Form.Item>

        {databases.length > 0 && (
          <Form.Item name="targetDatabase" label={t('common.targetDatabase')}>
            <Select placeholder={t('common.selectTargetDatabase')}>
              {databases.map((db) => (
                <Select.Option key={db} value={db}>
                  {db}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}

        <Form.Item
          name="targetTable"
          label={t('common.targetTableName')}
          rules={[{ required: true, message: t('common.pleaseEnterTargetTableName') }]}
        >
          <Input placeholder={t('common.pleaseEnterTargetTableName')} />
        </Form.Item>

        <Form.Item name="copyType" label={t('common.copyType')}>
          <Radio.Group>
            <Radio value="structure">{t('common.structureOnly')}</Radio>
            <Radio value="structure_data">{t('common.structureAndData')}</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export { CopyTableDialog };
