import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Window } from '@wailsio/runtime';
import { applyWindowBackground } from '../../utils/windowBackground';

const setBackgroundColour = vi.mocked(Window.SetBackgroundColour);

describe('applyWindowBackground', () => {
  beforeEach(() => setBackgroundColour.mockClear());

  afterEach(() => vi.clearAllTimers());

  it('把主题底色按 RGB 写给当前窗口，不带透明度', () => {
    applyWindowBackground('#101118');
    expect(setBackgroundColour).toHaveBeenCalledWith(0x10, 0x11, 0x18, 255);
  });

  it('不是 #RRGGBB 的颜色不写', () => {
    for (const bad of ['', '#FFF', '101118', 'rgba(16, 17, 24, 1)']) {
      applyWindowBackground(bad);
    }
    expect(setBackgroundColour).not.toHaveBeenCalled();
  });
});
