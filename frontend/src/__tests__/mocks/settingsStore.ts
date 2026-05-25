import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ThemePreset } from '../../styles/theme';

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
  themePreset: ThemePreset;
  themeMode: ThemeMode;
  language: 'zh-CN' | 'en-US';
  settingsActiveTab?: 'general' | 'appearance' | 'language' | 'shortcuts';
  shortcuts: Record<string, string>;
}

interface SettingsState {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: AppSettings = {
  pageSize: 1000,
  maxResultRows: 10000,
  themePreset: 'midnightDeep',
  themeMode: 'system',
  language: 'zh-CN',
  shortcuts: {},
};

const VERSION = 1;

function migrate(state: any, version: number | undefined): Partial<SettingsState> {
  if (version === undefined) {
    return { settings: defaultSettings };
  }

  if (state.settings && state.settings.theme && !state.settings.themePreset) {
    const oldSettings = state.settings;
    const preset =
      oldSettings.theme === 'dark'
        ? 'midnightDeep'
        : oldSettings.theme === 'light'
          ? 'nordicFrost'
          : 'midnightDeep';
    const mode: ThemeMode = oldSettings.theme === 'system' ? 'system' : oldSettings.theme;
    return {
      settings: {
        ...defaultSettings,
        ...oldSettings,
        themePreset: preset,
        themeMode: mode,
      },
    };
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
