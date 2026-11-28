import React, { useState } from 'react';
import { Modal, Form, Input, Radio, App, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { getDialect } from '../utils/sqlDialects';
import { rewriteDDLForCopy } from '../utils/ddlCopy';
import { splitSchemaQualifiedTable } from '../utils/qualifiedName';

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

/** 查询结果里的二进制列只剩这个占位文本，照着写过去等于把数据改坏 */
const BLOB_PLACEHOLDER = /^\[BLOB: \d+ bytes\]$/;

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
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const targetTable: string = values.targetTable;
      const targetDatabase = values.targetDatabase || sourceDatabase;
      // 目标库留空 = 跟源表在同一个库
      const sameDatabase = !values.targetDatabase || values.targetDatabase === sourceDatabase;
      const copyType = values.copyType;
      const dialect = getDialect(dbType);
      const q = (name: string) => dialect.escapeIdentifier(name);
      // 表引用：PG 系、SQL Server 的名字可以带 schema（schema.表），按段加引号
      const ref = (name: string) => dialect.buildTableRef(name);
      const sourceRef = ref(sourceTable);
      const targetRef = ref(targetTable);
      if (sameDatabase && targetRef === sourceRef) {
        throw new Error(t('common.copyTable.sameTable'));
      }
      // DDL 改写按去掉 schema 的表名来：DDL 里是 "schema"."表" 两段，拿整串 schema.表 对不上。
      // 目标表默认是 schema.表_copy，也就是落在源表所在的 schema 里
      const sourceName = splitSchemaQualifiedTable(sourceTable, dbType)?.table ?? sourceTable;
      const targetName = splitSchemaQualifiedTable(targetTable, dbType)?.table ?? targetTable;

      // 1. 复制结构：只改表名和约束 / 索引名，列名、注释原样保留
      const ddlStatements = await api.getTableDDL(connectionId, sourceTable, sourceDatabase);
      for (const stmt of ddlStatements) {
        if (stmt.trim()) {
          await api.executeDDL(
            connectionId,
            rewriteDDLForCopy(stmt, sourceName, targetName).trim(),
            targetDatabase
          );
        }
      }

      // 2. 复制数据（如果选择了结构和数据）
      if (copyType === 'structure_data') {
        // 表已经建好：数据这一步失败时要说清楚，目标表里没有（或只有一部分）数据。
        // executeQuery 不抛错、把报错放在结果里，每一步都得看
        try {
          if (sameDatabase) {
            // 同数据库：使用 INSERT INTO ... SELECT
            const insertSql = `INSERT INTO ${targetRef} SELECT * FROM ${sourceRef}`;
            const res = await api.executeQuery(connectionId, insertSql, targetDatabase);
            if (res.error) throw new Error(res.error);
          } else if (dialect.dbType === 'mysql' && sourceDatabase && targetDatabase) {
            // 同一台服务器上的两个库：交给服务器搬，二进制列也原样过去
            const insertSql = `INSERT INTO ${q(targetDatabase)}.${q(targetTable)} SELECT * FROM ${q(sourceDatabase)}.${q(sourceTable)}`;
            const res = await api.executeQuery(connectionId, insertSql, targetDatabase);
            if (res.error) throw new Error(res.error);
          } else {
            // 跨数据库（PG 系等不能跨库查询）：先查询源表数据，再逐行插入目标表
            const result = await api.executeQuery(
              connectionId,
              `SELECT * FROM ${sourceRef}`,
              sourceDatabase
            );
            if (result.error) throw new Error(result.error);

            const rows = result.rows ?? [];
            const colNames = result.columns ?? [];
            if (
              rows.some((row) => row.some((v) => typeof v === 'string' && BLOB_PLACEHOLDER.test(v)))
            ) {
              throw new Error(t('common.copyTable.binaryCrossDatabase'));
            }
            for (let i = 0; i < rows.length; i++) {
              const valuesSql = rows[i].map((v: unknown) => dialect.escapeValue(v)).join(', ');
              const insertSql = `INSERT INTO ${targetRef} (${colNames.map((c) => q(c)).join(', ')}) VALUES (${valuesSql})`;
              const res = await api.executeQuery(connectionId, insertSql, targetDatabase);
              if (res.error) {
                throw new Error(
                  `${t('common.copyTable.rowsCopied', { copied: i, total: rows.length })} ${res.error}`
                );
              }
            }
          }
        } catch (err: unknown) {
          throw new Error(`${t('common.copyTable.dataCopyFailed')}: ${getErrorMessage(err)}`, {
            cause: err,
          });
        }
      }

      message.success(`${t('common.tableCopied')}: "${sourceTable}" → "${targetTable}"`);
      onSuccess();
    } catch (err: unknown) {
      message.error(`${t('common.copyTable.copyFailed')}: ${getErrorMessage(err)}`);
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
      title={t('common.copyTable.title')}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText={t('common.copy')}
      cancelText={t('common.cancel')}
      width={560}
      destroyOnHidden
      transitionName=""
      maskTransitionName=""
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
