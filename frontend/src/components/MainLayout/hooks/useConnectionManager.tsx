import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form } from 'antd';
import { useConnections, useDatabase, useGroups } from '../../../hooks/useApi';
import { DatabaseProperties } from '../../DatabaseProperties';
import type { TabPanelRef } from '../../TabPanel';
import type { TableInfo, ColumnInfo, IndexInfo } from '../../../types/api';
import type { ConnectionFormData } from '../../ConnectionDialog';
import type { Connection } from '../../../stores/appStore';
import { useAppStore } from '../../../stores/appStore';
import { api } from '../../../api';
import { EventsOn } from '../../../../wailsjs/runtime/runtime';

interface UseConnectionManagerParams {
  tabPanelRef: React.RefObject<TabPanelRef | null>;
}

export function useConnectionManager({ tabPanelRef }: UseConnectionManagerParams) {
  const { t } = useTranslation();

  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState<string | undefined>();
  const [selectedSchema, setSelectedSchema] = useState<string | undefined>();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [connectionDatabases, setConnectionDatabases] = useState<
    Record<
      string,
      {
        database: string;
        tables: TableInfo[];
        loaded: boolean;
        loadFailed?: boolean;
        procedures?: string[];
        functions?: string[];
        triggers?: import('../../../types/api').TriggerInfo[];
        sequences?: import('../../../types/api').SequenceInfo[];
        routinesLoaded?: boolean;
      }[]
    >
  >({});
  const [tableStructures, setTableStructures] = useState<
    Record<string, { columns: ColumnInfo[]; indexes: IndexInfo[]; loaded: boolean }>
  >({});
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionFormData | undefined>();
  const [connectionExportOpen, setConnectionExportOpen] = useState(false);
  const [batchManageOpen, setBatchManageOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordDialogConn, setPasswordDialogConn] = useState<{ id: string; name: string } | null>(
    null
  );
  const [passwordForm] = Form.useForm();
  const closingDbModalRef = useRef(false);

  // 监听连接状态变化事件（后端发送）
  useEffect(() => {
    const cleanup = EventsOn('connection-status-changed', (data: { connectionId: string; status: string }) => {
      const { updateConnection } = useAppStore.getState();
      updateConnection(data.connectionId, { status: data.status as any });
    });
    return cleanup;
  }, []);

  const {
    connections,
    isLoading,
    setActiveConnection,
    saveConnection,
    deleteConnection,
    connect,
    disconnect,
  } = useConnections();

  const { groups, saveGroup, deleteGroup } = useGroups();

  const { getTables, refreshTables, getDatabases, getColumns, getIndexes } = useDatabase();

  // Handler wrappers for ConnectionTree
  const handleSaveConnection = useCallback(
    async (data: any) => {
      await saveConnection({
        id: data.id,
        name: data.name,
        db_type: data.db_type,
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password,
        database: data.database,
        group_id: data.group_id,
      });
    },
    [saveConnection]
  );

  const handleSaveGroup = useCallback(
    (data: { id?: string; name: string; icon: string; color: string; parent_id?: string }) => {
      saveGroup({
        id: data.id,
        name: data.name,
        icon: data.icon,
        color: data.color,
        parent_id: data.parent_id,
      });
    },
    [saveGroup]
  );

  const handleDeleteGroup = useCallback(
    (id: string) => {
      deleteGroup(id);
    },
    [deleteGroup]
  );

  const handleDialogSave = useCallback(
    async (data: ConnectionFormData) => {
      try {
        await saveConnection({
          id: data.id,
          name: data.name,
          db_type: data.dbType,
          host: data.host,
          port: data.port,
          username: data.username,
          password: data.password,
          database: data.database,
          group_id: data.group_id,
        });
        setConnectionDialogOpen(false);
      } catch (error) {
        console.error('Failed to save connection:', error);
        throw error;
      }
    },
    [saveConnection]
  );

// ConnectionTree handles connection expansion internally

  const loadDatabaseTables = useCallback(
    async (connectionId: string, database: string, forceRefresh = false) => {
      const cacheKey = `${connectionId}::${database || ''}`;
      const { setTableDataLoading } = useAppStore.getState();

      setTableDataLoading(cacheKey, true);

      try {
        const tables = await getTables(connectionId, database, forceRefresh);

        setConnectionDatabases((prev) => {
          const dbList = prev[connectionId] || [];
          const dbIndex = dbList.findIndex((db) => db.database === database);

          if (dbIndex >= 0) {
            const newDbList = [...dbList];
            newDbList[dbIndex] = { ...newDbList[dbIndex], tables, loaded: true, loadFailed: false };
            return {
              ...prev,
              [connectionId]: newDbList,
            };
          } else {
            return {
              ...prev,
              [connectionId]: [...dbList, { database, tables, loaded: true, loadFailed: false }],
            };
          }
        });
      } catch {
        setConnectionDatabases((prev) => {
          const dbList = prev[connectionId] || [];
          const dbIndex = dbList.findIndex((db) => db.database === database);

          if (dbIndex >= 0) {
            const newDbList = [...dbList];
            newDbList[dbIndex] = { ...newDbList[dbIndex], loaded: true, loadFailed: true };
            return {
              ...prev,
              [connectionId]: newDbList,
            };
          } else {
            return {
              ...prev,
              [connectionId]: [...dbList, { database, tables: [], loaded: true, loadFailed: true }],
            };
          }
        });
      } finally {
        setTableDataLoading(cacheKey, false);
      }
    },
    [getTables]
  );

  const loadDatabaseRoutines = useCallback(async (connectionId: string, database: string) => {
    try {
      const [procedures, functions, triggers, sequences] = await Promise.all([
        api.getProcedures(connectionId, database),
        api.getFunctions(connectionId, database),
        api.getTriggers(connectionId, database),
        api.getSequences(connectionId, database).catch(() => []),
      ]);

      setConnectionDatabases((prev) => {
        const dbList = prev[connectionId] || [];
        const dbIndex = dbList.findIndex((db) => db.database === database);

        if (dbIndex >= 0) {
          const newDbList = [...dbList];
          newDbList[dbIndex] = {
            ...newDbList[dbIndex],
            procedures,
            functions,
            triggers,
            sequences,
            routinesLoaded: true,
          };
          return {
            ...prev,
            [connectionId]: newDbList,
          };
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to load routines:', err);
      // 即使加载失败也标记为已加载，避免一直显示 loading
      setConnectionDatabases((prev) => {
        const dbList = prev[connectionId] || [];
        const dbIndex = dbList.findIndex((db) => db.database === database);
        if (dbIndex >= 0) {
          const newDbList = [...dbList];
          newDbList[dbIndex] = {
            ...newDbList[dbIndex],
            routinesLoaded: true,
          };
          return { ...prev, [connectionId]: newDbList };
        }
        return prev;
      });
    }
  }, []);

  // ConnectionTree handles table selection internally

  // ConnectionTree handles connection selection internally

  const handleConnect = useCallback(
    async (connectionId: string) => {
      const { setLoading, clearTableData, setConnections, setError } = useAppStore.getState();
      try {
        await connect(connectionId);
        const databases = (await getDatabases(connectionId)) || [];
        const dbList = databases.map((db) => ({ database: db, tables: [], loaded: false }));
        setConnectionDatabases((prev) => ({
          ...prev,
          [connectionId]: dbList,
        }));
        setExpandedKeys((prev) => [...prev, connectionId]);
      } catch (err: unknown) {
        // 检查是否是密码错误，需要弹框输入密码
        if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'PASSWORD_REQUIRED') {
          const conn = connections.find((c) => c.id === connectionId);
          setPasswordDialogConn({
            id: connectionId,
            name: conn?.name || t('common.unknownConnection'),
          });
          setPasswordDialogOpen(true);
          return;
        }
        // 连接失败时，彻底清理所有相关状态
        setConnectionDatabases((prev) => {
          const next = { ...prev };
          delete next[connectionId];
          return next;
        });
        // 清理表数据缓存（包括 loading 状态）
        clearTableData(connectionId);
        // 重置连接状态为断开
        setConnections((prev) =>
          prev.map((c) => (c.id === connectionId ? { ...c, status: 'disconnected' as const } : c))
        );
        // 确保全局 loading 状态被重置
        setLoading(false);
        setError(null);
        throw err;
      }
    },
    [connect, getDatabases, connections]
  );

  const handlePasswordSubmit = async () => {
    try {
      const values = await passwordForm.validateFields();
      setPasswordDialogOpen(false);
      passwordForm.resetFields();

      if (!passwordDialogConn) return;

      // 保存密码到存储
      await api.updateConnectionPassword(passwordDialogConn.id, values.password);

      // 重试连接
      const { setLoading, clearTableData, setConnections, setError } = useAppStore.getState();
      try {
        await connect(passwordDialogConn.id);
        const databases = (await getDatabases(passwordDialogConn.id)) || [];
        const dbList = databases.map((db) => ({ database: db, tables: [], loaded: false }));
        setConnectionDatabases((prev) => {
          const next = { ...prev };
          // 清除之前连接失败的状态
          if (next[passwordDialogConn.id]) {
            next[passwordDialogConn.id] = next[passwordDialogConn.id].map((db) => ({
              ...db,
              loadFailed: false,
            }));
          }
          return {
            ...next,
            [passwordDialogConn.id]: dbList,
          };
        });
        setExpandedKeys((prev) => [...prev, passwordDialogConn.id]);
      } catch (err) {
        setConnectionDatabases((prev) => {
          const next = { ...prev };
          delete next[passwordDialogConn.id];
          return next;
        });
        clearTableData(passwordDialogConn.id);
        setConnections((prev) =>
          prev.map((c) =>
            c.id === passwordDialogConn.id ? { ...c, status: 'disconnected' as const } : c
          )
        );
        setLoading(false);
        setError(null);
        throw err;
      }
    } catch (err) {
      // 表单验证失败或其他错误
      console.error('Password prompt error:', err);
    }
  };

  const handleDatabaseExpand = useCallback(
    async (connectionId: string, database: string) => {
      setSelectedConnectionId(connectionId);
      setSelectedDatabase(database);

      // 检查连接状态
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn || conn.status !== 'connected') {
        return;
      }

      // 检查是否已加载失败，避免不断重试导致错误提示
      const dbList = connectionDatabases[connectionId] || [];
      const db = dbList.find((d) => d.database === database);
      if (db?.loadFailed) return;

      // 始终强制刷新，因为展开数据库时需要最新数据
      await loadDatabaseTables(connectionId, database, true);
      await loadDatabaseRoutines(connectionId, database);
    },
    [loadDatabaseTables, loadDatabaseRoutines, connectionDatabases, connections]
  );

  const handleDatabaseRefresh = useCallback(
    async (connectionId: string, database: string) => {
      await loadDatabaseTables(connectionId, database, true); // Force refresh
    },
    [loadDatabaseTables]
  );

  const handleDatabaseProperties = useCallback((connectionId: string, databaseName: string) => {
    Modal.info({
      title: `${t('common.databasePropertiesTitle')}: ${databaseName}`,
      width: 800,
      transitionName: '',
      maskTransitionName: '',
      content: <DatabaseProperties connectionId={connectionId} databaseName={databaseName} />,
      okText: t('common.close'),
    });
  }, []);

  const handleDatabaseClose = useCallback(
    (connectionId: string, database: string) => {
      if (closingDbModalRef.current) return;

      const hasTabs = tabPanelRef.current?.hasDatabaseTabs(connectionId, database);
      const tabInfo = tabPanelRef.current?.getDatabaseTabInfo(connectionId, database);

      const doClose = () => {
        setConnectionDatabases((prev) => {
          const newData = { ...prev };
          if (newData[connectionId]) {
            newData[connectionId] = newData[connectionId].map((db) =>
              db.database === database ? { ...db, loaded: false, tables: [] } : db
            );
          }
          return newData;
        });
        setExpandedKeys((prev) =>
          prev.filter(
            (key) =>
              !key.startsWith(`db::${connectionId}::${database}`) &&
              !key.startsWith(`tables::${connectionId}::${database}`) &&
              !key.startsWith(`views::${connectionId}::${database}`) &&
              !key.startsWith(`table::${connectionId}::${database}`) &&
              !key.startsWith(`view::${connectionId}::${database}`)
          )
        );
        setTableStructures((prev) => {
          const newData = { ...prev };
          const keysToDelete = Object.keys(newData).filter((key) =>
            key.startsWith(`${connectionId}::${database}::`)
          );
          keysToDelete.forEach((key) => delete newData[key]);
          return newData;
        });
        if (selectedConnectionId === connectionId && selectedDatabase === database) {
          setSelectedTable(null);
          setSelectedDatabase(undefined);
          setSelectedSchema(undefined);
        }
      };

      if (hasTabs && tabInfo && (tabInfo.dataTabCount > 0 || tabInfo.sqlTabCount > 0)) {
        closingDbModalRef.current = true;
        const tabDesc = [
          tabInfo.dataTabCount > 0
            ? t('common.dataTableCount', { count: tabInfo.dataTabCount })
            : '',
          tabInfo.sqlTabCount > 0 ? t('common.sqlQueryCount', { count: tabInfo.sqlTabCount }) : '',
        ]
          .filter(Boolean)
          .join(t('common.enumerationSeparator'));
        Modal.confirm({
          title: t('common.closeRelatedTabsTitle'),
          content: t('common.closeDatabaseTabsContent', { tabs: tabDesc }),
          okText: t('common.closeAndCloseDatabase'),
          cancelText: t('common.closeDatabaseOnly'),
          transitionName: '',
          maskTransitionName: '',
          onOk: () => {
            closingDbModalRef.current = false;
            tabPanelRef.current?.closeDatabaseTabs(connectionId, database);
            doClose();
          },
          onCancel: () => {
            closingDbModalRef.current = false;
            doClose();
          },
        });
      } else {
        doClose();
      }
    },
    [selectedConnectionId, selectedDatabase]
  );

  const handleLoadDatabases = useCallback(
    async (connectionId: string) => {
      try {
        const databases = await getDatabases(connectionId);
        const dbList = databases.map((db) => ({ database: db, tables: [], loaded: false }));
        setConnectionDatabases((prev) => ({
          ...prev,
          [connectionId]: dbList,
        }));
      } catch (error) {
        console.error('Failed to load database list:', error);
      }
    },
    [getDatabases]
  );

  const handleTableExpand = useCallback(
    async (connectionId: string, database: string, tableName: string) => {
      const tableKey = `${connectionId}::${database}::${tableName}`;

      // 如果已经加载过，跳过
      if (tableStructures[tableKey]?.loaded) return;

      try {
        const [columns, indexes] = await Promise.all([
          getColumns(connectionId, tableName, database),
          getIndexes(connectionId, tableName, database),
        ]);

        setTableStructures((prev) => ({
          ...prev,
          [tableKey]: { columns, indexes, loaded: true },
        }));
      } catch (error) {
        console.error('Failed to load table structure:', error);
        // 即使失败也标记为 loaded，避免重复请求
        setTableStructures((prev) => ({
          ...prev,
          [tableKey]: { columns: [], indexes: [], loaded: true },
        }));
      }
    },
    [tableStructures, getColumns, getIndexes]
  );

  const handleDisconnect = useCallback(
    (connectionId: string) => {
      const tabInfo = tabPanelRef.current?.getConnectionTabInfo(connectionId);
      const hasTabs = tabPanelRef.current?.hasConnectionTabs(connectionId);

      const doDisconnect = () => {
        setConnectionDatabases((prev) => {
          const next = { ...prev };
          delete next[connectionId];
          return next;
        });
        setExpandedKeys((prev) =>
          prev.filter((k) => {
            if (k === connectionId) return false;
            if (k.startsWith(`db::${connectionId}::`)) return false;
            if (k.startsWith(`tables::${connectionId}::`)) return false;
            if (k.startsWith(`views::${connectionId}::`)) return false;
            if (k.startsWith(`table::${connectionId}::`)) return false;
            if (k.startsWith(`view::${connectionId}::`)) return false;
            if (k.startsWith(`procedures::${connectionId}::`)) return false;
            if (k.startsWith(`functions::${connectionId}::`)) return false;
            return true;
          })
        );
        setTableStructures((prev) => {
          const next = { ...prev };
          const keysToDelete = Object.keys(next).filter((key) =>
            key.startsWith(`${connectionId}::`)
          );
          keysToDelete.forEach((key) => delete next[key]);
          return next;
        });
        if (selectedConnectionId === connectionId) {
          setSelectedConnectionId(null);
          setSelectedTable(null);
          setSelectedDatabase(undefined);
          setSelectedSchema(undefined);
          setActiveConnection(null);
        }
        disconnect(connectionId);
      };

      if (hasTabs && tabInfo && (tabInfo.dataTabCount > 0 || tabInfo.sqlTabCount > 0)) {
        const tabDesc = [
          tabInfo.dataTabCount > 0
            ? t('common.dataTableCount', { count: tabInfo.dataTabCount })
            : '',
          tabInfo.sqlTabCount > 0 ? t('common.sqlQueryCount', { count: tabInfo.sqlTabCount }) : '',
        ]
          .filter(Boolean)
          .join(t('common.enumerationSeparator'));
        Modal.confirm({
          title: t('common.closeRelatedTabsTitle'),
          content: t('common.disconnectTabsContent', { tabs: tabDesc }),
          okText: t('common.closeAndDisconnect'),
          cancelText: t('common.disconnectOnly'),
          transitionName: '',
          maskTransitionName: '',
          onOk: () => {
            tabPanelRef.current?.closeConnectionTabs(connectionId);
            doDisconnect();
          },
          onCancel: () => {
            doDisconnect();
          },
        });
      } else {
        doDisconnect();
      }
    },
    [disconnect, selectedConnectionId, setActiveConnection]
  );

  const handleEditConnection = useCallback((connection: Connection) => {
    setEditingConnection({
      id: connection.id,
      name: connection.name,
      dbType: connection.db_type,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: '',
      database: connection.database,
      group_id: connection.group_id,
    });
    setConnectionDialogOpen(true);
  }, []);

  const handleDeleteConnection = useCallback(
    (connectionId: string) => {
      deleteConnection(connectionId);
    },
    [deleteConnection]
  );

  const handleNewQuery = useCallback(
    async (connectionId: string) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;

      // 如果未连接，先尝试连接
      if (conn.status !== 'connected') {
        try {
          await handleConnect(connectionId);
        } catch (err: unknown) {
          // 连接失败时，handleConnect 会处理密码弹框，不需要再处理
          return;
        }
      }

      setSelectedConnectionId(connectionId);
      setActiveConnection(connectionId);
      window.dispatchEvent(
        new CustomEvent('tab-action', {
          detail: { action: 'new-sql-tab', connectionId, database: selectedDatabase },
        })
      );
    },
    [connections, handleConnect, setActiveConnection]
  );

  const handleEditTab = useCallback((targetKey: string, action: string) => {
    if (action === 'remove' && targetKey !== 'sql') {
      setSelectedTable(null);
    }
  }, []);

  return {
    // State
    selectedConnectionId,
    setSelectedConnectionId,
    selectedTable,
    setSelectedTable,
    selectedDatabase,
    setSelectedDatabase,
    selectedSchema,
    setSelectedSchema,
    expandedKeys,
    setExpandedKeys,
    connectionDatabases,
    setConnectionDatabases,
    tableStructures,
    setTableStructures,
    connectionDialogOpen,
    setConnectionDialogOpen,
    editingConnection,
    setEditingConnection,
    connectionExportOpen,
    setConnectionExportOpen,
    batchManageOpen,
    setBatchManageOpen,
    passwordDialogOpen,
    setPasswordDialogOpen,
    passwordDialogConn,
    setPasswordDialogConn,
    passwordForm,
    closingDbModalRef,
    // From hooks
    connections,
    isLoading,
    setActiveConnection,
    saveConnection,
    deleteConnection,
    connect,
    disconnect,
    groups,
    saveGroup,
    deleteGroup,
    getTables,
    refreshTables,
    getDatabases,
    getColumns,
    getIndexes,
    // Handlers
    handleSaveConnection,
    handleSaveGroup,
    handleDeleteGroup,
    handleDialogSave,
    loadDatabaseTables,
    loadDatabaseRoutines,
    handleConnect,
    handlePasswordSubmit,
    handleDatabaseExpand,
    handleDatabaseRefresh,
    handleDatabaseProperties,
    handleDatabaseClose,
    handleLoadDatabases,
    handleTableExpand,
    handleDisconnect,
    handleEditConnection,
    handleDeleteConnection,
    handleNewQuery,
    handleEditTab,
  };
}
