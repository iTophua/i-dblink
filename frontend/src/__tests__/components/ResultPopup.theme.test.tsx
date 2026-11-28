import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Window } from '@wailsio/runtime';
import { ResultPopup } from '../../components/ResultPopup';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ThemeMode } from '../../styles/theme';

const setBackgroundColour = vi.mocked(Window.SetBackgroundColour);

// jsdom 没有 matchMedia：ResultPopup 要监听系统外观变化，主题解析「跟随系统」时也要读它
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
});

// 弹窗是独立的原生窗口，webview 透明：刚打开、前端还没画出来时露出来的是原生底色
describe('ResultPopup 的原生窗口底色', () => {
  const originalSettings = useSettingsStore.getState().settings;
  const setTheme = (themeMode: ThemeMode) =>
    useSettingsStore.setState((state) => ({ settings: { ...state.settings, themeMode } }));

  beforeEach(() => {
    setBackgroundColour.mockClear();
    window.location.hash = '#popup/p1';
  });

  afterEach(() => {
    // 先卸载再还原设置：弹窗订阅着设置，还原时它还在的话会有一帧没包在 act 里的更新
    cleanup();
    useSettingsStore.setState({ settings: originalSettings });
    window.location.hash = '';
  });

  it('深色下打开弹窗：底色是主题的深色，不是写死的浅色', () => {
    setTheme('dark');

    render(<ResultPopup />);

    // #101118
    expect(setBackgroundColour).toHaveBeenCalledWith(0x10, 0x11, 0x18, 255);
  });

  it('弹窗开着的时候切主题，底色跟着换', () => {
    setTheme('dark');
    render(<ResultPopup />);

    act(() => setTheme('light'));

    // #F2F3F8
    expect(setBackgroundColour).toHaveBeenLastCalledWith(0xf2, 0xf3, 0xf8, 255);
  });
});
