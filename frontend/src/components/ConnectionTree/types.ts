import type { Connection, ConnectionGroup } from '../../stores/appStore';
import type { TableInfo } from '../../types/api';

export type ConnectionTreeProps = {
  connections: Connection[];
  groups: ConnectionGroup[];
  selectedId: string | null;
  selectedTableId: string | null;
  onSelect: (id: string | null) => void;
  onTableSelect: (table: string | null, database?: string) => void;
  onObjectTypeSelect?: (objectType: 'table' | 'view' | 'all', database?: string, schema?: string) => void;
  onTableOpen: (tableName: string, database?: string) => void;
  onViewOpen?: (viewName: string, database?: string) => void;
  onOpenDesigner?: (tableName: string, database?: string) => void;
  onOpenViewDefinition?: (viewName: string, database?: string) => void;
  onExpand: (connectionId: string, expanded: boolean) => void;
  /** 取消进行中的连接（网络不通时不必等拨号超时） */
  onCancelConnect?: (connectionId: string) => void;
  collapsed: boolean;
  searchText: string;
  /** 搜索态下用户展开/双击连接节点时自动清除搜索（意图从"找连接"转为"浏览连接"） */
  onClearSearch?: () => void;
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
      sequences?: import('../../types/api').SequenceInfo[];
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
  onImportConnections?: () => void;
  onBatchManage?: () => void;
  onRefreshConnections?: () => void;
};
