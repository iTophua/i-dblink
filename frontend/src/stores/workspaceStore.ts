import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SavedTableTab {
  name: string;
  connectionId: string;
  connectionName: string;
  database?: string;
  pinned?: boolean;
}

export interface SavedSqlTab {
  key: string;
  title: string;
  connectionId?: string;
  database?: string;
  content?: string;
  pinned?: boolean;
}

export interface SavedDesignerTab {
  key: string;
  title: string;
  connectionId: string;
  database?: string;
  tableName?: string;
  isNewTable?: boolean;
  pinned?: boolean;
}

export interface SavedViewDefTab {
  key?: string;
  title: string;
  connectionId: string;
  database?: string;
  viewName: string;
  pinned?: boolean;
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
  batchUpdate: (updates: Partial<WorkspaceSnapshot>) => void;
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

const VERSION = 5;

function migrate(state: unknown, version: number | undefined): Partial<WorkspaceState> {
  const s = state as Record<string, unknown>;
  if (version === undefined) {
    return { ...defaultWorkspace };
  }
  if (version === 1) {
    if (s.openedSqlTabs) {
      s.openedSqlTabs = (s.openedSqlTabs as Array<SavedSqlTab & { defaultQuery?: string }>).map((t) => ({
        ...t,
        content: t.content || t.defaultQuery || undefined,
      }));
    }
  }
  if (version === 2) {
    if (!s.openedViewDefTabs) {
      s.openedViewDefTabs = [];
    }
  }
  if (version === 3) {
    // v4: 应用重启后重置连接展开状态
    s.expandedKeys = [];
  }
  if (version === 4) {
    // v5: tab key 格式变更，重置 activeKey 避免找不到对应 tab
    s.activeKey = 'objects';
  }
  // 确保返回完整的 defaultWorkspace 结构
  return { ...defaultWorkspace, ...s } as unknown as WorkspaceSnapshot;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      ...defaultWorkspace,
      updateWorkspace: (updates) =>
        set((state) => {
          // 深度合并以避免不必要的更新
          const newState = { ...state };
          let hasChanges = false;
          
          for (const key in updates) {
            const updateValue = (updates as Record<string, unknown>)[key];
            if (Array.isArray(updateValue)) {
              if (JSON.stringify((newState as Record<string, unknown>)[key]) !== JSON.stringify(updateValue)) {
                (newState as Record<string, unknown>)[key] = [...updateValue];
                hasChanges = true;
              }
            } else if (typeof updateValue === 'object' && updateValue !== null) {
              const current = (newState as Record<string, unknown>)[key] || {};
              const updated = { ...(current as Record<string, unknown>), ...updateValue };
              if (JSON.stringify(current) !== JSON.stringify(updated)) {
                (newState as Record<string, unknown>)[key] = updated;
                hasChanges = true;
              }
            } else {
              if ((newState as Record<string, unknown>)[key] !== updateValue) {
                (newState as Record<string, unknown>)[key] = updateValue;
                hasChanges = true;
              }
            }
          }
          
          return hasChanges ? newState : state;
        }),
        
        batchUpdate: (updates) => {
          set((state) => {
            const newState = { ...state };
            let hasChanges = false;
            
            for (const key in updates) {
              const updateValue = (updates as Record<string, unknown>)[key];
              if (Array.isArray(updateValue)) {
                if (JSON.stringify((newState as Record<string, unknown>)[key]) !== JSON.stringify(updateValue)) {
                  (newState as Record<string, unknown>)[key] = [...updateValue];
                  hasChanges = true;
                }
              } else if (typeof updateValue === 'object' && updateValue !== null) {
                const current = (newState as Record<string, unknown>)[key] || {};
                const updated = { ...(current as Record<string, unknown>), ...updateValue };
                if (JSON.stringify(current) !== JSON.stringify(updated)) {
                  (newState as Record<string, unknown>)[key] = updated;
                  hasChanges = true;
                }
              } else {
                if ((newState as Record<string, unknown>)[key] !== updateValue) {
                  (newState as Record<string, unknown>)[key] = updateValue;
                  hasChanges = true;
                }
              }
            }
            
            return hasChanges ? newState : state;
          });
        },
      clearWorkspace: () => set(defaultWorkspace),
    }),
    {
      name: 'idblink-workspace',
      version: VERSION,
      migrate: migrate,
    }
  )
);
