import { useState, useCallback } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../../api';

export function useTransaction(connectionId?: string | null) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [transactionActive, setTransactionActive] = useState(false);

  const handleBeginTransaction = useCallback(async () => {
    if (!connectionId) {
      message.warning(t('common.pleaseSelectADatabaseConnection'));
      return;
    }
    try {
      await api.beginTransaction(connectionId);
      setTransactionActive(true);
      message.success(t('common.transactionStarted'));
    } catch (err: any) {
      message.error(`${t('common.failedToBeginTransaction')}: ${err.message || err}`);
    }
  }, [connectionId]);

  const handleCommitTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      await api.commitTransaction(connectionId);
      setTransactionActive(false);
      message.success(t('common.transactionCommitted'));
    } catch (err: any) {
      message.error(`${t('common.failedToCommitTransaction')}: ${err.message || err}`);
    }
  }, [connectionId]);

  const handleRollbackTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      await api.rollbackTransaction(connectionId);
      setTransactionActive(false);
      message.success(t('common.transactionRolledBack'));
    } catch (err: any) {
      message.error(`${t('common.failedToRollbackTransaction')}: ${err.message || err}`);
    }
  }, [connectionId]);

  return {
    transactionActive,
    handleBeginTransaction,
    handleCommitTransaction,
    handleRollbackTransaction,
  };
}
