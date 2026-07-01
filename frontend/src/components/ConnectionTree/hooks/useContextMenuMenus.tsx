import { useCallback, useRef } from 'react';
import { Modal, App } from 'antd';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  DatabaseOutlined,
  LinkOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  DisconnectOutlined,
  CopyOutlined,
  FolderOutlined,
  PlusOutlined,
  MinusOutlined,
  InfoCircleOutlined,
  DashboardOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import React from 'react';
import type { Connection, ConnectionGroup } from '../../../stores/appStore';
import { api } from '../../../api';
import { getErrorMessage } from '../../../utils/getErrorMessage';

interface DialogSetters {
  setGroupDialogOpen: (open: boolean) => void;
  setEditingGroup: (group: ConnectionGroup | null) => void;
  setParentGroupId: (id: string | null) => void;
  setRenamingKey: (key: string | null) => void;
  setRenameValue: (value: string) => void;
  setCopyTarget: (target: { tableName: string; database?: string; connId: string } | null) => void;
  setCopyDialogOpen: (open: boolean) => void;
  setDumpTarget: (target: { tableName: string; database?: string; connId: string } | null) => void;
  setDumpDialogOpen: (open: boolean) => void;
  setRunSqlTarget: (target: { connId: string; database?: string } | null) => void;
  setRunSqlDialogOpen: (open: boolean) => void;
  setBackupRestoreTarget: (target: { connId: string; database: string } | null) => void;
  setBackupRestoreMode: (mode: 'backup' | 'restore') => void;
  setBackupRestoreOpen: (open: boolean) => void;
  setUserManagementTarget: (target: { connId: string; database?: string } | null) => void;
  setUserManagementOpen: (open: boolean) => void;
  setSchemaCompareOpen: (open: boolean) => void;
  setProcessListOpen: (open: boolean) => void;
  setProcessListTarget: (target: { connId: string; database?: string } | null) => void;
  setServerStatusOpen: (open: boolean) => void;
  setServerStatusTarget: (target: { connId: string } | null) => void;
  setCreateDatabaseTarget: (target: { connId: string; dbType?: string } | null) => void;
  setCreateDatabaseOpen: (open: boolean) => void;
  setPropertiesType: (type: 'connection' | 'table' | 'view' | 'procedure' | 'function' | 'trigger' | 'group') => void;
  setPropertiesTarget: (target: { connId: string; name: string; database?: string; data?: any } | null) => void;
  setPropertiesOpen: (open: boolean) => void;
  setPropertiesLoading: (loading: boolean) => void;
  setPropertiesContent: (content: string) => void;
}

interface ActionCallbacks {
  onConnect: (connectionId: string) => Promise<void> | void;
  onDisconnect: (connectionId: string) => void;
  onExpand: (connectionId: string, expanded: boolean) => void;
  onEditConnection: (connection: Connection) => void;
  onDeleteConnection: (connectionId: string) => void;
  onNewQuery: (connectionId: string) => void;
  onExpandKeys: (keys: string[]) => void;
  onDatabaseRefresh?: (connectionId: string, database: string) => void;
  onDatabaseClose?: (connectionId: string, database: string) => void;
  onDatabaseProperties?: (connectionId: string, databaseName: string) => void;
  onTableOpen: (tableName: string, database?: string) => void;
  onOpenDesigner?: (tableName: string, database?: string) => void;
  onOpenViewDefinition?: (viewName: string, database?: string) => void;
  onViewOpen?: (viewName: string, database?: string) => void;
  onDeleteGroup: (id: string) => void;
  handleCopyConnection: (conn: Connection) => Promise<void>;
  handleMoveConnection: (connectionId: string, targetGroupId: string) => Promise<void>;
}

export function useContextMenuMenus(
  groups: ConnectionGroup[],
  connections: Connection[],
  expandedKeys: string[],
  groupedConnections: Record<string, Connection[]>,
  dialogSetters: DialogSetters,
  callbacks: ActionCallbacks
) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const closingDbModalRef = useRef(false);

  const getConnectionMenu = useCallback(
    (conn: Connection): MenuProps => ({
      items:
        conn.status === 'connected'
          ? [
              {
                key: 'disconnect',
                label: t('common.mainLayout.disconnectConnection'),
                icon: <DisconnectOutlined />,
              },
              { key: 'refresh', label: t('common.refresh'), icon: <ReloadOutlined /> },
              { type: 'divider' },
              { key: 'edit', label: t('common.editConnection'), icon: <EditOutlined /> },
              { key: 'copy', label: t('common.copyConnectionConfig'), icon: <CopyOutlined /> },
              { type: 'divider' },
              {
                key: 'connection-properties',
                label: t('common.connectionProperties'),
                icon: <InfoCircleOutlined />,
              },
              { type: 'divider' },
              {
                key: 'new-query',
                label: t('common.sqlEditor.newQuery'),
                icon: <PlayCircleOutlined />,
              },
              {
                key: 'create-database',
                label: t('common.createDatabase'),
                icon: <DatabaseOutlined />,
              },
              { type: 'divider' },
              {
                key: 'move',
                label: t('common.mainLayout.moveToGroup'),
                icon: <FolderOutlined />,
                children: [
                  ...groups
                    .filter((g) => g.id !== 'default' || conn.group_id !== 'default')
                    .map((g) => ({
                      key: `move-to-${g.id}`,
                      label:
                        g.id === 'default' ? (
                          <>
                            <MinusOutlined /> {g.name}
                          </>
                        ) : (
                          <>
                            {g.icon} {g.name}
                          </>
                        ),
                      disabled: conn.group_id === g.id,
                    })),
                  { type: 'divider' },
                  { key: 'new-group', label: t('common.newGroup'), icon: <PlusOutlined /> },
                ],
              },
              { type: 'divider' },
              {
                key: 'delete',
                label: t('common.mainLayout.deleteConnection'),
                icon: <DeleteOutlined />,
                danger: true,
              },
            ]
          : [
              { key: 'connect', label: t('common.mainLayout.connect'), icon: <LinkOutlined /> },
              { key: 'edit', label: t('common.editConnection'), icon: <EditOutlined /> },
              { key: 'copy', label: t('common.copyConnectionConfig'), icon: <CopyOutlined /> },
              { type: 'divider' },
              {
                key: 'connection-properties',
                label: t('common.connectionProperties'),
                icon: <InfoCircleOutlined />,
              },
              { type: 'divider' },
              {
                key: 'move',
                label: t('common.mainLayout.moveToGroup'),
                icon: <FolderOutlined />,
                children: [
                  ...groups
                    .filter((g) => g.id !== 'default' || conn.group_id !== 'default')
                    .map((g) => ({
                      key: `move-to-${g.id}`,
                      label:
                        g.id === 'default' ? (
                          <>
                            <MinusOutlined /> {g.name}
                          </>
                        ) : (
                          <>
                            {g.icon} {g.name}
                          </>
                        ),
                      disabled: conn.group_id === g.id,
                    })),
                  { type: 'divider' },
                  { key: 'new-group', label: t('common.newGroup'), icon: <PlusOutlined /> },
                ],
              },
              { type: 'divider' },
              {
                key: 'delete',
                label: t('common.mainLayout.deleteConnection'),
                icon: <DeleteOutlined />,
                danger: true,
              },
            ],
      onClick: async ({ key }) => {
        if (key === 'connect') {
          await callbacks.onConnect(conn.id);
        } else if (key === 'disconnect') {
          Modal.confirm({
            title: t('common.confirmDisconnect'),
            content: t('common.confirmDisconnectContent', { name: conn.name }),
            okText: t('common.disconnectLabel'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            transitionName: '',
            maskTransitionName: '',
            onOk: () => callbacks.onDisconnect(conn.id),
          });
        } else if (key === 'refresh') {
          callbacks.onExpandKeys(expandedKeys.filter((k) => !k.startsWith(`db::${conn.id}::`)));
          callbacks.onExpand(conn.id, true);
        } else if (key === 'edit') {
          callbacks.onEditConnection(conn);
        } else if (key === 'delete') {
          Modal.confirm({
            title: t('common.confirmDeleteConnectionTitle'),
            content: t('common.confirmDeleteConnectionContent', { name: conn.name }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            transitionName: '',
            maskTransitionName: '',
            onOk: () => callbacks.onDeleteConnection(conn.id),
          });
        } else if (key === 'new-query') {
          callbacks.onNewQuery(conn.id);
        } else if (key === 'create-database') {
          const connInfo = connections.find((c) => c.id === conn.id);
          dialogSetters.setCreateDatabaseTarget({
            connId: conn.id,
            dbType: connInfo?.db_type,
          });
          dialogSetters.setCreateDatabaseOpen(true);
        } else if (key === 'connection-properties') {
          dialogSetters.setPropertiesType('connection');
          dialogSetters.setPropertiesTarget({ connId: conn.id, name: conn.name, data: conn });
          dialogSetters.setPropertiesOpen(true);
        } else if (key === 'copy') {
          callbacks.handleCopyConnection(conn);
        } else if (key === 'new-group') {
          dialogSetters.setEditingGroup(null);
          dialogSetters.setParentGroupId(null);
          dialogSetters.setGroupDialogOpen(true);
        } else if (key.startsWith('move-to-')) {
          const targetGroupId = key.replace('move-to-', '');
          callbacks.handleMoveConnection(conn.id, targetGroupId);
        }
      },
    }),
    [
      groups,
      expandedKeys,
      connections,
      callbacks,
      dialogSetters,
    ]
  );

  const getGroupMenu = useCallback(
    (group: ConnectionGroup): MenuProps => ({
      items: [
        { key: 'new-connection', label: t('common.newConnection'), icon: <PlusOutlined /> },
        { key: 'new-group', label: t('common.newGroup'), icon: <FolderOutlined /> },
        { type: 'divider' },
        { key: 'rename', label: t('common.renameGroup'), icon: <EditOutlined /> },
        { type: 'divider' },
        { key: 'export', label: t('common.exportGroup') },
        { type: 'divider' },
        { key: 'group-properties', label: t('common.groupProperties') },
        { type: 'divider' },
        {
          key: 'delete',
          label: t('common.mainLayout.deleteGroup'),
          icon: <DeleteOutlined />,
          danger: true,
          disabled: group.id === 'default',
        },
      ],
      onClick: ({ key }) => {
        if (key === 'group-properties') {
          const connCount = groupedConnections[group.id]?.length || 0;
          dialogSetters.setPropertiesType('group');
          dialogSetters.setPropertiesTarget({
            connId: '',
            name: group.name,
            data: { ...group, connCount },
          });
          dialogSetters.setPropertiesOpen(true);
        } else if (key === 'new-connection') {
          callbacks.onEditConnection({
            id: '',
            name: '',
            db_type: 'mysql',
            host: 'localhost',
            port: 3306,
            username: '',
            status: 'disconnected',
            group_id: group.id,
          } as Connection);
        } else if (key === 'new-group') {
          dialogSetters.setEditingGroup(null);
          dialogSetters.setParentGroupId(group.id);
          dialogSetters.setGroupDialogOpen(true);
        } else if (key === 'rename') {
          dialogSetters.setRenamingKey(`group-${group.id}`);
          dialogSetters.setRenameValue(group.name);
        } else if (key === 'delete') {
          const connCount = groupedConnections[group.id]?.length || 0;
          Modal.confirm({
            title: t('common.confirmDeleteGroupTitle'),
            content:
              connCount > 0
                ? t('common.confirmDeleteGroupWithConnectionsContent', {
                    name: group.name,
                    count: connCount,
                  })
                : t('common.confirmDeleteGroupContent', { name: group.name }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            transitionName: '',
            maskTransitionName: '',
            onOk: () => callbacks.onDeleteGroup(group.id),
          });
        }
      },
    }),
    [groupedConnections, callbacks, dialogSetters]
  );

  const getDatabaseMenu = useCallback(
    (connId: string, dbName: string): MenuProps => ({
      items: [
        { key: 'new-query', label: t('common.sqlEditor.newQuery'), icon: <PlayCircleOutlined /> },
        { type: 'divider' },
        { key: 'refresh-db', label: t('common.refreshDatabase'), icon: <ReloadOutlined /> },
        { key: 'close-db', label: t('common.closeDatabase'), icon: <DisconnectOutlined /> },
        { type: 'divider' },
        { key: 'dump-structure', label: t('common.dumpSqlStructure'), disabled: true },
        { key: 'dump-full', label: t('common.dumpSqlStructureAndData'), disabled: true },
        { type: 'divider' },
        { key: 'backup-db', label: t('common.backupDatabaseMenu') },
        { key: 'restore-db', label: t('common.restoreDatabaseMenu') },
        { key: 'user-management', label: t('common.userPrivileges') },
        { key: 'schema-compare', label: t('common.schemaCompare') },
        { key: 'process-list', label: t('common.processList.title'), icon: <DashboardOutlined /> },
        { key: 'server-status', label: t('common.serverStatus.title'), icon: <CloudServerOutlined /> },
        { type: 'divider' },
        { key: 'run-sql-file', label: t('common.runSqlFile') },
        { type: 'divider' },
        { key: 'db-properties', label: t('common.databasePropertiesMenu') },
      ],
      onClick: ({ key }) => {
        if (key === 'new-query') {
          callbacks.onNewQuery(connId);
        } else if (key === 'refresh-db') {
          callbacks.onDatabaseRefresh?.(connId, dbName);
        } else if (key === 'close-db') {
          if (closingDbModalRef.current) return;
          closingDbModalRef.current = true;
          Modal.confirm({
            title: t('common.confirmCloseDatabaseTitle'),
            content: t('common.confirmCloseDatabaseContent', { name: dbName }),
            okText: t('common.close'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            transitionName: '',
            maskTransitionName: '',
            onOk: () => {
              closingDbModalRef.current = false;
              callbacks.onDatabaseClose?.(connId, dbName);
            },
            onCancel: () => {
              closingDbModalRef.current = false;
            },
          });
        } else if (key === 'backup-db') {
          dialogSetters.setBackupRestoreTarget({ connId, database: dbName });
          dialogSetters.setBackupRestoreMode('backup');
          dialogSetters.setBackupRestoreOpen(true);
        } else if (key === 'restore-db') {
          dialogSetters.setBackupRestoreTarget({ connId, database: dbName });
          dialogSetters.setBackupRestoreMode('restore');
          dialogSetters.setBackupRestoreOpen(true);
        } else if (key === 'user-management') {
          dialogSetters.setUserManagementTarget({ connId, database: dbName });
          dialogSetters.setUserManagementOpen(true);
        } else if (key === 'schema-compare') {
          dialogSetters.setSchemaCompareOpen(true);
        } else if (key === 'process-list') {
          dialogSetters.setProcessListTarget({ connId, database: dbName });
          dialogSetters.setProcessListOpen(true);
        } else if (key === 'server-status') {
          dialogSetters.setServerStatusTarget({ connId });
          dialogSetters.setServerStatusOpen(true);
        } else if (key === 'run-sql-file') {
          dialogSetters.setRunSqlTarget({ connId, database: dbName });
          dialogSetters.setRunSqlDialogOpen(true);
        } else if (key === 'db-properties') {
          callbacks.onDatabaseProperties?.(connId, dbName);
        }
      },
    }),
    [callbacks, dialogSetters]
  );

  const getSchemaMenu = useCallback(
    (connId: string, database: string, schemaName: string): MenuProps => ({
      items: [
        { key: 'new-query', label: t('common.sqlEditor.newQuery'), icon: <PlayCircleOutlined /> },
        { type: 'divider' },
        { key: 'refresh-schema', label: t('common.refresh'), icon: <ReloadOutlined /> },
        { type: 'divider' },
        { key: 'create-schema', label: t('common.createSchema'), icon: <PlusOutlined /> },
        { key: 'drop-schema', label: t('common.dropSchema'), icon: <DeleteOutlined />, danger: true },
      ],
      onClick: ({ key: action }) => {
        if (action === 'new-query') {
          callbacks.onNewQuery(connId);
        } else if (action === 'refresh-schema') {
          callbacks.onDatabaseRefresh?.(connId, database);
        } else if (action === 'create-schema') {
          let inputVal = '';
          Modal.confirm({
            title: t('common.createSchemaTitle'),
            content: (
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{t('common.schemaName')}</label>
                <input
                  autoFocus
                  placeholder={t('common.pleaseEnterSchemaName')}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: 'var(--background)',
                    color: 'var(--text)',
                  }}
                  onChange={(e) => { inputVal = e.target.value; }}
                />
              </div>
            ),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            transitionName: '',
            maskTransitionName: '',
            onOk: async () => {
              if (!inputVal.trim()) return;
              try {
                await api.createSchema(connId, database, inputVal.trim());
                message.success(t('common.schemaCreated', { name: inputVal.trim() }));
                callbacks.onDatabaseRefresh?.(connId, database);
              } catch (err: unknown) {
                message.error(t('common.createSchemaFailed') + ': ' + getErrorMessage(err));
              }
            },
          });
        } else if (action === 'drop-schema') {
          Modal.confirm({
            title: t('common.confirmDropSchemaTitle'),
            content: t('common.confirmDropSchemaContent', { name: schemaName }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            transitionName: '',
            maskTransitionName: '',
            onOk: async () => {
              try {
                await api.dropSchema(connId, database, schemaName);
                message.success(t('common.schemaDropped', { name: schemaName }));
                callbacks.onDatabaseRefresh?.(connId, database);
              } catch (err: unknown) {
                message.error(t('common.dropSchemaFailed') + ': ' + getErrorMessage(err));
              }
            },
          });
        }
      },
    }),
    [callbacks, t, message]
  );

  const getTableMenu = useCallback(
    (connId: string, tableName: string, database?: string): MenuProps => ({
      items: [
        { key: 'open-table', label: t('common.openTableBrowse') },
        { key: 'design-table', label: t('common.designTable') },
        { type: 'divider' },
        { key: 'copy-table', label: t('common.copyTableStructure') },
        { key: 'copy-table-data', label: t('common.copyTableStructureAndData') },
        { type: 'divider' },
        { key: 'truncate-table', label: t('common.clearTable'), danger: true },
        { key: 'drop-table', label: t('common.dropTable'), danger: true },
        { type: 'divider' },
        {
          key: 'table-maintenance',
          label: t('common.tableMaintenance'),
          children: [
            { key: 'optimize-table', label: t('common.optimizeTable') },
            { key: 'analyze-table', label: t('common.analyzeTable') },
            { key: 'repair-table', label: t('common.repairTable') },
          ],
        },
        { type: 'divider' },
        { key: 'dump-table', label: t('common.dumpSqlFile') },
        { key: 'import-csv', label: t('common.importDataMenu') },
        { key: 'export-csv', label: t('common.exportCsvMenu'), disabled: true },
        { type: 'divider' },
        { key: 'table-properties', label: t('common.mainLayout.tableProperties') },
      ],
      onClick: async ({ key }) => {
        if (key === 'table-properties') {
          dialogSetters.setPropertiesType('table');
          dialogSetters.setPropertiesTarget({ connId, name: tableName, database });
          dialogSetters.setPropertiesOpen(true);
        } else if (key === 'open-table') {
          callbacks.onTableOpen(tableName, database);
        } else if (key === 'design-table') {
          callbacks.onOpenDesigner?.(tableName, database);
        } else if (key === 'copy-table' || key === 'copy-table-data') {
          dialogSetters.setCopyTarget({ tableName, database, connId });
          dialogSetters.setCopyDialogOpen(true);
        } else if (key === 'dump-table') {
          dialogSetters.setDumpTarget({ tableName, database, connId });
          dialogSetters.setDumpDialogOpen(true);
        } else if (key === 'import-csv') {
          callbacks.onTableOpen(tableName, database);
        } else if (key === 'truncate-table') {
          Modal.confirm({
            title: t('common.confirmClearTableTitle'),
            content: t('common.confirmClearTableContent', { name: tableName }),
            okText: t('common.clearLabel'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            transitionName: '',
            maskTransitionName: '',
            onOk: async () => {
              try {
                await api.truncateTable(connId, tableName, database);
                message.success(t('common.tableTruncated', { name: tableName }));
                callbacks.onDatabaseRefresh?.(connId, database || '');
              } catch (err: unknown) {
                message.error(t('common.truncateTableFailed') + ': ' + getErrorMessage(err));
              }
            },
          });
        } else if (key === 'drop-table') {
          Modal.confirm({
            title: t('common.confirmDeleteTableTitle'),
            content: t('common.confirmDeleteTableContent', { name: tableName }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            transitionName: '',
            maskTransitionName: '',
            onOk: async () => {
              try {
                await api.dropTable(connId, tableName, database);
                message.success(t('common.tableDeleted', { name: tableName }));
                callbacks.onDatabaseRefresh?.(connId, database || '');
              } catch (err: unknown) {
                message.error(t('common.deleteTableFailed') + ': ' + getErrorMessage(err));
              }
            },
          });
        } else if (key === 'optimize-table') {
          try {
            await api.maintainTable(connId, tableName, 'optimize', database);
            message.success(t('common.tableOptimized', { name: tableName }));
          } catch (err: unknown) {
            message.error(t('common.optimizeTableFailed') + ': ' + getErrorMessage(err));
          }
        } else if (key === 'analyze-table') {
          try {
            await api.maintainTable(connId, tableName, 'analyze', database);
            message.success(t('common.tableAnalyzed', { name: tableName }));
          } catch (err: unknown) {
            message.error(t('common.analyzeTableFailed') + ': ' + getErrorMessage(err));
          }
        } else if (key === 'repair-table') {
          try {
            await api.maintainTable(connId, tableName, 'repair', database);
            message.success(t('common.tableRepaired', { name: tableName }));
          } catch (err: unknown) {
            message.error(t('common.repairTableFailed') + ': ' + getErrorMessage(err));
          }
        }
      },
    }),
    [callbacks, dialogSetters]
  );

  const getViewMenu = useCallback(
    (connId: string, viewName: string, database?: string): MenuProps => ({
      items: [
        { key: 'open-view', label: t('common.openViewBrowse') },
        { key: 'design-view', label: t('common.designView') },
        { type: 'divider' },
        { key: 'rename-view', label: t('common.renameView'), disabled: true },
        { key: 'drop-view', label: t('common.dropView'), danger: true },
        { type: 'divider' },
        { key: 'view-dependencies', label: t('common.viewDependencies'), disabled: true },
        { key: 'view-properties', label: t('common.viewProperties') },
      ],
      onClick: async ({ key }) => {
        if (key === 'view-properties') {
          dialogSetters.setPropertiesType('view');
          dialogSetters.setPropertiesTarget({ connId, name: viewName, database });
          dialogSetters.setPropertiesLoading(true);
          dialogSetters.setPropertiesOpen(true);
          try {
            const ddl = await api.getTableDDL(connId, viewName, database);
            dialogSetters.setPropertiesContent(Array.isArray(ddl) ? ddl.join('\n') : ddl);
          } catch (err: unknown) {
            dialogSetters.setPropertiesContent(t('common.loadFailed') + ': ' + getErrorMessage(err));
          } finally {
            dialogSetters.setPropertiesLoading(false);
          }
        } else if (key === 'open-view') {
          callbacks.onViewOpen?.(viewName, database);
        } else if (key === 'design-view') {
          callbacks.onOpenViewDefinition?.(viewName, database);
        } else if (key === 'drop-view') {
          Modal.confirm({
            title: t('common.confirmDeleteViewTitle'),
            content: t('common.confirmDeleteViewContent', { name: viewName }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            transitionName: '',
            maskTransitionName: '',
            onOk: async () => {
              try {
                await api.dropView(connId, viewName, database);
                message.success(t('common.viewDeleted', { name: viewName }));
                callbacks.onDatabaseRefresh?.(connId, database || '');
              } catch (err: unknown) {
                message.error(t('common.deleteViewFailed') + ': ' + getErrorMessage(err));
              }
            },
          });
        }
      },
    }),
    [callbacks, dialogSetters]
  );

  const getProcedureMenu = useCallback(
    (connId: string, procedureName: string, database?: string): MenuProps => ({
      items: [
        {
          key: 'procedure-properties',
          label: t('common.procedureProperties'),
        },
      ],
      onClick: async ({ key }) => {
        if (key === 'procedure-properties') {
          dialogSetters.setPropertiesType('procedure');
          dialogSetters.setPropertiesTarget({ connId, name: procedureName, database });
          dialogSetters.setPropertiesLoading(true);
          dialogSetters.setPropertiesOpen(true);
          try {
            const body = await api.getProcedureBody(connId, procedureName, database);
            dialogSetters.setPropertiesContent(body);
          } catch (err: unknown) {
            dialogSetters.setPropertiesContent(t('common.loadFailed') + ': ' + getErrorMessage(err));
          } finally {
            dialogSetters.setPropertiesLoading(false);
          }
        }
      },
    }),
    [t, dialogSetters]
  );

  const getFunctionMenu = useCallback(
    (connId: string, functionName: string, database?: string): MenuProps => ({
      items: [
        {
          key: 'function-properties',
          label: t('common.functionProperties'),
        },
      ],
      onClick: async ({ key }) => {
        if (key === 'function-properties') {
          dialogSetters.setPropertiesType('function');
          dialogSetters.setPropertiesTarget({ connId, name: functionName, database });
          dialogSetters.setPropertiesLoading(true);
          dialogSetters.setPropertiesOpen(true);
          try {
            const body = await api.getFunctionBody(connId, functionName, database);
            dialogSetters.setPropertiesContent(body);
          } catch (err: unknown) {
            dialogSetters.setPropertiesContent(t('common.loadFailed') + ': ' + getErrorMessage(err));
          } finally {
            dialogSetters.setPropertiesLoading(false);
          }
        }
      },
    }),
    [t, dialogSetters]
  );

  const getTriggerMenu = useCallback(
    (connId: string, trigger: import('../../../types/api').TriggerInfo, database?: string): MenuProps => ({
      items: [
        {
          key: 'trigger-properties',
          label: t('common.triggerProperties'),
        },
      ],
      onClick: ({ key }) => {
        if (key === 'trigger-properties') {
          dialogSetters.setPropertiesType('trigger');
          dialogSetters.setPropertiesTarget({ connId, name: trigger.name, database, data: trigger });
          dialogSetters.setPropertiesOpen(true);
        }
      },
    }),
    [t, dialogSetters]
  );

  return {
    getConnectionMenu,
    getGroupMenu,
    getDatabaseMenu,
    getSchemaMenu,
    getTableMenu,
    getViewMenu,
    getProcedureMenu,
    getFunctionMenu,
    getTriggerMenu,
  };
}
