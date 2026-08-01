import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ShortcutConfig {
  id: string;
  keys: string;
  description: string;
  category: 'file' | 'edit' | 'view' | 'connection' | 'tools' | 'window' | 'help';
}

export interface AppSettings {
  pageSize: number;
  maxResultRows: number;

  themeMode: ThemeMode;
  language: 'zh-CN' | 'en-US';
  settingsActiveTab?: 'general' | 'appearance' | 'language' | 'shortcuts' | 'editor';
  shortcuts: Record<string, string>;
  liveTemplatesEnabled: boolean;
  editorWordWrap: boolean;
}

interface SettingsState {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: AppSettings = {
  pageSize: 1000,
  maxResultRows: 10000,

  themeMode: 'system',
  language: 'zh-CN',
  shortcuts: {},
  liveTemplatesEnabled: true,
  editorWordWrap: false,
};

const VERSION = 1;

function migrate(state: any, version: number | undefined): Partial<SettingsState> {
  if (version === undefined) {
    return { settings: defaultSettings };
  }

  // 迁移：从 themeSyncSystem 字段迁移到 themeMode: 'system'
  if (state.settings && 'themeSyncSystem' in state.settings) {
    const syncSystem = state.settings.themeSyncSystem as boolean;
    const currentMode = (state.settings.themeMode as ThemeMode) || 'dark';
    const newMode: ThemeMode = syncSystem ? 'system' : currentMode;
    const { themeSyncSystem, ...restSettings } = state.settings;
    return {
      settings: {
        ...defaultSettings,
        ...restSettings,
        themeMode: newMode,
      },
    };
  }

  return {
    settings: { ...defaultSettings, ...state.settings },
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),
      resetSettings: () => set({ settings: defaultSettings }),
    }),
    {
      name: 'idblink-settings-test',
      version: VERSION,
      migrate: migrate,
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
