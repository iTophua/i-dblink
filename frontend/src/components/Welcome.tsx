import { useState, useEffect } from 'react';
import { Button, Card, Typography, Divider, Space, Empty } from 'antd';
import {
  DatabaseOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppStore, Connection } from '../stores/appStore';
import type { GroupOutput } from '../types/api';
import { ConnectionDialog, ConnectionFormData } from './ConnectionDialog';
import { api } from '../api';

const { Title } = Typography;

export function Welcome() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingData, setEditingData] = useState<ConnectionFormData | undefined>();

  const connections = useAppStore((state) => state.connections);
  const groups = useAppStore((state) => state.groups);
  const addConnection = useAppStore((state) => state.addConnection);
  const updateConnection = useAppStore((state) => state.updateConnection);
  const deleteConnection = useAppStore((state) => state.deleteConnection);
  const setConnections = useAppStore((state) => state.setConnections);
  const addGroup = useAppStore((state) => state.addGroup);

  const loadConnections = async () => {
    try {
      const backendConnections = await api.getConnections();
      setConnections(backendConnections as Connection[]);
    } catch (error) {
      console.error('Failed to load connections:', error);
    }
  };

  const loadGroups = async () => {
    try {
      const backendGroups = await api.getGroups();
      backendGroups.forEach((g: GroupOutput) => {
        const exists = groups.find((grp) => grp.id === g.id);
        if (!exists) {
          addGroup({
            id: g.id,
            name: g.name,
            icon: g.icon,
            color: g.color,
          });
        }
      });
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  };

  useEffect(() => {
    loadConnections();
    loadGroups();
  }, []);

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
      await api.deleteConnection(id);
      deleteConnection(id);
    } catch (error) {
      console.error('Failed to delete connection:', error);
    }
  };

  const handleSaveConnection = async (data: ConnectionFormData) => {
    const inputData: Parameters<typeof api.saveConnection>[0] = {
      ...(data.id ? { id: data.id } : {}),
      name: data.name,
      db_type: data.dbType,
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password || '',
      ...(data.database ? { database: data.database } : {}),
      ...(data.group_id ? { group_id: data.group_id } : {}),
    };

    const savedConnection = await api.saveConnection(inputData);

    const appConnection: Connection = {
      ...savedConnection,
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
        iDBLink - {t('common.dbTool')}
      </Title>

      <Card
        title={t('common.connectionList')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleNewConnection}>
            {t('common.newConnection')}
          </Button>
        }
      >
        {connections.length === 0 ? (
          <Empty description={t('common.noConnection')} image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleNewConnection}>
              {t('common.createFirstConnection')}
            </Button>
          </Empty>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
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
                      <div>
                        {conn.host}:{conn.port}
                      </div>
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

      <Card title={t('common.welcome.features')} size="small">
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <li>{t('common.featureDatabases')}</li>
          <li>{t('common.featureGroups')}</li>
          <li>{t('common.featureVisualBrowse')}</li>
          <li>{t('common.featureSqlEditor')}</li>
          <li>{t('common.featureErDiagram')}</li>
          <li>{t('common.featureImportExport')}</li>
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
