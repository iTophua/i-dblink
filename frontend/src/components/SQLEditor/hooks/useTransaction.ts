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

  // 事务绑定在连接上：切换连接时静默回滚旧连接的事务并重置模式与状态
  useEffect(() => {
    if (prevConnectionIdRef.current === connectionId) return;
    const prev = prevConnectionIdRef.current;
    prevConnectionIdRef.current = connectionId;
    if (transactionActive && prev) {
      api.rollbackTransaction(prev).catch(() => {
        // 静默失败：旧事务可能已结束或连接已断，后端已幂等处理
      });
    }
    setTransactionActive(false);
    setTxMode('auto');
  }, [connectionId, transactionActive]);

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
                await api.commitTransaction(connectionId);
                setTransactionActive(false);
                setTxMode('auto');
                message.success(t('common.transactionCommitted'));
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
      // 切到手动：不开事务——首次执行 SQL 时才开（此时才产生可提交/回滚的变更）
      setTxMode('manual');
    },
    [txMode, transactionActive, connectionId, message, t]
  );

  const handleCommitTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      await api.commitTransaction(connectionId);
      message.success(t('common.transactionCommitted'));
    } catch (err: unknown) {
      message.error(`${t('common.failedToCommitTransaction')}: ${getErrorMessage(err)}`);
    } finally {
      // 事务结束但模式保持手动；后端已幂等（无事务=已提交），失败只剩连接级故障
      setTransactionActive(false);
    }
  }, [connectionId]);

  const handleRollbackTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      await api.rollbackTransaction(connectionId);
      message.success(t('common.transactionRolledBack'));
    } catch (err: unknown) {
      message.error(`${t('common.failedToRollbackTransaction')}: ${getErrorMessage(err)}`);
    } finally {
      setTransactionActive(false);
    }
  }, [connectionId]);

  return {
    txMode,
    transactionActive,
    handleTxModeChange,
    ensureTransactionForExecution,
    handleCommitTransaction,
    handleRollbackTransaction,
  };
}
