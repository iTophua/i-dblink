import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ThemePreset } from '../styles/theme';

export type ThemeMode = 'light' | 'dark';

export interface AppSettings {
  pageSize: number;
  themePreset: ThemePreset;
  themeMode: ThemeMode;
  themeSyncSystem: boolean;
  language: 'zh-CN' | 'en-US';
}

interface SettingsState {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: AppSettings = {
  pageSize: 1000,
  themePreset: 'midnightDeep',
  themeMode: 'dark',
  themeSyncSystem: true,
  language: 'zh-CN',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),
      resetSettings: () =>
        set({ settings: defaultSettings }),
    }),
    {
      name: 'idblink-settings',
    }
  )
);
