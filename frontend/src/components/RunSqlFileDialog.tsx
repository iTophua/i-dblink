import { useState, useRef } from 'react';
import { Modal, Button, Progress, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { splitSqlStatements } from '../utils/sqlUtils';

interface RunSqlFileDialogProps {
  open: boolean;
  connectionId: string;
  database?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

export function RunSqlFileDialog({
  open,
  connectionId,
  database,
  onCancel,
  onSuccess,
}: RunSqlFileDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalStatements, setTotalStatements] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setProgress(0);

    try {
      const content = await file.text();
      const statements = splitSqlStatements(content);
      setTotalStatements(statements.length);

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < statements.length; i++) {
        const sql = statements[i];
        try {
          await api.executeDDL(connectionId, sql, database);
          success++;
        } catch (err: unknown) {
          failed++;
          errors.push(`${t('common.statement')} ${i + 1}: ${getErrorMessage(err)}`);
        }
        setProgress(Math.round(((i + 1) / statements.length) * 100));
      }

      if (failed > 0) {
        message.warning(
          `${t('common.executionComplete')}: ${t('common.success')}: ${success}, ${t('common.failed')}: ${failed}`
        );
        console.error('SQL 执行错误:', errors.slice(0, 10));
      } else {
        message.success(
          `${t('common.executionComplete')}: ${t('common.success')}: ${success} ${t('common.statements')}`
        );
      }

      onSuccess();
    } catch (err: unknown) {
      message.error(`${t('common.executionFailed')}: ${getErrorMessage(err)}`);
    } finally {
      setLoading(false);
      setProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Modal
      title={t('common.runSqlFile')}
      open={open}
      onCancel={onCancel}
      transitionName=""
      maskTransitionName=""
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={loading}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="select"
          type="primary"
          loading={loading}
          onClick={() => fileInputRef.current?.click()}
        >
          {t('common.selectSqlFile')}
        </Button>,
      ]}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".sql"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {loading && (
        <div style={{ marginTop: 16 }}>
          <Progress percent={progress} />
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('common.executingStatements', { count: totalStatements })}
          </p>
        </div>
      )}

      {!loading && (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>
          {t('common.clickToSelectSqlFile')}
        </p>
      )}
    </Modal>
  );
}
