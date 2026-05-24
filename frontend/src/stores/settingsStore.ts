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

function migrate(state: unknown, version: number | undefined): Partial<SettingsState> {
  if (version === undefined) {
    return { settings: defaultSettings };
  }

  const s = state as Record<string, unknown>;
  const stateSettings = s.settings as Record<string, unknown> | undefined;

  // 迁移逻辑：从旧版格式迁移到新版格式
  if (stateSettings && stateSettings.theme && !stateSettings.themePreset) {
    const oldTheme = stateSettings.theme as string;
    const preset =
      oldTheme === 'dark'
        ? 'midnightDeep'
        : oldTheme === 'light'
          ? 'nordicFrost'
          : 'midnightDeep';
    const mode: ThemeMode =
      oldTheme === 'system'
        ? typeof window !== 'undefined'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : 'dark'
        : (oldTheme as ThemeMode);
    return {
      settings: {
        ...defaultSettings,
        ...(stateSettings as unknown as Partial<AppSettings>),
        themePreset: preset,
        themeMode: mode,
        themeSyncSystem: oldTheme === 'system',
      },
    };
  }

  return {
    settings: { ...defaultSettings, ...stateSettings },
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
      resetSettings: () =>
        set(() => {
          i18n.changeLanguage(defaultSettings.language);
          return { settings: defaultSettings };
        }),
    }),
    {
      name: 'idblink-settings',
      version: VERSION,
      migrate: migrate,
      onRehydrateStorage: () => (state) => {
        if (state && state.settings.language) {
          i18n.changeLanguage(state.settings.language);
        }
      },
    }
  )
);
