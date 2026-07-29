import { useState, useRef, useCallback, useEffect } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import type { DatabaseType } from '../../../types/api';
import { detectSqlDialect, mergeCompatibleDialect, type DialectDetection } from '../../../utils/sqlDialects/detectDialect';
import { convertByRules } from '../../../utils/sqlDialects/convertRules';
import { streamAITask } from '../../../services/aiService';
import { useAIStore } from '../../../stores/aiStore';

// 从 AI 输出中提取第一个 sql 代码块内容；无代码块则返回去空白原文。
// 与 AIPanel.tsx 的 extractSQL 及后端 ai.ExtractSQL 保持一致。
function extractSQL(text: string): string {
  const match = text.match(/```(?:sql)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : text.trim();
}

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
  const [aiConverting, setAiConverting] = useState(false);
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
      // 双向兼容归一比较：检测出的方言和连接 dbType 都归一到主方言再比较，
      // 避免 oracle 语法在 dameng 连接（兼容）误报、达梦语法折叠成 oracle 后与 dameng 恒不等等问题。
      if (detection && detection.dialect !== mergeCompatibleDialect(dbType)) {
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

  // SQL 方言 AI 转换（深度转换，需 AI 配置就绪）
  const handleAIConvert = useCallback(async () => {
    if (!dialectMismatch || !dbType || !setSql || !sql) return;
    const { ready } = useAIStore.getState();
    if (!ready) {
      message.warning(t('common.aiSettings.notConfigured'));
      return;
    }

    setAiConverting(true);
    // AI 转换期间关闭 banner，避免转换过程中 SQL 变化触发重复检测
    setDialectMismatch(null);
    setDialectDismissed(true);

    try {
      const result = await streamAITask({
        taskId: 'sql-convert',
        sql,
        sourceDialect: dialectMismatch.dialect,
        targetDialect: dbType,
      // Banner 场景静默转换，无需逐 chunk 更新 UI，等全部完成后再替换
      }, () => {});
      // 后端 sql-convert 任务只输出 sql 代码块，提取后直接替换编辑器内容
      const converted = extractSQL(result);
      setSql(converted);
      message.success(t('common.sqlEditor.dialectConverted', { source: dialectMismatch.dialect, target: dbType }));
    } catch (err) {
      message.error(`${t('common.sqlEditor.aiConvertFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiConverting(false);
    }
  }, [sql, dbType, dialectMismatch, setSql, message, t]);

  // SQL 方言转换忽略
  const handleDismissDialectBanner = useCallback(() => {
    setDialectDismissed(true);
    setDialectMismatch(null);
  }, []);

  return {
    dialectMismatch,
    handleQuickConvert,
    handleAIConvert,
    aiConverting,
    handleDismissDialectBanner,
  };
}
