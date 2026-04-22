import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal,
  Form,
  InputNumber,
  Select,
  message,
  Space,
  Tabs,
  Switch,
  Button as AntButton,
} from 'antd';
import { UploadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { GlobalInput, GlobalInputPassword } from './GlobalInput';

export interface ConnectionFormData {
  id?: string;
  name: string;
  dbType: 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'oracle' | 'mariadb' | 'dameng';
  host: string;
  port: number;
  username: string;
  password?: string;
  database?: string;
  group_id?: string;
}

interface ConnectionDialogProps {
  open: boolean;
  editingData?: ConnectionFormData;
  onCancel: () => void;
  onSave: (data: ConnectionFormData) => Promise<void>;
}

const DB_TYPE_PORTS: Record<string, number> = {
  mysql: 3306,
  postgresql: 5432,
  sqlite: 0,
  sqlserver: 1433,
  oracle: 1521,
  mariadb: 3306,
  dameng: 5236,
};

export function ConnectionDialog({ open, editingData, onCancel, onSave }: ConnectionDialogProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dbType, setDbType] = useState<
    'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'oracle' | 'mariadb' | 'dameng'
  >(editingData?.dbType || 'mysql');
  const testCancelledRef = useRef(false);

  useEffect(() => {
    if (open) {
      const currentDbType = editingData?.dbType || 'mysql';
      setDbType(currentDbType);
      form.setFieldsValue({
        name: editingData?.name,
        db_type: currentDbType,
        host: editingData?.host || 'localhost',
        port: editingData?.port || DB_TYPE_PORTS[currentDbType],
        username: editingData?.username,
        password: editingData?.password,
        database: editingData?.database,
      });
    } else {
      form.resetFields();
    }
  }, [open, editingData, form]);

  const handleDbTypeChange = useCallback(
    (value: string) => {
      setDbType(value as typeof dbType);
      const defaultPort = DB_TYPE_PORTS[value];
      if (defaultPort && !editingData) {
        form.setFieldsValue({ port: defaultPort });
      }
    },
    [editingData, form]
  );

  const handleTestConnection = useCallback(async () => {
    try {
      const values = await form.validateFields(['db_type', 'host', 'port', 'username', 'password']);
      setTesting(true);
      testCancelledRef.current = false;

      const isSqlite = values.db_type === 'sqlite';
      const result = await invoke<boolean>('test_connection', {
        dbType: values.db_type,
        host: isSqlite ? '' : values.host,
        port: isSqlite ? 0 : values.port,
        username: isSqlite ? '' : values.username,
        password: values.password || '',
        database: isSqlite ? values.host : values.database,
      });

      if (testCancelledRef.current) return;

      if (result) {
        message.success('连接测试成功');
      }
    } catch (error: any) {
      if (testCancelledRef.current) return;
      if (error.errorFields) return;
      message.error(`连接测试失败：${error}`);
    } finally {
      setTesting(false);
    }
  }, [form]);

  const handleCancelTest = useCallback(() => {
    testCancelledRef.current = true;
    setTesting(false);
  }, []);

  const handleOk = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const isSqlite = values.db_type === 'sqlite';
      await onSave({
        id: editingData?.id,
        name: values.name,
        dbType: values.db_type,
        host: isSqlite ? '' : values.host,
        port: isSqlite ? 0 : values.port,
        username: isSqlite ? '' : values.username,
        password: values.password,
        database: isSqlite ? values.host : values.database,
        group_id: editingData?.group_id,
      });
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(`操作失败：${error}`);
    } finally {
      setSaving(false);
    }
  }, [form, editingData, onSave]);

  const handleCancel = useCallback(() => {
    form.resetFields();
    onCancel();
  }, [form, onCancel]);

  const compactFormItemStyle = { marginBottom: 12 };

  return (
    <Modal
      title={editingData ? '编辑连接' : '新建连接'}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={saving}
      width={600}
      transitionName=""
      maskTransitionName=""
      styles={{ body: { padding: '12px 16px' } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {testing ? (
              <Space>
                <AntButton loading size="small">
                  测试中...
                </AntButton>
                <AntButton onClick={handleCancelTest} size="small">
                  取消
                </AntButton>
              </Space>
            ) : (
              <AntButton icon={<ThunderboltOutlined />} onClick={handleTestConnection} size="small">
                测试连接
              </AntButton>
            )}
          </div>
          <Space>
            <AntButton onClick={handleCancel} size="small">
              取消
            </AntButton>
            <AntButton type="primary" onClick={handleOk} loading={saving} size="small">
              {editingData ? '保存' : '创建'}
            </AntButton>
          </Space>
        </div>
      }
    >
      <Tabs
        size="small"
        items={[
          {
            key: 'basic',
            label: '常规',
            children: (
              <Form
                form={form}
                layout="vertical"
                size="small"
                initialValues={{
                  name: editingData?.name,
                  db_type: editingData?.dbType || 'mysql',
                  host: editingData?.host || 'localhost',
                  port: editingData?.port || DB_TYPE_PORTS[editingData?.dbType || 'mysql'],
                  username: editingData?.username,
                  database: editingData?.database,
                  connect_timeout: 30,
                  query_timeout: 300,
                  charset: 'utf8mb4',
                }}
              >
                <Form.Item
                  name="name"
                  label="连接名称"
                  rules={[{ required: true, message: '请输入连接名称' }]}
                  style={compactFormItemStyle}
                >
                  <GlobalInput placeholder="例如：我的 MySQL 数据库" />
                </Form.Item>

                <Form.Item
                  name="db_type"
                  label="数据库类型"
                  rules={[{ required: true, message: '请选择数据库类型' }]}
                  style={compactFormItemStyle}
                >
                  <Select onChange={handleDbTypeChange}>
                    <Select.Option value="mysql">MySQL</Select.Option>
                    <Select.Option value="postgresql">PostgreSQL</Select.Option>
                    <Select.Option value="sqlite">SQLite</Select.Option>
                    <Select.Option value="mariadb">MariaDB</Select.Option>
                    <Select.Option value="sqlserver">SQL Server</Select.Option>
                    <Select.Option value="oracle">Oracle</Select.Option>
                    <Select.Option value="dameng">达梦 (DM)</Select.Option>
                  </Select>
                </Form.Item>

                {dbType !== 'sqlite' && (
                  <>
                    <Form.Item
                      name="host"
                      label="主机地址"
                      rules={[{ required: true, message: '请输入主机地址' }]}
                      style={compactFormItemStyle}
                    >
                      <GlobalInput placeholder="例如：localhost 或 192.168.1.100" />
                    </Form.Item>

                    <Form.Item
                      name="port"
                      label="端口"
                      rules={[{ required: true, message: '请输入端口' }]}
                      style={compactFormItemStyle}
                    >
                      <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                    </Form.Item>
                  </>
                )}

                {dbType === 'sqlite' && (
                  <Form.Item
                    name="host"
                    label="数据库文件路径"
                    rules={[{ required: true, message: '请输入数据库文件路径' }]}
                    style={compactFormItemStyle}
                  >
                    <GlobalInput placeholder="例如：/path/to/database.db" />
                  </Form.Item>
                )}

                <Form.Item
                  name="username"
                  label="用户名"
                  rules={[{ required: dbType !== 'sqlite', message: '请输入用户名' }]}
                  style={compactFormItemStyle}
                >
                  <GlobalInput placeholder="例如：root" />
                </Form.Item>

                <Form.Item
                  name="password"
                  label="密码"
                  rules={[{ required: !editingData && dbType !== 'sqlite', message: '请输入密码' }]}
                  style={compactFormItemStyle}
                >
                  <GlobalInputPassword
                    placeholder={editingData ? '留空则保持密码不变' : '请输入密码'}
                    autoComplete="new-password"
                  />
                </Form.Item>

                <Form.Item name="database" label="数据库名" style={compactFormItemStyle}>
                  <GlobalInput placeholder="例如：mydb（可选）" />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'ssl',
            label: 'SSL/TLS',
            children: (
              <Form layout="vertical" size="small">
                <Form.Item
                  name="use_ssl"
                  label="使用 SSL/TLS 加密连接"
                  valuePropName="checked"
                  style={compactFormItemStyle}
                >
                  <Switch size="small" />
                </Form.Item>

                <Form.Item name="ssl_ca_cert" label="CA 证书文件" style={compactFormItemStyle}>
                  <Space.Compact style={{ width: '100%' }}>
                    <GlobalInput placeholder="选择 CA 证书文件路径" readOnly />
                    <AntButton
                      icon={<UploadOutlined />}
                      size="small"
                      onClick={() => message.info('文件选择功能待实现')}
                    />
                  </Space.Compact>
                </Form.Item>

                <Form.Item
                  name="ssl_client_cert"
                  label="客户端证书文件"
                  style={compactFormItemStyle}
                >
                  <Space.Compact style={{ width: '100%' }}>
                    <GlobalInput placeholder="选择客户端证书文件路径" readOnly />
                    <AntButton
                      icon={<UploadOutlined />}
                      size="small"
                      onClick={() => message.info('文件选择功能待实现')}
                    />
                  </Space.Compact>
                </Form.Item>

                <Form.Item
                  name="ssl_client_key"
                  label="客户端私钥文件"
                  style={compactFormItemStyle}
                >
                  <Space.Compact style={{ width: '100%' }}>
                    <GlobalInput placeholder="选择客户端私钥文件路径" readOnly />
                    <AntButton
                      icon={<UploadOutlined />}
                      size="small"
                      onClick={() => message.info('文件选择功能待实现')}
                    />
                  </Space.Compact>
                </Form.Item>

                <Space direction="vertical" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                  <span>💡 SSL 配置用于加密客户端与服务器之间的数据传输</span>
                </Space>
              </Form>
            ),
          },
          {
            key: 'ssh',
            label: 'SSH 隧道',
            children: (
              <Form layout="vertical" size="small">
                <Form.Item
                  name="use_ssh"
                  label="使用 SSH 隧道"
                  valuePropName="checked"
                  style={compactFormItemStyle}
                >
                  <Switch size="small" />
                </Form.Item>

                <Form.Item name="ssh_host" label="SSH 主机地址" style={compactFormItemStyle}>
                  <GlobalInput placeholder="例如：192.168.1.100" />
                </Form.Item>

                <Form.Item
                  name="ssh_port"
                  label="SSH 端口"
                  initialValue={22}
                  style={compactFormItemStyle}
                >
                  <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item name="ssh_username" label="SSH 用户名" style={compactFormItemStyle}>
                  <GlobalInput placeholder="例如：root" />
                </Form.Item>

                <Form.Item name="ssh_password" label="SSH 密码" style={compactFormItemStyle}>
                  <GlobalInputPassword placeholder="请输入 SSH 密码" autoComplete="new-password" />
                </Form.Item>

                <Form.Item
                  name="ssh_key_path"
                  label="SSH 私钥文件路径"
                  style={compactFormItemStyle}
                >
                  <Space.Compact style={{ width: '100%' }}>
                    <GlobalInput placeholder="选择私钥文件路径" readOnly />
                    <AntButton
                      icon={<UploadOutlined />}
                      size="small"
                      onClick={() => message.info('文件选择功能待实现')}
                    />
                  </Space.Compact>
                </Form.Item>

                <Space direction="vertical" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                  <span>💡 SSH 隧道用于通过安全的 SSH 连接访问数据库</span>
                </Space>
              </Form>
            ),
          },
          {
            key: 'advanced',
            label: '高级',
            children: (
              <Form layout="vertical" size="small">
                <Form.Item
                  name="connect_timeout"
                  label="连接超时（秒）"
                  initialValue={30}
                  style={compactFormItemStyle}
                >
                  <InputNumber min={1} max={300} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  name="query_timeout"
                  label="查询超时（秒）"
                  initialValue={300}
                  style={compactFormItemStyle}
                >
                  <InputNumber min={1} max={3600} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  name="charset"
                  label="字符集"
                  initialValue="utf8mb4"
                  style={compactFormItemStyle}
                >
                  <Select>
                    <Select.Option value="utf8mb4">utf8mb4</Select.Option>
                    <Select.Option value="utf8">utf8</Select.Option>
                    <Select.Option value="gbk">gbk</Select.Option>
                    <Select.Option value="latin1">latin1</Select.Option>
                  </Select>
                </Form.Item>

                <Space direction="vertical" style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 8 }}>
                  <span>💡 高级配置用于优化连接性能和字符编码</span>
                </Space>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
}
