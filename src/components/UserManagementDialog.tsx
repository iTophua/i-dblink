import React, { useCallback, useEffect, useState } from 'react';
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
      const errorMessage = err instanceof Error ? err.message : '获取用户列表失败';
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
      const resp = await api.getUserPrivileges(
        connectionId,
        user.user,
        user.host || '%',
        database
      );
      if (resp.privileges) {
        setPrivileges(resp.privileges);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '获取权限失败';
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
      msg.success('用户创建成功');
      setCreateUserOpen(false);
      createUserForm.resetFields();
      loadUsers();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '创建用户失败';
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
      msg.success('用户已删除');
      if (selectedUser?.user === user.user) {
        setSelectedUser(null);
        setPrivileges([]);
      }
      loadUsers();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '删除用户失败';
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
      msg.success('权限授予成功');
      grantForm.resetFields();
      loadPrivileges(selectedUser);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '授予权限失败';
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
      msg.success('权限已撤销');
      loadPrivileges(selectedUser);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '撤销权限失败';
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
      title: '权限',
      dataIndex: 'privilege',
      key: 'privilege',
      width: 150,
      render: (priv: string) => (
        <Tag color={privilegeTagColor[priv] || 'default'}>
          {priv}
        </Tag>
      ),
    },
    {
      title: '数据库',
      dataIndex: 'database',
      key: 'database',
      width: 120,
    },
    {
      title: '表',
      dataIndex: 'table',
      key: 'table',
      width: 150,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: PrivilegeItem) => (
        <Popconfirm
          title="确认撤销权限"
          description={`撤销 ${record.privilege} 权限？`}
          okText="确认"
          cancelText="取消"
          onConfirm={() => handleRevoke(record.privilege, record.table)}
        >
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>
            撤销
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const userColumns: ColumnsType<UserItem> = [
    {
      title: '用户名',
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
      title: '主机',
      dataIndex: 'host',
      key: 'host',
      width: 120,
      render: (host: string) => (
        <Text code>{host}</Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => (
        <Tag color={type === 'superuser' ? 'red' : 'default'}>
          {type || '-'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: UserItem) => (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={() => handleUserSelect(record)}
          >
            查看权限
          </Button>
          <Popconfirm
            title="确认删除用户"
            description={`删除用户 ${record.user}？`}
            okText="确认"
            cancelText="取消"
            onConfirm={() => handleDropUser(record)}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              删除
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
            用户权限管理
          </Space>
        }
        open={open}
        onCancel={onClose}
        width={900}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong>用户列表</Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateUserOpen(true)}
            >
              创建用户
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
                    用户 <Text code>{selectedUser.user}@{selectedUser.host}</Text> 的权限
                  </Text>
                  <Button
                    icon={<KeyOutlined />}
                    onClick={() => grantForm.resetFields()}
                  >
                    授予权限
                  </Button>
                </div>

                <Form form={grantForm} layout="inline" onFinish={handleGrant}>
                  <Form.Item name="privileges" rules={[{ required: true, message: '请选择权限' }]}>
                    <Select
                      mode="multiple"
                      options={PRIVILEGE_OPTIONS}
                      style={{ width: 200 }}
                      placeholder="选择权限"
                    />
                  </Form.Item>
                  <Form.Item name="databaseAll" valuePropName="checked">
                    <Checkbox>所有数据库/表</Checkbox>
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate>
                    {() => (
                      <>
                        {!grantForm.getFieldValue('databaseAll') && (
                          <Select
                            placeholder="数据库"
                            style={{ width: 150, marginRight: 8 }}
                            disabled={!grantForm.isFieldTouched('databaseAll') && !grantForm.getFieldValue('databaseAll')}
                          >
                            <Select.Option value={database}>{database}</Select.Option>
                          </Select>
                        )}
                        {!grantForm.getFieldValue('databaseAll') && (
                          <Input
                            placeholder="表名"
                            style={{ width: 150, marginRight: 8 }}
                            disabled={!grantForm.isFieldTouched('databaseAll') && !grantForm.getFieldValue('databaseAll')}
                          />
                        )}
                        <Button type="primary" htmlType="submit" icon={<ThunderboltOutlined />}>
                          执行
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
        title="创建新用户"
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
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item
            name="host"
            label="主机"
            tooltip="留空表示 %（允许所有主机）"
          >
            <Input placeholder="%" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
