import { useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, message, Space, Tabs, Switch, Upload, Button as AntButton } from 'antd';
import { UploadOutlined, PlusOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

const { Option } = Select;

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

export function ConnectionDialog({
  open,
  editingData,
  onCancel,
  onSave,
}: ConnectionDialogProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [dbType, setDbType] = useState<'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'oracle' | 'mariadb' | 'dameng'>(editingData?.dbType || 'mysql');

  // 当数据库类型改变时，自动更新默认端口
  const handleDbTypeChange = (value: any) => {
    setDbType(value);
    const defaultPort = DB_TYPE_PORTS[value];
    if (defaultPort && !editingData) {
      form.setFieldsValue({ port: defaultPort });
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // 先测试连接
      const testResult = await invoke<boolean>('test_connection', {
        dbType: values.db_type,
        host: values.host,
        port: values.port,
        username: values.username,
        password: values.password || '',
      });

      if (testResult) {
        // 连接测试成功，保存连接
        await onSave({
          id: editingData?.id,
          name: values.name,
          dbType: values.db_type,
          host: values.host,
          port: values.port,
          username: values.username,
          password: values.password,
          database: values.database,
          group_id: editingData?.group_id,
        });
        message.success('连接已保存');
        form.resetFields();
      } else {
        message.error('连接测试失败');
      }
    } catch (error: any) {
      message.error(`操作失败：${error}`);
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
      title={editingData ? '编辑连接' : '新建连接'}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={700}
    >
      <Tabs
        items={[
          {
            key: 'basic',
            label: '常规',
            children: (
              <Form
                form={form}
                layout="vertical"
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
                >
                  <Input placeholder="例如：我的 MySQL 数据库" />
                </Form.Item>

                <Form.Item
                  name="db_type"
                  label="数据库类型"
                  rules={[{ required: true, message: '请选择数据库类型' }]}
                >
                  <Select onChange={handleDbTypeChange}>
                    <Option value="mysql">MySQL</Option>
                    <Option value="postgresql">PostgreSQL</Option>
                    <Option value="sqlite">SQLite</Option>
                    <Option value="mariadb">MariaDB</Option>
                    <Option value="sqlserver">SQL Server</Option>
                    <Option value="oracle">Oracle</Option>
                    <Option value="dameng">达梦 (DM)</Option>
                  </Select>
                </Form.Item>

                {dbType !== 'sqlite' && (
                  <>
                    <Form.Item
                      name="host"
                      label="主机地址"
                      rules={[{ required: true, message: '请输入主机地址' }]}
                    >
                      <Input placeholder="例如：localhost 或 192.168.1.100" />
                    </Form.Item>

                    <Form.Item
                      name="port"
                      label="端口"
                      rules={[{ required: true, message: '请输入端口' }]}
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
                  >
                    <Input placeholder="例如：/path/to/database.db" />
                  </Form.Item>
                )}

                <Form.Item
                  name="username"
                  label="用户名"
                  rules={[{ required: dbType !== 'sqlite', message: '请输入用户名' }]}
                >
                  <Input placeholder="例如：root" />
                </Form.Item>

                <Form.Item
                  name="password"
                  label="密码"
                  rules={[{ required: !editingData && dbType !== 'sqlite', message: '请输入密码' }]}
                >
                  <Input.Password
                    placeholder={editingData ? '留空则保持密码不变' : '请输入密码'}
                    autoComplete="new-password"
                  />
                </Form.Item>

                <Form.Item name="database" label="数据库名">
                  <Input placeholder="例如：mydb（可选）" />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'ssl',
            label: 'SSL/TLS',
            children: (
              <Form layout="vertical">
                <Form.Item name="use_ssl" label="使用 SSL/TLS 加密连接" valuePropName="checked">
                  <Switch />
                </Form.Item>

                <Form.Item name="ssl_ca_cert" label="CA 证书文件">
                  <Space.Compact style={{ width: '100%' }}>
                    <Input placeholder="选择 CA 证书文件路径" readOnly />
                    <AntButton icon={<UploadOutlined />} onClick={() => message.info('文件选择功能待实现')} />
                  </Space.Compact>
                </Form.Item>

                <Form.Item name="ssl_client_cert" label="客户端证书文件">
                  <Space.Compact style={{ width: '100%' }}>
                    <Input placeholder="选择客户端证书文件路径" readOnly />
                    <AntButton icon={<UploadOutlined />} onClick={() => message.info('文件选择功能待实现')} />
                  </Space.Compact>
                </Form.Item>

                <Form.Item name="ssl_client_key" label="客户端私钥文件">
                  <Space.Compact style={{ width: '100%' }}>
                    <Input placeholder="选择客户端私钥文件路径" readOnly />
                    <AntButton icon={<UploadOutlined />} onClick={() => message.info('文件选择功能待实现')} />
                  </Space.Compact>
                </Form.Item>

                <Space direction="vertical" style={{ color: '#999', fontSize: 12 }}>
                  <span>💡 SSL 配置用于加密客户端与服务器之间的数据传输</span>
                </Space>
              </Form>
            ),
          },
          {
            key: 'ssh',
            label: 'SSH 隧道',
            children: (
              <Form layout="vertical">
                <Form.Item name="use_ssh" label="使用 SSH 隧道" valuePropName="checked">
                  <Switch />
                </Form.Item>

                <Form.Item name="ssh_host" label="SSH 主机地址">
                  <Input placeholder="例如：192.168.1.100" />
                </Form.Item>

                <Form.Item name="ssh_port" label="SSH 端口" initialValue={22}>
                  <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item name="ssh_username" label="SSH 用户名">
                  <Input placeholder="例如：root" />
                </Form.Item>

                <Form.Item name="ssh_password" label="SSH 密码">
                  <Input.Password placeholder="请输入 SSH 密码" autoComplete="new-password" />
                </Form.Item>

                <Form.Item name="ssh_key_path" label="SSH 私钥文件路径">
                  <Space.Compact style={{ width: '100%' }}>
                    <Input placeholder="选择私钥文件路径" readOnly />
                    <AntButton icon={<UploadOutlined />} onClick={() => message.info('文件选择功能待实现')} />
                  </Space.Compact>
                </Form.Item>

                <Space direction="vertical" style={{ color: '#999', fontSize: 12 }}>
                  <span>💡 SSH 隧道用于通过安全的 SSH 连接访问数据库</span>
                </Space>
              </Form>
            ),
          },
          {
            key: 'advanced',
            label: '高级',
            children: (
              <Form layout="vertical">
                <Form.Item name="connect_timeout" label="连接超时（秒）" initialValue={30}>
                  <InputNumber min={1} max={300} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item name="query_timeout" label="查询超时（秒）" initialValue={300}>
                  <InputNumber min={1} max={3600} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item name="charset" label="字符集" initialValue="utf8mb4">
                  <Select>
                    <Option value="utf8mb4">utf8mb4</Option>
                    <Option value="utf8">utf8</Option>
                    <Option value="gbk">gbk</Option>
                    <Option value="latin1">latin1</Option>
                  </Select>
                </Form.Item>

                <Space direction="vertical" style={{ color: '#999', fontSize: 12, marginTop: 16 }}>
                  <span>💡 高级配置用于优化连接性能和字符编码</span>
                </Space>
              </Form>
            ),
          },
        ]}
      />

      <Space style={{ marginTop: 16, color: '#999', fontSize: 12 }}>
        <span>💡 提示：点击确定会先测试连接，成功后才会保存</span>
      </Space>
    </Modal>
  );
}
