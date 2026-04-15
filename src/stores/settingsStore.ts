import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppSettings {
  pageSize: number;
  theme: 'light' | 'dark' | 'system';
  language: 'zh-CN' | 'en-US';
}

interface SettingsState {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: AppSettings = {
  pageSize: 1000,
  theme: 'system',
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
