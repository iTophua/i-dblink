import React, {
  useRef,
  useCallback,
  useState,
  useMemo,
  useEffect,
  ChangeEvent,
  MouseEvent,
} from 'react';
import { Tree, Spin, Dropdown, Badge, Modal, App, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  DatabaseOutlined,
  TableOutlined,
  EyeOutlined,
  LinkOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  DisconnectOutlined,
  CopyOutlined,
  FolderOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  FunctionOutlined,
  MinusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { Connection, ConnectionGroup } from '../../stores/appStore';
import type { TableInfo } from '../../types/api';
import { GroupDialog } from './GroupDialog';
import { EnhancedEmptyState } from '../LoadingStates';
import { GlobalInput } from '../GlobalInput';
import { DatabaseIcon } from '../DatabaseIcon';
import { CopyTableDialog } from '../CopyTableDialog';
import { DumpDialog } from '../DumpDialog';
import { RunSqlFileDialog } from '../RunSqlFileDialog';
import { BackupRestoreDialog } from '../BackupRestoreDialog';
import { UserManagementDialog } from '../UserManagementDialog';
import { SchemaCompareDialog } from '../SchemaCompareDialog';
import { CreateDatabaseDialog } from './CreateDatabaseDialog';
import { api } from '../../api';

const isBaseTable = (tableType: string): boolean => {
  const normalizedType = (tableType || '').toUpperCase().trim();
  if (!normalizedType || normalizedType === 'NULL') return false;
  return (
    normalizedType === 'BASE TABLE' ||
    normalizedType === 'TABLE' ||
    normalizedType === 'BASE_TABLE' ||
    normalizedType === 'SYSTEM TABLE' ||
    normalizedType === 'SYSTEM TABLES' ||
    normalizedType === 'LOCAL TEMPORARY' ||
    normalizedType === 'GLOBAL TEMPORARY' ||
    normalizedType === 'TEMPORARY'
  );
};

const isView = (tableType: string): boolean => {
  const normalizedType = (tableType || '').toUpperCase().trim();
  if (!normalizedType) return false;
  return (
    normalizedType === 'VIEW' ||
    normalizedType === 'SYSTEM VIEW' ||
    normalizedType === 'SYSTEM VIEWS' ||
    normalizedType === 'MATERIALIZED VIEW' ||
    normalizedType === 'MATERIALIZED_VIEW'
  );
};

const TABLE_NODE_STYLE = {
  cursor: 'pointer',
  padding: '1px 4px',
  borderRadius: 3,
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  gap: 4,
  transition: 'all 0.2s ease',
};

interface QuickActionButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick: (e: React.MouseEvent) => void;
  visible: boolean;
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  icon,
  tooltip,
  onClick,
  visible,
}) => {
  if (!visible) return null;

  return (
    <Tooltip title={tooltip} placement="right">
      <span
        onClick={onClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 11,
          background: 'var(--background-hover)',
          color: 'var(--text-secondary)',
          transition: 'all 0.2s ease',
          marginLeft: 4,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--border-color)';
          e.currentTarget.style.color = 'var(--color-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--background-hover)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
      >
        {icon}
      </span>
    </Tooltip>
  );
};

interface TableNodeProps {
  connId: string;
  database: string;
  table: TableInfo;
  selectedTableId: string | null;
  onTableClick: (tableName: string, database: string) => void;
  onTableOpen: (tableName: string, database: string) => void;
  onContextMenu: (connId: string, tableName: string, database?: string) => MenuProps;
  onNewQuery: (connId: string) => void;
}

const TableNode = React.memo<TableNodeProps>(
  ({
    connId,
    database,
    table,
    selectedTableId,
    onTableClick,
    onTableOpen,
    onContextMenu,
    onNewQuery,
  }) => {
    const { t } = useTranslation();
    const [hovered, setHovered] = useState(false);
    const isSelected = selectedTableId === table.table_name;
    const backgroundColor = isSelected
      ? 'var(--row-selected-bg)'
      : hovered
        ? 'var(--row-hover-bg)'
        : 'transparent';

    const formatRowCount = (count: number): string => {
      if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
      if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
      if (count >= 10_000) return `${(count / 1_000).toFixed(0)}K`;
      if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
      return String(count);
    };

    return (
      <Dropdown menu={onContextMenu(connId, table.table_name, database)} trigger={['contextMenu']}>
        <span
          style={{
            ...TABLE_NODE_STYLE,
            background: backgroundColor,
            border: isSelected ? '1px solid var(--row-selected-bg)' : '1px solid transparent',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={(e) => {
            e.stopPropagation();
            onTableClick(table.table_name, database);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onTableOpen(table.table_name, database);
          }}
          data-testid={`table-node-${table.table_name}`}
        >
          <TableOutlined style={{ color: 'var(--color-success)', fontSize: 11 }} />
          <span style={{ fontSize: 12 }}>{table.table_name}</span>
          {table.row_count !== undefined && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>
              ({formatRowCount(table.row_count)})
            </span>
          )}
          {hovered && (
            <>
              <QuickActionButton
                icon={<PlayCircleOutlined />}
                tooltip={t('common.newQueryTooltip')}
                visible={hovered}
                onClick={(e) => {
                  e.stopPropagation();
                  onNewQuery(connId);
                }}
              />
              <QuickActionButton
                icon={<SwapOutlined style={{ fontSize: 10 }} />}
                tooltip={t('common.viewDataTooltip')}
                visible={hovered}
                onClick={(e) => {
                  e.stopPropagation();
                  onTableOpen(table.table_name, database);
                }}
              />
            </>
          )}
        </span>
      </Dropdown>
    );
  }
);

interface ViewNodeProps {
  connId: string;
  database: string;
  view: TableInfo;
  selectedTableId: string | null;
  onTableClick: (tableName: string, database: string) => void;
  onTableOpen: (tableName: string, database: string) => void;
  onViewOpen?: (viewName: string, database: string) => void;
  onContextMenu: (connId: string, tableName: string, database?: string) => MenuProps;
  onNewQuery: (connId: string) => void;
}

const ViewNode = React.memo<ViewNodeProps>(
  ({
    connId,
    database,
    view,
    selectedTableId,
    onTableClick,
    onTableOpen,
    onViewOpen,
    onContextMenu,
    onNewQuery,
  }) => {
    const { t } = useTranslation();
    const [hovered, setHovered] = useState(false);
    const isSelected = selectedTableId === view.table_name;
    const backgroundColor = isSelected
      ? 'var(--row-selected-bg)'
      : hovered
        ? 'var(--row-hover-bg)'
        : 'transparent';

    return (
      <Dropdown menu={onContextMenu(connId, view.table_name, database)} trigger={['contextMenu']}>
        <span
          style={{
            ...TABLE_NODE_STYLE,
            background: backgroundColor,
            border: isSelected ? '1px solid var(--row-selected-bg)' : '1px solid transparent',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={(e) => {
            e.stopPropagation();
            onTableClick(view.table_name, database);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (onViewOpen) {
              onViewOpen(view.table_name, database);
            } else {
              onTableOpen(view.table_name, database);
            }
          }}
          data-testid={`view-node-${view.table_name}`}
        >
          <EyeOutlined style={{ color: 'var(--color-primary)', fontSize: 11 }} />
          <span style={{ fontSize: 12 }}>{view.table_name}</span>
          {view.row_count !== undefined && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>
              (
              {view.row_count >= 1_000_000_000
                ? `${(view.row_count / 1_000_000_000).toFixed(1)}B`
                : view.row_count >= 1_000_000
                  ? `${(view.row_count / 1_000_000).toFixed(1)}M`
                  : view.row_count >= 10_000
                    ? `${(view.row_count / 1_000).toFixed(0)}K`
                    : view.row_count >= 1_000
                      ? `${(view.row_count / 1_000).toFixed(1)}K`
                      : String(view.row_count)}
              )
            </span>
          )}
          {hovered && (
            <QuickActionButton
              icon={<PlayCircleOutlined />}
              tooltip={t('common.newQueryTooltip')}
              visible={hovered}
              onClick={(e) => {
                e.stopPropagation();
                onNewQuery(connId);
              }}
            />
          )}
        </span>
      </Dropdown>
    );
  }
);

type ConnectionTreeProps = {
  connections: Connection[];
  groups: ConnectionGroup[];
  selectedId: string | null;
  selectedTableId: string | null;
  onSelect: (id: string | null) => void;
  onTableSelect: (table: string | null, database?: string) => void;
  onObjectTypeSelect?: (objectType: 'table' | 'view' | 'all', database?: string) => void;
  onTableOpen: (tableName: string, database?: string) => void;
  onViewOpen?: (viewName: string, database?: string) => void;
  onOpenDesigner?: (tableName: string, database?: string) => void;
  onOpenViewDefinition?: (viewName: string, database?: string) => void;
  onExpand: (connectionId: string, expanded: boolean) => void;
  collapsed: boolean;
  searchText: string;
  expandedKeys: string[];
  onExpandKeys: (keys: string[]) => void;
  connectionDatabases: Record<
    string,
    {
      database: string;
      tables: TableInfo[];
      loaded: boolean;
      loadFailed?: boolean;
      procedures?: string[];
      functions?: string[];
      triggers?: import('../../types/api').TriggerInfo[];
      routinesLoaded?: boolean;
    }[]
  >;
  isLoading: boolean;
  onConnect: (connectionId: string) => Promise<void> | void;
  onDisconnect: (connectionId: string) => void;
  onEditConnection: (connection: Connection) => void;
  onDeleteConnection: (connectionId: string) => void;
  onNewQuery: (connectionId: string) => void;
  onOpenRoutine?: (
    connectionId: string,
    database: string,
    name: string,
    type: 'procedure' | 'function'
  ) => void;
  onOpenTrigger?: (connectionId: string, database: string, name: string) => void;
  onDatabaseExpand: (connectionId: string, database: string) => void;
  onDatabaseRefresh?: (connectionId: string, database: string) => void;
  onDatabaseClose?: (connectionId: string, database: string) => void;
  onDatabaseProperties?: (connectionId: string, databaseName: string) => void;
  onBackupRestore?: (connectionId: string, database: string, mode: 'backup' | 'restore') => void;
  onLoadDatabases?: (connectionId: string) => void;
  onTableExpand: (connectionId: string, database: string, tableName: string) => void;
  onSaveConnection: (data: any) => Promise<void>;
  onSaveGroup: (data: {
    id?: string;
    name: string;
    icon: string;
    color: string;
    parent_id?: string;
  }) => void;
  onDeleteGroup: (id: string) => void;
  onCreateConnection?: () => void;
};

function getDbIcon(dbType: string) {
  return <DatabaseIcon type={dbType} size={16} />;
}

function getConnIcon(dbType: string) {
  return <DatabaseIcon type={dbType} size={16} />;
}

export function EnhancedConnectionTree({
  connections,
  groups,
  selectedId,
  selectedTableId,
  onSelect,
  onTableSelect,
  onObjectTypeSelect,
  onTableOpen,
  onViewOpen,
  onOpenDesigner,
  onOpenViewDefinition,
  onExpand,
  collapsed,
  searchText,
  expandedKeys,
  onExpandKeys,
  connectionDatabases,
  isLoading,
  onConnect,
  onDisconnect,
  onEditConnection,
  onDeleteConnection,
  onNewQuery,
  onOpenRoutine,
  onOpenTrigger,
  onDatabaseExpand,
  onDatabaseRefresh,
  onDatabaseClose,
  onDatabaseProperties,
  onBackupRestore,
  onLoadDatabases,
  onTableExpand,
  onSaveConnection,
  onSaveGroup,
  onDeleteGroup,
  onCreateConnection,
}: ConnectionTreeProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ConnectionGroup | null>(null);
  const [parentGroupId, setParentGroupId] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState<{
    tableName: string;
    database?: string;
    connId: string;
  } | null>(null);
  const [dumpDialogOpen, setDumpDialogOpen] = useState(false);
  const [dumpTarget, setDumpTarget] = useState<{
    tableName: string;
    database?: string;
    connId: string;
  } | null>(null);
  const [runSqlDialogOpen, setRunSqlDialogOpen] = useState(false);
  const [runSqlTarget, setRunSqlTarget] = useState<{ connId: string; database?: string } | null>(
    null
  );
  const [backupRestoreOpen, setBackupRestoreOpen] = useState(false);
  const [backupRestoreMode, setBackupRestoreMode] = useState<'backup' | 'restore'>('backup');
  const [backupRestoreTarget, setBackupRestoreTarget] = useState<{
    connId: string;
    database: string;
  } | null>(null);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [userManagementTarget, setUserManagementTarget] = useState<{
    connId: string;
    database?: string;
  } | null>(null);
  const [createDatabaseOpen, setCreateDatabaseOpen] = useState(false);
  const [createDatabaseTarget, setCreateDatabaseTarget] = useState<{
    connId: string;
    dbType?: string;
  } | null>(null);
  const [schemaCompareOpen, setSchemaCompareOpen] = useState(false);
  const prevTableCountsRef = useRef<Map<string, number>>(new Map());
  const connectionDatabasesRef = useRef(connectionDatabases);
  const closingDbModalRef = useRef(false);
  const expandedKeysRef = useRef(expandedKeys);

  useEffect(() => {
    connectionDatabasesRef.current = connectionDatabases;
  }, [connectionDatabases]);

  useEffect(() => {
    expandedKeysRef.current = expandedKeys;
  }, [expandedKeys]);

  useEffect(() => {
    const currentTableCounts = new Map<string, number>();
    Object.entries(connectionDatabases).forEach(([connId, dbs]) => {
      dbs.forEach((db) => {
        if (db.loaded) {
          // 使用与表过滤相同的逻辑计算表数量，保持一致性
          const tableCount = db.tables.filter((t) => isBaseTable(t.table_type)).length;
          currentTableCounts.set(`${connId}::${db.database}`, tableCount);
        }
      });
    });
    prevTableCountsRef.current = currentTableCounts;
  }, [connectionDatabases]);

  const groupedConnections = useMemo(() => {
    const map: Record<string, Connection[]> = {};
    connections.forEach((conn) => {
      const groupId = conn.group_id || 'ungrouped';
      if (!map[groupId]) map[groupId] = [];
      map[groupId].push(conn);
    });
    return map;
  }, [connections]);

  const filteredConnections = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter(
      (conn) => conn.name.toLowerCase().includes(q) || conn.host.toLowerCase().includes(q)
    );
  }, [connections, searchText]);

  const handleCopyConnection = useCallback(
    async (conn: Connection) => {
      try {
        const copyData = {
          id: null,
          name: `${conn.name} (${t('common.copySuffix')})`,
          db_type: conn.db_type,
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: '',
          database: conn.database,
          group_id: conn.group_id,
        };
        await onSaveConnection(copyData);
        message.success(t('common.connectionConfigCopied'));
      } catch (error: any) {
        message.error(t('common.copyConnectionFailed') + ': ' + (error.message || error));
      }
    },
    [onSaveConnection]
  );

  const handleMoveConnection = useCallback(
    async (connectionId: string, targetGroupId: string) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;
      try {
        await onSaveConnection({
          ...conn,
          id: conn.id,
          group_id: targetGroupId === 'default' ? null : targetGroupId,
        });
        const group = groups.find((g) => g.id === targetGroupId);
        message.success(t('common.movedToGroup', { name: group?.name || t('common.ungrouped') }));
      } catch (error: any) {
        message.error(t('common.moveFailed') + ': ' + (error.message || error));
      }
    },
    [connections, groups, onSaveConnection]
  );

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
          await onConnect(conn.id);
        } else if (key === 'disconnect') {
          Modal.confirm({
            title: t('common.confirmDisconnect'),
            content: t('common.confirmDisconnectContent', { name: conn.name }),
            okText: t('common.disconnectLabel'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => onDisconnect(conn.id),
          });
        } else if (key === 'refresh') {
          onExpandKeys(expandedKeys.filter((k) => !k.startsWith(`db::${conn.id}::`)));
          onExpand(conn.id, true);
        } else if (key === 'edit') {
          onEditConnection(conn);
        } else if (key === 'delete') {
          Modal.confirm({
            title: t('common.confirmDeleteConnectionTitle'),
            content: t('common.confirmDeleteConnectionContent', { name: conn.name }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => onDeleteConnection(conn.id),
          });
        } else if (key === 'new-query') {
          onNewQuery(conn.id);
        } else if (key === 'create-database') {
          const connInfo = connections.find((c) => c.id === conn.id);
          setCreateDatabaseTarget({
            connId: conn.id,
            dbType: connInfo?.db_type,
          });
          setCreateDatabaseOpen(true);
        } else if (key === 'copy') {
          handleCopyConnection(conn);
        } else if (key === 'new-group') {
          setEditingGroup(null);
          setParentGroupId(null);
          setGroupDialogOpen(true);
        } else if (key.startsWith('move-to-')) {
          const targetGroupId = key.replace('move-to-', '');
          handleMoveConnection(conn.id, targetGroupId);
        }
      },
    }),
    [
      groups,
      expandedKeys,
      onConnect,
      onDisconnect,
      onExpand,
      onEditConnection,
      onDeleteConnection,
      onNewQuery,
      onExpandKeys,
      setGroupDialogOpen,
      setEditingGroup,
      setParentGroupId,
      handleCopyConnection,
      handleMoveConnection,
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
        {
          key: 'delete',
          label: t('common.mainLayout.deleteGroup'),
          icon: <DeleteOutlined />,
          danger: true,
          disabled: group.id === 'default',
        },
      ],
      onClick: ({ key }) => {
        if (key === 'new-connection') {
          onEditConnection({
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
          setEditingGroup(null);
          setParentGroupId(group.id);
          setGroupDialogOpen(true);
        } else if (key === 'rename') {
          setRenamingKey(`group-${group.id}`);
          setRenameValue(group.name);
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
            onOk: () => onDeleteGroup(group.id),
          });
        }
      },
    }),
    [groupedConnections, onEditConnection, onDeleteGroup]
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
        { type: 'divider' },
        { key: 'run-sql-file', label: t('common.runSqlFile') },
        { type: 'divider' },
        { key: 'db-properties', label: t('common.databasePropertiesMenu') },
      ],
      onClick: ({ key }) => {
        if (key === 'new-query') {
          onNewQuery(connId);
        } else if (key === 'refresh-db') {
          onDatabaseRefresh?.(connId, dbName);
        } else if (key === 'close-db') {
          if (closingDbModalRef.current) return;
          closingDbModalRef.current = true;
          Modal.confirm({
            title: t('common.confirmCloseDatabaseTitle'),
            content: t('common.confirmCloseDatabaseContent', { name: dbName }),
            okText: t('common.close'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
              closingDbModalRef.current = false;
              onDatabaseClose?.(connId, dbName);
            },
            onCancel: () => {
              closingDbModalRef.current = false;
            },
          });
        } else if (key === 'backup-db') {
          setBackupRestoreTarget({ connId, database: dbName });
          setBackupRestoreMode('backup');
          setBackupRestoreOpen(true);
        } else if (key === 'restore-db') {
          setBackupRestoreTarget({ connId, database: dbName });
          setBackupRestoreMode('restore');
          setBackupRestoreOpen(true);
        } else if (key === 'user-management') {
          setUserManagementTarget({ connId, database: dbName });
          setUserManagementOpen(true);
        } else if (key === 'schema-compare') {
          setSchemaCompareOpen(true);
        } else if (key === 'run-sql-file') {
          setRunSqlTarget({ connId, database: dbName });
          setRunSqlDialogOpen(true);
        } else if (key === 'db-properties') {
          onDatabaseProperties?.(connId, dbName);
        }
      },
    }),
    [onNewQuery, onDatabaseRefresh, onDatabaseClose, onDatabaseProperties]
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
      ],
      onClick: async ({ key }) => {
        if (key === 'open-table') {
          onTableOpen(tableName, database);
        } else if (key === 'design-table') {
          onOpenDesigner?.(tableName, database);
        } else if (key === 'copy-table' || key === 'copy-table-data') {
          setCopyTarget({ tableName, database, connId });
          setCopyDialogOpen(true);
        } else if (key === 'dump-table') {
          setDumpTarget({ tableName, database, connId });
          setDumpDialogOpen(true);
        } else if (key === 'import-csv') {
          onTableOpen(tableName, database);
        } else if (key === 'truncate-table') {
          Modal.confirm({
            title: t('common.confirmClearTableTitle'),
            content: t('common.confirmClearTableContent', { name: tableName }),
            okText: t('common.clearLabel'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: async () => {
              try {
                await api.truncateTable(connId, tableName, database);
                message.success(t('common.tableTruncated', { name: tableName }));
                onDatabaseRefresh?.(connId, database || '');
              } catch (err: any) {
                message.error(t('common.truncateTableFailed') + ': ' + err.message);
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
            onOk: async () => {
              try {
                await api.dropTable(connId, tableName, database);
                message.success(t('common.tableDeleted', { name: tableName }));
                onDatabaseRefresh?.(connId, database || '');
              } catch (err: any) {
                message.error(t('common.deleteTableFailed') + ': ' + err.message);
              }
            },
          });
        } else if (key === 'optimize-table') {
          try {
            await api.maintainTable(connId, tableName, 'optimize', database);
            message.success(t('common.tableOptimized', { name: tableName }));
          } catch (err: any) {
            message.error(t('common.optimizeTableFailed') + ': ' + err.message);
          }
        } else if (key === 'analyze-table') {
          try {
            await api.maintainTable(connId, tableName, 'analyze', database);
            message.success(t('common.tableAnalyzed', { name: tableName }));
          } catch (err: any) {
            message.error(t('common.analyzeTableFailed') + ': ' + err.message);
          }
        } else if (key === 'repair-table') {
          try {
            await api.maintainTable(connId, tableName, 'repair', database);
            message.success(t('common.tableRepaired', { name: tableName }));
          } catch (err: any) {
            message.error(t('common.repairTableFailed') + ': ' + err.message);
          }
        }
      },
    }),
    [onTableOpen, onOpenDesigner, onDatabaseRefresh]
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
        { key: 'view-properties', label: t('common.viewProperties'), disabled: true },
      ],
      onClick: async ({ key }) => {
        if (key === 'open-view') {
          onViewOpen?.(viewName, database);
        } else if (key === 'design-view') {
          onOpenViewDefinition?.(viewName, database);
        } else if (key === 'drop-view') {
          Modal.confirm({
            title: t('common.confirmDeleteViewTitle'),
            content: t('common.confirmDeleteViewContent', { name: viewName }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: async () => {
              try {
                await api.dropView(connId, viewName, database);
                message.success(t('common.viewDeleted', { name: viewName }));
                onDatabaseRefresh?.(connId, database || '');
              } catch (err: any) {
                message.error(t('common.deleteViewFailed') + ': ' + err.message);
              }
            },
          });
        }
      },
    }),
    [onTableOpen, onOpenDesigner, onOpenViewDefinition, onDatabaseRefresh]
  );

  const handleGroupSave = useCallback(
    async (data: {
      id?: string;
      name: string;
      icon: string;
      color: string;
      parent_id?: string;
    }) => {
      onSaveGroup(data);
      setGroupDialogOpen(false);
      setEditingGroup(null);
      setParentGroupId(null);
    },
    [onSaveGroup]
  );

  const handleRenameCommit = useCallback(
    async (groupId: string) => {
      if (!renameValue.trim()) {
        setRenamingKey(null);
        return;
      }
      const group = groups.find((g) => g.id === groupId);
      if (group && group.name !== renameValue.trim()) {
        onSaveGroup({
          id: groupId,
          name: renameValue.trim(),
          icon: group.icon,
          color: group.color,
        });
      }
      setRenamingKey(null);
    },
    [groups, renameValue, onSaveGroup]
  );

  const handleTableClick = useCallback(
    (tableName: string, database?: string) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        onTableOpen(tableName, database);
      } else {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          onTableSelect(tableName, database);
        }, 250);
      }
    },
    [onTableOpen, onTableSelect]
  );

  const handleDoubleClick = useCallback(
    async (key: string) => {
      if (key.startsWith('table::')) {
        const parts = key.split('::');
        if (parts.length >= 4) {
          const database = parts[2];
          const tableName = parts.slice(3).join('::');
          onTableOpen(tableName, database);
        }
      } else if (key.startsWith('view::')) {
        const parts = key.split('::');
        if (parts.length >= 4) {
          const database = parts[2];
          const viewName = parts.slice(3).join('::');
          if (onViewOpen) {
            onViewOpen(viewName, database);
          } else {
            onTableOpen(viewName, database);
          }
        }
      } else if (key.startsWith('db::')) {
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbKey = `db::${connectionId}::${database}`;

          const isExpanded = expandedKeysRef.current.some((k) => k.startsWith(dbKey));

          if (isExpanded) {
            onExpandKeys(expandedKeysRef.current.filter((k) => !k.startsWith(dbKey)));
          } else {
            const dbList = connectionDatabasesRef.current[connectionId] || [];
            const db = dbList.find((d) => d.database === database);
            if (db?.loadFailed) {
              onExpandKeys([...expandedKeysRef.current, dbKey]);
              return;
            }
            if (!db || !db.loaded || db.tables.length === 0) {
              onDatabaseExpand(connectionId, database);
            }
            onExpandKeys([...expandedKeysRef.current, dbKey]);
          }
        }
      } else if (key.startsWith('tables::') || key.startsWith('views::')) {
        const isExpanded = expandedKeysRef.current.includes(key);
        if (isExpanded) {
          onExpandKeys(expandedKeysRef.current.filter((k) => k !== key));
        } else {
          onExpandKeys([...expandedKeysRef.current, key]);
        }
      } else if (key.startsWith('group-')) {
        const isExpanded = expandedKeysRef.current.includes(key);
        if (isExpanded) {
          onExpandKeys(expandedKeysRef.current.filter((k) => k !== key));
        } else {
          onExpandKeys([...expandedKeysRef.current, key]);
        }
      } else {
        const conn = connections.find((c) => c.id === key);
        if (!conn) return;

        if (conn.status !== 'connected') {
          await onConnect(key);
        } else {
          const isExpanded = expandedKeysRef.current.includes(key);
          if (isExpanded) {
            onExpandKeys(expandedKeysRef.current.filter((k) => k !== key));
          } else {
            onExpandKeys([...expandedKeysRef.current, key]);
          }
        }
      }
    },
    [connections, onExpandKeys, onConnect, onTableOpen, onDatabaseExpand]
  );

  const treeData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const treeNodes = [];

    const matchTables = (tables: TableInfo[]) =>
      !q || tables.some((t) => t.table_name.toLowerCase().includes(q));
    const matchViews = (tables: TableInfo[]) =>
      !q ||
      tables
        .filter((t) => isView(t.table_type))
        .some((v) => v.table_name.toLowerCase().includes(q));

    const buildTableNodes = (
      connId: string,
      db: {
        database: string;
        tables: TableInfo[];
        loaded: boolean;
        loadFailed?: boolean;
        procedures?: string[];
        functions?: string[];
        triggers?: import('../../types/api').TriggerInfo[];
        routinesLoaded?: boolean;
      },
      allTableItems: TableInfo[] | undefined,
      allViewItems: TableInfo[] | undefined,
      isDbExpanded: boolean
    ) => {
      // 当正在加载时（allTableItems 为 undefined），使用空数组
      const tableItems = allTableItems || [];
      const viewItems = allViewItems || [];
      // 标记是否正在加载（db 未 loaded 但 allTableItems 为 undefined）
      const isLoading = !db.loaded && allTableItems === undefined;

      const tablesFolderKey = `tables::${connId}::${db.database}`;
      const viewsFolderKey = `views::${connId}::${db.database}`;
      const isTablesFolderExpanded = expandedKeys.includes(tablesFolderKey);
      const isViewsFolderExpanded = expandedKeys.includes(viewsFolderKey);

      const filteredTables = searchText.trim()
        ? tableItems.filter((t) =>
            t.table_name.toLowerCase().includes(searchText.trim().toLowerCase())
          )
        : tableItems;
      const filteredViews = searchText.trim()
        ? viewItems.filter((v) =>
            v.table_name.toLowerCase().includes(searchText.trim().toLowerCase())
          )
        : viewItems;

      const tablesNode = {
        key: tablesFolderKey,
        title: isLoading ? (
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}
          >
            <Spin size="small" />
            <span>{t('common.tablesLoading')}</span>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <TableOutlined style={{ color: 'var(--color-success)', fontSize: 12 }} />
            <span>{t('common.tables', { count: tableItems.length })}</span>
          </span>
        ),
        isLeaf: false,
        children: !db.loaded
          ? [
              {
                key: `init-tables::${connId}::${db.database}`,
                title: (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {t('common.clickToLoadTables')}
                  </span>
                ),
                isLeaf: true,
                selectable: false,
              },
            ]
          : isTablesFolderExpanded && tableItems.length > 0
            ? filteredTables.map((table) => ({
                key: `table::${connId}::${db.database}::${table.table_name}`,
                isLeaf: true,
                title: (
                  <TableNode
                    connId={connId}
                    database={db.database}
                    table={table}
                    selectedTableId={selectedTableId}
                    onTableClick={handleTableClick}
                    onTableOpen={onTableOpen}
                    onContextMenu={getTableMenu}
                    onNewQuery={onNewQuery}
                  />
                ),
              }))
            : tableItems.length > 0
              ? undefined
              : [
                  {
                    key: `no-tables::${connId}::${db.database}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.noTables')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ],
      };

      const viewsNode = {
        key: viewsFolderKey,
        title: isLoading ? (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--text-tertiary)',
              userSelect: 'none',
            }}
          >
            <Spin size="small" />
            <span>{t('common.viewsLoading')}</span>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
            <EyeOutlined style={{ color: 'var(--color-primary)', fontSize: 12 }} />
            <span>{t('common.views', { count: viewItems.length })}</span>
          </span>
        ),
        isLeaf: false,
        children: !db.loaded
          ? [
              {
                key: `init-views::${connId}::${db.database}`,
                title: (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {t('common.clickToLoadViews')}
                  </span>
                ),
                isLeaf: true,
                selectable: false,
              },
            ]
          : isViewsFolderExpanded && viewItems.length > 0
            ? filteredViews.map((view) => ({
                key: `view::${connId}::${db.database}::${view.table_name}`,
                isLeaf: true,
                title: (
                  <ViewNode
                    connId={connId}
                    database={db.database}
                    view={view}
                    selectedTableId={selectedTableId}
                    onTableClick={handleTableClick}
                    onTableOpen={onTableOpen}
                    onViewOpen={onViewOpen}
                    onContextMenu={getViewMenu}
                    onNewQuery={onNewQuery}
                  />
                ),
              }))
            : viewItems.length > 0
              ? undefined
              : [
                  {
                    key: `no-views::${connId}::${db.database}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.noViews')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ],
      };

      const proceduresFolderKey = `procedures::${connId}::${db.database}`;
      const functionsFolderKey = `functions::${connId}::${db.database}`;
      const isProceduresFolderExpanded = expandedKeys.includes(proceduresFolderKey);
      const isFunctionsFolderExpanded = expandedKeys.includes(functionsFolderKey);

      const proceduresNode = {
        key: proceduresFolderKey,
        title: db.routinesLoaded ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
            <ThunderboltOutlined style={{ color: 'var(--color-warning)', fontSize: 12 }} />
            <span>{t('common.procedures', { count: db.procedures?.length || 0 })}</span>
          </span>
        ) : isDbExpanded ? (
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}
          >
            <Spin size="small" />
            <span>{t('common.proceduresLoading')}</span>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
            <ThunderboltOutlined style={{ color: 'var(--color-warning)', fontSize: 12 }} />
            <span>{t('common.databaseProperties.procedures')}</span>
          </span>
        ),
        isLeaf: false,
        children: !db.routinesLoaded
          ? [
              {
                key: `init-procedures::${connId}::${db.database}`,
                title: (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {t('common.clickToLoadProcedures')}
                  </span>
                ),
                isLeaf: true,
                selectable: false,
              },
            ]
          : db.procedures && db.procedures.length > 0
            ? isProceduresFolderExpanded
              ? db.procedures.map((proc) => ({
                  key: `proc::${connId}::${db.database}::${proc}`,
                  isLeaf: true,
                  title: (
                    <span
                      style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                      onClick={() => onOpenRoutine?.(connId, db.database, proc, 'procedure')}
                    >
                      <ThunderboltOutlined
                        style={{ color: 'var(--color-warning)', fontSize: 11 }}
                      />
                      <span style={{ fontSize: 12 }}>{proc}</span>
                    </span>
                  ),
                }))
              : undefined
            : [
                {
                  key: `no-procedures::${connId}::${db.database}`,
                  title: (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                      {t('common.noProcedures')}
                    </span>
                  ),
                  isLeaf: true,
                  selectable: false,
                },
              ],
      };

      const functionsNode = {
        key: functionsFolderKey,
        title: db.routinesLoaded ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
            <FunctionOutlined style={{ color: 'var(--db-color-dameng)', fontSize: 12 }} />
            <span>{t('common.functions', { count: db.functions?.length || 0 })}</span>
          </span>
        ) : isDbExpanded ? (
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}
          >
            <Spin size="small" />
            <span>{t('common.functionsLoading')}</span>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
            <FunctionOutlined style={{ color: 'var(--db-color-dameng)', fontSize: 12 }} />
            <span>{t('common.databaseProperties.functions')}</span>
          </span>
        ),
        isLeaf: false,
        children: !db.routinesLoaded
          ? [
              {
                key: `init-functions::${connId}::${db.database}`,
                title: (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {t('common.clickToLoadFunctions')}
                  </span>
                ),
                isLeaf: true,
                selectable: false,
              },
            ]
          : db.functions && db.functions.length > 0
            ? isFunctionsFolderExpanded
              ? db.functions.map((func) => ({
                  key: `func::${connId}::${db.database}::${func}`,
                  isLeaf: true,
                  title: (
                    <span
                      style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                      onClick={() => onOpenRoutine?.(connId, db.database, func, 'function')}
                    >
                      <FunctionOutlined style={{ color: 'var(--db-color-dameng)', fontSize: 11 }} />
                      <span style={{ fontSize: 12 }}>{func}</span>
                    </span>
                  ),
                }))
              : undefined
            : [
                {
                  key: `no-functions::${connId}::${db.database}`,
                  title: (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                      {t('common.noFunctions')}
                    </span>
                  ),
                  isLeaf: true,
                  selectable: false,
                },
              ],
      };

      const triggersFolderKey = `triggers::${connId}::${db.database}`;
      const isTriggersFolderExpanded = expandedKeys.includes(triggersFolderKey);

      const triggersNode = {
        key: triggersFolderKey,
        title: db.routinesLoaded ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
            <ThunderboltOutlined style={{ color: 'var(--color-error)', fontSize: 12 }} />
            <span>{t('common.triggers', { count: db.triggers?.length || 0 })}</span>
          </span>
        ) : isDbExpanded ? (
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}
          >
            <Spin size="small" />
            <span>{t('common.triggersLoading')}</span>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
            <ThunderboltOutlined style={{ color: 'var(--color-error)', fontSize: 12 }} />
            <span>{t('common.databaseProperties.triggers')}</span>
          </span>
        ),
        isLeaf: false,
        children: !db.routinesLoaded
          ? [
              {
                key: `init-triggers::${connId}::${db.database}`,
                title: (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {t('common.clickToLoadTriggers')}
                  </span>
                ),
                isLeaf: true,
                selectable: false,
              },
            ]
          : db.triggers && db.triggers.length > 0
            ? isTriggersFolderExpanded
              ? db.triggers.map((trigger) => ({
                  key: `trigger::${connId}::${db.database}::${trigger.name}`,
                  isLeaf: true,
                  title: (
                    <span
                      style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                      onClick={() => {
                        onOpenTrigger?.(connId, db.database, trigger.name);
                      }}
                    >
                      <ThunderboltOutlined style={{ color: 'var(--color-error)', fontSize: 11 }} />
                      <span style={{ fontSize: 12 }}>{trigger.name}</span>
                    </span>
                  ),
                }))
              : undefined
            : [
                {
                  key: `no-triggers::${connId}::${db.database}`,
                  title: (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                      {t('common.noTriggers')}
                    </span>
                  ),
                  isLeaf: true,
                  selectable: false,
                },
              ],
      };

      const dbChildren = q
        ? [
            ...(filteredTables.length ? [tablesNode] : []),
            ...(filteredViews.length ? [viewsNode] : []),
            proceduresNode,
            functionsNode,
            triggersNode,
          ]
        : [tablesNode, viewsNode, proceduresNode, functionsNode, triggersNode];

      return {
        key: `db::${connId}::${db.database}`,
        title: (
          <div
            style={{ width: '100%' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleDoubleClick(`db::${connId}::${db.database}`);
            }}
            data-testid={`database-node-${db.database}`}
          >
            <Dropdown menu={getDatabaseMenu(connId, db.database)} trigger={['contextMenu']}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  userSelect: 'none',
                }}
              >
                {(() => {
                  const isSystemDb = [
                    'mysql',
                    'information_schema',
                    'performance_schema',
                    'sys',
                    'postgres',
                    'template0',
                    'template1',
                    'master',
                    'tempdb',
                    'model',
                    'msdb',
                  ].includes(db.database.toLowerCase());
                  return (
                    <>
                      <DatabaseOutlined
                        style={{
                          color: isSystemDb ? 'var(--text-disabled)' : 'var(--color-primary)',
                          fontSize: 12,
                        }}
                      />
                      <span
                        style={{
                          color: isSystemDb
                            ? 'var(--text-disabled)'
                            : db.loaded
                              ? 'var(--color-success)'
                              : undefined,
                          fontWeight: db.loaded ? 500 : undefined,
                          userSelect: 'none',
                        }}
                      >
                        {db.database}
                      </span>
                    </>
                  );
                })()}
              </div>
            </Dropdown>
          </div>
        ),
        children: db.loaded || isDbExpanded ? dbChildren : undefined,
      };
    };

    const buildConnNode = (conn: Connection) => {
      const dbList = connectionDatabases[conn.id] || [];
      const connNameMatch = !q || conn.name.toLowerCase().includes(q);
      const isExpanded = expandedKeys.includes(conn.id);

      const dbNodes: any[] = [];
      for (const db of dbList) {
        const dbMatch = !q || db.database.toLowerCase().includes(q);
        // 直接使用 db.tables，因为 connectionDatabases 已包含加载的表数据
        const isDbExpanded = expandedKeys.some((k) =>
          k.startsWith(`db::${conn.id}::${db.database}`)
        );
        // 当数据库正在展开但数据未加载时，不显示表数量（显示"加载中"）
        const tableItems = db.loaded
          ? db.tables.filter((t) => isBaseTable(t.table_type))
          : isDbExpanded
            ? undefined
            : [];
        const viewItems = db.loaded
          ? db.tables.filter((t) => isView(t.table_type))
          : isDbExpanded
            ? undefined
            : [];

        const tablesMatch = matchTables(tableItems || []);
        const viewsMatch = matchViews(db.tables || []);

        if (q && !dbMatch && !tablesMatch && !viewsMatch && !isDbExpanded) continue;

        const dbNode = buildTableNodes(conn.id, db, tableItems, viewItems, isDbExpanded);
        if (dbNode) dbNodes.push(dbNode);
      }

      if (q && !connNameMatch && dbNodes.length === 0 && !isExpanded) return null;

      const connTitle = (
        <div
          style={{ width: '100%' }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handleDoubleClick(conn.id);
          }}
          data-testid={`connection-item-${conn.id}`}
        >
          <Dropdown menu={getConnectionMenu(conn)} trigger={['contextMenu']}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              {getConnIcon(conn.db_type)}
              <span
                style={{
                  color: conn.status === 'connected' ? 'var(--color-success)' : undefined,
                  fontWeight: conn.status === 'connected' ? 500 : undefined,
                  userSelect: 'none',
                }}
              >
                {conn.name}
                {conn.color && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: conn.color,
                      display: 'inline-block',
                      marginLeft: 4,
                      border: '1px solid rgba(255,255,255,0.2)',
                    }}
                  />
                )}
                {conn.status === 'connected' ? (
                  <Tooltip title={t('common.mainLayout.connected')}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--color-success)',
                        animation: 'pulse 2s infinite',
                      }}
                    />
                  </Tooltip>
                ) : (
                  <Tooltip title={t('common.mainLayout.disconnected')}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--text-disabled)',
                        opacity: 0.5,
                      }}
                    />
                  </Tooltip>
                )}
                {conn.status === 'loading' && (
                  <Tooltip title={t('common.mainLayout.connecting')}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--color-warning)',
                        animation: 'pulse 1s infinite',
                      }}
                    />
                  </Tooltip>
                )}
              </span>
              {conn.database && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                  ({conn.database})
                </span>
              )}
            </div>
          </Dropdown>
        </div>
      );

      return {
        key: conn.id,
        title: connTitle,
        isLeaf: conn.status !== 'connected',
        children:
          conn.status === 'connected'
            ? dbNodes.length > 0
              ? dbNodes
              : [
                  {
                    key: `loading::${conn.id}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.noDatabases')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ]
            : undefined,
      };
    };

    const realGroups = groups.filter((g) => g.id !== 'default');
    for (const group of realGroups) {
      const groupConnNodes = (groupedConnections[group.id] || [])
        .map((conn) => buildConnNode(conn))
        .filter((n) => n !== null && n !== undefined);

      if (groupConnNodes.length === 0 && q) continue;

      const groupKey = `group-${group.id}`;
      const isRenaming = renamingKey === groupKey;

      let groupTitle: React.ReactNode;
      if (isRenaming) {
        groupTitle = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
            <GlobalInput
              size="small"
              value={renameValue}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
              onPressEnter={() => handleRenameCommit(group.id)}
              onBlur={() => handleRenameCommit(group.id)}
              autoFocus
              style={{ width: 100, height: 22, padding: '0 4px' }}
              onClick={(e: MouseEvent) => e.stopPropagation()}
            />
          </div>
        );
      } else {
        groupTitle = (
          <div
            style={{ width: '100%' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleDoubleClick(groupKey);
            }}
          >
            <Dropdown menu={getGroupMenu(group)} trigger={['contextMenu']}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingRight: 4,
                  userSelect: 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 14 }}>{group.icon}</span>
                  <span style={{ fontWeight: 500, color: group.color }}>{group.name}</span>
                </span>
                <Badge
                  count={groupConnNodes.length}
                  style={{ backgroundColor: group.color, boxShadow: 'none' }}
                />
              </div>
            </Dropdown>
          </div>
        );
      }

      treeNodes.push({
        key: groupKey,
        title: groupTitle,
        isLeaf: false,
        children: groupConnNodes,
      });
    }

    const ungroupedConnNodes = (groupedConnections['ungrouped'] || [])
      .map((conn) => buildConnNode(conn))
      .filter((n) => n !== null && n !== undefined);

    if (ungroupedConnNodes.length > 0 || !q) {
      for (const node of ungroupedConnNodes) {
        treeNodes.push(node);
      }
    }

    return treeNodes;
  }, [
    groups,
    groupedConnections,
    connections,
    searchText,
    connectionDatabases,
    expandedKeys,
    selectedTableId,
    renamingKey,
    renameValue,
    handleTableClick,
    onTableOpen,
    onViewOpen,
    getTableMenu,
    onNewQuery,
    onOpenRoutine,
    onOpenTrigger,
    handleDoubleClick,
    getConnectionMenu,
    getGroupMenu,
    getDatabaseMenu,
    getViewMenu,
    handleRenameCommit,
    handleCopyConnection,
    handleMoveConnection,
    onSaveGroup,
    filteredConnections,
  ]);

  useEffect(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return;

    const expandSet = new Set<string>();

    for (const conn of filteredConnections) {
      const dbList = connectionDatabases[conn.id] || [];
      for (const db of dbList) {
        if (db.database.toLowerCase().includes(q)) {
          expandSet.add(`db::${conn.id}::${db.database}`);
        }

        if (db.loaded && db.tables.length > 0) {
          let matchTables = false;
          let matchViews = false;

          for (const table of db.tables) {
            const tableName = table.table_name.toLowerCase();
            if (tableName.includes(q)) {
              if (isBaseTable(table.table_type)) {
                matchTables = true;
              } else if (isView(table.table_type)) {
                matchViews = true;
              }
            }
          }

          if (matchTables) {
            expandSet.add(`db::${conn.id}::${db.database}`);
            expandSet.add(`tables::${conn.id}::${db.database}`);
          }
          if (matchViews) {
            expandSet.add(`db::${conn.id}::${db.database}`);
            expandSet.add(`views::${conn.id}::${db.database}`);
          }
        }
      }
    }

    if (expandSet.size > 0) {
      onExpandKeys(Array.from(expandSet));
    }
  }, [searchText, filteredConnections, connectionDatabases, onExpandKeys]);

  const handleExpand = useCallback(
    async (keys: React.Key[], info: { node: any; expanded: boolean }) => {
      const strKeys = keys as string[];
      onExpandKeys(strKeys);

      const key = info.node?.key as string;
      if (!key) return;

      if (
        !key.startsWith('group-') &&
        !key.startsWith('tables::') &&
        !key.startsWith('views::') &&
        !key.startsWith('db::') &&
        !key.startsWith('procedures::') &&
        !key.startsWith('functions::')
      ) {
        const conn = connections.find((c) => c.id === key);
        if (info.expanded && conn && conn.status !== 'connected') {
          await onConnect(key);
        } else if (info.expanded && conn && conn.status === 'connected') {
          const dbList = connectionDatabases[key] || [];
          if (dbList.length === 0 && onLoadDatabases) {
            onLoadDatabases(key);
          }
        }
        onExpand(key, info.expanded);
      }

      if (key.startsWith('db::') && info.expanded) {
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbList = connectionDatabasesRef.current[connectionId] || [];
          const db = dbList.find((d) => d.database === database);
          if (db?.loadFailed) return;
          if (!db || !db.loaded || db.tables.length === 0) {
            onDatabaseExpand(connectionId, database);
          }
        }
      }

      if (key.startsWith('procedures::') && info.expanded) {
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbList = connectionDatabasesRef.current[connectionId] || [];
          const db = dbList.find((d) => d.database === database);
          if (db?.loadFailed) return;
          if (!db || !db.loaded || !db.routinesLoaded) {
            onDatabaseExpand(connectionId, database);
          }
        }
      }

      if (key.startsWith('functions::') && info.expanded) {
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbList = connectionDatabasesRef.current[connectionId] || [];
          const db = dbList.find((d) => d.database === database);
          if (db?.loadFailed) return;
          if (!db || !db.loaded || !db.routinesLoaded) {
            onDatabaseExpand(connectionId, database);
          }
        }
      }

      if (key.startsWith('triggers::') && info.expanded) {
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbList = connectionDatabasesRef.current[connectionId] || [];
          const db = dbList.find((d) => d.database === database);
          if (db?.loadFailed) return;
          if (!db || !db.loaded || !db.routinesLoaded) {
            onDatabaseExpand(connectionId, database);
          }
        }
      }

      if (key.startsWith('tables::') && info.expanded) {
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbList = connectionDatabasesRef.current[connectionId] || [];
          const db = dbList.find((d) => d.database === database);
          if (db?.loadFailed) return;
          if (!db || !db.loaded || db.tables.length === 0) {
            onDatabaseExpand(connectionId, database);
          }
        }
      }

      if (key.startsWith('views::') && info.expanded) {
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbList = connectionDatabasesRef.current[connectionId] || [];
          const db = dbList.find((d) => d.database === database);
          if (db?.loadFailed) return;
          if (!db || !db.loaded || db.tables.length === 0) {
            onDatabaseExpand(connectionId, database);
          }
        }
      }

      if (key.startsWith('table::') && info.expanded) {
        const parts = key.split('::');
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const tableName = parts.slice(3).join('::');
          onTableExpand(connectionId, database, tableName);
        }
      }
    },
    [
      connections,
      connectionDatabases,
      onExpandKeys,
      onConnect,
      onExpand,
      onDatabaseExpand,
      onTableExpand,
      onLoadDatabases,
    ]
  );

  const handleSelect = useCallback(
    (keys: React.Key[]) => {
      const key = keys[0] as string;
      if (!key) return;

      if (key.startsWith('table::')) {
        const parts = key.split('::');
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const tableName = parts.slice(3).join('::');
          onSelect(connectionId);
          onTableSelect(tableName, database);
          onObjectTypeSelect?.('table', database);
        }
      } else if (key.startsWith('view::')) {
        const parts = key.split('::');
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const viewName = parts.slice(3).join('::');
          onSelect(connectionId);
          onTableSelect(viewName, database);
          onObjectTypeSelect?.('view', database);
        }
      } else if (key.startsWith('db::')) {
        // 单击数据库节点只选中，不加载数据（展开时才会加载）
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          onSelect(connectionId);
        }
      } else if (key.startsWith('tables::')) {
        const parts = key.split('::');
        const connectionId = parts[1];
        const database = parts[2];
        onSelect(connectionId);
        onTableSelect(null, database);
        onObjectTypeSelect?.('table', database);
      } else if (key.startsWith('views::')) {
        const parts = key.split('::');
        const connectionId = parts[1];
        const database = parts[2];
        onSelect(connectionId);
        onTableSelect(null, database);
        onObjectTypeSelect?.('view', database);
      } else if (key.startsWith('group-')) {
      } else {
        const conn = connections.find((c) => c.id === key);
        if (conn) {
          onSelect(key);
          onTableSelect(null, undefined);
          onObjectTypeSelect?.('all', undefined);
        }
      }
    },
    [onSelect, onTableSelect, onObjectTypeSelect, connections]
  );

  if (collapsed) {
    return (
      <div style={{ padding: '8px 12px' }}>
        {isLoading ? (
          <Spin size="small" />
        ) : connections.length === 0 ? (
          <EnhancedEmptyState
            icon={<DatabaseOutlined />}
            title={t('common.mainLayout.noConnections')}
            description={t('common.connectionTreeEmpty')}
            action={{
              label: t('common.newConnection'),
              onClick: () => onCreateConnection?.(),
              icon: <PlusOutlined />,
            }}
          />
        ) : (
          connections.map((conn) => (
            <Dropdown key={conn.id} menu={getConnectionMenu(conn)} trigger={['contextMenu']}>
              <div
                onClick={() => onSelect(conn.id)}
                style={{
                  padding: '8px',
                  marginBottom: 4,
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: selectedId === conn.id ? 'var(--row-selected-bg)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
              >
                {getDbIcon(conn.db_type)}
              </div>
            </Dropdown>
          ))
        )}

        <div
          style={{
            marginTop: 8,
            padding: '6px',
            borderRadius: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--background-hover)',
            border: '1px dashed var(--border-color)',
          }}
          onClick={() => {
            setEditingGroup(null);
            setParentGroupId(null);
            setGroupDialogOpen(true);
          }}
        >
          <PlusOutlined style={{ color: 'var(--text-tertiary)' }} />
        </div>

        <GroupDialog
          open={groupDialogOpen}
          editingGroup={editingGroup}
          parentGroupId={parentGroupId}
          onCancel={() => {
            setGroupDialogOpen(false);
            setEditingGroup(null);
            setParentGroupId(null);
          }}
          onSave={handleGroupSave}
        />
      </div>
    );
  }

  return (
    <div>
      <Spin spinning={isLoading} size="small">
        {connections.length === 0 && !isLoading ? (
          <EnhancedEmptyState
            icon={<DatabaseOutlined />}
            title={t('common.mainLayout.noConnections')}
            description={t('common.connectionTreeEmptyDescription')}
            action={{
              label: t('common.newConnection'),
              onClick: () => onCreateConnection?.(),
              icon: <PlusOutlined />,
            }}
            secondaryAction={{
              label: t('common.importConnections'),
              onClick: () => {},
              icon: <FolderOutlined />,
              disabled: true,
            }}
            tips={[
              t('common.connectionTreeTip1'),
              t('common.connectionTreeTip2'),
              t('common.connectionTreeTip3'),
            ]}
          />
        ) : (
          <Tree
            showIcon={false}
            selectedKeys={selectedId ? [selectedId] : []}
            expandedKeys={expandedKeys}
            onExpand={(keys, info) => {
              handleExpand(keys, info);
            }}
            onSelect={handleSelect}
            treeData={treeData}
            draggable={(node) =>
              !node.key.toString().startsWith('group-') &&
              !node.key.toString().startsWith('db::') &&
              !node.key.toString().startsWith('table::') &&
              !node.key.toString().startsWith('view::') &&
              !node.key.toString().startsWith('tables::') &&
              !node.key.toString().startsWith('views::') &&
              !node.key.toString().startsWith('procedures::') &&
              !node.key.toString().startsWith('functions::')
            }
            onDrop={(info) => {
              const draggedKey = info.dragNode.key as string;
              const dropKey = info.node.key as string;

              // 只有当放置目标是分组时，才移动连接
              if (dropKey.startsWith('group-')) {
                const connId = draggedKey;
                const groupId = dropKey.replace('group-', '');
                handleMoveConnection(connId, groupId);
              }
            }}
            style={{
              background: 'transparent',
              padding: '0 4px 8px',
              fontSize: 12,
              userSelect: 'none',
            }}
            className="connection-tree"
            blockNode
            virtual
          />
        )}
      </Spin>

      <GroupDialog
        open={groupDialogOpen}
        editingGroup={editingGroup}
        parentGroupId={parentGroupId}
        onCancel={() => {
          setGroupDialogOpen(false);
          setEditingGroup(null);
          setParentGroupId(null);
        }}
        onSave={handleGroupSave}
      />

      <CopyTableDialog
        open={copyDialogOpen}
        sourceTable={copyTarget?.tableName || ''}
        sourceDatabase={copyTarget?.database}
        connectionId={copyTarget?.connId || ''}
        dbType={connections.find((c) => c.id === copyTarget?.connId)?.db_type}
        databases={
          copyTarget ? connectionDatabases[copyTarget.connId]?.map((d) => d.database) || [] : []
        }
        onCancel={() => {
          setCopyDialogOpen(false);
          setCopyTarget(null);
        }}
        onSuccess={() => {
          setCopyDialogOpen(false);
          setCopyTarget(null);
          if (copyTarget?.database) {
            onDatabaseRefresh?.(copyTarget.connId, copyTarget.database);
          }
        }}
      />

      <DumpDialog
        open={dumpDialogOpen}
        tableName={dumpTarget?.tableName || ''}
        database={dumpTarget?.database}
        connectionId={dumpTarget?.connId || ''}
        onCancel={() => {
          setDumpDialogOpen(false);
          setDumpTarget(null);
        }}
        onSuccess={() => {
          setDumpDialogOpen(false);
          setDumpTarget(null);
        }}
      />

      <RunSqlFileDialog
        open={runSqlDialogOpen}
        connectionId={runSqlTarget?.connId || ''}
        database={runSqlTarget?.database}
        onCancel={() => {
          setRunSqlDialogOpen(false);
          setRunSqlTarget(null);
        }}
        onSuccess={() => {
          setRunSqlDialogOpen(false);
          setRunSqlTarget(null);
        }}
      />

      <BackupRestoreDialog
        open={backupRestoreOpen}
        mode={backupRestoreMode}
        connectionId={backupRestoreTarget?.connId || ''}
        database={backupRestoreTarget?.database}
        dbType={connections.find((c) => c.id === backupRestoreTarget?.connId)?.db_type || ''}
        onCancel={() => {
          setBackupRestoreOpen(false);
          setBackupRestoreTarget(null);
        }}
        onSuccess={() => {
          setBackupRestoreOpen(false);
          setBackupRestoreTarget(null);
        }}
      />

      <UserManagementDialog
        open={userManagementOpen}
        connectionId={userManagementTarget?.connId || ''}
        database={userManagementTarget?.database}
        onClose={() => {
          setUserManagementOpen(false);
          setUserManagementTarget(null);
        }}
      />

      <SchemaCompareDialog
        open={schemaCompareOpen}
        connections={connections}
        onClose={() => setSchemaCompareOpen(false)}
      />

      <CreateDatabaseDialog
        open={createDatabaseOpen}
        connectionId={createDatabaseTarget?.connId || ''}
        dbType={createDatabaseTarget?.dbType}
        onCancel={() => {
          setCreateDatabaseOpen(false);
          setCreateDatabaseTarget(null);
        }}
        onSuccess={() => {
          setCreateDatabaseOpen(false);
          if (createDatabaseTarget?.connId) {
            onLoadDatabases?.(createDatabaseTarget.connId);
          }
          setCreateDatabaseTarget(null);
        }}
      />
    </div>
  );
}

export default EnhancedConnectionTree;
