import { useState, useCallback, useEffect, useRef } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../../api';
import { getErrorMessage } from '../../../utils/getErrorMessage';
import { appModal } from '../../../utils/appModal';

/** 事务模式：auto=自动提交（默认），manual=手动事务（执行后需提交/回滚，模式保持） */
export type TransactionMode = 'auto' | 'manual';

export function useTransaction(connectionId?: string | null, sessionId = '', database = '') {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [txMode, setTxMode] = useState<TransactionMode>('auto');
  const [transactionActive, setTransactionActive] = useState(false);
  // 当前事务开在哪个库上；null = 不确定（挂载时从后端认领的事务不知道是带哪个库开的）。
  // 事务固定开在开启时的库上，换了库的语句进不了它——执行前先在这里拦下并说清楚原因
  const txDatabaseRef = useRef<string | null>(null);
  const prevConnectionIdRef = useRef(connectionId);
  // 卸载清理读最新值，避免闭包过期
  const connectionIdRef = useRef(connectionId);
  const transactionActiveRef = useRef(transactionActive);
  useEffect(() => {
    connectionIdRef.current = connectionId;
  }, [connectionId]);
  useEffect(() => {
    transactionActiveRef.current = transactionActive;
  }, [transactionActive]);

  // 事务按连接全局唯一（后端每个连接只有一个事务槽），而本 hook 每个
  // 查询 Tab 各存一份状态——两者可能失同步。挂载/切换连接时以后端状态
  // 为准对齐：残留事务若无人认领，会捕获该连接所有语句并在看门狗超时
  // 回滚时静默丢数据。
  useEffect(() => {
    const prev = prevConnectionIdRef.current;
    prevConnectionIdRef.current = connectionId;
    if (prev !== connectionId) {
      // 切换连接：静默回滚旧连接的事务并重置模式与状态
      if (transactionActiveRef.current && prev) {
        api.rollbackTransaction(prev, sessionId).catch(() => {
          // 静默失败：旧事务可能已结束或连接已断，后端已幂等处理
        });
      }
      setTransactionActive(false);
      setTxMode('auto');
      txDatabaseRef.current = null;
    }
    if (!connectionId) return;
    let cancelled = false;
    api
      .getTransactionStatus(connectionId, sessionId)
      .then((active) => {
        if (!cancelled && active) setTransactionActive(true);
      })
      .catch(() => {
        // 连接未建立等场景静默：真正开启事务时会得到明确报错
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  // 卸载（关闭查询 Tab）：回滚未完事务。留给 5 分钟看门狗的话，超时窗口内
  // 该事务仍会捕获同连接的语句（表数据编辑、其他 Tab 的自动提交查询）
  useEffect(
    () => () => {
      if (transactionActiveRef.current && connectionIdRef.current) {
        api.rollbackTransaction(connectionIdRef.current, sessionId).catch(() => {});
      }
    },
    []
  );

  /** 开启事务并记下它所在的库。失败由调用方提示 */
  const beginTransaction = useCallback(async () => {
    if (!connectionId) return;
    await api.beginTransaction(connectionId, sessionId, database);
    txDatabaseRef.current = database;
    setTransactionActive(true);
  }, [connectionId, sessionId, database]);

  /**
   * 执行前钩子：手动模式下确保事务已开启。
   * 提交/回滚后事务关闭但模式保持手动，下次执行时自动重开新事务。
   */
  const ensureTransactionForExecution = useCallback(async () => {
    if (txMode !== 'manual' || !connectionId) return;
    if (!transactionActive) {
      try {
        await beginTransaction();
      } catch (err: unknown) {
        message.error(`${t('common.failedToBeginTransaction')}: ${getErrorMessage(err)}`);
        throw err; // 手动模式下开不了事务就不应执行
      }
      return;
    }

    // 本地显示「事务进行中」时以后端为准，两种情况都不能照常执行：
    //   · 看门狗按空闲回收事务，界面上却还亮着事务按钮——这时语句会落到自动提交，
    //     用户以为还能回滚，其实已经生效
    //   · 事务开在另一个库上——带着当前库的语句进不了它
    const dbLabel = (name: string) => name || t('common.txDefaultDatabase');
    if (txDatabaseRef.current !== null && txDatabaseRef.current !== database) {
      const err = new Error(
        t('common.txOpenOnOtherDatabase', {
          database: dbLabel(txDatabaseRef.current),
          target: dbLabel(database),
        })
      );
      message.error(err.message);
      throw err;
    }
    // 状态查不到（连接已断等）就不拦：后端对「必须在事务里执行」的语句自有把关
    const active = await api.getTransactionStatus(connectionId, sessionId).catch(() => true);
    if (!active) {
      setTransactionActive(false);
      txDatabaseRef.current = null;
      const err = new Error(t('common.txEndedBeforeExecution'));
      message.error(err.message);
      throw err; // 事务已经没了，不能让语句落进自动提交
    }
  }, [txMode, transactionActive, connectionId, sessionId, database, beginTransaction, message, t]);

  /** 手动模式下显式开启事务（执行 SQL 时也会懒开启；提前开启可立即获得提交/回滚控制） */
  const handleBeginTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      await beginTransaction();
      message.success(t('common.transactionStarted'));
    } catch (err: unknown) {
      message.error(`${t('common.failedToBeginTransaction')}: ${getErrorMessage(err)}`);
    }
  }, [connectionId, beginTransaction, message, t]);

  /** 切换事务模式。切到自动时若有未提交事务，弹确认（提交并切换 / 取消留在手动）。 */
  const handleTxModeChange = useCallback(
    (mode: TransactionMode) => {
      if (mode === txMode) return;
      if (mode === 'auto') {
        if (transactionActive && connectionId) {
          appModal.confirm({
            title: t('common.txModeSwitchTitle'),
            content: t('common.txModeSwitchContent'),
            okText: t('common.commitTransaction'),
            cancelText: t('common.cancel'),
            onOk: async () => {
              try {
                const committed = await api.commitTransaction(connectionId, sessionId);
                setTransactionActive(false);
                txDatabaseRef.current = null;
                setTxMode('auto');
                if (committed) {
                  message.success(t('common.transactionCommitted'));
                } else {
                  message.warning(t('common.txAlreadyEnded'));
                }
              } catch (err: unknown) {
                message.error(`${t('common.failedToCommitTransaction')}: ${getErrorMessage(err)}`);
              }
            },
          });
          return;
        }
        setTxMode('auto');
        return;
      }
      // 切到手动：不开事务——首次执行 SQL 时才开（此时才产生可提交/回滚的变更）。
      // 若后端已有该连接的事务（如其他查询 Tab 开启），直接接续其活跃状态，
      // 否则本 Tab 永远看不到提交/回滚按钮，事务也无人收尾。
      if (connectionId) {
        api
          .getTransactionStatus(connectionId, sessionId)
          .then((active) => {
            if (active) setTransactionActive(true);
          })
          .catch(() => {});
      }
      setTxMode('manual');
    },
    [txMode, transactionActive, connectionId, sessionId, message, t]
  );

  const handleCommitTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      const committed = await api.commitTransaction(connectionId, sessionId);
      if (committed) {
        message.success(t('common.transactionCommitted'));
      } else {
        // 后端已没有等待中的事务——大概率被 5 分钟看门狗超时回滚，不能假装提交成功
        message.warning(t('common.txAlreadyEnded'));
      }
    } catch (err: unknown) {
      message.error(`${t('common.failedToCommitTransaction')}: ${getErrorMessage(err)}`);
    } finally {
      // 事务结束但模式保持手动；后端已幂等（无事务=已结束），失败只剩连接级故障
      setTransactionActive(false);
      txDatabaseRef.current = null;
    }
  }, [connectionId, sessionId, message, t]);

  const handleRollbackTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      const rolledBack = await api.rollbackTransaction(connectionId, sessionId);
      if (rolledBack) {
        message.success(t('common.transactionRolledBack'));
      } else {
        message.warning(t('common.txAlreadyEnded'));
      }
    } catch (err: unknown) {
      message.error(`${t('common.failedToRollbackTransaction')}: ${getErrorMessage(err)}`);
    } finally {
      setTransactionActive(false);
      txDatabaseRef.current = null;
    }
  }, [connectionId, sessionId, message, t]);

  return {
    txMode,
    transactionActive,
    handleTxModeChange,
    handleBeginTransaction,
    ensureTransactionForExecution,
    handleCommitTransaction,
    handleRollbackTransaction,
  };
}
