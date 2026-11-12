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
  Empty,
  App,
} from 'antd';
import {
  UserOutlined,
  PlusOutlined,
  DeleteOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api';
import { useTableScrollHeight } from '../hooks/useTableScrollHeight';

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

export interface UserManagementPanelProps {
  connectionId: string;
  database?: string;
  connectionName?: string;
}

/**
 * 用户权限管理（Tab 内容，非弹窗）。
 *
 * 左列用户列表 + 右列权限与授权表单；创建用户仍用小表单弹窗（属于子流程，
 * 不是把整个功能塞回弹窗）。
 */
export const UserManagementPanel: React.FC<UserManagementPanelProps> = ({
  connectionId,
  database,
  connectionName,
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
  const {
    tableScrollHeight: usersHeight,
    containerRef: usersContainerRef,
    toolbarRef: usersToolbarRef,
  } = useTableScrollHeight([users.length]);
  const {
    tableScrollHeight: privHeight,
    containerRef: privContainerRef,
    toolbarRef: privToolbarRef,
  } = useTableScrollHeight([privileges.length, selectedUser?.user]);

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
  }, [connectionId, database, msg, t]);

  useEffect(() => {
    // 组件按 Tab（连接 + 库）挂载，初始状态即空；这里只负责拉用户列表
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首屏加载用户列表（含 loading 状态）
    if (connectionId) loadUsers();
  }, [connectionId, loadUsers]);

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

  const userColumns: ColumnsType<UserItem> = [
    {
      title: t('common.username'),
      dataIndex: 'user',
      key: 'user',
      ellipsis: true,
      render: (user: string, record) => (
        <Space size={6}>
          <UserOutlined style={{ color: 'var(--text-tertiary)' }} />
          <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.35 }}>
            <Text strong>{user}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.host}
            </Text>
          </span>
        </Space>
      ),
    },
    {
      title: t('common.type'),
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string | undefined) => (
        <Tag color={type === 'superuser' ? 'red' : 'default'}>{type || '-'}</Tag>
      ),
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 56,
      align: 'center',
      render: (_: unknown, record: UserItem) => (
        <Popconfirm
          title={t('common.userManagement.confirmDeleteUser')}
          description={t('common.deleteUserConfirm', { user: record.user })}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
          onConfirm={() => handleDropUser(record)}
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

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
      ellipsis: true,
    },
    {
      title: t('common.table'),
      dataIndex: 'table',
      key: 'table',
      width: 150,
      ellipsis: true,
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 90,
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

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: '12px 16px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          marginBottom: 10,
        }}
      >
        <SafetyOutlined style={{ color: 'var(--color-primary)' }} />
        <Text strong>{t('common.userPrivilegeManagement')}</Text>
        {database && <Tag color="blue">{database}</Tag>}
        {connectionName && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {connectionName}
          </Text>
        )}
        <span style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateUserOpen(true)}>
          {t('common.createUser')}
        </Button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16 }}>
        {/* 左列：用户 */}
        <div
          ref={usersContainerRef}
          style={{
            width: '42%',
            minWidth: 260,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            borderRight: '1px solid var(--border)',
            paddingRight: 16,
            boxSizing: 'border-box',
          }}
        >
          <div
            ref={usersToolbarRef}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
          >
            <Text strong style={{ fontSize: 12 }}>
              {t('common.userList')}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {users.length}
            </Text>
          </div>
          <Table<UserItem>
            dataSource={users}
            columns={userColumns}
            rowKey={(record) => `${record.user}@${record.host}`}
            loading={userLoading}
            size="small"
            pagination={false}
            scroll={{ y: Math.max(160, usersHeight - 40) }}
            rowClassName={(record) =>
              selectedUser && record.user === selectedUser.user ? 'user-row-selected' : ''
            }
            onRow={(record) => ({
              onClick: () => handleUserSelect(record),
              style: { cursor: 'pointer' },
            })}
            locale={{ emptyText: t('common.userManagement.noUsers') }}
          />
        </div>

        {/* 右列：权限 */}
        <div
          ref={privContainerRef}
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {selectedUser ? (
            <>
              <div
                ref={privToolbarRef}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  flexWrap: 'wrap',
                }}
              >
                <Text strong style={{ fontSize: 12 }}>
                  {t('common.userPrivilegesFor', {
                    user: `${selectedUser.user}@${selectedUser.host}`,
                  })}
                </Text>
              </div>

              <Form form={grantForm} layout="inline" onFinish={handleGrant}>
                <Form.Item
                  name="privileges"
                  rules={[{ required: true, message: t('common.pleaseSelectPermission') }]}
                >
                  <Select
                    mode="multiple"
                    options={PRIVILEGE_OPTIONS}
                    style={{ width: 190 }}
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
                        <Form.Item name="table">
                          <Input
                            placeholder={t('common.table')}
                            style={{ width: 150, marginRight: 8, marginBottom: 8 }}
                          />
                        </Form.Item>
                      )}
                      <Button
                        type="primary"
                        htmlType="submit"
                        icon={<ThunderboltOutlined />}
                        style={{ marginBottom: 8 }}
                      >
                        {t('common.grantPrivilege')}
                      </Button>
                    </>
                  )}
                </Form.Item>
              </Form>

              <Table
                dataSource={privileges}
                columns={privilegeColumns}
                rowKey={(record, index) => `${record.privilege}-${record.table || ''}-${index}`}
                loading={loading}
                size="small"
                pagination={false}
                scroll={{ y: Math.max(120, privHeight - 120) }}
              />
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('common.selectUserToViewPrivileges')}
              />
            </div>
          )}
        </div>
      </div>

      <Modal
        title={t('common.createNewUser')}
        open={createUserOpen}
        onCancel={() => {
          setCreateUserOpen(false);
          createUserForm.resetFields();
        }}
        onOk={handleCreateUser}
        transitionName=""
        maskTransitionName=""
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
    </div>
  );
};
