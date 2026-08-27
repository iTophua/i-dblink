import { useEffect, useCallback } from 'react';
import { App } from 'antd';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/appStore';
import { api } from '../api';
import i18n from '../i18n';
import type { ConnectionInput, GroupInput } from '../types/api';

import { getDialect } from '../utils/sqlDialects';

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

    // LRU: 访问后重新设置以更新顺序
    this.cache.delete(key);
    this.cache.set(key, { ...entry, timestamp: Date.now() });

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
  tables: Map<string, string[]>; // tableName -> columnNames
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

      // 分批并行获取列信息，每批10个，避免同时发起过多请求压垮 sidecar
      const BATCH_SIZE = 10;
      for (let i = 0; i < tablesResult.length; i += BATCH_SIZE) {
        const batch = tablesResult.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (table) => {
            const tableType = (table.table_type || '').toUpperCase().trim();
            const isView =
              tableType === 'VIEW' || tableType === 'SYSTEM VIEW' || tableType === 'MATERIALIZED VIEW';

            try {
              const columns = await getColumns(table.table_name);
              return {
                tableName: table.table_name,
                columns: columns.map((c) => c.column_name),
                isView,
              };
            } catch {
              return {
                tableName: table.table_name,
                columns: [],
                isView,
              };
            }
          })
        );

        for (const result of batchResults) {
          const targetMap = result.isView ? viewsMap : tablesMap;
          targetMap.set(result.tableName, result.columns);
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

// 连接尝试代数（键为 connectionID）：取消时递增，作废迟到的结果——
// 避免用户取消后又跳成"已连接"，或取消引发的后端错误弹提示
const connectGenerations = new Map<string, number>();
// 进行中的连接 Promise（键为 connectionID）：并发触发连接时复用同一次请求。
// 展开节点 + 双击、查询 Tab 自动连接等场景可能与用户操作并发触发，
// 两个并发连接会在后端撞上 "connection already exists" 报错（表现为
// 首次连接报错、重试立刻成功）
const connectInFlight = new Map<string, Promise<void>>();

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
      // 应用重启后重置所有连接状态为断开
      const resetConnections = connectionsData.map((conn) => ({
        ...conn,
        status: 'disconnected' as const,
      }));
      setConnections(resetConnections);
      setGroups(groupsData);
      setActiveConnection(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '加载连接失败';
      setError(errorMsg);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [setConnections, setGroups, setActiveConnection, setLoading, setError]);

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
        message.success(i18n.t('common.connectionDeleted'));
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
        message.success(i18n.t('common.connectionTestSuccess'));
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
      // 已有同 ID 连接进行中：直接复用该次结果（取消语义由其内部的 generation 承载）
      const existing = connectInFlight.get(connectionId);
      if (existing) return existing;

      const attempt = (async () => {
        const generation = (connectGenerations.get(connectionId) || 0) + 1;
        connectGenerations.set(connectionId, generation);
        // 只亮连接自身的指示灯（status='loading'，树上橙色脉冲），不再翻转全局
        // loading 让整棵树面板转圈
        setConnections((prev) =>
          prev.map((c) => (c.id === connectionId ? { ...c, status: 'loading' as const } : c))
        );
        try {
          await api.connectConnection(connectionId);
          if (connectGenerations.get(connectionId) !== generation) {
            throw new Error(i18n.t('common.connectionCancelled'));
          }
          setConnections((prev) =>
            prev.map((c) => (c.id === connectionId ? { ...c, status: 'connected' as const } : c))
          );
          message.success(i18n.t('common.connectionSuccess'));
        } catch (err) {
          // 用户已取消：静默中止（状态已由 cancelConnect 重置），不弹错误
          if (connectGenerations.get(connectionId) !== generation) {
            throw new Error(i18n.t('common.connectionCancelled'), { cause: err });
          }
          setConnections((prev) =>
            prev.map((c) => (c.id === connectionId ? { ...c, status: 'disconnected' as const } : c))
          );
          const errorMsg = err instanceof Error ? err.message : String(err);
          // 检查是否是密码错误（后端返回 PASSWORD_REQUIRED）
          if (
            errorMsg === 'PASSWORD_REQUIRED' ||
            (typeof err === 'object' &&
              err !== null &&
              'code' in err &&
              (err as Record<string, unknown>).code === 'PASSWORD_REQUIRED')
          ) {
            const error = new Error('密码错误，请重新输入') as Error & { code: string };
            error.code = 'PASSWORD_REQUIRED';
            throw error;
          }
          setError(errorMsg);
          // 瞬时网络未就绪（no route to host 等）：附上可操作的提示
          // （后端已自动重试 3 次，走到这里说明仍失败，多半是权限/VPN 问题）
          if (/no route to host|network is (down|unreachable)|host is down/i.test(errorMsg)) {
            message.error(
              `${errorMsg}\n${i18n.t('common.connectNetworkHint')}`,
              6
            );
          } else {
            message.error(errorMsg);
          }
          throw err;
        }
      })();

      connectInFlight.set(connectionId, attempt);
      try {
        return await attempt;
      } finally {
        connectInFlight.delete(connectionId);
      }
    },
    [setConnections, setError]
  );

  /** 取消进行中的连接：立即重置状态并中止后端拨号，迟到的结果作废 */
  const cancelConnect = useCallback(
    async (connectionId: string) => {
      connectGenerations.set(connectionId, (connectGenerations.get(connectionId) || 0) + 1);
      setConnections((prev) =>
        prev.map((c) => (c.id === connectionId ? { ...c, status: 'disconnected' as const } : c))
      );
      try {
        await api.cancelConnection(connectionId);
      } catch {
        // 后端可能从未开始连接或已完成——无需反馈
      }
    },
    [setConnections]
  );

  const disconnect = useCallback(
    async (connectionId: string) => {
      try {
        setLoading(true);
        await api.disconnectConnection(connectionId);
        setConnections((prev) =>
          prev.map((c) => (c.id === connectionId ? { ...c, status: 'disconnected' as const } : c))
        );
        message.success(i18n.t('common.connectionDisconnected'));
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
    cancelConnect,
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
        message.success(i18n.t('common.groupDeleted'));
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
// in-flight 去重：同 cacheKey 且同 search 的并发调用复用同一个请求。
// search 不同则不复用——否则新搜索值会被静默丢弃（复用旧搜索的 Promise），
// 表现为"输入结束后结果对不上搜索词"。
const tableLoadingPromises = new Map<
  string,
  {
    promise: Promise<import('../types/api').TableInfo[]>;
    search?: string;
    requestId: number;
  }
>();
// 每个 cacheKey 的最新请求序号：搜索快速变化时旧请求可能后返回，
// 只有最新请求才允许写缓存，防止过期响应覆盖新结果
let tableRequestSeq = 0;
const latestTableRequestId = new Map<string, number>();

export const useDatabase = () => {
  const { message } = App.useApp();
  // 用 useShallow 只在 action 引用变化时重渲染（action 是稳定的，不会触发），
  // 避免 useAppStore() 无 selector 订阅整个 store 导致所有组件重渲染。
  const {
    setLoading,
    setError,
    setTableData,
    setTableDataLoading,
    setTableDataFailed,
    getTableData,
  } = useAppStore(
    useShallow((s) => ({
      setLoading: s.setLoading,
      setError: s.setError,
      setTableData: s.setTableData,
      setTableDataLoading: s.setTableDataLoading,
      setTableDataFailed: s.setTableDataFailed,
      getTableData: s.getTableData,
    }))
  );

  const getTables = useCallback(
    async (
      connectionId: string,
      database?: string,
      forceRefresh = false,
      search?: string,
      silent = false
    ) => {
      const cacheKey = `${connectionId}::${database || ''}`;

      // 如果已有正在进行的请求且搜索词相同，复用该 Promise
      const existing = tableLoadingPromises.get(cacheKey);
      if (existing && existing.search === search) {
        return existing.promise;
      }

      const cached = getTableData(cacheKey);
      if (cached && cached.loaded && !cached.loading && !forceRefresh && !search) {
        return cached.tables;
      }

      // 如果正在加载中且非强制刷新，直接返回
      if (cached?.loading && !forceRefresh) {
        return cached.tables;
      }

      const requestId = ++tableRequestSeq;
      latestTableRequestId.set(cacheKey, requestId);

      const promise = (async () => {
        try {
          setTableDataLoading(cacheKey, true);
          console.log('[DEBUG] Calling getTablesCategorized with:', { connectionId, database, search });
          const result = await api.getTablesCategorized(connectionId, database, search);
          console.log('[DEBUG] getTablesCategorized result:', JSON.stringify(result, null, 2));
          const allTables = [...(result.tables || []), ...(result.views || [])];
          console.log('[DEBUG] allTables count:', allTables.length, 'tables:', result.tables?.length, 'views:', result.views?.length);
          // 过期响应仲裁：仅当本请求仍是该 cacheKey 的最新请求时才写缓存/报错
          if (latestTableRequestId.get(cacheKey) === requestId) {
            setTableData(cacheKey, allTables);
          }
          return allTables;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '获取表列表失败';
          if (latestTableRequestId.get(cacheKey) === requestId) {
            console.error('获取表列表失败:', connectionId, database, err);
            setError(errorMsg);
            message.error(errorMsg);
            setTableDataFailed(cacheKey, true);
          }
          return [];
        } finally {
          if (tableLoadingPromises.get(cacheKey)?.requestId === requestId) {
            tableLoadingPromises.delete(cacheKey);
          }
          if (latestTableRequestId.get(cacheKey) === requestId) {
            latestTableRequestId.delete(cacheKey);
          }
          // silent 模式（如编辑器补全）不翻转全局 loading，避免整棵连接树错误转圈
          if (!silent) setLoading(false);
        }
      })();

      tableLoadingPromises.set(cacheKey, { promise, search, requestId });
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

      const TIMEOUT_MS = 15000;

      const promise = (async () => {
        const result = await Promise.race([
          api.getTableStructure(connectionId, tableName, database),
          new Promise<import('../api').TableStructure>((_, reject) =>
            setTimeout(() => reject(new Error('获取表结构超时 (15s)，请检查 Go sidecar 是否运行或网络连接')), TIMEOUT_MS)
          ),
        ]);
        return result;
      })();

      structureCache.set(cacheKey, promise);

      promise.catch(() => {
        structureCache.delete(cacheKey);
      });

      return promise;
    },
    []
  );

  const getColumns = useCallback(
    async (connectionId: string, tableName: string, database?: string) => {
      const result = await getTableStructureCached(connectionId, tableName, database);
      return result.columns || [];
    },
    [getTableStructureCached]
  );

  const getAllColumns = useCallback(
    async (connectionId: string, database?: string, silent = false) => {
      try {
        if (!silent) setLoading(true);
        const result = await api.getAllColumns(connectionId, database);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '批量获取列信息失败';
        setError(errorMsg);
        if (!silent) message.error(errorMsg);
        throw err;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [setLoading, setError]
  );

  const getIndexes = useCallback(
    async (connectionId: string, tableName: string, database?: string) => {
      const result = await getTableStructureCached(connectionId, tableName, database);
      return result.indexes || [];
    },
    [getTableStructureCached]
  );

  const getForeignKeys = useCallback(
    async (connectionId: string, tableName: string, database?: string) => {
      const result = await getTableStructureCached(connectionId, tableName, database);
      return result.foreign_keys || [];
    },
    [getTableStructureCached]
  );

  const getTableInfo = useCallback(
    async (connectionId: string, tableName: string, database?: string) => {
      try {
        setLoading(true);
        const conn = useAppStore.getState().connections.find((c) => c.id === connectionId);
        const dbType = conn?.db_type || 'mysql';
        const dialect = getDialect(dbType);

        const sql = dialect.buildTableInfoQuery(tableName, database);
        const result = await api.executeQuery(connectionId, sql, database);

        if (result.error || result.rows.length === 0) {
          return null;
        }

        const columns = result.columns;
        const row = result.rows[0];

        // 统一的字段映射
        const getValue = (names: string[]): unknown => {
          for (const name of names) {
            const idx = columns.indexOf(name);
            if (idx >= 0) return row[idx];
          }
          return undefined;
        };

        return {
          table_name: getValue(['table_name', 'TABLE_NAME', 'name']) as string,
          table_type: getValue(['table_type', 'TABLE_TYPE', 'type']) as string,
          engine: getValue(['engine', 'ENGINE']) as string,
          row_count: getValue(['row_count', 'TABLE_ROWS', 'NUM_ROWS', 'rows']) as number,
          data_length: getValue(['data_length', 'DATA_LENGTH', 'data_size', 'BYTES']) as number,
          index_length: getValue(['index_length', 'INDEX_LENGTH', 'index_size']) as number,
          create_time: getValue(['create_time', 'CREATE_TIME']) as string,
          update_time: getValue(['update_time', 'UPDATE_TIME']) as string,
          collation: getValue(['collation', 'TABLE_COLLATION']) as string,
          comment: getValue(['comment', 'TABLE_COMMENT', 'COMMENTS']) as string,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '获取表信息失败';
        setError(errorMsg);
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
        const conn = useAppStore.getState().connections.find((c) => c.id === connectionId);
        const dbType = conn?.db_type || 'mysql';
        const dialect = getDialect(dbType);

        const sql = dialect.buildTableDDLQuery(tableName, database);
        const result = await api.executeQuery(connectionId, sql, database);

        if (result.error || result.rows.length === 0) {
          return '';
        }

        // 根据数据库类型解析结果
        if (dbType === 'sqlite') {
          return result.rows[0][0] as string;
        }
        // 大多数数据库返回单列结果
        return result.rows[0][result.columns.length > 1 ? 1 : 0] as string;
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
    async (connectionId: string, sql: string, database?: string, signal?: AbortSignal) => {
      try {
        setLoading(true);
        const result = await api.executeQuery(connectionId, sql, database, signal);
        if (result.error) {
          message.error(result.error);
        }
        return result;
      } catch (err) {
        // abort 不算错误，重新抛出让上层区分（区分"停止"与"真无数据"）
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
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
    getAllColumns,
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
