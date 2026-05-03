import { useState, useCallback } from 'react';
import { Modal, Form, Checkbox, message, Space, Button as AntButton } from 'antd';
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
        message.warning(`未找到 ${dbType} 的备份工具，请先安装`);
      }
    } catch {
      message.warning(`未找到 ${dbType} 的备份工具，请先安装`);
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
        message.success('备份成功');
      } else {
        await api.restore({
          connectionId,
          database: values.database || database || '',
          filePath: values.filePath,
        });
        message.success('恢复成功');
      }
      onSuccess();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`${mode === 'backup' ? '备份' : '恢复'}失败：${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const isSupported = ['mysql', 'mariadb', 'postgresql', 'kingbase', 'highgo', 'vastbase'].includes(dbType);

  if (!isSupported) {
    return (
      <Modal
        title={mode === 'backup' ? '备份数据库' : '恢复数据库'}
        open={open}
        onCancel={onCancel}
        footer={null}
        width={500}
      >
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          当前数据库类型暂不支持{mode === 'backup' ? '备份' : '恢复'}功能
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={mode === 'backup' ? '备份数据库' : '恢复数据库'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      width={500}
      okText={mode === 'backup' ? '开始备份' : '开始恢复'}
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
              检测备份工具
            </AntButton>
          </div>
        )}

        {toolChecked && !toolAvailable && (
          <div style={{ marginBottom: 16, color: '#ff4d4f', textAlign: 'center' }}>
            未找到备份工具，请先安装对应数据库的客户端工具
          </div>
        )}

        {toolChecked && toolAvailable && (
          <>
            <Form.Item
              name="database"
              label="数据库"
              rules={[{ required: true, message: '请输入数据库名' }]}
            >
              <GlobalInput placeholder="数据库名" />
            </Form.Item>

            {mode === 'backup' && (
              <>
                <Form.Item label="备份内容">
                  <Space direction="vertical">
                    <Form.Item name="includeStructure" valuePropName="checked" noStyle>
                      <Checkbox>包含结构</Checkbox>
                    </Form.Item>
                    <Form.Item name="includeData" valuePropName="checked" noStyle>
                      <Checkbox>包含数据</Checkbox>
                    </Form.Item>
                  </Space>
                </Form.Item>
              </>
            )}

            <Form.Item
              name="filePath"
              label={mode === 'backup' ? '保存路径' : '备份文件'}
              rules={[{ required: true, message: mode === 'backup' ? '请选择保存路径' : '请选择备份文件' }]}
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
                  {mode === 'backup' ? '选择路径' : '选择文件'}
                </AntButton>
              </Space.Compact>
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
