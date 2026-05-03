import { create } from 'zustand';
import type { ConnectionOutput, GroupOutput, TableInfo } from '../types/api';

export interface Connection extends ConnectionOutput {
  tables?: string[];
  views?: string[];
  procedures?: string[];
}

export interface ConnectionGroup extends GroupOutput {
  children?: ConnectionGroup[];
}

// Table data cache structure
interface TableDataCache {
  tables: TableInfo[];
  loaded: boolean;
  loading: boolean;
  loadFailed?: boolean;
  lastUpdated?: number;
}

interface AppState {
  connections: Connection[];
  activeConnectionId: string | null;
  groups: ConnectionGroup[];
  isLoading: boolean;
  error: string | null;
  transactionStartTime: number | null;

  // Table data cache: key = `${connectionId}::${database}`
  tableDataCache: Record<string, TableDataCache>;

  addConnection: (connection: Connection) => void;
  updateConnection: (id: string, connection: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;
  setConnections: (connections: Connection[] | ((prev: Connection[]) => Connection[])) => void;
  setActiveConnection: (id: string | null | ((prev: string | null) => string | null)) => void;

  addGroup: (group: ConnectionGroup) => void;
  updateGroup: (id: string, group: Partial<ConnectionGroup>) => void;
  deleteGroup: (id: string) => void;
  setGroups: (groups: ConnectionGroup[] | ((prev: ConnectionGroup[]) => ConnectionGroup[])) => void;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setTransactionStartTime: (time: number | null) => void;

  // Table data cache methods
  setTableData: (key: string, tables: TableInfo[]) => void;
  setTableDataLoading: (key: string, loading: boolean) => void;
  setTableDataFailed: (key: string, failed: boolean) => void;
  getTableData: (key: string) => TableDataCache | undefined;
  clearTableData: (connectionId?: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  groups: [
    {
      id: 'default',
      name: '不分组',
      icon: '📁',
      color: '#6d6d6d',
      parent_id: undefined,
    },
  ],
  isLoading: false,
  error: null,
  transactionStartTime: null,
  tableDataCache: {},

  addConnection: (connection) =>
    set((state) => ({
      connections: [...state.connections, connection],
    })),

  setConnections: (connections) =>
    set((state) => ({
      connections: typeof connections === 'function' ? connections(state.connections) : connections,
    })),

  updateConnection: (id, updated) =>
    set((state) => ({
      connections: state.connections.map((conn) =>
        conn.id === id ? { ...conn, ...updated } : conn
      ),
    })),

  deleteConnection: (id) =>
    set((state) => ({
      connections: state.connections.filter((conn) => conn.id !== id),
      activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
    })),

  setActiveConnection: (id) =>
    set((state) => ({
      activeConnectionId: typeof id === 'function' ? id(state.activeConnectionId) : id,
    })),

  addGroup: (group) =>
    set((state) => ({
      groups: [...state.groups, group],
    })),

  setGroups: (groups) =>
    set((state) => ({
      groups: typeof groups === 'function' ? groups(state.groups) : groups,
    })),

  updateGroup: (id, updated) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, ...updated } : g)),
    })),

  deleteGroup: (id) =>
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== id),
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setTransactionStartTime: (time) => set({ transactionStartTime: time }),

  // Table data cache methods
  setTableData: (key, tables) =>
    set((state) => ({
      tableDataCache: {
        ...state.tableDataCache,
        [key]: {
          tables,
          loaded: true,
          loading: false,
          lastUpdated: Date.now(),
        },
      },
    })),

  setTableDataLoading: (key, loading) =>
    set((state) => ({
      tableDataCache: {
        ...state.tableDataCache,
        [key]: {
          ...(state.tableDataCache[key] || { tables: [], loaded: false }),
          loading,
        },
      },
    })),

  setTableDataFailed: (key, failed) =>
    set((state) => ({
      tableDataCache: {
        ...state.tableDataCache,
        [key]: {
          ...(state.tableDataCache[key] || { tables: [], loaded: false }),
          loadFailed: failed,
          loading: false, // 失败时重置 loading 状态
        },
      },
    })),

  getTableData: (key) => {
    const state = get();
    return state.tableDataCache[key];
  },

  clearTableData: (connectionId) =>
    set((state) => {
      if (connectionId) {
        // Clear cache for specific connection
        const newCache = { ...state.tableDataCache };
        Object.keys(newCache).forEach((key) => {
          if (key.startsWith(`${connectionId}::`)) {
            delete newCache[key];
          }
        });
        return { tableDataCache: newCache };
      }
      return { tableDataCache: {} };
    }),
}));
