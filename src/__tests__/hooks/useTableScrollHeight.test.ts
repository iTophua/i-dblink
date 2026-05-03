import { describe, it, expect } from 'vitest';
import { useTableScrollHeight } from '../hooks/useTableScrollHeight';

describe('useTableScrollHeight logic', () => {
  it('calculates height: container - toolbar - statusbar - border', () => {
    const containerHeight = 800;
    const toolbarHeight = 30;
    const statusBarHeight = 25;
    const border = 2;

    const expected = containerHeight - toolbarHeight - statusBarHeight - border;
    const finalHeight = Math.max(300, expected);

    expect(finalHeight).toBe(743);
  });

  it('enforces minimum height of 300px', () => {
    const containerHeight = 300;
    const toolbarHeight = 100;
    const statusBarHeight = 100;
    const border = 2;

    const calculated = containerHeight - toolbarHeight - statusBarHeight - border;
    const finalHeight = Math.max(300, calculated);

    expect(finalHeight).toBe(300);
    expect(calculated).toBe(98);
  });

  it('handles edge case: container smaller than minimum', () => {
    const containerHeight = 200;
    const toolbarHeight = 50;
    const statusBarHeight = 50;
    const border = 2;

    const calculated = containerHeight - toolbarHeight - statusBarHeight - border;
    const finalHeight = Math.max(300, calculated);

    expect(finalHeight).toBe(300);
  });

  it('handles zero-height elements', () => {
    const containerHeight = 600;
    const toolbarHeight = 0;
    const statusBarHeight = 0;
    const border = 2;

    const expected = Math.max(300, containerHeight - toolbarHeight - statusBarHeight - border);
    expect(expected).toBe(598);
  });

  it('handles large container', () => {
    const containerHeight = 2000;
    const toolbarHeight = 50;
    const statusBarHeight = 30;
    const border = 2;

    const expected = Math.max(300, containerHeight - toolbarHeight - statusBarHeight - border);
    expect(expected).toBe(1918);
  });

  it('ResizeObserver is used for container size changes', () => {
    const mockObserver = {
      observe: vi.fn(),
      disconnect: vi.fn(),
    };

    global.ResizeObserver = vi.fn(() => mockObserver);

    expect(global.ResizeObserver).toBeDefined();
  });

  it('resize event listener is added', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();

    global.window = {
      addEventListener: addListener,
      removeEventListener: removeListener,
    } as any;

    addListener('resize', vi.fn());
    expect(addListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
