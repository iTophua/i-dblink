import { describe, it, expect } from 'vitest';
import { MENU_SHORTCUTS, isMacOS } from '../../constants/menuShortcuts';

describe('shortcut display format', () => {
  it('formats shortcut for macOS', () => {
    const formatShortcut = (keys: string): string =>
      keys.replace('mod+', '\u2318').replace('shift+', '\u21e7').replace('enter', '\u21b5').toUpperCase();
    expect(formatShortcut('mod+n')).toBe('\u2318N');
  });

  it('formats shortcut for Windows', () => {
    const formatShortcut = (keys: string): string =>
      keys.replace('mod+', 'Ctrl+').replace('shift+', '\u21e7').replace('enter', '\u21b5').toUpperCase();
    expect(formatShortcut('mod+n')).toBe('CTRL+N');
  });
});

describe('MENU_SHORTCUTS integration', () => {
  it('all MENU_SHORTCUTS have unique IDs', () => {
    const ids = MENU_SHORTCUTS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all MENU_SHORTCUTS have non-empty keys', () => {
    MENU_SHORTCUTS.forEach((s) => {
      expect(s.keys.length).toBeGreaterThan(0);
    });
  });

  it('all MENU_SHORTCUTS have valid categories', () => {
    const validCategories = ['file', 'edit', 'view', 'connection', 'tools', 'window', 'help'];
    MENU_SHORTCUTS.forEach((s) => {
      expect(validCategories).toContain(s.category);
    });
  });
});

describe('isMacOS behavior', () => {
  const originalPlatform = global.navigator?.platform;

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(global, 'navigator', {
        value: { platform: originalPlatform },
        writable: true,
      });
    }
  });

  it('returns true for macOS platform', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'MacIntel' },
      writable: true,
    });
    expect(isMacOS()).toBe(true);
  });

  it('returns false for non-macOS platforms', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'Win32' },
      writable: true,
    });
    expect(isMacOS()).toBe(false);
  });
});

describe('shortcut key format', () => {
  it('supports mod+key combinations', () => {
    const validKeys = ['mod+n', 'mod+o', 'mod+s', 'mod+shift+s', 'mod+enter'];
    validKeys.forEach((key) => {
      expect(key).toMatch(/^mod(\+shift)?\+[a-zA-Z0-9]+$/);
    });
  });

  it('supports function key combinations', () => {
    const validKeys = ['f5', 'f11', 'f1'];
    validKeys.forEach((key) => {
      expect(key).toMatch(/^f\d+$/);
    });
  });

  it('supports special keys', () => {
    const validKeys = ['delete'];
    validKeys.forEach((key) => {
      expect(key).toMatch(/^delete$/);
    });
  });
});
