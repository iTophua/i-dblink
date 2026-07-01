import { useState, useRef, useCallback, useEffect } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import type { DatabaseType } from '../../../types/api';
import { detectSqlDialect, type DialectDetection } from '../../../utils/sqlDialects/detectDialect';
import { convertByRules } from '../../../utils/sqlDialects/convertRules';

export function useSqlDialectDetection(
  connectionId?: string | null,
  dbType?: DatabaseType,
  sql?: string,
  setSql?: (sql: string) => void,
) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [dialectMismatch, setDialectMismatch] = useState<DialectDetection | null>(null);
  const [dialectDismissed, setDialectDismissed] = useState(false);
  const dialectDetectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SQL 方言检测（debounce 500ms）
  useEffect(() => {
    if (dialectDetectTimerRef.current) {
      clearTimeout(dialectDetectTimerRef.current);
    }

    if (dialectDismissed || !sql || !dbType) {
      setDialectMismatch(null);
      return;
    }

    dialectDetectTimerRef.current = setTimeout(() => {
      const detection = detectSqlDialect(sql);
      if (detection && detection.dialect !== dbType) {
        setDialectMismatch(detection);
      } else {
        setDialectMismatch(null);
      }
    }, 500);

    return () => {
      if (dialectDetectTimerRef.current) {
        clearTimeout(dialectDetectTimerRef.current);
      }
    };
  }, [sql, dbType, dialectDismissed]);

  // 切换连接时重置方言检测
  useEffect(() => {
    setDialectDismissed(false);
    setDialectMismatch(null);
  }, [connectionId]);

  // SQL 方言快速转换（规则引擎）
  const handleQuickConvert = useCallback(() => {
    if (!dialectMismatch || !dbType || !setSql || !sql) return;
    const converted = convertByRules(sql, {
      sourceDialect: dialectMismatch.dialect,
      targetDialect: dbType,
    });
    setSql(converted);
    setDialectMismatch(null);
    setDialectDismissed(true);
    message.success(t('common.sqlEditor.dialectConverted', { source: dialectMismatch.dialect, target: dbType }));
  }, [sql, dbType, dialectMismatch, setSql]);

  // SQL 方言转换忽略
  const handleDismissDialectBanner = useCallback(() => {
    setDialectDismissed(true);
    setDialectMismatch(null);
  }, []);

  return {
    dialectMismatch,
    handleQuickConvert,
    handleDismissDialectBanner,
  };
}
