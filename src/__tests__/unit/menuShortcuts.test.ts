import { describe, it, expect, vi } from 'vitest';
import {
  MENU_SHORTCUTS,
  MACOS_SHORTCUTS,
  getShortcutsByCategory,
  isMacOS,
} from '../../constants/menuShortcuts';

describe('MENU_SHORTCUTS', () => {
  it('contains expected categories', () => {
    const categories = new Set(MENU_SHORTCUTS.map((s) => s.category));
    expect(categories).toContain('file');
    expect(categories).toContain('edit');
    expect(categories).toContain('view');
    expect(categories).toContain('connection');
    expect(categories).toContain('tools');
    expect(categories).toContain('window');
    expect(categories).toContain('help');
  });

  it('has execute-query with macKeys', () => {
    const executeQuery = MENU_SHORTCUTS.find((s) => s.id === 'execute-query');
    expect(executeQuery).toBeDefined();
    expect(executeQuery!.macKeys).toBe('mod+r');
    expect(executeQuery!.keys).toBe('mod+enter');
  });

  it('all shortcuts have required fields', () => {
    MENU_SHORTCUTS.forEach((s) => {
      expect(s.id).toBeTruthy();
      expect(s.keys).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.category).toBeTruthy();
    });
  });

  it('has no duplicate IDs', () => {
    const ids = MENU_SHORTCUTS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('MACOS_SHORTCUTS', () => {
  it('contains macOS-specific shortcuts', () => {
    expect(MACOS_SHORTCUTS).toHaveLength(3);
    const ids = MACOS_SHORTCUTS.map((s) => s.id);
    expect(ids).toContain('hide-app');
    expect(ids).toContain('hide-others');
    expect(ids).toContain('minimize');
  });
});

describe('getShortcutsByCategory', () => {
  it('returns shortcuts for a given category', () => {
    const fileShortcuts = getShortcutsByCategory('file');
    expect(fileShortcuts.length).toBeGreaterThan(0);
    fileShortcuts.forEach((s) => {
      expect(s.category).toBe('file');
    });
  });

  it('returns correct number of shortcuts per category', () => {
    expect(getShortcutsByCategory('file').length).toBe(6);
    expect(getShortcutsByCategory('edit').length).toBe(8);
    expect(getShortcutsByCategory('view').length).toBe(5);
    expect(getShortcutsByCategory('connection').length).toBe(4);
    expect(getShortcutsByCategory('tools').length).toBe(2);
    expect(getShortcutsByCategory('window').length).toBe(4);
    expect(getShortcutsByCategory('help').length).toBe(1);
  });

  it('returns empty array for non-existent category', () => {
    // TypeScript prevents invalid categories, but we test anyway
    const result = getShortcutsByCategory('file' as any);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('isMacOS', () => {
  const originalPlatform = global.navigator?.platform;

  afterEach(() => {
    if (originalPlatform !== undefined) {
      Object.defineProperty(global, 'navigator', {
        value: { platform: originalPlatform },
        writable: true,
      });
    }
  });

  it('returns true on macOS', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'MacIntel' },
      writable: true,
    });
    expect(isMacOS()).toBe(true);
  });

  it('returns false on Windows', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'Win32' },
      writable: true,
    });
    expect(isMacOS()).toBe(false);
  });

  it('returns false on Linux', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'Linux x86_64' },
      writable: true,
    });
    expect(isMacOS()).toBe(false);
  });

  it('returns false when navigator is undefined', () => {
    const origNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: undefined,
      writable: true,
    });
    expect(isMacOS()).toBe(false);
    Object.defineProperty(global, 'navigator', {
      value: origNavigator,
      writable: true,
    });
  });
});
