import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SavedTableTab {
  name: string;
  connectionId: string;
  connectionName: string;
  database?: string;
}

export interface SavedSqlTab {
  key: string;
  title: string;
  connectionId?: string;
  database?: string;
}

export interface SavedDesignerTab {
  key: string;
  title: string;
  connectionId: string;
  database?: string;
  tableName?: string;
  isNewTable?: boolean;
}

export interface WorkspaceSnapshot {
  openedTables: SavedTableTab[];
  openedSqlTabs: SavedSqlTab[];
  openedDesignerTabs: SavedDesignerTab[];
  activeKey: string;
  sidebarCollapsed: boolean;
  expandedKeys: string[];
}

interface WorkspaceState extends WorkspaceSnapshot {
  updateWorkspace: (updates: Partial<WorkspaceSnapshot>) => void;
  clearWorkspace: () => void;
}

const defaultWorkspace: WorkspaceSnapshot = {
  openedTables: [],
  openedSqlTabs: [],
  openedDesignerTabs: [],
  activeKey: 'objects',
  sidebarCollapsed: false,
  expandedKeys: [],
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      ...defaultWorkspace,
      updateWorkspace: (updates) =>
        set((state) => ({
          ...state,
          ...updates,
        })),
      clearWorkspace: () => set(defaultWorkspace),
    }),
    {
      name: 'idblink-workspace',
    }
  )
);
