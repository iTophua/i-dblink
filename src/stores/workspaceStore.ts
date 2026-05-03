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
  content?: string;
}

export interface SavedDesignerTab {
  key: string;
  title: string;
  connectionId: string;
  database?: string;
  tableName?: string;
  isNewTable?: boolean;
}

export interface SavedViewDefTab {
  key?: string;
  title: string;
  connectionId: string;
  database?: string;
  viewName: string;
}

export interface WorkspaceSnapshot {
  openedTables: SavedTableTab[];
  openedSqlTabs: SavedSqlTab[];
  openedDesignerTabs: SavedDesignerTab[];
  openedViewDefTabs: SavedViewDefTab[];
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
  openedViewDefTabs: [],
  activeKey: 'objects',
  sidebarCollapsed: false,
  expandedKeys: [],
};

const VERSION = 3;

function migrate(state: any, version: number | undefined): Partial<WorkspaceState> {
  if (version === undefined) {
    return { ...defaultWorkspace };
  }
  if (version === 1) {
    if (state.openedSqlTabs) {
      state.openedSqlTabs = state.openedSqlTabs.map((t: any) => ({
        ...t,
        content: t.content || t.defaultQuery || undefined,
      }));
    }
  }
  if (version === 2) {
    if (!state.openedViewDefTabs) {
      state.openedViewDefTabs = [];
    }
  }
  return { ...defaultWorkspace, ...state };
}

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
      version: VERSION,
      migrate: migrate,
    }
  )
);
