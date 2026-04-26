import { useEffect, useCallback } from 'react';
import { App } from 'antd';
import { useAppStore } from '../stores/appStore';
import { api } from '../api';
import type { ConnectionInput, GroupInput } from '../types/api';

const escapeSqlString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/'/g, "''");

const escapeSqlIdentifier = (value: string): string => value.replace(/`/g, '``');

// 防重复调用：跟踪正在加载的 cacheKey
const loadingTablesKeys = new Set<string>();

// 性能优化：带 TTL 的 LRU 缓存
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number; // 毫秒

  constructor(maxSize = 100, ttl = 5 * 60 * 1000) {
    // 默认 5 分钟 TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    // 如果缓存已满，删除最老的条目
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // 清理过期条目
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

const structureCache = new TTLCache<Promise<import('../api').TableStructure>>(100, 10 * 60 * 1000);

// Schema 补全缓存：用于智能代码补全
interface SchemaCompletionEntry {
  tables: Map<string, string[]>;  // tableName -> columnNames
  views: Map<string, string[]>;
  timestamp: number;
}

class SchemaCompletionCache {
  private cache = new Map<string, SchemaCompletionEntry>();
  private ttl = 10 * 60 * 1000; // 10 分钟
  private pendingPromises = new Map<string, Promise<SchemaCompletionEntry>>();

  private makeKey(connectionId: string, database: string): string {
    return `${connectionId}::${database}`;
  }

  async get(
    connectionId: string,
    database: string,
    getTables: () => Promise<import('../types/api').TableInfo[]>,
    getColumns: (tableName: string) => Promise<import('../types/api').ColumnInfo[]>
  ): Promise<SchemaCompletionEntry> {
    const key = this.makeKey(connectionId, database);
    const entry = this.cache.get(key);

    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry;
    }

    // 如果有正在进行的请求，等待它
    const pending = this.pendingPromises.get(key);
    if (pending) {
      return pending;
    }

    // 开始获取 schema 数据
    const promise = (async () => {
      const tablesResult = await getTables();
      const tablesMap = new Map<string, string[]>();
      const viewsMap = new Map<string, string[]>();

      for (const table of tablesResult) {
        const tableType = (table.table_type || '').toUpperCase().trim();
        const isView = tableType === 'VIEW' || tableType === 'SYSTEM VIEW' || tableType === 'MATERIALIZED VIEW';
        const targetMap = isView ? viewsMap : tablesMap;

        try {
          const columns = await getColumns(table.table_name);
          targetMap.set(table.table_name, columns.map(c => c.column_name));
        } catch {
          targetMap.set(table.table_name, []);
        }
      }

      const entry: SchemaCompletionEntry = {
        tables: tablesMap,
        views: viewsMap,
        timestamp: Date.now(),
      };

      this.cache.set(key, entry);
      this.pendingPromises.delete(key);
      return entry;
    })();

    this.pendingPromises.set(key, promise);
    return promise;
  }

  invalidate(connectionId: string, database?: string): void {
    if (database) {
      this.cache.delete(this.makeKey(connectionId, database));
    } else {
      // 删除该连接的所有缓存
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${connectionId}::`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

const schemaCompletionCache = new SchemaCompletionCache();

export const useConnections = () => {
  const { message } = App.useApp();
  const connections = useAppStore((state) => state.connections);
  const groups = useAppStore((state) => state.groups);
  const activeConnectionId = useAppStore((state) => state.activeConnectionId);
  const isLoading = useAppStore((state) => state.isLoading);
  const error = useAppStore((state) => state.error);
  const setConnections = useAppStore((state) => state.setConnections);
  const setGroups = useAppStore((state) => state.setGroups);
  const setActiveConnection = useAppStore((state) => state.setActiveConnection);
  const setLoading = useAppStore((state) => state.setLoading);
  const setError = useAppStore((state) => state.setError);

  const loadConnections = useCallback(async () => {
    try {
      setLoading(true);
      const [connectionsData, groupsData] = await Promise.all([
        api.getConnections(),
        api.getGroups(),
      ]);
      setConnections(connectionsData);
      setGroups(groupsData);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '加载连接失败';
      setError(errorMsg);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [setConnections, setGroups, setLoading, setError]);

  const saveConnection = useCallback(
    async (input: ConnectionInput) => {
      try {
        setLoading(true);
        const connection = await api.saveConnection(input);
        setConnections((prev) =>
          input.id ? prev.map((c) => (c.id === input.id ? connection : c)) : [...prev, connection]
        );
        message.success(input.id ? '连接已更新' : '连接已创建');
        return connection;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '保存连接失败';
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setConnections, setLoading, setError]
  );

  const deleteConnection = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        await api.deleteConnection(id);
        setConnections((prev) => prev.filter((c) => c.id !== id));
        setActiveConnection((current) => (current === id ? null : current));
        message.success('连接已删除');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '删除连接失败';
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setConnections, setActiveConnection, setLoading, setError]
  );

  const testConnection = useCallback(
    async (
      dbType: string,
      host: string,
      port: number,
      username: string,
      password: string,
      database?: string
    ) => {
      try {
        setLoading(true);
        const result = await api.testConnection(dbType, host, port, username, password, database);
        message.success('连接测试成功');
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '连接测试失败';
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError]
  );

  const connect = useCallback(
    async (connectionId: string) => {
      try {
        setLoading(true);
        await api.connectConnection(connectionId);
        setConnections((prev) =>
          prev.map((c) =>
            c.id === connectionId ? { ...c, status: 'connected' as const } : c
          )
        );
        message.success('连接成功');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        // 检查是否是密码错误（后端返回 PASSWORD_REQUIRED）
        if (errorMsg === 'PASSWORD_REQUIRED' || (typeof err === 'object' && err !== null && 'code' in err && (err as Record<string, unknown>).code === 'PASSWORD_REQUIRED')) {
          setLoading(false);
          const error = new Error('密码错误，请重新输入') as Error & { code: string };
          error.code = 'PASSWORD_REQUIRED';
          throw error;
        }
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setConnections, setLoading, setError]
  );

  const disconnect = useCallback(
    async (connectionId: string) => {
      try {
        setLoading(true);
        await api.disconnectConnection(connectionId);
        setConnections((prev) =>
          prev.map((c) =>
            c.id === connectionId ? { ...c, status: 'disconnected' as const } : c
          )
        );
        message.success('已断开连接');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '断开连接失败';
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setConnections, setLoading, setError]
  );

  return {
    connections,
    groups,
    activeConnectionId,
    isLoading,
    error,
    loadConnections,
    saveConnection,
    deleteConnection,
    testConnection,
    connect,
    disconnect,
    setActiveConnection,
  };
};

export const useGroups = () => {
  const { message } = App.useApp();
  const groups = useAppStore((state) => state.groups);
  const isLoading = useAppStore((state) => state.isLoading);
  const setGroups = useAppStore((state) => state.setGroups);
  const setLoading = useAppStore((state) => state.setLoading);
  const setError = useAppStore((state) => state.setError);

  const saveGroup = useCallback(
    async (input: GroupInput) => {
      try {
        setLoading(true);
        const group = await api.saveGroup(input);
        setGroups((prev) =>
          input.id ? prev.map((g) => (g.id === input.id ? group : g)) : [...prev, group]
        );
        message.success(input.id ? '分组已更新' : '分组已创建');
        return group;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '保存分组失败';
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setGroups, setLoading, setError]
  );

  const deleteGroup = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        await api.deleteGroup(id);
        setGroups((prev) => prev.filter((g) => g.id !== id));
        message.success('分组已删除');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '删除分组失败';
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setGroups, setLoading, setError]
  );

  return {
    groups,
    isLoading,
    saveGroup,
    deleteGroup,
  };
};

// 性能优化：Promise 锁，防止同一 cacheKey 的并发请求重复发送
const tableLoadingPromises = new Map<string, Promise<import('../types/api').TableInfo[]>>();

export const useDatabase = () => {
  const { message } = App.useApp();
  const { setLoading, setError, setTableData, setTableDataLoading, setTableDataFailed, getTableData, clearTableData } =
    useAppStore();

  const getTables = useCallback(
    async (connectionId: string, database?: string, forceRefresh = false, search?: string) => {
      const cacheKey = `${connectionId}::${database || ''}`;

      // 如果已有正在进行的请求，复用该 Promise
      const existingPromise = tableLoadingPromises.get(cacheKey);
      if (existingPromise) {
        return existingPromise;
      }

      // 防重复调用：如果正在加载中，直接返回
      if (loadingTablesKeys.has(cacheKey)) {
        // 等待现有请求完成，返回缓存的数据（如果有）
        const cached = getTableData(cacheKey);
        return cached?.tables || [];
      }

      const cached = getTableData(cacheKey);
      if (cached && cached.loaded && !cached.loading && !forceRefresh && !search) {
        return cached.tables;
      }

      // 如果正在加载中且非强制刷新，直接返回
      if (cached?.loading && !forceRefresh) {
        return cached.tables;
      }

      // 标记正在加载
      loadingTablesKeys.add(cacheKey);

      const promise = (async () => {
        try {
          setTableDataLoading(cacheKey, true);
          const result = await api.getTablesCategorized(connectionId, database, search);
          const allTables = [
            ...(result.tables || []),
            ...(result.views || []),
          ];
          setTableData(cacheKey, allTables);
          return allTables;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '获取表列表失败';
          console.error('获取表列表失败:', connectionId, database, err);
          setError(errorMsg);
          message.error(errorMsg);
          setTableDataFailed(cacheKey, true);
          return [];
        } finally {
          // 移除加载标记
          loadingTablesKeys.delete(cacheKey);
          tableLoadingPromises.delete(cacheKey);
          setLoading(false);
        }
      })();

      tableLoadingPromises.set(cacheKey, promise);
      return promise;
    },
    [setLoading, setError, setTableData, setTableDataLoading, setTableDataFailed, getTableData]
  );

  const refreshTables = useCallback(
    async (connectionId: string, database?: string, search?: string) => {
      return getTables(connectionId, database, true, search);
    },
    [getTables]
  );

  const getDatabases = useCallback(
    async (connectionId: string) => {
      try {
        setLoading(true);
        const databases = await api.getDatabases(connectionId);
        return databases;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '获取数据库列表失败';
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError]
  );

  const getTableStructureCached = useCallback(
    async (connectionId: string, tableName: string, database?: string) => {
      const cacheKey = `${connectionId}::${database || ''}::${tableName}`;

      const cached = structureCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const promise = api.getTableStructure(connectionId, tableName, database);
      structureCache.set(cacheKey, promise);
      return promise;
    },
    []
  );

  const getColumns = useCallback(
    async (connectionId: string, tableName: string, database?: string) => {
      const result = await getTableStructureCached(connectionId, tableName, database);
      return result.columns;
    },
    [getTableStructureCached]
  );

  const getIndexes = useCallback(
    async (connectionId: string, tableName: string, database?: string) => {
      const result = await getTableStructureCached(connectionId, tableName, database);
      return result.indexes;
    },
    [getTableStructureCached]
  );

  const getForeignKeys = useCallback(
    async (connectionId: string, tableName: string, database?: string) => {
      const result = await getTableStructureCached(connectionId, tableName, database);
      return result.foreign_keys;
    },
    [getTableStructureCached]
  );

  const getTableInfo = useCallback(
    async (connectionId: string, tableName: string, database?: string) => {
      try {
        setLoading(true);
        const safeDb = database ? escapeSqlString(database) : '';
        const safeTable = escapeSqlString(tableName);
        const sql = database
          ? `SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, CREATE_TIME, UPDATE_TIME, TABLE_COLLATION, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${safeDb}' AND TABLE_NAME = '${safeTable}'`
          : `SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, CREATE_TIME, UPDATE_TIME, TABLE_COLLATION, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_NAME = '${safeTable}'`;

        const result = await api.executeQuery(connectionId, sql);

        if (result.error || result.rows.length === 0) {
          return null;
        }

        const columns = result.columns;
        const row = result.rows[0];

        return {
          table_name: row[columns.indexOf('TABLE_NAME')] as string,
          engine: row[columns.indexOf('ENGINE')] as string,
          row_count: row[columns.indexOf('TABLE_ROWS')] as number,
          data_length: row[columns.indexOf('DATA_LENGTH')] as number,
          index_length: row[columns.indexOf('INDEX_LENGTH')] as number,
          create_time: row[columns.indexOf('CREATE_TIME')] as string,
          update_time: row[columns.indexOf('UPDATE_TIME')] as string,
          collation: row[columns.indexOf('TABLE_COLLATION')] as string,
          comment: row[columns.indexOf('TABLE_COMMENT')] as string,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '获取表信息失败';
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError]
  );

  const getCreateTableSQL = useCallback(
    async (connectionId: string, tableName: string, database?: string) => {
      try {
        setLoading(true);
        const safeDb = database ? escapeSqlIdentifier(database) : '';
        const safeTable = escapeSqlIdentifier(tableName);
        const sql = database
          ? `SHOW CREATE TABLE \`${safeDb}\`.\`${safeTable}\``
          : `SHOW CREATE TABLE \`${safeTable}\``;

        const result = await api.executeQuery(connectionId, sql);

        if (result.error || result.rows.length === 0) {
          return '';
        }

        // SHOW CREATE TABLE 返回两列：Table 和 Create Table
        return result.rows[0][1] as string;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '获取 CREATE TABLE 语句失败';
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError]
  );

  const executeQuery = useCallback(
    async (connectionId: string, sql: string, database?: string) => {
      try {
        setLoading(true);
        const result = await api.executeQuery(connectionId, sql, database);
        if (result.error) {
          message.error(result.error);
        }
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '执行查询失败';
        setError(errorMsg);
        message.error(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError]
  );

  return {
    getTables,
    refreshTables,
    getDatabases,
    getColumns,
    getIndexes,
    getForeignKeys,
    getTableInfo,
    getCreateTableSQL,
    executeQuery,
    schemaCompletionCache,
  };
};

// Schema 补全 Hook
export const useSchemaCompletion = (connectionId: string | null, database?: string) => {
  const { getTables, getColumns } = useDatabase();

  const getSchema = useCallback(async () => {
    if (!connectionId || !database) {
      return { tables: new Map<string, string[]>(), views: new Map<string, string[]>() };
    }

    return schemaCompletionCache.get(
      connectionId,
      database,
      () => getTables(connectionId, database, false),
      (tableName) => getColumns(connectionId, tableName, database)
    );
  }, [connectionId, database, getTables, getColumns]);

  return { getSchema, schemaCompletionCache };
};

export const useInitApp = () => {
  const { loadConnections } = useConnections();

  useEffect(() => {
    loadConnections();

    const handleMenuAction = (event: CustomEvent<{ action: string }>) => {
      console.log('Menu action triggered:', event.detail.action);
    };

    window.addEventListener('menu-action', handleMenuAction);

    const intervalId = setInterval(() => {
      structureCache.cleanup();
    }, 60000);

    return () => {
      window.removeEventListener('menu-action', handleMenuAction);
      clearInterval(intervalId);
    };
  }, [loadConnections]);
};
