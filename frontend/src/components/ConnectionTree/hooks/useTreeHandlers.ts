import { useCallback, useRef } from 'react';
import type { Connection } from '../../../stores/appStore';
import { parseTreeKey } from '../utils/treeKeyParser';

interface TreeHandlerCallbacks {
  onExpandKeys: (keys: string[]) => void;
  onConnect: (connectionId: string) => Promise<void> | void;
  onExpand: (connectionId: string, expanded: boolean) => void;
  onDatabaseExpand: (connectionId: string, database: string) => void;
  onTableExpand: (connectionId: string, database: string, tableName: string) => void;
  onLoadDatabases?: (connectionId: string) => void;
  onTableOpen: (tableName: string, database?: string) => void;
  onViewOpen?: (viewName: string, database?: string) => void;
  onSelect: (id: string | null) => void;
  onTableSelect: (table: string | null, database?: string) => void;
  onObjectTypeSelect?: (objectType: 'table' | 'view' | 'all', database?: string, schema?: string) => void;
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
        callbacks.onTableOpen(parsed.name!, parsed.database);
      } else if (parsed.type === 'view' && parsed.connectionId && parsed.database) {
        if (callbacks.onViewOpen) {
          callbacks.onViewOpen(parsed.name!, parsed.database);
        } else {
          callbacks.onTableOpen(parsed.name!, parsed.database);
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
        const isExpanded = refs.expandedKeysRef.current.includes(key);
        if (isExpanded) {
          callbacks.onExpandKeys(refs.expandedKeysRef.current.filter((k) => k !== key));
        } else {
          callbacks.onExpandKeys([...refs.expandedKeysRef.current, key]);
        }
      } else if (parsed.type === 'connection' && parsed.connectionId) {
        const conn = connections.find((c) => c.id === parsed.connectionId);
        if (!conn) return;

        if (conn.status !== 'connected') {
          await callbacks.onConnect(parsed.connectionId);
          callbacks.onExpandKeys([
            ...refs.expandedKeysRef.current.filter((k) => !k.startsWith(`${parsed.connectionId}::`)),
            parsed.connectionId,
          ]);
        } else {
          const isExpanded = refs.expandedKeysRef.current.includes(parsed.connectionId);
          if (isExpanded) {
            callbacks.onExpandKeys(refs.expandedKeysRef.current.filter((k) => k !== parsed.connectionId));
          } else {
            callbacks.onExpandKeys([...refs.expandedKeysRef.current, parsed.connectionId]);
          }
        }
      }
    },
    [connections, callbacks, refs]
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
          await callbacks.onConnect(parsed.connectionId);
        } else if (info.expanded && conn && conn.status === 'connected') {
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
      if (
        (parsed.type === 'procedures-folder' || parsed.type === 'functions-folder' || parsed.type === 'triggers-folder' || parsed.type === 'sequences-folder') &&
        info.expanded &&
        parsed.connectionId &&
        parsed.database
      ) {
        const dbList = refs.connectionDatabasesRef.current[parsed.connectionId] || [];
        const db = dbList.find((d: any) => d.database === parsed.database);
        if (db?.loadFailed) return;
        if (!db || !db.loaded || !db.routinesLoaded) {
          callbacks.onDatabaseExpand(parsed.connectionId, parsed.database);
        }
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
    [connections, callbacks, refs]
  );

  const handleSelect = useCallback(
    (keys: React.Key[]) => {
      const key = keys[0] as string;
      if (!key) return;

      const parsed = parseTreeKey(key);

      if (parsed.type === 'table' && parsed.connectionId && parsed.database) {
        callbacks.onSelect(parsed.connectionId);
        callbacks.onTableSelect(parsed.name!, parsed.database);
        callbacks.onObjectTypeSelect?.('table', parsed.database, parsed.schema);
      } else if (parsed.type === 'view' && parsed.connectionId && parsed.database) {
        callbacks.onSelect(parsed.connectionId);
        callbacks.onTableSelect(parsed.name!, parsed.database);
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
    [connections, callbacks]
  );

  return {
    clickTimerRef,
    handleTableClick,
    handleDoubleClick,
    handleExpand,
    handleSelect,
  };
}
