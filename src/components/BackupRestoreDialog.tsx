import { useState, useCallback } from 'react';
import { Modal, Form, Checkbox, message, Space, Button as AntButton } from 'antd';
import { useTranslation } from 'react-i18next';
import { FolderOutlined, DatabaseOutlined, UploadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { GlobalInput } from './GlobalInput';

interface BackupRestoreDialogProps {
  open: boolean;
  mode: 'backup' | 'restore';
  connectionId: string;
  dbType: string;
  database?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

function createFileInput(accept: string, onChange: (path: string) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const path = (file as { path?: string }).path || file.name;
      onChange(path);
    }
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

function createSaveInput(defaultName: string, onChange: (path: string) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.setAttribute('nwsaveas', defaultName);
  input.style.display = 'none';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const path = (file as { path?: string }).path || file.name;
      onChange(path);
    }
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

export function BackupRestoreDialog({
  open,
  mode,
  connectionId,
  dbType,
  database,
  onCancel,
  onSuccess,
}: BackupRestoreDialogProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [toolChecked, setToolChecked] = useState(false);
  const [toolAvailable, setToolAvailable] = useState(false);

  const checkTool = useCallback(async () => {
    try {
      const result = await api.checkBackupTool(dbType);
      setToolChecked(true);
      setToolAvailable(result.available);
      if (!result.available) {
        message.warning(`${t('common.backupToolNotFound')}: ${dbType}`);
      }
    } catch {
      message.warning(`${t('common.backupToolNotFound')}: ${dbType}`);
    }
  }, [dbType]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (mode === 'backup') {
        await api.backup({
          connectionId,
          database: values.database || database || '',
          tables: values.tables || undefined,
          includeStructure: values.includeStructure,
          includeData: values.includeData,
          filePath: values.filePath,
        });
        message.success(t('common.backupSuccess'));
      } else {
        await api.restore({
          connectionId,
          database: values.database || database || '',
          filePath: values.filePath,
        });
        message.success(t('common.restoreSuccess'));
      }
      onSuccess();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(
        `${t('common.failedToBackupOrRestore', { mode: mode === 'backup' ? t('common.backup') : t('common.restore') })}: ${errorMsg}`
      );
    } finally {
      setLoading(false);
    }
  };

  const isSupported = ['mysql', 'mariadb', 'postgresql', 'kingbase', 'highgo', 'vastbase'].includes(
    dbType
  );

  if (!isSupported) {
    return (
      <Modal
        title={mode === 'backup' ? t('common.backupDatabase') : t('common.restoreDatabase')}
        open={open}
        onCancel={onCancel}
        footer={null}
        width={500}
      >
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {t('common.currentDbTypeNotSupported', {
            mode: mode === 'backup' ? t('common.backup') : t('common.restore'),
          })}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={mode === 'backup' ? t('common.backupDatabase') : t('common.restoreDatabase')}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      width={500}
      okText={mode === 'backup' ? t('common.startBackup') : t('common.startRestore')}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          database: database || '',
          includeStructure: true,
          includeData: true,
          filePath: '',
        }}
      >
        {!toolChecked && (
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <AntButton onClick={checkTool} icon={<DatabaseOutlined />}>
              {t('common.checkBackupTool')}
            </AntButton>
          </div>
        )}

        {toolChecked && !toolAvailable && (
          <div style={{ marginBottom: 16, color: '#ff4d4f', textAlign: 'center' }}>
            {t('common.backupToolNotFoundPleaseInstall')}
          </div>
        )}

        {toolChecked && toolAvailable && (
          <>
            <Form.Item
              name="database"
              label={t('common.database')}
              rules={[{ required: true, message: t('common.pleaseEnterDatabaseName') }]}
            >
              <GlobalInput placeholder={t('common.databaseName')} />
            </Form.Item>

            {mode === 'backup' && (
              <>
                <Form.Item label={t('common.backupContent')}>
                  <Space direction="vertical">
                    <Form.Item name="includeStructure" valuePropName="checked" noStyle>
                      <Checkbox>{t('common.includeStructure')}</Checkbox>
                    </Form.Item>
                    <Form.Item name="includeData" valuePropName="checked" noStyle>
                      <Checkbox>{t('common.dumpDialog.includeData')}</Checkbox>
                    </Form.Item>
                  </Space>
                </Form.Item>
              </>
            )}

            <Form.Item
              name="filePath"
              label={
                mode === 'backup' ? t('common.savePath') : t('common.backupRestore.backupFile')
              }
              rules={[
                {
                  required: true,
                  message:
                    mode === 'backup'
                      ? t('common.pleaseSelectSavePath')
                      : t('common.pleaseSelectBackupFile'),
                },
              ]}
            >
              <Space.Compact style={{ width: '100%' }}>
                <GlobalInput
                  placeholder={mode === 'backup' ? '/path/to/backup.sql' : '/path/to/backup.sql'}
                  readOnly
                />
                <AntButton
                  icon={mode === 'backup' ? <FolderOutlined /> : <UploadOutlined />}
                  onClick={() => {
                    if (mode === 'backup') {
                      const dbName = form.getFieldValue('database') || 'backup';
                      createSaveInput(`${dbName}.sql`, (path) => {
                        form.setFieldValue('filePath', path);
                      });
                    } else {
                      createFileInput('.sql,.dump', (path) => {
                        form.setFieldValue('filePath', path);
                      });
                    }
                  }}
                >
                  {mode === 'backup' ? t('common.selectPath') : t('common.selectFile')}
                </AntButton>
              </Space.Compact>
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
