import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../__tests__/mocks/settingsStore';
import type { AppSettings } from '../stores/settingsStore';

const defaultSettings: AppSettings = {
  pageSize: 1000,
  maxResultRows: 10000,
  themePreset: 'midnightDeep',
  themeMode: 'dark',
  themeSyncSystem: true,
  language: 'zh-CN',
  shortcuts: {},
};

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetSettings();
  });

  describe('initial state', () => {
    it('has default settings', () => {
      const settings = useSettingsStore.getState().settings;
      expect(settings.pageSize).toBe(1000);
      expect(settings.maxResultRows).toBe(10000);
      expect(settings.themePreset).toBe('midnightDeep');
      expect(settings.themeMode).toBe('dark');
      expect(settings.themeSyncSystem).toBe(true);
      expect(settings.language).toBe('zh-CN');
      expect(settings.shortcuts).toEqual({});
    });
  });

  describe('updateSettings', () => {
    it('updates pageSize', () => {
      useSettingsStore.getState().updateSettings({ pageSize: 500 });
      expect(useSettingsStore.getState().settings.pageSize).toBe(500);
    });

    it('updates maxResultRows', () => {
      useSettingsStore.getState().updateSettings({ maxResultRows: 5000 });
      expect(useSettingsStore.getState().settings.maxResultRows).toBe(5000);
    });

    it('updates themePreset', () => {
      useSettingsStore.getState().updateSettings({ themePreset: 'nordicFrost' });
      expect(useSettingsStore.getState().settings.themePreset).toBe('nordicFrost');
    });

    it('updates themeMode', () => {
      useSettingsStore.getState().updateSettings({ themeMode: 'light' });
      expect(useSettingsStore.getState().settings.themeMode).toBe('light');
    });

    it('updates themeSyncSystem', () => {
      useSettingsStore.getState().updateSettings({ themeSyncSystem: false });
      expect(useSettingsStore.getState().settings.themeSyncSystem).toBe(false);
    });

    it('updates language', () => {
      useSettingsStore.getState().updateSettings({ language: 'en-US' });
      expect(useSettingsStore.getState().settings.language).toBe('en-US');
    });

    it('updates shortcuts', () => {
      useSettingsStore.getState().updateSettings({ shortcuts: { 'new-connection': 'ctrl+N' } });
      expect(useSettingsStore.getState().settings.shortcuts['new-connection']).toBe('ctrl+N');
    });

    it('updates multiple settings at once', () => {
      useSettingsStore.getState().updateSettings({
        pageSize: 500,
        themeMode: 'light',
        language: 'en-US',
      });
      const settings = useSettingsStore.getState().settings;
      expect(settings.pageSize).toBe(500);
      expect(settings.themeMode).toBe('light');
      expect(settings.language).toBe('en-US');
    });

    it('preserves other settings when updating one', () => {
      useSettingsStore.getState().updateSettings({ pageSize: 500 });
      const settings = useSettingsStore.getState().settings;
      expect(settings.pageSize).toBe(500);
      expect(settings.themePreset).toBe('midnightDeep');
      expect(settings.language).toBe('zh-CN');
    });
  });

  describe('resetSettings', () => {
    it('resets all settings to defaults', () => {
      useSettingsStore.getState().updateSettings({
        pageSize: 500,
        themeMode: 'light',
        language: 'en-US',
      });

      useSettingsStore.getState().resetSettings();

      const settings = useSettingsStore.getState().settings;
      expect(settings.pageSize).toBe(1000);
      expect(settings.themeMode).toBe('dark');
      expect(settings.language).toBe('zh-CN');
    });

    it('resets shortcuts to empty', () => {
      useSettingsStore.getState().updateSettings({
        shortcuts: { 'new-connection': 'ctrl+N' },
      });

      useSettingsStore.getState().resetSettings();

      expect(useSettingsStore.getState().settings.shortcuts).toEqual({});
    });
  });
});
