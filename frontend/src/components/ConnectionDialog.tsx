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
import { GlobalInput, GlobalInputPassword } from './GlobalInput';
import { DatabaseIcon } from './DatabaseIcon';
import { DB_TYPE_COLORS } from '../styles/theme';
import type { FormInstance } from 'antd';
import { api } from '../api';
import i18n from '../i18n';
import { getErrorMessage } from '../utils/getErrorMessage';

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
  { value: 'mysql', label: 'MySQL', descKey: 'common.dbDescMySQL' },
  { value: 'postgresql', label: 'PostgreSQL', descKey: 'common.dbDescPostgreSQL' },
  { value: 'sqlite', label: 'SQLite', descKey: 'common.dbDescSQLite' },
  { value: 'mariadb', label: 'MariaDB', descKey: 'common.dbDescMariaDB' },
  { value: 'sqlserver', label: 'SQL Server', descKey: 'common.dbDescSQLServer' },
  { value: 'oracle', label: 'Oracle', descKey: 'common.dbDescOracle' },
  { value: 'dameng', label: i18n.t('common.damengLabel'), descKey: 'common.dbDescDameng' },
  { value: 'kingbase', label: i18n.t('common.kingbaseLabel'), descKey: 'common.dbDescKingbase' },
  { value: 'highgo', label: i18n.t('common.highgoLabel'), descKey: 'common.dbDescHighgo' },
  { value: 'vastbase', label: i18n.t('common.vastbaseLabel'), descKey: 'common.dbDescVastbase' },
];

const DB_CATEGORIES = [
  {
    nameKey: 'common.dbCategoryCommon',
    dbs: ['mysql', 'postgresql', 'sqlite', 'mariadb'],
  },
  {
    nameKey: 'common.dbCategoryEnterprise',
    dbs: ['sqlserver', 'oracle'],
  },
  {
    nameKey: 'common.dbCategoryDomestic',
    dbs: ['dameng', 'kingbase', 'highgo', 'vastbase'],
  },
];

/** 表单全量值（含按需渲染 Tab 上未挂载的字段，经 getFieldsValue(true) 读取） */
interface FullFormValues {
  name?: string;
  db_type?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  color?: string;
  use_ssh?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_auth_method?: 'password' | 'key';
  ssh_password?: string;
  ssh_key_path?: string;
  ssh_passphrase?: string;
  use_ssl?: boolean;
  ssl_ca_cert?: string;
  ssl_client_cert?: string;
  ssl_client_key?: string;
}

export function ConnectionDialog({ open, editingData, onCancel, onSave }: ConnectionDialogProps) {  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  // 新建连接的未保存草稿：误关对话框（取消/遮罩/ESC）不清空表单，重开时恢复
  const hasDraftRef = useRef(false);
  // 本次会话是否为编辑已有连接（编辑关闭时清空表单，避免数据泄漏到下次新建）
  const sessionWasEditRef = useRef(false);
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
      sessionWasEditRef.current = !!editingData;
      const currentDbType = editingData?.dbType || 'mysql';
      setDbType(currentDbType);
      setActiveTab('general');
      if (editingData) {
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
      } else if (hasDraftRef.current) {
        // 上次新建未保存的草稿仍在表单里：保留，仅同步库类型
        form.setFieldsValue({ db_type: currentDbType });
      } else {
        // 全新表单：默认值
        form.setFieldsValue({
          db_type: currentDbType,
          host: 'localhost',
          port: DB_TYPE_PORTS[currentDbType],
          ssh_port: 22,
          ssh_auth_method: 'password',
        });
      }
    }
    // 注意：关闭时不 resetFields——误关对话框不该丢掉已填写的配置（草稿留在表单里）
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
      // 只校验基础必填字段；SSH/SSL/默认库等配置须从完整表单读取——
      // validateFields(字段列表) 的返回值只含列表内字段，此前 use_ssh 恒为
      // undefined，测试连接从不走 SSH 隧道（直连主机字段导致必然失败）。
      // getFieldsValue(true) 同时覆盖未挂载 Tab 的字段
      const values = await form.validateFields(['db_type', 'host', 'port', 'username', 'password']);
      const all = form.getFieldsValue(true) as FullFormValues;
      setTesting(true);
      testCancelledRef.current = false;

      const isSqlite = values.db_type === 'sqlite';
      await api.testConnection(
        values.db_type,
        isSqlite ? '' : values.host,
        isSqlite ? 0 : values.port,
        isSqlite ? '' : values.username,
        values.password || '',
        isSqlite ? values.host : all.database,
        all.use_ssh
          ? {
              ssh_enabled: true,
              ssh_host: all.ssh_host,
              ssh_port: all.ssh_port,
              ssh_username: all.ssh_username,
              ssh_auth_method: all.ssh_auth_method || 'password',
              ssh_password: all.ssh_password,
              ssh_private_key_path: all.ssh_key_path,
              ssh_passphrase: all.ssh_passphrase,
            }
          : undefined,
        all.use_ssl
          ? {
              ssl_enabled: true,
              ssl_ca_path: all.ssl_ca_cert,
              ssl_cert_path: all.ssl_client_cert,
              ssl_key_path: all.ssl_client_key,
              ssl_skip_verify: false,
            }
          : undefined,
      );

      if (testCancelledRef.current) return;

      message.success(t('common.connectionTestSuccess'));
    } catch (error: unknown) {
      if (testCancelledRef.current) return;
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error(`${t('common.connectionTestFailed')}: ${getErrorMessage(error)}`);
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
      // 各 Tab 字段按需渲染：validateFields() 只校验并返回"已挂载"的字段——
      // 停在其他 Tab 点保存时 SSH/SSL（或常规页字段）会整组缺失。
      // 用 getFieldsValue(true) 取全量存储值（含未挂载 Tab）合并，保证任意
      // Tab 点保存都携带完整配置
      const values = await form.validateFields();
      const merged = { ...form.getFieldsValue(true), ...values } as FullFormValues;

      const dbTypeValue = (merged.db_type || dbType) as ConnectionFormData['dbType'];
      const isSqlite = dbTypeValue === 'sqlite';
      // 必填项为空：多半在未挂载的常规页上（未触发字段校验标记）——
      // 切回常规页并补一次校验，让用户看到红色错误提示
      if (!merged.name?.trim() || (!isSqlite && !merged.host?.trim())) {
        setActiveTab('general');
        setTimeout(() => {
          form.validateFields(['name', 'host']).catch(() => {});
        }, 60);
        message.warning(t('common.incompleteConnectionInfo'));
        return;
      }
      setSaving(true);

      await onSave({
        id: editingData?.id,
        name: merged.name || '',
        dbType: dbTypeValue,
        host: isSqlite ? '' : merged.host || '',
        port: isSqlite ? 0 : merged.port || 0,
        username: isSqlite ? '' : merged.username || '',
        password: merged.password,
        database: isSqlite ? merged.host : merged.database,
        group_id: editingData?.group_id,
        color: merged.color,
        sshEnabled: !!merged.use_ssh,
        sshHost: merged.ssh_host,
        sshPort: merged.ssh_port,
        sshUsername: merged.ssh_username,
        sshAuthMethod: merged.ssh_auth_method || 'password',
        sshPassword: merged.ssh_password,
        sshPrivateKeyPath: merged.ssh_key_path,
        sshPassphrase: merged.ssh_passphrase,
        sslEnabled: !!merged.use_ssl,
        sslCaPath: merged.ssl_ca_cert,
        sslCertPath: merged.ssl_client_cert,
        sslKeyPath: merged.ssl_client_key,
        sslSkipVerify: false,
      });
      // 保存成功：草稿已消费，清空表单
      hasDraftRef.current = false;
      form.resetFields();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error(`${t('common.operationFailed')}: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }, [form, editingData, onSave, dbType]);

  const handleCancel = useCallback(() => {
    // 编辑会话关闭即清空；新建会话保留草稿（误关不丢已填内容，重开恢复）
    if (sessionWasEditRef.current) {
      form.resetFields();
      hasDraftRef.current = false;
    }
    onCancel();
  }, [form, onCancel]);

  const currentDbInfo = DB_TYPE_OPTIONS.find((opt) => opt.value === dbType);
  const currentDbColor =
    DB_TYPE_COLORS[dbType as keyof typeof DB_TYPE_COLORS] || DB_TYPE_COLORS.default;

  const getDbCategoryLabel = (nameKey: string) => {
    return t(nameKey);
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
      className="connection-dialog-modal"
      data-testid="connection-dialog"
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
              <div key={category.nameKey} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    padding: '6px 8px',
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    fontWeight: 500,
                  }}
                >
                  {getDbCategoryLabel(category.nameKey)}
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
                {currentDbInfo?.descKey ? t(currentDbInfo.descKey) : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {testing ? (
                <Space>
                  <AntButton loading size="small">
                    {t('common.testing')}
                  </AntButton>
                  {/* 红色无边框文案，与右侧"取消（关闭对话框）"按钮明确区分，避免误触 */}
                  <AntButton type="text" danger size="small" onClick={handleCancelTest}>
                    {t('common.cancelTest')}
                  </AntButton>
                </Space>
              ) : (
                <AntButton
                  icon={<ThunderboltOutlined />}
                  onClick={handleTestConnection}
                  size="small"
                  data-testid="conn-test-btn"
                >
                  {t('common.testConnection')}
                </AntButton>
              )}
              <AntButton onClick={handleCancel} size="small">
                {t('common.cancel')}
              </AntButton>
              <AntButton type="primary" onClick={handleOk} loading={saving} size="small" data-testid="conn-save-btn">
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
              onValuesChange={() => {
                // 新建会话中的任意输入都视为产生草稿（预填不算，setFieldsValue 不触发本回调）
                if (!editingData) hasDraftRef.current = true;
              }}
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
                    <GlobalInput placeholder={t('common.connectionNamePlaceholder')} data-testid="conn-name-input" />
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
                            rules={[
                              { required: true, message: t('common.pleaseEnterHostAddress') },
                            ]}
                            style={{ marginBottom: 16 }}
                          >
                            <GlobalInput placeholder={t('common.exampleLocalhost')} data-testid="conn-host-input" />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item
                            name="port"
                            label={t('common.port')}
                            rules={[{ required: true, message: t('common.pleaseEnterPort') }]}
                            style={{ marginBottom: 16 }}
                          >
                            <InputNumber min={1} max={65535} style={{ width: '100%' }} data-testid="conn-port-input" />
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
                        rules={[
                          {
                            required: dbType !== 'sqlite',
                            message: t('common.pleaseEnterUsername'),
                          },
                        ]}
                        style={{ marginBottom: 16 }}
                      >
                        <GlobalInput placeholder={t('common.exampleRoot')} data-testid="conn-username-input" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="password"
                        label={t('common.mainLayout.password')}
                        rules={[
                          {
                            required: !editingData && dbType !== 'sqlite',
                            message: t('common.pleaseEnterPassword'),
                          },
                        ]}
                        style={{ marginBottom: 16 }}
                      >
                        <GlobalInputPassword
                          placeholder={
                            editingData
                              ? t('common.leaveBlankKeepPassword')
                              : t('common.pleaseEnterPassword')
                          }
                          autoComplete="new-password"
                          data-testid="conn-password-input"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item
                    name="database"
                    label={t('common.databaseName')}
                    style={{ marginBottom: 16 }}
                  >
                    <GlobalInput placeholder={t('common.exampleMydbOptional')} data-testid="conn-database-input" />
                  </Form.Item>

                  <Form.Item
                    name="color"
                    label={t('common.markColor')}
                    style={{ marginBottom: 16 }}
                    extra={t('common.markColorExtra')}
                    getValueFromEvent={(color) => color?.toHex() || ''}
                    getValueProps={(value) => ({
                      value: value
                        ? typeof value === 'string'
                          ? value
                          : value.toHex()
                        : undefined,
                    })}
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

                  <Form.Item
                    name="ssl_ca_cert"
                    label={t('common.caCertificate')}
                    style={{ marginBottom: 16 }}
                  >
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
                      <Form.Item
                        name="ssh_host"
                        label={t('common.sshHost')}
                        style={{ marginBottom: 16 }}
                      >
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
                      <Form.Item
                        name="ssh_username"
                        label={t('common.username')}
                        style={{ marginBottom: 16 }}
                      >
                        <GlobalInput placeholder={t('common.exampleRoot')} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="ssh_password"
                        label={t('common.mainLayout.password')}
                        style={{ marginBottom: 16 }}
                      >
                        <GlobalInputPassword
                          placeholder={t('common.sshPassword')}
                          autoComplete="new-password"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item
                    name="ssh_key_path"
                    label={t('common.privateKeyFile')}
                    style={{ marginBottom: 16 }}
                  >
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
                    label={t('common.databaseProperties.charset')}
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
