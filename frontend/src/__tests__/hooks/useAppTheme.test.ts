import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Window } from '@wailsio/runtime';
import { SaveStartupTheme, SetNativeWindowAppearance } from '../../../bindings/idblink/backend/app';
import { useAppTheme } from '../../hooks/useAppTheme';
import { THEMES, type ThemeMode, type ThemePreset } from '../../styles/theme';

const root = document.documentElement;
const appearance = vi.mocked(SetNativeWindowAppearance);
const saveStartupTheme = vi.mocked(SaveStartupTheme);
const setBackgroundColour = vi.mocked(Window.SetBackgroundColour);

// 下一帧才执行的回调：测试里自己决定什么时候「出帧」
let frames: FrameRequestCallback[];

function stubSystemAppearance(dark: () => boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' && dark(),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

beforeEach(() => {
  frames = [];
  // 先开假计时器再替换 rAF：假计时器自己也会接管 requestAnimationFrame
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  stubSystemAppearance(() => false);
  root.removeAttribute('data-theme');
  root.removeAttribute('data-theme-preset');
  root.classList.remove('theme-transitioning');
  appearance.mockClear();
  saveStartupTheme.mockClear();
  setBackgroundColour.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useAppTheme', () => {
  it('挂载后当场应用主题并同步原生窗口，不等计时器也不等下一帧', () => {
    renderHook(() => useAppTheme('dark', 'default'));

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-theme-preset')).toBe('default');
    expect(root.style.getPropertyValue('--background')).toBe(
      THEMES.default.dark.neutralColors.background
    );
    expect(frames).toHaveLength(0);
    // 启动这一下不是切换，不能带过渡（带着过渡就是浅色渐变成深色）
    expect(root.classList.contains('theme-transitioning')).toBe(false);

    expect(appearance).toHaveBeenCalledWith('dark');
    // #101118
    expect(setBackgroundColour).toHaveBeenCalledWith(0x10, 0x11, 0x18, 255);
    // 下次启动时原生窗口的底色：两种外观的都记给后端
    expect(saveStartupTheme).toHaveBeenCalledWith(
      THEMES.default.light.neutralColors.background,
      THEMES.default.dark.neutralColors.background,
      'dark'
    );
  });

  it('挂载期的 effect 再跑一遍（StrictMode）也不算切换', () => {
    const { rerender } = renderHook(() => useAppTheme('dark', 'default'));
    rerender();

    expect(root.classList.contains('theme-transitioning')).toBe(false);
    expect(frames).toHaveLength(0);
  });

  it('切换主题才带过渡，并且放到下一帧应用', () => {
    const { rerender } = renderHook(
      ({ mode }: { mode: ThemeMode }) => useAppTheme(mode, 'default'),
      {
        initialProps: { mode: 'dark' },
      }
    );
    rerender({ mode: 'light' });

    // 下一帧之前还是旧主题，过渡 class 也还没加
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.classList.contains('theme-transitioning')).toBe(false);
    expect(frames).toHaveLength(1);

    frames[0](0);
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.classList.contains('theme-transitioning')).toBe(true);
    expect(appearance).toHaveBeenLastCalledWith('light');
    expect(saveStartupTheme).toHaveBeenLastCalledWith(
      THEMES.default.light.neutralColors.background,
      THEMES.default.dark.neutralColors.background,
      'light'
    );

    vi.advanceTimersByTime(300);
    expect(root.classList.contains('theme-transitioning')).toBe(false);
  });

  it('跟随系统：按系统外观应用，原生外观交还给系统', () => {
    stubSystemAppearance(() => true);
    const { result } = renderHook(() => useAppTheme('system', 'default'));

    expect(result.current.effectiveMode).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(appearance).toHaveBeenCalledWith('system');
    expect(saveStartupTheme).toHaveBeenCalledWith(
      THEMES.default.light.neutralColors.background,
      THEMES.default.dark.neutralColors.background,
      'system'
    );
  });

  it('跟随系统时系统外观变了（设置没变）也重新应用', () => {
    let dark = false;
    stubSystemAppearance(() => dark);
    const { result, rerender } = renderHook(() => useAppTheme('system', 'default'));
    expect(result.current.effectiveMode).toBe('light');

    dark = true;
    rerender();

    expect(result.current.effectiveMode).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('换预设：记给后端的两种底色跟着预设走', () => {
    const preset: ThemePreset = 'ink';
    renderHook(() => useAppTheme('dark', preset));

    expect(saveStartupTheme).toHaveBeenCalledWith(
      THEMES.ink.light.neutralColors.background,
      THEMES.ink.dark.neutralColors.background,
      'dark'
    );
  });
});
