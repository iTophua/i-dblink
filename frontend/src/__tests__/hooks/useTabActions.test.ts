import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabActions, tabActionTargets } from '../../components/SQLEditor/hooks/useTabActions';

const dispatch = (detail: { action?: string; tabKey?: string }) => {
  act(() => {
    window.dispatchEvent(new CustomEvent('tab-action', { detail }));
  });
};

const makeHandlers = () => ({
  executeQuery: vi.fn(),
  save: vi.fn(),
  saveAs: vi.fn(),
});

describe('useTabActions', () => {
  // ⌘R / 菜单「执行查询」冒泡到 window，所有已挂载的 SQL 标签页都收得到：只有当前页执行
  it('只有当前标签页响应执行、保存、另存为', () => {
    const active = makeHandlers();
    const background = makeHandlers();
    renderHook(() => useTabActions({ tabKey: 'a', isActive: true, handlers: active }));
    renderHook(() => useTabActions({ tabKey: 'b', isActive: false, handlers: background }));

    dispatch({ action: 'execute-query' });
    dispatch({ action: 'save' });
    dispatch({ action: 'save-as' });

    expect(active.executeQuery).toHaveBeenCalledTimes(1);
    expect(active.save).toHaveBeenCalledTimes(1);
    expect(active.saveAs).toHaveBeenCalledTimes(1);
    expect(background.executeQuery).not.toHaveBeenCalled();
    expect(background.save).not.toHaveBeenCalled();
    expect(background.saveAs).not.toHaveBeenCalled();
  });

  it('切换标签页后由新的当前页响应', () => {
    const first = makeHandlers();
    const second = makeHandlers();
    const view = renderHook(
      ({ firstActive }: { firstActive: boolean }) => {
        useTabActions({ tabKey: 'a', isActive: firstActive, handlers: first });
        useTabActions({ tabKey: 'b', isActive: !firstActive, handlers: second });
      },
      { initialProps: { firstActive: true } }
    );

    dispatch({ action: 'execute-query' });
    expect(first.executeQuery).toHaveBeenCalledTimes(1);
    expect(second.executeQuery).not.toHaveBeenCalled();

    view.rerender({ firstActive: false });
    dispatch({ action: 'execute-query' });
    expect(first.executeQuery).toHaveBeenCalledTimes(1);
    expect(second.executeQuery).toHaveBeenCalledTimes(1);
  });

  it('事件带 tabKey 时只由指定的标签页响应', () => {
    const a = makeHandlers();
    const b = makeHandlers();
    renderHook(() => useTabActions({ tabKey: 'a', isActive: true, handlers: a }));
    renderHook(() => useTabActions({ tabKey: 'b', isActive: false, handlers: b }));

    dispatch({ action: 'save', tabKey: 'b' });

    expect(b.save).toHaveBeenCalledTimes(1);
    expect(a.save).not.toHaveBeenCalled();
  });

  it('不认识的 action 不触发任何回调', () => {
    const handlers = makeHandlers();
    renderHook(() => useTabActions({ tabKey: 'a', isActive: true, handlers }));

    dispatch({ action: 'new-sql-tab' });
    dispatch({});
    dispatch(undefined as unknown as { action?: string });

    expect(handlers.executeQuery).not.toHaveBeenCalled();
    expect(handlers.save).not.toHaveBeenCalled();
    expect(handlers.saveAs).not.toHaveBeenCalled();
  });

  it('卸载后不再响应（关闭标签页）', () => {
    const handlers = makeHandlers();
    const view = renderHook(() => useTabActions({ tabKey: 'a', isActive: true, handlers }));
    view.unmount();

    dispatch({ action: 'execute-query' });

    expect(handlers.executeQuery).not.toHaveBeenCalled();
  });
});

describe('tabActionTargets', () => {
  it.each([
    {
      name: '当前页，事件不带 tabKey',
      detail: { action: 'save' },
      target: { isActive: true },
      expected: true,
    },
    {
      name: '后台页，事件不带 tabKey',
      detail: { action: 'save' },
      target: { isActive: false },
      expected: false,
    },
    {
      name: 'tabKey 匹配的后台页',
      detail: { action: 'save', tabKey: 'a' },
      target: { tabKey: 'a', isActive: false },
      expected: true,
    },
    {
      name: 'tabKey 不匹配的当前页',
      detail: { action: 'save', tabKey: 'b' },
      target: { tabKey: 'a', isActive: true },
      expected: false,
    },
    {
      name: '没有 action',
      detail: { tabKey: 'a' },
      target: { tabKey: 'a', isActive: true },
      expected: false,
    },
    { name: 'detail 为空', detail: undefined, target: { isActive: true }, expected: false },
  ])('$name → $expected', ({ detail, target, expected }) => {
    expect(tabActionTargets(detail, target)).toBe(expected);
  });
});
