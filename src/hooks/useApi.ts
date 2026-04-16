import { useEffect, useCallback, useRef } from 'react';
import { App } from 'antd';
import { useAppStore } from '../stores/appStore';
import { api } from '../api';
import type { ConnectionInput, GroupInput } from '../types/api';

// 性能优化：带 TTL 的 LRU 缓存
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number; // 毫秒

  constructor(maxSize = 100, ttl = 5 * 60 * 1000) { // 默认 5 分钟 TTL
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

// 模块级别的列缓存（跨组件实例共享）- 使用 TTL 缓存
const columnsCache = new TTLCache<Promise<any>>(100, 10 * 60 * 1000); // 10 分钟 TTL

// 定期清理过期缓存
if (typeof window !== 'undefined') {
  setInterval(() => {
    columnsCache.cleanup();
  }, 60000); // 每分钟清理一次
}

export const useConnections = () => {
  const { message } = App.useApp();
  const {
    connections,
    groups,
    activeConnectionId,
    isLoading,
    error,
    setConnections,
    setGroups,
    setActiveConnection,
    setLoading,
    setError,
  } = useAppStore();

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

  const saveConnection = useCallback(async (input: ConnectionInput) => {
    try {
      setLoading(true);
      const connection = await api.saveConnection(input);
      if (input.id) {
        setConnections(connections.map(c => c.id === input.id ? connection : c));
      } else {
        setConnections([...connections, connection]);
      }
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
  }, [connections, setConnections, setLoading, setError]);

  const deleteConnection = useCallback(async (id: string) => {
    try {
      setLoading(true);
      await api.deleteConnection(id);
      setConnections(connections.filter(c => c.id !== id));
      if (activeConnectionId === id) {
        setActiveConnection(null);
      }
      message.success('连接已删除');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '删除连接失败';
      setError(errorMsg);
      message.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [connections, activeConnectionId, setConnections, setActiveConnection, setLoading, setError]);

  const testConnection = useCallback(async (
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
  }, [setLoading, setError]);

  const connect = useCallback(async (connectionId: string) => {
    try {
      setLoading(true);
      await api.connectConnection(connectionId);
      setConnections(connections.map(c =>
        c.id === connectionId ? { ...c, status: 'connected' as const } : c
      ));
      message.success('连接成功');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '连接失败';
      setError(errorMsg);
      message.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [connections, setConnections, setLoading, setError]);

  const disconnect = useCallback(async (connectionId: string) => {
    try {
      setLoading(true);
      await api.disconnectConnection(connectionId);
      setConnections(connections.map(c =>
        c.id === connectionId ? { ...c, status: 'disconnected' as const } : c
      ));
      message.success('已断开连接');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '断开连接失败';
      setError(errorMsg);
      message.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [connections, setConnections, setLoading, setError]);

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
  const {
    groups,
    isLoading,
    setGroups,
    setLoading,
    setError,
  } = useAppStore();

  const saveGroup = useCallback(async (input: GroupInput) => {
    try {
      setLoading(true);
      const group = await api.saveGroup(input);
      if (input.id) {
        setGroups(groups.map(g => g.id === input.id ? group : g));
      } else {
        setGroups([...groups, group]);
      }
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
  }, [groups, setGroups, setLoading, setError]);

  const deleteGroup = useCallback(async (id: string) => {
    try {
      setLoading(true);
      await api.deleteGroup(id);
      setGroups(groups.filter(g => g.id !== id));
      message.success('分组已删除');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '删除分组失败';
      setError(errorMsg);
      message.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [groups, setGroups, setLoading, setError]);

  return {
    groups,
    isLoading,
    saveGroup,
    deleteGroup,
  };
};

export const useDatabase = () => {
  const { message } = App.useApp();
  const { setLoading, setError, setTableData, setTableDataLoading, getTableData, clearTableData } = useAppStore();

  const getTables = useCallback(async (connectionId: string, database?: string, forceRefresh = false) => {
    const cacheKey = `${connectionId}::${database || ''}`;
    
    // If force refresh, clear cache first
    if (forceRefresh) {
      clearTableData(connectionId);
    }

    // Check if we have cached data
    const cached = getTableData(cacheKey);
    if (cached && cached.loaded && !cached.loading && !forceRefresh) {
      return cached.tables;
    }
    
    // If already loading, don't start another request
    if (cached?.loading && !forceRefresh) {
      return cached.tables;
    }
    
    try {
      setTableDataLoading(cacheKey, true);
      const tables = await api.getTables(connectionId, database);
      setTableData(cacheKey, tables);
      return tables;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取表列表失败';
      setError(errorMsg);
      message.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setTableData, setTableDataLoading, getTableData, clearTableData]);

  const refreshTables = useCallback(async (connectionId: string, database?: string) => {
    return getTables(connectionId, database, true);
  }, [getTables]);

  const getDatabases = useCallback(async (connectionId: string) => {
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
  }, [setLoading, setError]);

  const getColumns = useCallback(async (connectionId: string, tableName: string, database?: string) => {
    const cacheKey = `${connectionId}::${database || ''}::${tableName}`;
    
    // 检查缓存 - 使用新的 TTLCache API
    const cached = columnsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const promise = api.getColumns(connectionId, tableName, database);
    columnsCache.set(cacheKey, promise);
    return promise;
  }, []);

  const getIndexes = useCallback(async (connectionId: string, tableName: string, database?: string) => {
    try {
      setLoading(true);
      const indexes = await api.getIndexes(connectionId, tableName, database);
      return indexes;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取索引信息失败';
      setError(errorMsg);
      message.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const getForeignKeys = useCallback(async (connectionId: string, tableName: string, database?: string) => {
    try {
      setLoading(true);
      const fks = await api.getForeignKeys(connectionId, tableName, database);
      return fks;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取外键信息失败';
      setError(errorMsg);
      message.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);
  
  const getTableInfo = useCallback(async (connectionId: string, tableName: string, database?: string) => {
    try {
      setLoading(true);
      const sql = database 
        ? `SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, CREATE_TIME, UPDATE_TIME, TABLE_COLLATION, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${database}' AND TABLE_NAME = '${tableName}'`
        : `SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, CREATE_TIME, UPDATE_TIME, TABLE_COLLATION, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_NAME = '${tableName}'`;
      
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
  }, [setLoading, setError]);
  
  const getCreateTableSQL = useCallback(async (connectionId: string, tableName: string, database?: string) => {
    try {
      setLoading(true);
      const sql = database 
        ? `SHOW CREATE TABLE \`${database}\`.\`${tableName}\``
        : `SHOW CREATE TABLE \`${tableName}\``;
      
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
  }, [setLoading, setError]);

  const executeQuery = useCallback(async (connectionId: string, sql: string, database?: string) => {
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
  }, [setLoading, setError]);

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
  };
};

export const useInitApp = () => {
  const { loadConnections } = useConnections();

  useEffect(() => {
    loadConnections();
    
    // Listen for menu action events from toolbar buttons
    const handleMenuAction = (event: CustomEvent<{ action: string }>) => {
      console.log('Menu action triggered:', event.detail.action);
      // TODO: Implement actual menu action handling
      // This will be connected to Tauri menu system in production
    };
    
    window.addEventListener('menu-action' as any, handleMenuAction as any);
    
    return () => {
      window.removeEventListener('menu-action' as any, handleMenuAction as any);
    };
  }, [loadConnections]);
};
