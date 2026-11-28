import { useCallback, useRef } from 'react';
import type { Connection } from '../../../stores/appStore';
import type { ObjectTypeFilter, RoutineKind } from '../../../types/api';
import { parseTreeKey } from '../utils/treeKeyParser';
import type { ParsedTreeKey, TreeKeyType } from '../utils/treeKeyParser';
import { qualifiedTableName } from '../../../utils/qualifiedName';

/** 过程 / 函数 / 触发器 / 序列的目录（和其中的项）：对象页里各有一张对应的列表 */
const ROUTINE_KIND: Partial<Record<TreeKeyType, RoutineKind>> = {
  'procedures-folder': 'procedure',
  procedure: 'procedure',
  'functions-folder': 'function',
  function: 'function',
  'triggers-folder': 'trigger',
  trigger: 'trigger',
  'sequences-folder': 'sequence',
  sequence: 'sequence',
};

const ROUTINE_FOLDER_TYPES: TreeKeyType[] = [
  'procedures-folder',
  'functions-folder',
  'triggers-folder',
  'sequences-folder',
];
const isRoutineFolder = (type: TreeKeyType) => ROUTINE_FOLDER_TYPES.includes(type);

interface TreeHandlerCallbacks {
  onExpandKeys: (keys: string[]) => void;
  onConnect: (connectionId: string) => Promise<void> | void;
  onExpand: (connectionId: string, expanded: boolean) => void;
  onDatabaseExpand: (connectionId: string, database: string) => void;
  onTableExpand: (connectionId: string, database: string, tableName: string) => void;
  onLoadDatabases?: (connectionId: string) => void;
  /** 用户主动展开连接节点时清除搜索（携带连接 ID，供滚动定位等后续处理） */
  onClearSearch?: (connectionId?: string) => void;
  onTableOpen: (tableName: string, database?: string) => void;
  onViewOpen?: (viewName: string, database?: string) => void;
  onSelect: (id: string | null) => void;
  onTableSelect: (table: string | null, database?: string) => void;
  onObjectTypeSelect?: (objectType: ObjectTypeFilter, database?: string, schema?: string) => void;
}

interface TreeHandlerRefs {
  expandedKeysRef: React.MutableRefObject<string[]>;
  connectionDatabasesRef: React.MutableRefObject<Record<string, any[]>>;
}

export function useTreeHandlers(
  connections: Connection[],
  callbacks: TreeHandlerCallbacks,
  refs: TreeHandlerRefs
) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 节点 key 里带着 schema：打开、选中表时拼成带 schema 的名字（PG 系、SQL Server 认）。
  // 不带的话数据页按 search_path 找同名表，可能落到别的 schema 的表上
  const objectName = useCallback(
    (parsed: ParsedTreeKey): string =>
      qualifiedTableName(
        parsed.name ?? '',
        parsed.schema,
        connections.find((c) => c.id === parsed.connectionId)?.db_type
      ),
    [connections]
  );

  /** 只动展开状态：展开了就收起，没收起就展开 */
  const toggleKey = useCallback(
    (key: string) => {
      if (refs.expandedKeysRef.current.includes(key)) {
        callbacks.onExpandKeys(refs.expandedKeysRef.current.filter((k) => k !== key));
      } else {
        callbacks.onExpandKeys([...refs.expandedKeysRef.current, key]);
      }
    },
    [callbacks, refs]
  );

  /** 过程 / 函数 / 触发器 / 序列的目录展开时调用：列表还没加载就触发加载（点箭头和双击标题共用） */
  const loadRoutinesIfNeeded = useCallback(
    (connectionId: string, database: string) => {
      const dbList = refs.connectionDatabasesRef.current[connectionId] || [];
      const db = dbList.find((d: any) => d.database === database);
      if (db?.loadFailed) return;
      if (!db || !db.loaded || !db.routinesLoaded) {
        callbacks.onDatabaseExpand(connectionId, database);
      }
    },
    [callbacks, refs]
  );

  const handleTableClick = useCallback(
    (tableName: string, database?: string, schema?: string) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        callbacks.onTableOpen(tableName, database);
      } else {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          callbacks.onTableSelect(tableName, database);
          callbacks.onObjectTypeSelect?.('table', database, schema);
        }, 250);
      }
    },
    [callbacks]
  );

  const handleDoubleClick = useCallback(
    async (key: string) => {
      const parsed = parseTreeKey(key);

      if (parsed.type === 'table' && parsed.connectionId && parsed.database) {
        callbacks.onTableOpen(objectName(parsed), parsed.database);
      } else if (parsed.type === 'view' && parsed.connectionId && parsed.database) {
        if (callbacks.onViewOpen) {
          callbacks.onViewOpen(objectName(parsed), parsed.database);
        } else {
          callbacks.onTableOpen(objectName(parsed), parsed.database);
        }
      } else if (parsed.type === 'database' && parsed.connectionId && parsed.database) {
        const dbKey = `db::${parsed.connectionId}::${parsed.database}`;
        const isExpanded = refs.expandedKeysRef.current.some((k) => k.startsWith(dbKey));

        if (isExpanded) {
          callbacks.onExpandKeys(refs.expandedKeysRef.current.filter((k) => !k.startsWith(dbKey)));
        } else {
          const dbList = refs.connectionDatabasesRef.current[parsed.connectionId] || [];
          const db = dbList.find((d: any) => d.database === parsed.database);
          if (db?.loadFailed) {
            callbacks.onExpandKeys([...refs.expandedKeysRef.current, dbKey]);
            return;
          }
          if (!db || !db.loaded || db.tables.length === 0) {
            callbacks.onDatabaseExpand(parsed.connectionId, parsed.database);
          }
          callbacks.onExpandKeys([...refs.expandedKeysRef.current, dbKey]);
        }
      } else if (parsed.type === 'schema' || parsed.type === 'tables-folder' || parsed.type === 'views-folder' || parsed.type === 'group') {
        toggleKey(key);
      } else if (isRoutineFolder(parsed.type) && parsed.connectionId && parsed.database) {
        // 双击目录标题和点箭头是一回事：切换展开，展开时列表还没加载就先加载
        loadRoutinesIfNeeded(parsed.connectionId, parsed.database);
        toggleKey(key);
      } else if (parsed.type === 'connection' && parsed.connectionId) {
        const conn = connections.find((c) => c.id === parsed.connectionId);
        if (!conn) return;

        if (conn.status !== 'connected') {
          // 连接成功后才清除搜索：失败时保留搜索上下文，用户能立即重试
          await callbacks.onConnect(parsed.connectionId);
          callbacks.onClearSearch?.(parsed.connectionId);
          callbacks.onExpandKeys([
            ...refs.expandedKeysRef.current.filter((k) => !k.startsWith(`${parsed.connectionId}::`)),
            parsed.connectionId,
          ]);
        } else {
          // 已连接的连接直接展开 = 无需连接过程，视为成功
          callbacks.onClearSearch?.(parsed.connectionId);
          const isExpanded = refs.expandedKeysRef.current.includes(parsed.connectionId);
          if (isExpanded) {
            callbacks.onExpandKeys(refs.expandedKeysRef.current.filter((k) => k !== parsed.connectionId));
          } else {
            callbacks.onExpandKeys([...refs.expandedKeysRef.current, parsed.connectionId]);
          }
        }
      }
    },
    [connections, callbacks, refs, objectName, toggleKey, loadRoutinesIfNeeded]
  );

  const handleExpand = useCallback(
    async (keys: React.Key[], info: { node: any; expanded: boolean }) => {
      const strKeys = keys as string[];
      callbacks.onExpandKeys(strKeys);

      const key = info.node?.key as string;
      if (!key) return;

      const parsed = parseTreeKey(key);

      // Handle connection expand
      if (
        parsed.type === 'connection' &&
        parsed.connectionId
      ) {
        const conn = connections.find((c) => c.id === parsed.connectionId);
        if (info.expanded && conn && conn.status !== 'connected') {
          // 连接成功后才清除搜索：失败时保留搜索上下文，用户能立即重试
          await callbacks.onConnect(parsed.connectionId);
          callbacks.onClearSearch?.(parsed.connectionId);
        } else if (info.expanded && conn && conn.status === 'connected') {
          // 已连接的连接展开 = 无需连接过程，视为成功
          callbacks.onClearSearch?.(parsed.connectionId);
          const dbList = refs.connectionDatabasesRef.current[parsed.connectionId] || [];
          if (dbList.length === 0 && callbacks.onLoadDatabases) {
            callbacks.onLoadDatabases(parsed.connectionId);
          }
        }
        callbacks.onExpand(parsed.connectionId, info.expanded);
      }

      // Handle database expand
      if (parsed.type === 'database' && info.expanded && parsed.connectionId && parsed.database) {
        const dbList = refs.connectionDatabasesRef.current[parsed.connectionId] || [];
        const db = dbList.find((d: any) => d.database === parsed.database);
        if (db?.loadFailed) return;
        if (!db || !db.loaded || db.tables.length === 0) {
          callbacks.onDatabaseExpand(parsed.connectionId, parsed.database);
        }
      }

      // Handle procedures/functions/triggers/sequences folder expand
      if (isRoutineFolder(parsed.type) && info.expanded && parsed.connectionId && parsed.database) {
        loadRoutinesIfNeeded(parsed.connectionId, parsed.database);
      }

      // Handle tables/views folder expand
      if (
        (parsed.type === 'tables-folder' || parsed.type === 'views-folder') &&
        info.expanded &&
        parsed.connectionId &&
        parsed.database
      ) {
        const dbList = refs.connectionDatabasesRef.current[parsed.connectionId] || [];
        const db = dbList.find((d: any) => d.database === parsed.database);
        if (db?.loadFailed) return;
        if (!db || !db.loaded || db.tables.length === 0) {
          callbacks.onDatabaseExpand(parsed.connectionId, parsed.database);
        }
      }

      // Handle table expand
      if (parsed.type === 'table' && info.expanded && parsed.connectionId && parsed.database) {
        callbacks.onTableExpand(parsed.connectionId, parsed.database, parsed.name!);
      }
    },
    [connections, callbacks, refs, loadRoutinesIfNeeded]
  );

  const handleSelect = useCallback(
    (keys: React.Key[]) => {
      const key = keys[0] as string;
      if (!key) return;

      const parsed = parseTreeKey(key);
      const routineKind = ROUTINE_KIND[parsed.type];

      if (parsed.type === 'table' && parsed.connectionId && parsed.database) {
        callbacks.onSelect(parsed.connectionId);
        callbacks.onTableSelect(objectName(parsed), parsed.database);
        callbacks.onObjectTypeSelect?.('table', parsed.database, parsed.schema);
      } else if (parsed.type === 'view' && parsed.connectionId && parsed.database) {
        callbacks.onSelect(parsed.connectionId);
        callbacks.onTableSelect(objectName(parsed), parsed.database);
        callbacks.onObjectTypeSelect?.('view', parsed.database, parsed.schema);
      } else if (parsed.type === 'schema' && parsed.connectionId && parsed.database && parsed.schema) {
        callbacks.onSelect(parsed.connectionId);
        callbacks.onTableSelect(null, parsed.database);
        callbacks.onObjectTypeSelect?.('all', parsed.database, parsed.schema);
      } else if (parsed.type === 'database' && parsed.connectionId) {
        callbacks.onSelect(parsed.connectionId);
      } else if (parsed.type === 'tables-folder' && parsed.connectionId && parsed.database) {
        callbacks.onSelect(parsed.connectionId);
        callbacks.onTableSelect(null, parsed.database);
        callbacks.onObjectTypeSelect?.('table', parsed.database, parsed.schema);
      } else if (parsed.type === 'views-folder' && parsed.connectionId && parsed.database) {
        callbacks.onSelect(parsed.connectionId);
        callbacks.onTableSelect(null, parsed.database);
        callbacks.onObjectTypeSelect?.('view', parsed.database, parsed.schema);
      } else if (routineKind && parsed.connectionId && parsed.database) {
        // 选中目录或其中的项：对象页切到对应的列表（和选中表目录列出表一样）
        callbacks.onSelect(parsed.connectionId);
        callbacks.onTableSelect(null, parsed.database);
        callbacks.onObjectTypeSelect?.(routineKind, parsed.database);
      } else if (parsed.type === 'group') {
        // no-op for group selection
      } else if (parsed.type === 'connection' && parsed.connectionId) {
        const conn = connections.find((c) => c.id === parsed.connectionId);
        if (conn) {
          callbacks.onSelect(parsed.connectionId);
          callbacks.onTableSelect(null, undefined);
          callbacks.onObjectTypeSelect?.('all', undefined);
        }
      }
    },
    [connections, callbacks, objectName]
  );

  return {
    clickTimerRef,
    handleTableClick,
    handleDoubleClick,
    handleExpand,
    handleSelect,
  };
}
