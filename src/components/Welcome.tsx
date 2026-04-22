import { useState, useEffect } from 'react';
import { Button, Card, Typography, Divider, Space, Empty } from 'antd';
import { DatabaseOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useAppStore, Connection } from '../stores/appStore';
import type { DatabaseType, ConnectionStatus } from '../types/api';
import { invoke } from '@tauri-apps/api/core';
import { ConnectionDialog, ConnectionFormData } from './ConnectionDialog';

const { Title, Text } = Typography;

interface BackendConnection {
  id: string;
  name: string;
  db_type: string;
  host: string;
  port: number;
  username: string;
  database?: string;
  group_id?: string;
  status: string;
}

interface BackendGroup {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export function Welcome() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingData, setEditingData] = useState<ConnectionFormData | undefined>();
  
  const connections = useAppStore((state) => state.connections);
  const groups = useAppStore((state) => state.groups);
  const addConnection = useAppStore((state) => state.addConnection);
  const updateConnection = useAppStore((state) => state.updateConnection);
  const deleteConnection = useAppStore((state) => state.deleteConnection);
  const setConnections = useAppStore((state) => state.setConnections);
  const addGroup = useAppStore((state) => state.addGroup);

  // 加载保存的连接和分组
  useEffect(() => {
    loadConnections();
    loadGroups();
  }, []);

  const loadConnections = async () => {
    try {
      const backendConnections = await invoke<BackendConnection[]>('get_connections');
      const appConnections = backendConnections.map((c: BackendConnection) => ({
        id: c.id,
        name: c.name,
        db_type: c.db_type as DatabaseType,
        host: c.host,
        port: c.port,
        username: c.username,
        status: c.status as ConnectionStatus,
        group_id: c.group_id
      }));
      setConnections(appConnections);
    } catch (error) {
      console.error('Failed to load connections:', error);
    }
  };

  const loadGroups = async () => {
    try {
      const backendGroups = await invoke<BackendGroup[]>('get_groups');
      backendGroups.forEach((g: BackendGroup) => {
        const exists = groups.find(grp => grp.id === g.id);
        if (!exists) {
          addGroup({
            id: g.id,
            name: g.name,
            icon: g.icon,
            color: g.color
          });
        }
      });
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  };

  const handleNewConnection = () => {
    setEditingData(undefined);
    setDialogOpen(true);
  };

  const handleEditConnection = (conn: Connection) => {
    setEditingData({
      id: conn.id,
      name: conn.name,
      dbType: conn.db_type,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      group_id: conn.group_id,
    });
    setDialogOpen(true);
  };

  const handleDeleteConnection = async (id: string) => {
    try {
      await invoke('delete_connection', { id });
      deleteConnection(id);
    } catch (error) {
      console.error('Failed to delete connection:', error);
    }
  };

  const handleSaveConnection = async (data: ConnectionFormData) => {
    const inputData = {
      id: data.id || null,
      name: data.name,
      db_type: data.dbType,
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password || '',
      database: data.database || null,
      group_id: data.group_id || null,
    };

    const savedConnection = await invoke<BackendConnection>('save_connection', {
      input: inputData,
    });

    const appConnection: Connection = {
      id: savedConnection.id,
      name: savedConnection.name,
      db_type: savedConnection.db_type as DatabaseType,
      host: savedConnection.host,
      port: savedConnection.port,
      username: savedConnection.username,
      status: savedConnection.status as ConnectionStatus,
      group_id: savedConnection.group_id,
    };

    if (data.id) {
      updateConnection(data.id, appConnection);
    } else {
      addConnection(appConnection);
    }

    setDialogOpen(false);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <Title level={3} style={{ marginBottom: '1rem' }}>
        <DatabaseOutlined style={{ marginRight: '0.5rem', color: 'var(--color-primary)' }} />
        iDBLink - 数据库管理工具
      </Title>

      <Card 
        title="连接列表"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleNewConnection}>
            新建连接
          </Button>
        }
      >
        {connections.length === 0 ? (
          <Empty 
            description="暂无连接"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleNewConnection}>
              创建第一个连接
            </Button>
          </Empty>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {connections.map((conn) => (
              <Card
                key={conn.id}
                size="small"
                hoverable
                style={{ cursor: 'pointer' }}
                actions={[
                  <PlayCircleOutlined key="connect" onClick={() => {}} />,
                  <EditOutlined key="edit" onClick={() => handleEditConnection(conn)} />,
                  <DeleteOutlined key="delete" onClick={() => handleDeleteConnection(conn.id)} />,
                ]}
              >
                <Card.Meta
                  title={
                    <Space>
                      <DatabaseOutlined style={{ color: 'var(--color-primary)' }} />
                      {conn.name}
                    </Space>
                  }
                  description={
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      <div>{conn.db_type.toUpperCase()}</div>
                      <div>{conn.host}:{conn.port}</div>
                      <div>{conn.username}</div>
                    </div>
                  }
                />
              </Card>
            ))}
          </div>
        )}
      </Card>

      <Divider />

      <Card title="功能特性" size="small">
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <li>支持 MySQL, PostgreSQL, SQLite, SQL Server, Oracle, MariaDB, 达梦数据库</li>
          <li>自定义连接分组管理（已支持持久化存储）</li>
          <li>可视化数据浏览和编辑</li>
          <li>SQL 查询编辑器（Monaco Editor）</li>
          <li>ER 图与模型设计</li>
          <li>数据导入导出</li>
        </ul>
      </Card>

      {/* 连接对话框 */}
      <ConnectionDialog
        open={dialogOpen}
        editingData={editingData}
        onCancel={() => setDialogOpen(false)}
        onSave={handleSaveConnection}
      />
    </div>
  );
}
