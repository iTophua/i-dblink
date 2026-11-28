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
    expect(mockApi.getTransactionStatus).toHaveBeenCalledWith('conn-1', '');
    expect(result.current.transactionActive).toBe(true);
  });

  it('卸载时回滚未完事务，不留悬挂事务捕获后续语句', async () => {
    const { result, unmount } = renderHook(() => useTransaction('conn-1'));
    await act(async () => {
      await result.current.handleBeginTransaction();
    });
    expect(result.current.transactionActive).toBe(true);

    unmount();
    expect(mockApi.rollbackTransaction).toHaveBeenCalledWith('conn-1', '');
  });

  it('开启事务按钮：成功后进入活跃状态，事务开在选中的库上', async () => {
    const { result } = renderHook(() => useTransaction('conn-1', 'tab-1', 'sales'));
    await act(async () => {
      await result.current.handleBeginTransaction();
    });
    expect(mockApi.beginTransaction).toHaveBeenCalledWith('conn-1', 'tab-1', 'sales');
    expect(result.current.transactionActive).toBe(true);
  });

  it('手动模式执行前钩子：懒开启事务；后端确认事务还在则不重复开启', async () => {
    mockApi.getTransactionStatus.mockResolvedValue(true);
    const { result, rerender } = renderHook(() => useTransaction('conn-1', 'tab-1', 'sales'));

    act(() => {
      result.current.handleTxModeChange('manual');
    });
    rerender();
    await act(async () => {
      await result.current.ensureTransactionForExecution();
    });
    expect(mockApi.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockApi.beginTransaction).toHaveBeenCalledWith('conn-1', 'tab-1', 'sales');

    // 事务已活跃：先向后端核对，还在就不重复开启
    await act(async () => {
      await result.current.ensureTransactionForExecution();
    });
    expect(mockApi.getTransactionStatus).toHaveBeenCalledWith('conn-1', 'tab-1');
    expect(mockApi.beginTransaction).toHaveBeenCalledTimes(1);
  });

  // 看门狗按空闲回收事务，界面上却还亮着事务按钮：照常执行的话语句会落到自动提交
  it('本地显示事务进行中、后端已没有事务：不执行并复位状态', async () => {
    mockApi.getTransactionStatus.mockResolvedValue(true);
    const { result, rerender } = renderHook(() => useTransaction('conn-1', 'tab-1', 'sales'));

    act(() => {
      result.current.handleTxModeChange('manual');
    });
    rerender();
    await act(async () => {
      await result.current.ensureTransactionForExecution();
    });
    expect(result.current.transactionActive).toBe(true);

    // 后端把事务回收了
    mockApi.getTransactionStatus.mockResolvedValue(false);
    await act(async () => {
      await expect(result.current.ensureTransactionForExecution()).rejects.toThrow(
        'common.txEndedBeforeExecution'
      );
    });
    expect(result.current.transactionActive).toBe(false);
    expect(mockApi.beginTransaction).toHaveBeenCalledTimes(1);

    // 复位后再执行：重新开一笔事务（后端的「超时被回滚」状态也随重新开启解除）
    mockApi.getTransactionStatus.mockResolvedValue(true);
    await act(async () => {
      await result.current.ensureTransactionForExecution();
    });
    expect(mockApi.beginTransaction).toHaveBeenCalledTimes(2);
  });

  it('事务开在另一个库上：换了库的语句不执行，提示先提交或回滚', async () => {
    mockApi.getTransactionStatus.mockResolvedValue(true);
    const { result, rerender } = renderHook(
      ({ db }: { db: string }) => useTransaction('conn-1', 'tab-1', db),
      { initialProps: { db: 'sales' } }
    );
    act(() => {
      result.current.handleTxModeChange('manual');
    });
    await act(async () => {
      await result.current.ensureTransactionForExecution();
    });
    expect(mockApi.beginTransaction).toHaveBeenCalledWith('conn-1', 'tab-1', 'sales');

    rerender({ db: 'hr' });
    await act(async () => {
      await expect(result.current.ensureTransactionForExecution()).rejects.toThrow(
        'common.txOpenOnOtherDatabase'
      );
    });
    // 事务本身不动：用户可以切回去继续，或者直接提交 / 回滚
    expect(result.current.transactionActive).toBe(true);
    expect(mockApi.rollbackTransaction).not.toHaveBeenCalled();
    mockApi.getTransactionStatus.mockClear();
    mockApi.beginTransaction.mockClear();

    // 切回原来的库：照常执行
    rerender({ db: 'sales' });
    await act(async () => {
      await result.current.ensureTransactionForExecution();
    });
    expect(mockApi.beginTransaction).not.toHaveBeenCalled();
  });

  it('从后端认领的事务不知道开在哪个库上：换库后不拦，交给后端判断', async () => {
    mockApi.getTransactionStatus.mockResolvedValue(true);
    const { result, rerender } = renderHook(
      ({ db }: { db: string }) => useTransaction('conn-1', 'tab-1', db),
      { initialProps: { db: 'sales' } }
    );
    await act(async () => {});
    expect(result.current.transactionActive).toBe(true);

    act(() => {
      result.current.handleTxModeChange('manual');
    });
    rerender({ db: 'hr' });
    await act(async () => {
      await result.current.ensureTransactionForExecution();
    });
    // 不抛错；是否放行由后端按事务实际所在的库决定
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
    expect(mockApi.rollbackTransaction).toHaveBeenCalledWith('conn-1', '');
    expect(result.current.transactionActive).toBe(false);
    expect(result.current.txMode).toBe('auto');
  });
});
