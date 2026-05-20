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
  if (version === 3) {
    // v4: 应用重启后重置连接展开状态
    state.expandedKeys = [];
  }
  if (version === 4) {
    // v5: tab key 格式变更，重置 activeKey 避免找不到对应 tab
    state.activeKey = 'objects';
  }
  // 确保返回完整的 defaultWorkspace 结构
  return { ...defaultWorkspace, ...state };
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
            const updateValue = (updates as any)[key];
            if (Array.isArray(updateValue)) {
              // 对于数组，检查是否需要更新
              if (JSON.stringify((newState as any)[key]) !== JSON.stringify(updateValue)) {
                (newState as any)[key] = [...updateValue];
                hasChanges = true;
              }
            } else if (typeof updateValue === 'object' && updateValue !== null) {
              // 对于对象，深度合并
              const current = (newState as any)[key] || {};
              const updated = { ...current, ...updateValue };
              if (JSON.stringify(current) !== JSON.stringify(updated)) {
                (newState as any)[key] = updated;
                hasChanges = true;
              }
            } else {
              // 对于基本类型，直接赋值
              if ((newState as any)[key] !== updateValue) {
                (newState as any)[key] = updateValue;
                hasChanges = true;
              }
            }
          }
          
          return hasChanges ? newState : state;
        }),
        
        // 批量更新方法，减少多次状态更新的开销
        batchUpdate: (updates) => {
          set((state) => {
            const newState = { ...state };
            let hasChanges = false;
            
            for (const key in updates) {
              const updateValue = (updates as any)[key];
              if (Array.isArray(updateValue)) {
                if (JSON.stringify((newState as any)[key]) !== JSON.stringify(updateValue)) {
                  (newState as any)[key] = [...updateValue];
                  hasChanges = true;
                }
              } else if (typeof updateValue === 'object' && updateValue !== null) {
                const current = (newState as any)[key] || {};
                const updated = { ...current, ...updateValue };
                if (JSON.stringify(current) !== JSON.stringify(updated)) {
                  (newState as any)[key] = updated;
                  hasChanges = true;
                }
              } else {
                if ((newState as any)[key] !== updateValue) {
                  (newState as any)[key] = updateValue;
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
