import { useState, useRef } from 'react';
import { Modal, Button, Progress, App, Alert } from 'antd';
import { FileTextOutlined, UploadOutlined } from '@ant-design/icons';
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
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalStatements, setTotalStatements] = useState(0);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setProgress(0);
    setFileName(file.name);
    setResult(null);

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

      setResult({ success, failed, errors });

      if (failed > 0) {
        message.warning(
          `${t('common.executionComplete')}: ${t('common.success')}: ${success}, ${t('common.failed')}: ${failed}`
        );
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
      width={600}
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

      {!loading && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '24px 16px',
            borderRadius: 10,
            border: '1px dashed var(--border)',
            background: 'var(--background-toolbar)',
            textAlign: 'center',
          }}
        >
          <UploadOutlined style={{ fontSize: 28, color: 'var(--text-tertiary)' }} />
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('common.clickToSelectSqlFile')}
          </div>
          {fileName && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-tertiary)',
              }}
            >
              <FileTextOutlined />
              {fileName}
              {totalStatements > 0 && ` · ${totalStatements} ${t('common.statements')}`}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 8 }}>
          <Progress percent={progress} />
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 0 }}>
            {t('common.executingStatements', { count: totalStatements })}
          </p>
        </div>
      )}

      {!loading && result && (
        <div style={{ marginTop: 12 }}>
          <Alert
            type={result.failed > 0 ? 'warning' : 'success'}
            showIcon
            message={`${t('common.success')}: ${result.success} · ${t('common.failed')}: ${result.failed}`}
          />
          {result.errors.length > 0 && (
            <div
              style={{
                marginTop: 8,
                maxHeight: 160,
                overflow: 'auto',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--color-error-alpha-30)',
                background: 'var(--color-error-alpha-15)',
              }}
            >
              {result.errors.map((error, index) => (
                <div
                  key={index}
                  style={{
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: 'var(--color-error)',
                    fontFamily: 'var(--font-family-code)',
                    wordBreak: 'break-all',
                  }}
                >
                  {error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
