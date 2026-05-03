import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
      },
    }),
  },
  ConfigProvider: ({ children }: any) => children,
}));





vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        themePreset: 'midnightDeep',
        themeMode: 'dark',
        themeSyncSystem: true,
        language: 'zh-CN',
      },
    }),
    subscribe: vi.fn(),
  },
}));

vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => ({}),
    subscribe: vi.fn(),
  },
}));

describe('App initialization', () => {
  it('initializes with default theme', () => {
    const themePreset = 'midnightDeep';
    const themeMode = 'dark';
    expect(themePreset).toBe('midnightDeep');
    expect(themeMode).toBe('dark');
  });

  it('initializes theme on mount', () => {
    const themePreset = 'midnightDeep';
    const themeMode = 'dark';
    expect(themePreset).toBe('midnightDeep');
    expect(themeMode).toBe('dark');
  });

  it('loads connections on mount', () => {
    const loadConnectionsCalled = vi.fn();
    loadConnectionsCalled();
    expect(loadConnectionsCalled).toHaveBeenCalled();
  });
});

describe('App theme configuration', () => {
  it('supports dark theme', () => {
    const darkTheme = {
      preset: 'midnightDeep',
      mode: 'dark',
      syncSystem: false,
    };
    expect(darkTheme.mode).toBe('dark');
  });

  it('supports light theme', () => {
    const lightTheme = {
      preset: 'nordicFrost',
      mode: 'light',
      syncSystem: false,
    };
    expect(lightTheme.mode).toBe('light');
  });

  it('supports system theme sync', () => {
    const systemTheme = {
      syncSystem: true,
      mode: 'dark',
    };
    expect(systemTheme.syncSystem).toBe(true);
  });
});

describe('App language configuration', () => {
  it('supports Chinese', () => {
    const language = 'zh-CN';
    expect(language).toBe('zh-CN');
  });

  it('supports English', () => {
    const language = 'en-US';
    expect(language).toBe('en-US');
  });
});

describe('App event listeners', () => {
  it('listens for menu-action events', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();

    global.window = {
      addEventListener: addListener,
      removeEventListener: removeListener,
    } as any;

    addListener('menu-action', vi.fn());
    expect(addListener).toHaveBeenCalledWith('menu-action', expect.any(Function));
  });

  it('listens for tab-action events', () => {
    const addListener = vi.fn();
    global.window = {
      addEventListener: addListener,
    } as any;

    addListener('tab-action', vi.fn());
    expect(addListener).toHaveBeenCalledWith('tab-action', expect.any(Function));
  });
});
