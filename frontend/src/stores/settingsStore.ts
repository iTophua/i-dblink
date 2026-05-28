import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '../i18n';
import type { ThemePreset } from '../styles/theme';

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
  themePreset: ThemePreset;
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
  themeMode: 'system',
  themePreset: 'default',
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

  // 迁移：从 themeSyncSystem 字段迁移到 themeMode: 'system'
  if (stateSettings && 'themeSyncSystem' in stateSettings) {
    const syncSystem = stateSettings.themeSyncSystem as boolean;
    const currentMode = (stateSettings.themeMode as ThemeMode) || 'dark';
    const newMode: ThemeMode = syncSystem ? 'system' : currentMode;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { themeSyncSystem, ...restSettings } = stateSettings as Record<string, unknown>;
    return {
      settings: {
        ...defaultSettings,
        ...(restSettings as unknown as Partial<AppSettings>),
        themeMode: newMode,
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
