import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// vi.mock 工厂会被提升到文件顶部，共享 mock 必须用 vi.hoisted 声明
const mockApi = vi.hoisted(() => ({
  beginTransaction: vi.fn().mockResolvedValue(undefined),
  commitTransaction: vi.fn().mockResolvedValue(true),
  rollbackTransaction: vi.fn().mockResolvedValue(true),
  getTransactionStatus: vi.fn().mockResolvedValue(false),
}));

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    }),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../api', () => ({ api: mockApi }));
vi.mock('../../utils/appModal', () => ({ appModal: { confirm: vi.fn() } }));
vi.mock('../../utils/getErrorMessage', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { useTransaction } from '../../components/SQLEditor/hooks/useTransaction';

describe('useTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getTransactionStatus.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('挂载时以后端事务状态为准：后端有活跃事务则认领', async () => {
    mockApi.getTransactionStatus.mockResolvedValue(true);
    const { result } = renderHook(() => useTransaction('conn-1'));

    // 状态检查是异步的，等微任务队列清空
    await act(async () => {});
    expect(mockApi.getTransactionStatus).toHaveBeenCalledWith('conn-1');
    expect(result.current.transactionActive).toBe(true);
  });

  it('卸载时回滚未完事务，不留悬挂事务捕获后续语句', async () => {
    const { result, unmount } = renderHook(() => useTransaction('conn-1'));
    await act(async () => {
      await result.current.handleBeginTransaction();
    });
    expect(result.current.transactionActive).toBe(true);

    unmount();
    expect(mockApi.rollbackTransaction).toHaveBeenCalledWith('conn-1');
  });

  it('开启事务按钮：成功后进入活跃状态', async () => {
    const { result } = renderHook(() => useTransaction('conn-1'));
    await act(async () => {
      await result.current.handleBeginTransaction();
    });
    expect(mockApi.beginTransaction).toHaveBeenCalledWith('conn-1');
    expect(result.current.transactionActive).toBe(true);
  });

  it('手动模式执行前钩子：懒开启事务；已有活跃事务则跳过', async () => {
    const { result, rerender } = renderHook(() => useTransaction('conn-1'));

    act(() => {
      result.current.handleTxModeChange('manual');
    });
    rerender();
    await act(async () => {
      await result.current.ensureTransactionForExecution();
    });
    expect(mockApi.beginTransaction).toHaveBeenCalledTimes(1);

    // 事务已活跃：再次执行不重复开启
    await act(async () => {
      await result.current.ensureTransactionForExecution();
    });
    expect(mockApi.beginTransaction).toHaveBeenCalledTimes(1);
  });

  it('提交返回 false（事务已被看门狗回滚）时仍复位状态，不抛错', async () => {
    mockApi.commitTransaction.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useTransaction('conn-1'));

    await act(async () => {
      await result.current.handleCommitTransaction();
    });
    expect(result.current.transactionActive).toBe(false);
  });

  it('切换连接时静默回滚旧连接事务并复位', async () => {
    const { result, rerender } = renderHook(({ id }: { id?: string }) => useTransaction(id), {
      initialProps: { id: 'conn-1' },
    });
    await act(async () => {
      await result.current.handleBeginTransaction();
    });
    expect(result.current.transactionActive).toBe(true);

    rerender({ id: 'conn-2' });
    expect(mockApi.rollbackTransaction).toHaveBeenCalledWith('conn-1');
    expect(result.current.transactionActive).toBe(false);
    expect(result.current.txMode).toBe('auto');
  });
});
