import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../api';
import type { ActiveTabInfo } from '../../TabPanel';
import type { Connection } from '../../../stores/appStore';

interface UseTabManagerParams {
  selectedConnectionId: string | null;
  connections: Connection[];
}

export function useTabManager({ selectedConnectionId, connections }: UseTabManagerParams) {
  const { t } = useTranslation();

  // 双击表时触发，用于在 TabPanel 中打开新 Tab
  const [tableToOpen, setTableToOpen] = useState<{
    name: string;
    database?: string;
    isView?: boolean;
  } | null>(null);
  const [sqlTabCount, setSqlTabCount] = useState(0);
  const [activeTabInfo, setActiveTabInfo] = useState<ActiveTabInfo>({
    type: 'objects',
    title: t('common.objectListTitle'),
  });
  const [transactionActive, setTransactionActive] = useState(false);
  const [currentResultRows, setCurrentResultRows] = useState<number>(0);
  const [currentExecutionTime, setCurrentExecutionTime] = useState<number>(0);
  const [isQuerying, setIsQuerying] = useState(false);
  const [selectedObjectType, setSelectedObjectType] = useState<'table' | 'view' | 'all'>('all');

  // 监听活跃 Tab 变化，更新状态栏信息
  useEffect(() => {
    if (activeTabInfo.type === 'sql') {
      // 查询 Tab：监听事务状态
      if (selectedConnectionId) {
        api
          .getTransactionStatus(selectedConnectionId)
          .then(setTransactionActive)
          .catch(() => {});
      } else {
        setTransactionActive(false);
      }
      setCurrentResultRows(0);
      setCurrentExecutionTime(0);
    } else if (activeTabInfo.type === 'data') {
      // 数据 Tab：重置事务状态
      setTransactionActive(false);
      setCurrentResultRows(0);
      setCurrentExecutionTime(0);
    } else {
      setTransactionActive(false);
      setCurrentResultRows(0);
      setCurrentExecutionTime(0);
    }
  }, [activeTabInfo.type, activeTabInfo.connectionId, selectedConnectionId]);

  return {
    tableToOpen,
    setTableToOpen,
    sqlTabCount,
    setSqlTabCount,
    activeTabInfo,
    setActiveTabInfo,
    transactionActive,
    setTransactionActive,
    currentResultRows,
    setCurrentResultRows,
    currentExecutionTime,
    setCurrentExecutionTime,
    isQuerying,
    setIsQuerying,
    selectedObjectType,
    setSelectedObjectType,
  };
}
