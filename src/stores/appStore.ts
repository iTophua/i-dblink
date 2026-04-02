import { create } from 'zustand';
import type { ConnectionOutput, GroupOutput } from '../types/api';

export interface Connection extends ConnectionOutput {
  tables?: string[];
  views?: string[];
  procedures?: string[];
}

export interface ConnectionGroup extends GroupOutput {
  children?: ConnectionGroup[];
}

interface AppState {
  connections: Connection[];
  activeConnectionId: string | null;
  groups: ConnectionGroup[];
  isLoading: boolean;
  error: string | null;
  
  addConnection: (connection: Connection) => void;
  updateConnection: (id: string, connection: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;
  setConnections: (connections: Connection[]) => void;
  setActiveConnection: (id: string | null) => void;
  
  addGroup: (group: ConnectionGroup) => void;
  updateGroup: (id: string, group: Partial<ConnectionGroup>) => void;
  deleteGroup: (id: string) => void;
  setGroups: (groups: ConnectionGroup[]) => void;
  
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  connections: [],
  activeConnectionId: null,
  groups: [
    { 
      id: 'default', 
      name: '默认分组', 
      icon: '📁', 
      color: '#6d6d6d',
      parent_id: undefined 
    }
  ],
  isLoading: false,
  error: null,
  
  addConnection: (connection) => set((state) => ({
    connections: [...state.connections, connection]
  })),
  
  setConnections: (connections) => set({ connections }),
  
  updateConnection: (id, updated) => set((state) => ({
    connections: state.connections.map(conn => 
      conn.id === id ? { ...conn, ...updated } : conn
    )
  })),
  
  deleteConnection: (id) => set((state) => ({
    connections: state.connections.filter(conn => conn.id !== id),
    activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId
  })),
  
  setActiveConnection: (id) => set({ activeConnectionId: id }),
  
  addGroup: (group) => set((state) => ({
    groups: [...state.groups, group]
  })),
  
  setGroups: (groups) => set({ groups }),
  
  updateGroup: (id, updated) => set((state) => ({
    groups: state.groups.map(g => g.id === id ? { ...g, ...updated } : g)
  })),
  
  deleteGroup: (id) => set((state) => ({
    groups: state.groups.filter(g => g.id !== id)
  })),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error })
}));
