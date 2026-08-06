import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Tree, Input, Button, Space, Modal, Form, Select, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import type { Connection } from '../../stores/appStore';
import { useAppStore } from '../../stores/appStore';
import { api } from '../../api';
import { useMenuShortcuts } from '../../hooks/useMenuShortcuts';
import { useTranslation } from 'react-i18next';

// Placeholder for ConnectionDialog - import the real one if needed
const ConnectionDialogPlaceholder: React.FC<{
  connection?: Connection | null;
  onClose: () => void;
}> = ({ connection, onClose }) => (
  <div>
    <p>Connection Dialog Placeholder</p>
    {connection && <p>Editing: {connection.name}</p>}
    <button onClick={onClose}>Close</button>
  </div>
);

interface ConnectionTreeProps {
  selectedConnectionId: string | null;
  setSelectedConnectionId: (id: string | null) => void;
  selectedDatabase: string | undefined;
  setSelectedDatabase: (database: string | undefined) => void;
  expandedKeys: string[];
  setExpandedKeys: (keys: string[]) => void;
  searchText: string;
  setSearchText: (text: string) => void;
  onTableDoubleClick: (tableName: string, database?: string, isView?: boolean) => void;
}

interface TreeNodeData {
  key: string;
  title: string;
  children?: TreeNodeData[];
  connectionId?: string;
  database?: string;
  tableName?: string;
  isView?: boolean;
  type?: 'connection' | 'database' | 'table' | 'view' | 'group';
}

export const ConnectionTree: React.FC<ConnectionTreeProps> = ({
  selectedConnectionId,
  setSelectedConnectionId,
  selectedDatabase,
  setSelectedDatabase,
  expandedKeys,
  setExpandedKeys,
  searchText,
  setSearchText,
  onTableDoubleClick,
}) => {
  const { connections, groups } = useAppStore();
  const { registerShortcut } = useMenuShortcuts();
  const { t } = useTranslation();

  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [showEditConnectionDialog, setShowEditConnectionDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [connectionToDelete, setConnectionToDelete] = useState<string | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  const treeData = useMemo(() => {
    const data: TreeNodeData[] = [];
    
    // 添加分组
    groups.forEach(group => {
      const groupNode: TreeNodeData = {
        key: `group-${group.id}`,
        title: group.name,
        type: 'group',
        children: [],
      };
      
      // 添加分组内的连接
      (group.connections || []).forEach(connId => {
        const connection = connections.find(c => c.id === connId);
        if (connection) {
          const connNode: TreeNodeData = {
            key: `conn-${connection.id}`,
            title: connection.name,
            type: 'connection',
            connectionId: connection.id,
            children: [],
          };
          
          // 添加数据库
          if (connection.databases && connection.databases.length > 0) {
            connection.databases.forEach(db => {
              const dbNode: TreeNodeData = {
                key: `db-${connection.id}-${db}`,
                title: db,
                type: 'database',
                connectionId: connection.id,
                database: db,
                children: [],
              };
              
              // 添加表和视图
              const tables = connection.tables?.[db] || [];
              const views = connection.views?.[db] || [];
              
              tables.forEach(table => {
                dbNode.children!.push({
                  key: `table-${connection.id}-${db}-${table}`,
                  title: table,
                  type: 'table',
                  connectionId: connection.id,
                  database: db,
                  tableName: table,
                });
              });
              
              views.forEach(view => {
                dbNode.children!.push({
                  key: `view-${connection.id}-${db}-${view}`,
                  title: view,
                  type: 'view',
                  connectionId: connection.id,
                  database: db,
                  tableName: view,
                  isView: true,
                });
              });
              
              connNode.children!.push(dbNode);
            });
          }
          
          groupNode.children!.push(connNode);
        }
      });
      
      data.push(groupNode);
    });
    
    // 添加未分组的连接
    const ungroupedConnections = connections.filter(c => !groups.some(g => (g.connections || []).includes(c.id)));
    ungroupedConnections.forEach(connection => {
      const connNode: TreeNodeData = {
        key: `conn-${connection.id}`,
        title: connection.name,
        type: 'connection',
        connectionId: connection.id,
        children: [],
      };
      
      // 添加数据库
      if (connection.databases && connection.databases.length > 0) {
        connection.databases.forEach(db => {
          const dbNode: TreeNodeData = {
            key: `db-${connection.id}-${db}`,
            title: db,
            type: 'database',
            connectionId: connection.id,
            database: db,
            children: [],
          };
          
          // 添加表和视图
          const tables = connection.tables?.[db] || [];
          const views = connection.views?.[db] || [];
          
          tables.forEach(table => {
            dbNode.children!.push({
              key: `table-${connection.id}-${db}-${table}`,
              title: table,
              type: 'table',
              connectionId: connection.id,
              database: db,
              tableName: table,
            });
          });
          
          views.forEach(view => {
            dbNode.children!.push({
              key: `view-${connection.id}-${db}-${view}`,
              title: view,
              type: 'view',
              connectionId: connection.id,
              database: db,
              tableName: view,
              isView: true,
            });
          });
          
          connNode.children!.push(dbNode);
        });
      }
      
      data.push(connNode);
    });
    
    return data;
  }, [connections, groups]);

  const onDrop = useCallback((info: any) => {
    const dropKey = info.node.key;
    const dragKey = info.dragNode.key;
    const dropPos = info.node.pos;
    const dropLevel = info.node.level;
    
    // 实现拖拽逻辑
    console.log('Drop:', dropKey, 'Drag:', dragKey, 'Position:', dropPos, 'Level:', dropLevel);
  }, []);

  const onExpand = useCallback((expandedKeys: React.Key[]) => {
    setExpandedKeys(expandedKeys as string[]);
  }, []);

  const onSelect = useCallback((selectedKeys: React.Key[]) => {
    if (selectedKeys.length > 0) {
      const key = selectedKeys[0];
      const node = treeData.find(n => n.key === key);
      
      if (node) {
        if (node.type === 'connection') {
          setSelectedConnectionId(node.connectionId || null);
          setSelectedDatabase(undefined);
        } else if (node.type === 'database') {
          setSelectedConnectionId(node.connectionId || null);
          setSelectedDatabase(node.database);
        } else if (node.type === 'table' || node.type === 'view') {
          setSelectedConnectionId(node.connectionId || null);
          setSelectedDatabase(node.database);
        }
      }
    }
  }, [treeData, setSelectedConnectionId, setSelectedDatabase]);

  const onDoubleClick = useCallback((info: any) => {
    const node = info.node;
    if (node.type === 'table' || node.type === 'view') {
      onTableDoubleClick(node.tableName!, node.database, node.isView);
    }
  }, [onTableDoubleClick]);

  const handleAddConnection = useCallback(() => {
    setShowConnectionDialog(true);
  }, []);

  const handleEditConnection = useCallback((connection: Connection) => {
    setEditingConnection(connection);
    setShowEditConnectionDialog(true);
  }, []);

  const handleDeleteConnection = useCallback((connectionId: string) => {
    setConnectionToDelete(connectionId);
    setConfirmModalVisible(true);
  }, []);

  const confirmDeleteConnection = useCallback(async () => {
    if (connectionToDelete) {
      try {
        await api.deleteConnection(connectionToDelete);
        message.success(t('common.connectionDeleted'));
      } catch (error) {
        message.error(t('common.deleteConnectionFailed'));
      }
    }
    setConfirmModalVisible(false);
    setConnectionToDelete(null);
  }, [connectionToDelete]);

  const handleConnect = useCallback(async (connectionId: string) => {
    try {
      await api.connectConnection(connectionId);
      message.success(t('common.connectionSuccess'));
    } catch (error) {
      // 偶现连接失败（TLS 握手竞态、TCP 首包超时等）等 1s 重试一次
      try {
        await new Promise((r) => setTimeout(r, 1000));
        await api.connectConnection(connectionId);
        message.success(t('common.connectionSuccess'));
      } catch (error2) {
        message.error(t('common.connectFailed'));
      }
    }
  }, []);

  const handleDisconnect = useCallback(async (connectionId: string) => {
    try {
      await api.disconnectConnection(connectionId);
      message.success(t('common.connectionDisconnected'));
    } catch (error) {
      message.error(t('common.disconnectFailed'));
    }
  }, []);

  useEffect(() => {
    const cleanup1 = registerShortcut('add-connection', () => handleAddConnection());
    const cleanup2 = registerShortcut('connect-connection', () => {
      if (selectedConnectionId) {
        handleConnect(selectedConnectionId);
      }
    });
    const cleanup3 = registerShortcut('disconnect-connection', () => {
      if (selectedConnectionId) {
        handleDisconnect(selectedConnectionId);
      }
    });
    const cleanup4 = registerShortcut('delete-connection', () => {
      if (selectedConnectionId) {
        handleDeleteConnection(selectedConnectionId);
      }
    });
    
    return () => {
      cleanup1();
      cleanup2();
      cleanup3();
      cleanup4();
    };
  }, [registerShortcut, handleAddConnection, selectedConnectionId, handleConnect, handleDisconnect, handleDeleteConnection]);

  return (
    <div className="connection-tree-container">
      <div className="connection-tree-header">
        <Space>
          <Input
            placeholder="Search connections..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 200 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddConnection}
          >
            Add Connection
          </Button>
        </Space>
      </div>
      
      <Tree
        treeData={treeData}
        expandedKeys={expandedKeys}
        onExpand={onExpand}
        selectedKeys={selectedConnectionId ? [selectedConnectionId] : []}
        onSelect={onSelect}
        onDoubleClick={onDoubleClick}
        onDrop={onDrop}
        draggable
        blockNode
        showLine
      />
      
      <Modal
        title="Add Connection"
        open={showConnectionDialog}
        onCancel={() => setShowConnectionDialog(false)}
        footer={null}
      >
        <ConnectionDialogPlaceholder
          onClose={() => setShowConnectionDialog(false)}
        />
      </Modal>
      
      <Modal
        title="Edit Connection"
        open={showEditConnectionDialog}
        onCancel={() => setShowEditConnectionDialog(false)}
        footer={null}
      >
        <ConnectionDialogPlaceholder
          connection={editingConnection}
          onClose={() => setShowEditConnectionDialog(false)}
        />
      </Modal>
      
      <Modal
        title="Confirm Delete"
        open={confirmModalVisible}
        onOk={confirmDeleteConnection}
        onCancel={() => setConfirmModalVisible(false)}
        okText="Delete"
        cancelText="Cancel"
      >
        <p>Are you sure you want to delete this connection?</p>
      </Modal>
    </div>
  );
};