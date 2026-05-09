import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Form,
  Input,
  Button,
  Table,
  Tag,
  Space,
  Popconfirm,
  Select,
  Checkbox,
  Typography,
  App,
} from 'antd';
import {
  UserOutlined,
  PlusOutlined,
  DeleteOutlined,
  KeyOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api';

const { Text } = Typography;

interface UserItem {
  user: string;
  host: string;
  type?: string;
}

interface PrivilegeItem {
  user: string;
  host: string;
  database?: string;
  table?: string;
  privilege: string;
}

const PRIVILEGE_OPTIONS = [
  { label: 'SELECT', value: 'SELECT' },
  { label: 'INSERT', value: 'INSERT' },
  { label: 'UPDATE', value: 'UPDATE' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'CREATE', value: 'CREATE' },
  { label: 'DROP', value: 'DROP' },
  { label: 'ALTER', value: 'ALTER' },
  { label: 'INDEX', value: 'INDEX' },
  { label: 'REFERENCES', value: 'REFERENCES' },
  { label: 'TRIGGER', value: 'TRIGGER' },
  { label: 'EXECUTE', value: 'EXECUTE' },
  { label: 'ALL', value: 'ALL' },
];

export interface UserManagementDialogProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  database?: string;
}

export const UserManagementDialog: React.FC<UserManagementDialogProps> = ({
  open,
  onClose,
  connectionId,
  database,
}) => {
  const { t } = useTranslation();
  const { message: msg } = App.useApp();
  const [grantForm] = Form.useForm();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [privileges, setPrivileges] = useState<PrivilegeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userLoading, setUserLoading] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createUserForm] = Form.useForm();

  const loadUsers = useCallback(async () => {
    setUserLoading(true);
    try {
      const resp = await api.getUsers(connectionId, database);
      if (resp.users) {
        setUsers(resp.users);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('common.getUserListFailed');
      msg.error(errorMessage);
    } finally {
      setUserLoading(false);
    }
  }, [connectionId, database, msg]);

  useEffect(() => {
    if (open && connectionId) {
      queueMicrotask(() => {
        setSelectedUser(null);
        setPrivileges([]);
        loadUsers();
      });
    }
  }, [open, connectionId, database, loadUsers]);

  const loadPrivileges = async (user: UserItem) => {
    setLoading(true);
    try {
      const resp = await api.getUserPrivileges(connectionId, user.user, user.host || '%', database);
      if (resp.privileges) {
        setPrivileges(resp.privileges);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('common.getPrivilegesFailed');
      msg.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (user: UserItem) => {
    setSelectedUser(user);
    loadPrivileges(user);
  };

  const handleCreateUser = async () => {
    const values = await createUserForm.validateFields();
    try {
      await api.createUser({
        connectionId,
        username: values.username,
        password: values.password,
        host: values.host || '%',
        database,
      });
      msg.success(t('common.userCreated'));
      setCreateUserOpen(false);
      createUserForm.resetFields();
      loadUsers();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('common.createUserFailed');
      msg.error(errorMessage);
    }
  };

  const handleDropUser = async (user: UserItem) => {
    try {
      await api.dropUser({
        connectionId,
        username: user.user,
        host: user.host || '%',
        database,
      });
      msg.success(t('common.userDeleted'));
      if (selectedUser?.user === user.user) {
        setSelectedUser(null);
        setPrivileges([]);
      }
      loadUsers();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('common.deleteUserFailed');
      msg.error(errorMessage);
    }
  };

  const handleGrant = async () => {
    const values = await grantForm.validateFields();
    if (!selectedUser) return;
    try {
      await api.grantPrivilege({
        connectionId,
        username: selectedUser.user,
        host: selectedUser.host || '%',
        privileges: values.privileges,
        databaseAll: values.databaseAll,
        database: values.databaseAll ? undefined : database,
        table: values.databaseAll ? undefined : values.table,
      });
      msg.success(t('common.privilegeGranted'));
      grantForm.resetFields();
      loadPrivileges(selectedUser);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('common.grantPrivilegeFailed');
      msg.error(errorMessage);
    }
  };

  const handleRevoke = async (privilege: string, table?: string) => {
    if (!selectedUser) return;
    try {
      await api.revokePrivilege({
        connectionId,
        username: selectedUser.user,
        host: selectedUser.host || '%',
        privileges: [privilege],
        databaseAll: !table,
        database: !table ? undefined : database,
        table: table,
      });
      msg.success(t('common.privilegeRevoked'));
      loadPrivileges(selectedUser);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('common.revokePrivilegeFailed');
      msg.error(errorMessage);
    }
  };

  const privilegeTagColor: Record<string, string> = {
    ALL: 'gold',
    SELECT: 'blue',
    INSERT: 'green',
    UPDATE: 'orange',
    DELETE: 'red',
    CREATE: 'purple',
    DROP: 'volcano',
    ALTER: 'cyan',
    INDEX: 'magenta',
    REFERENCES: 'lime',
    TRIGGER: 'geekblue',
    EXECUTE: 'silver',
    SUPERUSER: 'red',
    CREATEROLE: 'purple',
    CREATEDB: 'blue',
    LOGIN: 'green',
    REPLICATION: 'orange',
  };

  const privilegeColumns: ColumnsType<PrivilegeItem> = [
    {
      title: t('common.privilege'),
      dataIndex: 'privilege',
      key: 'privilege',
      width: 150,
      render: (priv: string) => <Tag color={privilegeTagColor[priv] || 'default'}>{priv}</Tag>,
    },
    {
      title: t('common.database'),
      dataIndex: 'database',
      key: 'database',
      width: 120,
    },
    {
      title: t('common.table'),
      dataIndex: 'table',
      key: 'table',
      width: 150,
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 80,
      render: (_: unknown, record: PrivilegeItem) => (
        <Popconfirm
          title={t('common.confirmRevokePrivilege')}
          description={t('common.revokePrivilegeConfirm', { privilege: record.privilege })}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
          onConfirm={() => handleRevoke(record.privilege, record.table)}
        >
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>
            {t('common.revoke')}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const userColumns: ColumnsType<UserItem> = [
    {
      title: t('common.username'),
      dataIndex: 'user',
      key: 'user',
      render: (user: string) => (
        <Space>
          <UserOutlined />
          <Text strong>{user}</Text>
        </Space>
      ),
    },
    {
      title: t('common.host'),
      dataIndex: 'host',
      key: 'host',
      width: 120,
      render: (host: string) => <Text code>{host}</Text>,
    },
    {
      title: t('common.type'),
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => (
        <Tag color={type === 'superuser' ? 'red' : 'default'}>{type || '-'}</Tag>
      ),
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 120,
      render: (_: unknown, record: UserItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleUserSelect(record)}>
            {t('common.viewPrivileges')}
          </Button>
          <Popconfirm
            title={t('common.userManagement.confirmDeleteUser')}
            description={t('common.deleteUserConfirm', { user: record.user })}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            onConfirm={() => handleDropUser(record)}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={
          <Space>
            <SafetyOutlined />
            {t('common.userPrivilegeManagement')}
          </Space>
        }
        open={open}
        onCancel={onClose}
        width={900}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong>{t('common.userList')}</Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateUserOpen(true)}>
              {t('common.createUser')}
            </Button>
          </div>

          <Table
            dataSource={users}
            columns={userColumns}
            rowKey={(record) => `${record.user}@${record.host}`}
            loading={userLoading}
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
          />

          {selectedUser && (
            <>
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Text strong>
                    {t('common.userPrivilegesFor', {
                      user: `${selectedUser.user}@${selectedUser.host}`,
                    })}
                  </Text>
                  <Button icon={<KeyOutlined />} onClick={() => grantForm.resetFields()}>
                    {t('common.grantPrivilege')}
                  </Button>
                </div>

                <Form form={grantForm} layout="inline" onFinish={handleGrant}>
                  <Form.Item
                    name="privileges"
                    rules={[{ required: true, message: t('common.pleaseSelectPermission') }]}
                  >
                    <Select
                      mode="multiple"
                      options={PRIVILEGE_OPTIONS}
                      style={{ width: 200 }}
                      placeholder={t('common.selectUser')}
                    />
                  </Form.Item>
                  <Form.Item name="databaseAll" valuePropName="checked">
                    <Checkbox>{t('common.allDatabasesTables')}</Checkbox>
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate>
                    {() => (
                      <>
                        {!grantForm.getFieldValue('databaseAll') && (
                          <Select
                            placeholder={t('common.databaseName')}
                            style={{ width: 150, marginRight: 8 }}
                            disabled={
                              !grantForm.isFieldTouched('databaseAll') &&
                              !grantForm.getFieldValue('databaseAll')
                            }
                          >
                            <Select.Option value={database}>{database}</Select.Option>
                          </Select>
                        )}
                        {!grantForm.getFieldValue('databaseAll') && (
                          <Input
                            placeholder={t('common.table')}
                            style={{ width: 150, marginRight: 8 }}
                            disabled={
                              !grantForm.isFieldTouched('databaseAll') &&
                              !grantForm.getFieldValue('databaseAll')
                            }
                          />
                        )}
                        <Button type="primary" htmlType="submit" icon={<ThunderboltOutlined />}>
                          {t('common.sqlEditor.execute')}
                        </Button>
                      </>
                    )}
                  </Form.Item>
                </Form>
              </div>

              <Table
                dataSource={privileges}
                columns={privilegeColumns}
                rowKey={(record, index) => `${record.privilege}-${record.table || ''}-${index}`}
                loading={loading}
                size="small"
                pagination={false}
                scroll={{ y: 250 }}
              />
            </>
          )}
        </Space>
      </Modal>

      <Modal
        title={t('common.createNewUser')}
        open={createUserOpen}
        onCancel={() => {
          setCreateUserOpen(false);
          createUserForm.resetFields();
        }}
        onOk={handleCreateUser}
      >
        <Form form={createUserForm} layout="vertical">
          <Form.Item
            name="username"
            label={t('common.username')}
            rules={[{ required: true, message: t('common.pleaseEnterUsername') }]}
          >
            <Input placeholder={t('common.userNamePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('common.mainLayout.password')}
            rules={[{ required: true, message: t('common.pleaseEnterPassword') }]}
          >
            <Input.Password placeholder={t('common.passwordPlaceholder')} />
          </Form.Item>
          <Form.Item name="host" label={t('common.host')} tooltip={t('common.hostTooltip')}>
            <Input placeholder={t('common.percentSign')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
