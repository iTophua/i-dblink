import { useState, useCallback, useEffect, useRef } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../../api';
import { getErrorMessage } from '../../../utils/getErrorMessage';
import { appModal } from '../../../utils/appModal';

/** 事务模式：auto=自动提交（默认），manual=手动事务（执行后需提交/回滚，模式保持） */
export type TransactionMode = 'auto' | 'manual';

export function useTransaction(connectionId?: string | null) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [txMode, setTxMode] = useState<TransactionMode>('auto');
  const [transactionActive, setTransactionActive] = useState(false);
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
        api.rollbackTransaction(prev).catch(() => {
          // 静默失败：旧事务可能已结束或连接已断，后端已幂等处理
        });
      }
      setTransactionActive(false);
      setTxMode('auto');
    }
    if (!connectionId) return;
    let cancelled = false;
    api
      .getTransactionStatus(connectionId)
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
        api.rollbackTransaction(connectionIdRef.current).catch(() => {});
      }
    },
    []
  );

  /**
   * 执行前钩子：手动模式下确保事务已开启。
   * 提交/回滚后事务关闭但模式保持手动，下次执行时自动重开新事务。
   */
  const ensureTransactionForExecution = useCallback(async () => {
    if (txMode !== 'manual' || !connectionId || transactionActive) return;
    try {
      await api.beginTransaction(connectionId);
      setTransactionActive(true);
    } catch (err: unknown) {
      message.error(`${t('common.failedToBeginTransaction')}: ${getErrorMessage(err)}`);
      throw err; // 手动模式下开不了事务就不应执行
    }
  }, [txMode, transactionActive, connectionId, message, t]);

  /** 手动模式下显式开启事务（执行 SQL 时也会懒开启；提前开启可立即获得提交/回滚控制） */
  const handleBeginTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      await api.beginTransaction(connectionId);
      setTransactionActive(true);
      message.success(t('common.transactionStarted'));
    } catch (err: unknown) {
      message.error(`${t('common.failedToBeginTransaction')}: ${getErrorMessage(err)}`);
    }
  }, [connectionId, message, t]);

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
                const committed = await api.commitTransaction(connectionId);
                setTransactionActive(false);
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
          .getTransactionStatus(connectionId)
          .then((active) => {
            if (active) setTransactionActive(true);
          })
          .catch(() => {});
      }
      setTxMode('manual');
    },
    [txMode, transactionActive, connectionId, message, t]
  );

  const handleCommitTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      const committed = await api.commitTransaction(connectionId);
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
    }
  }, [connectionId, message, t]);

  const handleRollbackTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      const rolledBack = await api.rollbackTransaction(connectionId);
      if (rolledBack) {
        message.success(t('common.transactionRolledBack'));
      } else {
        message.warning(t('common.txAlreadyEnded'));
      }
    } catch (err: unknown) {
      message.error(`${t('common.failedToRollbackTransaction')}: ${getErrorMessage(err)}`);
    } finally {
      setTransactionActive(false);
    }
  }, [connectionId, message, t]);

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
