import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ThemePreset } from '../styles/theme';
import i18n from '../i18n';

export type ThemeMode = 'light' | 'dark';

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
  themeSyncSystem: boolean;
  language: 'zh-CN' | 'en-US';
  settingsActiveTab?: 'general' | 'appearance' | 'language' | 'shortcuts';
  shortcuts: Record<string, string>; // id -> keys
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
  themeMode: 'dark',
  themeSyncSystem: true,
  language: 'zh-CN',
  shortcuts: {},
};

const VERSION = 1;

function migrate(state: any, version: number | undefined): Partial<SettingsState> {
  if (version === undefined) {
    return { settings: defaultSettings };
  }

  // 迁移逻辑：从旧版格式迁移到新版格式
  if (state.settings && state.settings.theme && !state.settings.themePreset) {
    const oldSettings = state.settings;
    const preset =
      oldSettings.theme === 'dark'
        ? 'midnightDeep'
        : oldSettings.theme === 'light'
          ? 'nordicFrost'
          : 'midnightDeep';
    let mode: ThemeMode = 'dark';
    if (typeof window !== 'undefined' && oldSettings.theme === 'system') {
      mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else if (oldSettings.theme === 'system') {
      mode = 'dark'; // fallback for non-browser environments
    } else {
      mode = oldSettings.theme as ThemeMode;
    }
    return {
      settings: {
        ...defaultSettings,
        ...oldSettings,
        themePreset: preset,
        themeMode: mode,
        themeSyncSystem: oldSettings.theme === 'system',
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
        set((state) => {
          const newSettings = { ...state.settings, ...updates };
          if ('language' in updates && updates.language !== state.settings.language) {
            i18n.changeLanguage(updates.language);
          }
          return { settings: newSettings };
        }),
      resetSettings: () => set({ settings: defaultSettings }),
    }),
    {
      name: 'idblink-settings',
      version: VERSION,
      migrate: migrate,
    }
  )
);
