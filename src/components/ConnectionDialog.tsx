import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Form,
  InputNumber,
  Select,
  message,
  Space,
  Switch,
  Button as AntButton,
  Row,
  Col,
  Divider,
  Input,
  ColorPicker,
} from 'antd';
import {
  UploadOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  SafetyCertificateOutlined,
  KeyOutlined,
  SettingOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { GlobalInput, GlobalInputPassword } from './GlobalInput';
import { DatabaseIcon } from './DatabaseIcon';
import { DB_TYPE_COLORS } from '../styles/theme';
import type { FormInstance } from 'antd';
import i18n from '../i18n';

interface FileInputConfig {
  form: FormInstance;
  fieldName: string;
  accept: string;
}

const createFileInput = (config: FileInputConfig) => {
  const { form, fieldName, accept } = config;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const path = (file as any).path || file.name;
      form.setFieldValue(fieldName, path);
      message.success(`${i18n.t('common.fileSelected')}: ${file.name}`);
    } else {
      form.setFieldValue(fieldName, undefined);
    }
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
};

export interface ConnectionFormData {
  id?: string;
  name: string;
  dbType:
    | 'mysql'
    | 'postgresql'
    | 'sqlite'
    | 'sqlserver'
    | 'oracle'
    | 'mariadb'
    | 'dameng'
    | 'kingbase'
    | 'highgo'
    | 'vastbase';
  host: string;
  port: number;
  username: string;
  password?: string;
  database?: string;
  group_id?: string;
  color?: string;
  // SSH
  sshEnabled?: boolean;
  sshHost?: string;
  sshPort?: number;
  sshUsername?: string;
  sshAuthMethod?: 'password' | 'key';
  sshPassword?: string;
  sshPrivateKeyPath?: string;
  sshPassphrase?: string;
  // SSL
  sslEnabled?: boolean;
  sslCaPath?: string;
  sslCertPath?: string;
  sslKeyPath?: string;
  sslSkipVerify?: boolean;
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
  kingbase: 5432,
  highgo: 5866,
  vastbase: 5432,
};

const DB_TYPE_OPTIONS = [
  { value: 'mysql', label: 'MySQL', desc: '最流行的开源关系型数据库' },
  { value: 'postgresql', label: 'PostgreSQL', desc: '功能强大的开源对象关系数据库' },
  { value: 'sqlite', label: 'SQLite', desc: '轻量级嵌入式数据库' },
  { value: 'mariadb', label: 'MariaDB', desc: 'MySQL 的分支版本' },
  { value: 'sqlserver', label: 'SQL Server', desc: '微软企业级数据库' },
  { value: 'oracle', label: 'Oracle', desc: '企业级商业数据库' },
  { value: 'dameng', label: '达梦 (DM)', desc: '国产达梦数据库' },
  { value: 'kingbase', label: '人大金仓 (Kingbase)', desc: '国产人大金仓数据库' },
  { value: 'highgo', label: '瀚高 (HighGo)', desc: '国产瀚高数据库' },
  { value: 'vastbase', label: '海量 (Vastbase)', desc: '国产海量数据库' },
];

const DB_CATEGORIES = [
  {
    name: '常用数据库',
    dbs: ['mysql', 'postgresql', 'sqlite', 'mariadb'],
  },
  {
    name: '企业数据库',
    dbs: ['sqlserver', 'oracle'],
  },
  {
    name: '国产数据库',
    dbs: ['dameng', 'kingbase', 'highgo', 'vastbase'],
  },
];

export function ConnectionDialog({ open, editingData, onCancel, onSave }: ConnectionDialogProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [dbType, setDbType] = useState<
    | 'mysql'
    | 'postgresql'
    | 'sqlite'
    | 'sqlserver'
    | 'oracle'
    | 'mariadb'
    | 'dameng'
    | 'kingbase'
    | 'highgo'
    | 'vastbase'
  >(editingData?.dbType || 'mysql');
  const testCancelledRef = useRef(false);

  useEffect(() => {
    if (open) {
      const currentDbType = editingData?.dbType || 'mysql';
      setDbType(currentDbType);
      setActiveTab('general');
      form.setFieldsValue({
        name: editingData?.name,
        db_type: currentDbType,
        host: editingData?.host || 'localhost',
        port: editingData?.port || DB_TYPE_PORTS[currentDbType],
        username: editingData?.username,
        password: editingData?.password,
        database: editingData?.database,
        color: editingData?.color,
        // SSH
        use_ssh: editingData?.sshEnabled || false,
        ssh_host: editingData?.sshHost,
        ssh_port: editingData?.sshPort || 22,
        ssh_username: editingData?.sshUsername,
        ssh_auth_method: editingData?.sshAuthMethod || 'password',
        ssh_password: editingData?.sshPassword,
        ssh_key_path: editingData?.sshPrivateKeyPath,
        ssh_passphrase: editingData?.sshPassphrase,
        // SSL
        use_ssl: editingData?.sslEnabled || false,
        ssl_ca_cert: editingData?.sslCaPath,
        ssl_client_cert: editingData?.sslCertPath,
        ssl_client_key: editingData?.sslKeyPath,
      });
    } else {
      form.resetFields();
    }
  }, [open, editingData, form]);

  const handleDbTypeChange = useCallback(
    (value: string) => {
      setDbType(value as typeof dbType);
      form.setFieldsValue({ db_type: value });
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
        sshEnabled: values.use_ssh || false,
        sshHost: values.ssh_host,
        sshPort: values.ssh_port,
        sshUsername: values.ssh_username,
        sshAuthMethod: values.ssh_auth_method || 'password',
        sshPassword: values.ssh_password,
        sshPrivateKeyPath: values.ssh_key_path,
        sshPassphrase: values.ssh_passphrase,
        sslEnabled: values.use_ssl || false,
        sslCaPath: values.ssl_ca_cert,
        sslCertPath: values.ssl_client_cert,
        sslKeyPath: values.ssl_client_key,
        sslSkipVerify: false,
      });

      if (testCancelledRef.current) return;

      if (result) {
        message.success(t('common.connectionTestSuccess'));
      }
    } catch (error: any) {
      if (testCancelledRef.current) return;
      if (error.errorFields) return;
      message.error(`${t('common.connectionTestFailed')}: ${error}`);
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

      const dbTypeValue = values.db_type || dbType;
      const isSqlite = dbTypeValue === 'sqlite';
      await onSave({
        id: editingData?.id,
        name: values.name,
        dbType: dbTypeValue,
        host: isSqlite ? '' : values.host,
        port: isSqlite ? 0 : values.port,
        username: isSqlite ? '' : values.username,
        password: values.password,
        database: isSqlite ? values.host : values.database,
        group_id: editingData?.group_id,
        color: values.color,
        sshEnabled: values.use_ssh || false,
        sshHost: values.ssh_host,
        sshPort: values.ssh_port,
        sshUsername: values.ssh_username,
        sshAuthMethod: values.ssh_auth_method || 'password',
        sshPassword: values.ssh_password,
        sshPrivateKeyPath: values.ssh_key_path,
        sshPassphrase: values.ssh_passphrase,
        sslEnabled: values.use_ssl || false,
        sslCaPath: values.ssl_ca_cert,
        sslCertPath: values.ssl_client_cert,
        sslKeyPath: values.ssl_client_key,
        sslSkipVerify: false,
      });
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(`${t('common.operationFailed')}: ${error}`);
    } finally {
      setSaving(false);
    }
  }, [form, editingData, onSave, dbType]);

  const handleCancel = useCallback(() => {
    form.resetFields();
    onCancel();
  }, [form, onCancel]);

  const currentDbInfo = DB_TYPE_OPTIONS.find((opt) => opt.value === dbType);
  const currentDbColor =
    DB_TYPE_COLORS[dbType as keyof typeof DB_TYPE_COLORS] || DB_TYPE_COLORS.default;

  const getDbCategoryLabel = (name: string) => {
    const map: Record<string, string> = {
      '常用数据库': 'common.dbCategoryCommon',
      '企业数据库': 'common.dbCategoryEnterprise',
      '国产数据库': 'common.dbCategoryDomestic',
    };
    return t(map[name] || name);
  };

  const tabs = [
    { key: 'general', label: t('common.tabGeneral'), icon: <DatabaseOutlined /> },
    { key: 'ssl', label: 'SSL', icon: <SafetyCertificateOutlined /> },
    { key: 'ssh', label: 'SSH', icon: <KeyOutlined /> },
    { key: 'advanced', label: t('common.tabAdvanced'), icon: <SettingOutlined /> },
  ];

  return (
    <Modal
      title={null}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={saving}
      width={800}
      transitionName=""
      maskTransitionName=""
      styles={{ body: { padding: 0 } }}
      footer={null}
    >
      <div style={{ display: 'flex', height: 520 }}>
        {/* 左侧数据库类型选择 */}
        <div
          style={{
            width: 220,
            backgroundColor: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 12px 8px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {t('common.selectDatabase')}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px' }}>
            {DB_CATEGORIES.map((category) => (
              <div key={category.name} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    padding: '6px 8px',
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    fontWeight: 500,
                  }}
                >
                  {getDbCategoryLabel(category.name)}
                </div>
                {category.dbs.map((dbValue) => {
                  const dbInfo = DB_TYPE_OPTIONS.find((opt) => opt.value === dbValue);
                  if (!dbInfo) return null;
                  const isActive = dbType === dbValue;
                  const color =
                    DB_TYPE_COLORS[dbValue as keyof typeof DB_TYPE_COLORS] ||
                    DB_TYPE_COLORS.default;

                  return (
                    <div
                      key={dbValue}
                      onClick={() => handleDbTypeChange(dbValue)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        marginBottom: 2,
                        backgroundColor: isActive ? `${color}18` : 'transparent',
                        borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'var(--background-hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <DatabaseIcon type={dbValue} size={22} />
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? color : 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {dbInfo.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧配置区域 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 头部信息 */}
          <div
            style={{
              padding: '16px 20px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <DatabaseIcon type={dbType} size={28} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                {editingData ? t('common.editConnection') : t('common.createNewConnection')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {currentDbInfo?.desc}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {testing ? (
                <Space>
                  <AntButton loading size="small">
                    {t('common.testing')}
                  </AntButton>
                  <AntButton onClick={handleCancelTest} size="small">
                    {t('common.cancel')}
                  </AntButton>
                </Space>
              ) : (
                <AntButton
                  icon={<ThunderboltOutlined />}
                  onClick={handleTestConnection}
                  size="small"
                >
                  {t('common.testConnection')}
                </AntButton>
              )}
              <AntButton onClick={handleCancel} size="small">
                {t('common.cancel')}
              </AntButton>
              <AntButton type="primary" onClick={handleOk} loading={saving} size="small">
                {editingData ? t('common.save') : t('common.create')}
              </AntButton>
            </div>
          </div>

          {/* Tab 导航 */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border)',
              padding: '0 20px',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            {tabs.map((tab) => (
              <div
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderBottom:
                    activeTab === tab.key ? `2px solid ${currentDbColor}` : '2px solid transparent',
                  color: activeTab === tab.key ? currentDbColor : 'var(--text-secondary)',
                  fontWeight: activeTab === tab.key ? 600 : 500,
                  transition: 'all 0.2s ease',
                  marginBottom: -1,
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.key) {
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.key) {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                {tab.icon}
                {tab.label}
              </div>
            ))}
          </div>

          {/* Tab 内容 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
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
              {activeTab === 'general' && (
                <>
                  <Form.Item
                    name="name"
                    label={t('common.connectionName')}
                    rules={[{ required: true, message: t('common.pleaseEnterConnectionName') }]}
                    style={{ marginBottom: 16 }}
                  >
                    <GlobalInput placeholder={t('common.exampleProdMysql')} />
                  </Form.Item>

                  {dbType === 'sqlite' ? (
                    <Form.Item
                      name="host"
                      label={t('common.databaseFilePath')}
                      rules={[{ required: true, message: t('common.pleaseEnterDatabaseFilePath') }]}
                      style={{ marginBottom: 16 }}
                    >
                      <Space.Compact style={{ width: '100%' }}>
                        <GlobalInput placeholder={t('common.exampleDatabasePath')} />
                        <AntButton
                          icon={<FolderOutlined />}
                          onClick={() =>
                            createFileInput({
                              form,
                              fieldName: 'host',
                              accept: '.db,.sqlite,.sqlite3,.db3',
                            })
                          }
                        >
                          {t('common.browse')}
                        </AntButton>
                      </Space.Compact>
                    </Form.Item>
                  ) : (
                    <>
                      <Row gutter={16}>
                        <Col span={18}>
                          <Form.Item
                            name="host"
                            label={t('common.hostAddress')}
                            rules={[{ required: true, message: t('common.pleaseEnterHostAddress') }]}
                            style={{ marginBottom: 16 }}
                          >
                            <GlobalInput placeholder={t('common.exampleLocalhost')} />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item
                            name="port"
                            label={t('common.port')}
                            rules={[{ required: true, message: t('common.pleaseEnterPort') }]}
                            style={{ marginBottom: 16 }}
                          >
                            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </>
                  )}

                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="username"
                        label={t('common.username')}
                        rules={[{ required: dbType !== 'sqlite', message: t('common.pleaseEnterUsername') }]}
                        style={{ marginBottom: 16 }}
                      >
                        <GlobalInput placeholder={t('common.exampleRoot')} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="password"
                        label={t('common.password')}
                        rules={[
                          { required: !editingData && dbType !== 'sqlite', message: t('common.pleaseEnterPassword') },
                        ]}
                        style={{ marginBottom: 16 }}
                      >
                        <GlobalInputPassword
                          placeholder={editingData ? t('common.leaveBlankKeepPassword') : t('common.pleaseEnterPassword')}
                          autoComplete="new-password"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item name="database" label={t('common.databaseName')} style={{ marginBottom: 16 }}>
                    <GlobalInput placeholder={t('common.exampleMydbOptional')} />
                  </Form.Item>

                  <Form.Item
                    name="color"
                    label={t('common.markColor')}
                    style={{ marginBottom: 16 }}
                    extra={t('common.markColorExtra')}
                    getValueFromEvent={(color) => color?.toHex() || ''}
                    getValueProps={(value) => ({ value: value ? (typeof value === 'string' ? value : value.toHex()) : undefined })}
                  >
                    <ColorPicker showText />
                  </Form.Item>
                </>
              )}

              {activeTab === 'ssl' && (
                <>
                  <Form.Item
                    name="use_ssl"
                    label={t('common.enableSslTlsEncryption')}
                    valuePropName="checked"
                    style={{ marginBottom: 16 }}
                  >
                    <Switch size="small" />
                  </Form.Item>

                  <Form.Item name="ssl_ca_cert" label={t('common.caCertificate')} style={{ marginBottom: 16 }}>
                    <Space.Compact style={{ width: '100%' }}>
                      <GlobalInput placeholder={t('common.selectCaCertificateFile')} readOnly />
                      <AntButton
                        icon={<UploadOutlined />}
                        size="small"
                        onClick={() =>
                          createFileInput({
                            form,
                            fieldName: 'ssl_ca_cert',
                            accept: '.crt,.pem,.ca',
                          })
                        }
                      />
                    </Space.Compact>
                  </Form.Item>

                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="ssl_client_cert"
                        label={t('common.clientCertificate')}
                        style={{ marginBottom: 16 }}
                      >
                        <Space.Compact style={{ width: '100%' }}>
                          <GlobalInput placeholder={t('common.selectCertificate')} readOnly />
                          <AntButton
                            icon={<UploadOutlined />}
                            size="small"
                            onClick={() =>
                              createFileInput({
                                form,
                                fieldName: 'ssl_client_cert',
                                accept: '.crt,.pem,.cert',
                              })
                            }
                          />
                        </Space.Compact>
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="ssl_client_key"
                        label={t('common.clientPrivateKey')}
                        style={{ marginBottom: 16 }}
                      >
                        <Space.Compact style={{ width: '100%' }}>
                          <GlobalInput placeholder={t('common.selectPrivateKey')} readOnly />
                          <AntButton
                            icon={<UploadOutlined />}
                            size="small"
                            onClick={() =>
                              createFileInput({
                                form,
                                fieldName: 'ssl_client_key',
                                accept: '.key,.pem',
                              })
                            }
                          />
                        </Space.Compact>
                      </Form.Item>
                    </Col>
                  </Row>

                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                    {t('common.sslConfigDescription')}
                  </div>
                </>
              )}

              {activeTab === 'ssh' && (
                <>
                  <Form.Item
                    name="use_ssh"
                    label={t('common.enableSshTunnel')}
                    valuePropName="checked"
                    style={{ marginBottom: 16 }}
                  >
                    <Switch size="small" />
                  </Form.Item>

                  <Row gutter={16}>
                    <Col span={18}>
                      <Form.Item name="ssh_host" label={t('common.sshHost')} style={{ marginBottom: 16 }}>
                        <GlobalInput placeholder={t('common.example1921681100')} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        name="ssh_port"
                        label={t('common.port')}
                        initialValue={22}
                        style={{ marginBottom: 16 }}
                      >
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="ssh_username" label={t('common.username')} style={{ marginBottom: 16 }}>
                        <GlobalInput placeholder={t('common.exampleRoot')} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="ssh_password" label={t('common.password')} style={{ marginBottom: 16 }}>
                        <GlobalInputPassword placeholder={t('common.sshPassword')} autoComplete="new-password" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item name="ssh_key_path" label={t('common.privateKeyFile')} style={{ marginBottom: 16 }}>
                    <Space.Compact style={{ width: '100%' }}>
                      <GlobalInput placeholder={t('common.selectPrivateKeyFilePath')} readOnly />
                      <AntButton
                        icon={<UploadOutlined />}
                        size="small"
                        onClick={() =>
                          createFileInput({
                            form,
                            fieldName: 'ssh_key_path',
                            accept: '.pem,.key,.ppk',
                          })
                        }
                      />
                    </Space.Compact>
                  </Form.Item>

                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                    {t('common.sshTunnelDescription')}
                  </div>
                </>
              )}

              {activeTab === 'advanced' && (
                <>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="connect_timeout"
                        label={t('common.connectionTimeoutSeconds')}
                        initialValue={30}
                        style={{ marginBottom: 16 }}
                      >
                        <InputNumber min={1} max={300} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="query_timeout"
                        label={t('common.queryTimeoutSeconds')}
                        initialValue={300}
                        style={{ marginBottom: 16 }}
                      >
                        <InputNumber min={1} max={3600} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item
                    name="charset"
                    label={t('common.charset')}
                    initialValue="utf8mb4"
                    style={{ marginBottom: 16 }}
                  >
                    <Select>
                      <Select.Option value="utf8mb4">utf8mb4</Select.Option>
                      <Select.Option value="utf8">utf8</Select.Option>
                      <Select.Option value="gbk">gbk</Select.Option>
                      <Select.Option value="latin1">latin1</Select.Option>
                    </Select>
                  </Form.Item>

                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                    {t('common.advancedConfigDescription')}
                  </div>
                </>
              )}
            </Form>
          </div>
        </div>
      </div>
    </Modal>
  );
}
