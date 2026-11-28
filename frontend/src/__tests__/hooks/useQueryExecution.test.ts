/**
 * 查询执行的生命周期：执行中再次触发、停止、关闭标签页（卸载）时，
 * 后端还在跑的批次必须被取消，被取代的那一轮不能再改共享状态。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  executeScriptBatch: vi.fn(),
  cancelScriptBatch: vi.fn(),
  executeQuery: vi.fn(),
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('antd', () => ({
  App: { useApp: () => ({ message: mocks.message }) },
}));
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) };
});
vi.mock('../../api', () => ({
  api: { executeScriptBatch: mocks.executeScriptBatch, cancelScriptBatch: mocks.cancelScriptBatch },
}));
vi.mock('../../hooks/useApi', () => ({
  useDatabase: () => ({ executeQuery: mocks.executeQuery }),
}));

import { useQueryExecution } from '../../components/SQLEditor/hooks/useQueryExecution';

type ScriptResult = { results: Array<{ columns: string[]; rows: unknown[][]; error?: string }> };

interface PendingRun {
  token: string;
  resolve: (value: ScriptResult) => void;
}

const renderExecution = (onQueryStatusChange = vi.fn()) => {
  const hook = renderHook(() =>
    useQueryExecution({
      connectionId: 'c1',
      database: 'db',
      sql: 'SELECT 1',
      dbType: 'mysql',
      highlightError: vi.fn(),
      clearErrorMarkers: vi.fn(),
      onQueryStatusChange,
    })
  );
  return { ...hook, onQueryStatusChange };
};

/** 开始一次执行并等它真正发出绑定调用（取消令牌已登记） */
const startRun = async (result: { current: ReturnType<typeof useQueryExecution> }) => {
  let promise: Promise<void> | undefined;
  let pending!: PendingRun;
  mocks.executeScriptBatch.mockImplementationOnce(
    (_c: string, _s: string[], _d: string, _signal: AbortSignal, opts: { cancelToken: string }) =>
      new Promise<ScriptResult>((resolve) => {
        pending = { token: opts.cancelToken, resolve };
      })
  );
  act(() => {
    promise = result.current.handleExecuteQuery();
  });
  await waitFor(() => expect(mocks.executeScriptBatch).toHaveBeenCalled());
  return { promise: promise!, pending };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useQueryExecution', () => {
  it('执行中再次触发：取消上一轮的后端批次，上一轮的收尾不动新一轮的状态', async () => {
    const { result, onQueryStatusChange } = renderExecution();
    const first = await startRun(result);
    expect(result.current.loading).toBe(true);

    const second = await startRun(result);
    expect(mocks.cancelScriptBatch).toHaveBeenCalledWith(first.pending.token);

    await act(async () => {
      second.pending.resolve({ results: [{ columns: ['1'], rows: [[2]] }] });
      await second.promise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.result?.rows).toEqual([[2]]);
    expect(onQueryStatusChange).toHaveBeenLastCalledWith(false);
    const statusCalls = onQueryStatusChange.mock.calls.length;
    const messages = result.current.messages;

    // 旧一轮的结果这时才回来：必须被丢弃（它已被取代）
    await act(async () => {
      first.pending.resolve({ results: [{ columns: ['1'], rows: [[1]] }] });
      await first.promise;
    });
    expect(result.current.result?.rows).toEqual([[2]]);
    expect(result.current.messages).toEqual(messages);
    expect(result.current.loading).toBe(false);
    expect(onQueryStatusChange.mock.calls).toHaveLength(statusCalls);
    expect(mocks.message.error).not.toHaveBeenCalled();
  });

  it('旧一轮晚返回时不清掉新一轮的取消令牌：之后点「停止」取消的仍是新一轮', async () => {
    const { result } = renderExecution();
    const first = await startRun(result);
    const second = await startRun(result);

    // 旧一轮的结果先回来，新一轮还在跑
    await act(async () => {
      first.pending.resolve({ results: [{ columns: ['1'], rows: [[1]] }] });
      await first.promise;
    });
    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.stopQuery();
    });
    expect(mocks.cancelScriptBatch).toHaveBeenLastCalledWith(second.pending.token);

    await act(async () => {
      second.pending.resolve({ results: [{ columns: ['1'], rows: [[2]] }] });
      await second.promise;
    });
    expect(result.current.loading).toBe(false);
  });

  it('停止：取消后端批次并中止界面等待', async () => {
    const { result } = renderExecution();
    const run = await startRun(result);

    act(() => {
      result.current.stopQuery();
    });
    expect(mocks.cancelScriptBatch).toHaveBeenCalledWith(run.pending.token);
    expect(result.current.loading).toBe(false);
    expect(mocks.message.warning).toHaveBeenCalledWith('common.queryStopped');

    await act(async () => {
      run.pending.resolve({ results: [{ columns: ['1'], rows: [[1]] }] });
      await run.promise;
    });
    expect(result.current.loading).toBe(false);
  });

  // 绑定调用本身没法中断：不取消的话一条长查询会在标签页关掉之后继续占着连接跑到结束
  it('卸载（关闭标签页）：取消后端还在跑的批次', async () => {
    const { result, unmount } = renderExecution();
    const run = await startRun(result);

    unmount();
    expect(mocks.cancelScriptBatch).toHaveBeenCalledWith(run.pending.token);

    await act(async () => {
      run.pending.resolve({ results: [{ columns: ['1'], rows: [[1]] }] });
      await run.promise;
    });
    expect(mocks.message.success).not.toHaveBeenCalled();
  });

  it('查询正常结束时不取消任何批次', async () => {
    const { result } = renderExecution();
    const run = await startRun(result);
    await act(async () => {
      run.pending.resolve({ results: [{ columns: ['1'], rows: [[1]] }] });
      await run.promise;
    });
    expect(result.current.loading).toBe(false);
    expect(mocks.cancelScriptBatch).not.toHaveBeenCalled();
    expect(result.current.result?.rows).toEqual([[1]]);
  });
});
