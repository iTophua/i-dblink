import { useEffect, useCallback } from 'react';
import { App } from 'antd';
import { useAppStore } from '../stores/appStore';
import { api } from '../api';
import type { ConnectionInput, GroupInput } from '../types/api';

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
    password: string
  ) => {
    try {
      setLoading(true);
      const result = await api.testConnection(dbType, host, port, username, password);
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
  const { setLoading, setError } = useAppStore();

  const getTables = useCallback(async (connectionId: string) => {
    try {
      setLoading(true);
      const tables = await api.getTables(connectionId);
      return tables;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取表列表失败';
      setError(errorMsg);
      message.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const getColumns = useCallback(async (connectionId: string, tableName: string) => {
    try {
      setLoading(true);
      const columns = await api.getColumns(connectionId, tableName);
      return columns;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取列信息失败';
      setError(errorMsg);
      message.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const executeQuery = useCallback(async (connectionId: string, sql: string) => {
    try {
      setLoading(true);
      const result = await api.executeQuery(connectionId, sql);
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
    getColumns,
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
