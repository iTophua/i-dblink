import { useState, useCallback, useEffect, useRef } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../../api';
import { getErrorMessage } from '../../../utils/getErrorMessage';

export function useTransaction(connectionId?: string | null) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [transactionActive, setTransactionActive] = useState(false);
  const prevConnectionIdRef = useRef(connectionId);

  // 事务绑定在连接上：切换连接时静默回滚旧连接的事务并重置状态，
  // 避免 UI 的事务态与后端实际事务错位（提交/回滚打到没有事务的新连接上报错卡死）
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
  }, [connectionId, transactionActive]);

  const handleBeginTransaction = useCallback(async () => {
    if (!connectionId) {
      message.warning(t('common.pleaseSelectADatabaseConnection'));
      return;
    }
    try {
      await api.beginTransaction(connectionId);
      setTransactionActive(true);
      message.success(t('common.transactionStarted'));
    } catch (err: unknown) {
      message.error(`${t('common.failedToBeginTransaction')}: ${getErrorMessage(err)}`);
    }
  }, [connectionId]);

  const handleCommitTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      await api.commitTransaction(connectionId);
      message.success(t('common.transactionCommitted'));
    } catch (err: unknown) {
      message.error(`${t('common.failedToCommitTransaction')}: ${getErrorMessage(err)}`);
    } finally {
      // 无论成败都退出事务模式：后端已幂等（无事务=已是自动提交模式），
      // 剩余失败只有连接级故障，事务必已终结；不重置会导致 UI 永久卡在事务态
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
    transactionActive,
    handleBeginTransaction,
    handleCommitTransaction,
    handleRollbackTransaction,
  };
}
