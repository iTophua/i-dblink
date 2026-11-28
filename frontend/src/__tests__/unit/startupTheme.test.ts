import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEMES, type ThemeMode, type ThemePreset } from '../../styles/theme';

const root = document.documentElement;
const STORE_KEY = 'idblink-settings';

// 模拟「上次用的设置还在 localStorage 里」：重新加载一遍模块，store 从头建一次
async function loadWithSettings(settings: { themeMode: ThemeMode; themePreset: ThemePreset }) {
  localStorage.setItem(STORE_KEY, JSON.stringify({ state: { settings }, version: 1 }));
  vi.resetModules();
  return import('../../utils/startupTheme');
}

function stubSystemAppearance(dark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' && dark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

describe('applyThemeBeforeRender', () => {
  afterEach(() => {
    localStorage.clear();
    root.removeAttribute('data-theme');
    root.removeAttribute('data-theme-preset');
    root.style.cssText = '';
  });

  it('设置里是深色：调用当时主题令牌就写好了，不带过渡', async () => {
    const { applyThemeBeforeRender } = await loadWithSettings({
      themeMode: 'dark',
      themePreset: 'default',
    });
    expect(root.getAttribute('data-theme')).toBeNull();

    applyThemeBeforeRender();

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-theme-preset')).toBe('default');
    expect(root.style.getPropertyValue('--background')).toBe(
      THEMES.default.dark.neutralColors.background
    );
    // 启动画面用的就是这个变量：不先写好，它会拿浅色的兜底值画出来
    expect(root.style.getPropertyValue('--surface-canvas')).toBe(
      THEMES.default.dark.neutralColors.surfaceCanvas
    );
    expect(root.classList.contains('theme-transitioning')).toBe(false);
  });

  it('设置在 localStorage 里：不用等任何异步加载，store 建好时就读进来了', async () => {
    const { applyThemeBeforeRender } = await loadWithSettings({
      themeMode: 'dark',
      themePreset: 'ink',
    });

    applyThemeBeforeRender();

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-theme-preset')).toBe('ink');
    expect(root.style.getPropertyValue('--background')).toBe(
      THEMES.ink.dark.neutralColors.background
    );
  });

  it('浅色照常', async () => {
    const { applyThemeBeforeRender } = await loadWithSettings({
      themeMode: 'light',
      themePreset: 'default',
    });

    applyThemeBeforeRender();

    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.style.getPropertyValue('--background')).toBe(
      THEMES.default.light.neutralColors.background
    );
  });

  it('跟随系统：按系统外观应用', async () => {
    stubSystemAppearance(true);
    const dark = await loadWithSettings({ themeMode: 'system', themePreset: 'default' });
    dark.applyThemeBeforeRender();
    expect(root.getAttribute('data-theme')).toBe('dark');

    root.removeAttribute('data-theme');
    stubSystemAppearance(false);
    const light = await loadWithSettings({ themeMode: 'system', themePreset: 'default' });
    light.applyThemeBeforeRender();
    expect(root.getAttribute('data-theme')).toBe('light');
  });
});
