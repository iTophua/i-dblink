import { useState, useRef, useCallback, useEffect } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../../../hooks/useApi';
import { useSettingsStore } from '../../../stores/settingsStore';
import { extractParams } from '../../../utils/sqlParams';
import { splitSqlStatements } from '../../../utils/sqlUtils';
import { getDialect } from '../../../utils/sqlDialects';
import type { QueryResult, DatabaseType } from '../../../types/api';
import { getErrorMessage } from '../../../utils/getErrorMessage';

interface QueryResultWithTiming extends QueryResult {
  executionTime?: number;
  totalTime?: number;
  executedSql?: string;
}

declare global {
  interface Window {
    __sqlHistoryApi?: {
      addHistory: (item: {
        sql: string;
        success: boolean;
        duration?: number;
        rowCount?: number;
      }) => void;
    };
  }
}

export interface UseQueryExecutionParams {
  connectionId?: string | null;
  database?: string;
  sql: string;
  dbType?: DatabaseType;
  // Error handling (passed in to avoid circular deps with editor ref)
  highlightError: (errorMsg: string) => void;
  clearErrorMarkers: () => void;
  onQueryStatusChange?: (isQuerying: boolean) => void;
  // Editor ref for reading selection
  editorRef?: React.MutableRefObject<any>;
}

export function useQueryExecution({
  connectionId,
  database,
  sql,
  dbType,
  highlightError,
  clearErrorMarkers,
  onQueryStatusChange,
  editorRef,
}: UseQueryExecutionParams) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { executeQuery: executeQueryApi } = useDatabase();

  // 用 ref 包装外部传入的函数，避免 useCallback 闭包过期
  const highlightErrorRef = useRef(highlightError);
  const clearErrorMarkersRef = useRef(clearErrorMarkers);
  useEffect(() => { highlightErrorRef.current = highlightError; }, [highlightError]);
  useEffect(() => { clearErrorMarkersRef.current = clearErrorMarkers; }, [clearErrorMarkers]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResultWithTiming | null>(null);
  const [results, setResults] = useState<QueryResultWithTiming[]>([]);
  const [activeTab, setActiveTab] = useState<'result' | 'messages' | 'explain' | 'chart'>('result');
  const [resultViewMode, setResultViewMode] = useState<'auto' | 'all' | 'single'>('auto');
  const [messages, setMessages] = useState<string[]>([]);
  const [explainPlan, setExplainPlan] = useState<any[]>([]);
  const [execElapsed, setExecElapsed] = useState(0);

  const execTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestStartTimeRef = useRef(0);
  const returnedRowsRef = useRef(0);

  // Param dialog state shared with parent
  const [paramDialogOpen, setParamDialogOpen] = useState(false);
  const [paramDialogParams, setParamDialogParams] = useState<string[]>([]);
  const [pendingSql, setPendingSql] = useState<string>('');

  const handleExecuteQuery = useCallback(async (explicitSql?: string) => {
    // 收起建议列表
    editorRef?.current?.getAction('editor.action.hideSuggestWidget')?.run();

    let sqlToExecute: string;
    if (explicitSql) {
      sqlToExecute = explicitSql;
    } else {
      const selectedSql = editorRef?.current
        ?.getModel()
        ?.getValueInRange(editorRef.current.getSelection())
        ?.trim();
      sqlToExecute = selectedSql || sql;
    }

    if (!sqlToExecute.trim()) {
      message.warning(t('common.pleaseEnterSqlStatement'));
      return;
    }

    if (!connectionId) {
      message.warning(t('common.pleaseSelectADatabaseConnection'));
      return;
    }

    if (!database) {
      message.warning(t('common.pleaseSelectADatabase'));
      return;
    }

    // 查询参数化：检测参数并弹出输入对话框
    const params = extractParams(sqlToExecute);
    if (params.length > 0 && !pendingSql) {
      setParamDialogParams(params);
      setPendingSql(sqlToExecute);
      setParamDialogOpen(true);
      return;
    }

    if (pendingSql) {
      sqlToExecute = pendingSql;
      setPendingSql('');
    }

    requestStartTimeRef.current = Date.now();
    returnedRowsRef.current = 0;
    setExecElapsed(0);
    // 启动实时计时器（每 100ms 更新已用时间）
    if (execTimerRef.current) clearInterval(execTimerRef.current);
    execTimerRef.current = setInterval(() => {
      setExecElapsed((Date.now() - requestStartTimeRef.current) / 1000);
    }, 100);
    try {
      setLoading(true);
      setMessages([]);

      setResults([]);
      setExplainPlan([]);
      clearErrorMarkersRef.current();
      
      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      
      onQueryStatusChange?.(true);

      // 检测是否多语句（按分号分割，忽略字符串内的分号）
      const statements = splitSqlStatements(sqlToExecute);
      const isMultiStatement = statements.length > 1;

      if (isMultiStatement) {
        const multiResults: QueryResultWithTiming[] = [];
        const msgs: string[] = [];
        let totalErrors = 0;
        let totalSuccess = 0;
        const maxRows = useSettingsStore.getState().settings.maxResultRows;
        let hasTruncated = false;

        // 使用批处理优化多语句执行
        const batchSize = 5;
        for (let i = 0; i < statements.length; i += batchSize) {
          const batch = statements.slice(i, i + batchSize);
          const batchPromises = batch.map(async (stmt, index) => {
            if (abortControllerRef.current?.signal.aborted) return null;
            
            try {
              const queryResult = await executeQueryApi(connectionId, stmt, database, abortControllerRef.current?.signal);
              const executionTime = queryResult.execution_time_ms ?? 0;

              // 防御性处理：后端 omitempty 可能导致 rows/columns 为 undefined
              const rows = queryResult.rows ?? [];

              const truncated = rows.length > maxRows;
              if (truncated) {
                hasTruncated = true;
                queryResult.rows = rows.slice(0, maxRows);
              } else {
                queryResult.rows = rows;
              }

              if (queryResult.error) {
                msgs.push(t('common.statementFailed', { index: i + index + 1, error: queryResult.error }));
                totalErrors++;
                highlightErrorRef.current(queryResult.error);
                window.__sqlHistoryApi?.addHistory({
                  sql: stmt,
                  success: false,
                  duration: executionTime,
                });
              } else {
                const rowCount = queryResult.rows.length;
                const affectedRows = queryResult.rows_affected || 0;
                if (rowCount > 0) {
                  let msg = t('common.statementSuccess', {
                    index: i + index + 1,
                    count: rowCount,
                    time: executionTime,
                  });
                  if (truncated) msg += t('common.truncatedTo', { count: maxRows });
                  msgs.push(msg);
                } else if (affectedRows > 0) {
                  msgs.push(
                    t('common.statementAffected', {
                      index: i + index + 1,
                      count: affectedRows,
                      time: executionTime,
                    })
                  );
                } else {
                  msgs.push(t('common.statementExecuted', { index: i + index + 1, time: executionTime }));
                }
                totalSuccess++;
                window.__sqlHistoryApi?.addHistory({
                  sql: stmt,
                  success: true,
                  duration: executionTime,
                  rowCount: rowCount > 0 ? rowCount : affectedRows,
                });
              }
              return { ...queryResult, executionTime };
            } catch (error: unknown) {
              // 用户主动停止查询时静默跳过（不计为错误）
              if (error instanceof DOMException && error.name === 'AbortError') {
                return null;
              }
              msgs.push(t('common.statementFailed', { index: i + index + 1, error: getErrorMessage(error) }));
              totalErrors++;
              window.__sqlHistoryApi?.addHistory({
                sql: stmt,
                success: false,
              });
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(result => {
            if (result) multiResults.push(result);
          });

          // 批次间让UI有机会更新
          if (i + batchSize < statements.length) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        if (hasTruncated) {
          message.warning(
            `${t('common.queryResultsExceeded')} ${maxRows} ${t('common.rowsTruncated')}`
          );
        }

        setResults(multiResults);
        setMessages(msgs);

        if (totalErrors === 0) {
          message.success(
            `${t('common.allExecutedSuccessfully')}: ${totalSuccess} ${t('common.statements')}`
          );
          setActiveTab('result');
        } else {
          message.error(
            `${t('common.partialExecutionFailed')}: ${totalSuccess} ${t('common.success')}, ${totalErrors} ${t('common.failed')}`
          );
          setActiveTab('messages');
        }
      } else {
        // 单语句执行（含连接断开自动重试）
        const isConnectionError = (msg: string) => {
          const lower = msg.toLowerCase();
          return lower.includes('connection') || lower.includes('closed') ||
            lower.includes('eof') || lower.includes('broken pipe') ||
            lower.includes('reset by peer') || lower.includes('bad connection');
        };

        let queryResult = await executeQueryApi(connectionId, sqlToExecute, database, abortControllerRef.current?.signal);
        // 如果查询因连接问题失败，等待 1 秒后重试一次
        if (queryResult.error && isConnectionError(queryResult.error)) {
          message.info(t('common.connectionLostReconnecting', { defaultValue: 'Connection lost, attempting to reconnect...' }));
          await new Promise(resolve => setTimeout(resolve, 1000));
          queryResult = await executeQueryApi(connectionId, sqlToExecute, database, abortControllerRef.current?.signal);
        }

        const executionTime = queryResult.execution_time_ms ?? 0;
        const totalTime = Date.now() - requestStartTimeRef.current;

        if (queryResult.error) {
          setMessages([`✗ ${t('common.error')}: ${queryResult.error}`]);
          setActiveTab('messages');
          message.error(`${t('common.sqlExecutionFailed')}: ${queryResult.error}`);
          highlightErrorRef.current(queryResult.error);
          setResult({ ...queryResult, executionTime, totalTime, executedSql: sqlToExecute });
          window.__sqlHistoryApi?.addHistory({
            sql: sqlToExecute,
            success: false,
            duration: executionTime,
          });
        } else {
          const maxRows = useSettingsStore.getState().settings.maxResultRows;
          const allRows = queryResult.rows ?? [];
          const truncated = allRows.length > maxRows;
          const truncatedRows = truncated ? allRows.slice(0, maxRows) : allRows;
          const rowCount = truncatedRows.length;
          const affectedRows = queryResult.rows_affected || 0;

          setResult({ ...queryResult, rows: truncatedRows, executionTime, totalTime, executedSql: sqlToExecute });

          clearErrorMarkersRef.current();

          if (rowCount > 0) {
            let msg = `✓ ${t('common.querySuccess')}, ${rowCount} ${t('common.records')}, ${t('common.executionTime')} ${executionTime}ms`;
            if (truncated) {
              msg += `（${t('common.resultSetTruncated')}, ${t('common.onlyShowingFirst')}${maxRows} ${t('common.rows')}）`;
              message.warning(
                `${t('common.queryResultsExceeded')} ${maxRows} ${t('common.rowsTruncated')}`
              );
            }
            setMessages([msg]);
          } else if (affectedRows > 0) {
            setMessages([
              `${t('common.executionSuccess')}, ${affectedRows} ${t('common.rowsAffected')}, ${t('common.executionTime')} ${executionTime}ms`,
            ]);
          } else {
            setMessages([
              `${t('common.executionSuccess')}, ${t('common.executionTime')} ${executionTime}ms`,
            ]);
          }

          setActiveTab('result');
          window.__sqlHistoryApi?.addHistory({
            sql: sqlToExecute,
            success: true,
            duration: executionTime,
            rowCount: rowCount > 0 ? rowCount : affectedRows,
          });
        }
      }
    } catch (error: unknown) {
      // 检查是否是取消操作
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('Query was aborted');
        setMessages((prev) => [...prev, '⚠ ' + t('common.queryStopped')]);
        return;
      }
      
      console.error('SQL execution error:', error);
      setMessages([`✗ ${t('common.error')}: ${getErrorMessage(error)}`]);
      setActiveTab('messages');
      message.error(`${t('common.sqlExecutionFailed')}: ${getErrorMessage(error)}`);
      highlightErrorRef.current(getErrorMessage(error));
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
      onQueryStatusChange?.(false);
      // 停止执行计时器
      if (execTimerRef.current) {
        clearInterval(execTimerRef.current);
        execTimerRef.current = null;
      }
      setExecElapsed((Date.now() - requestStartTimeRef.current) / 1000);
    }
  }, [sql, connectionId, database, executeQueryApi, pendingSql]);

  const stopQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      setMessages((prev) => [...prev, '⚠ ' + t('common.queryStopped')]);
      message.warning(t('common.queryStopped'));
      onQueryStatusChange?.(false);
    } else {
      message.info(t('common.noQueryExecuting'));
    }
  }, [onQueryStatusChange]);

  const showExplainPlan = useCallback(async () => {
    if (!sql.trim()) {
      message.warning(t('common.pleaseEnterSqlStatement'));
      return;
    }

    if (!connectionId) {
      message.warning(t('common.pleaseSelectADatabaseConnection'));
      return;
    }

    if (!database) {
      message.warning(t('common.pleaseSelectADatabase'));
      return;
    }

    try {
      setLoading(true);

      let trimmedSQL = sql.trim();
      if (trimmedSQL.endsWith(';')) {
        trimmedSQL = trimmedSQL.slice(0, -1).trim();
      }

      const dialect = getDialect(dbType);
      const explainSQL = dialect.buildExplainQuery(trimmedSQL);
      const result = await executeQueryApi(connectionId, explainSQL, database);

      if (result.error) {
        message.error(`${t('common.failedToGenerateExplainPlan')}: ${result.error}`);
      } else {
        const planRows = result.rows ?? [];
        // SQL Server SHOWPLAN_XML returns plan as XML in result rows;
        // if no rows, the plan may be in messages — show a notice.
        if (planRows.length === 0) {
          message.info(t('common.explainPlanGenerated') + ': ' + (t('common.noExplainPlanData') || 'No tabular data returned (XML plan may be in messages).'));
        }
        setExplainPlan(planRows as unknown[]);
        setActiveTab('explain');
        if (planRows.length > 0) {
          message.success(t('common.explainPlanGenerated'));
        }
      }
    } catch (error: unknown) {
      console.error('Explain plan error:', error);
      message.error(`${t('common.failedToGenerateExplainPlan')}: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, [sql, connectionId, database, dbType, executeQueryApi]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (execTimerRef.current) {
      clearInterval(execTimerRef.current);
      execTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    loading,
    result,
    results,
    messages,
    explainPlan,
    activeTab,
    resultViewMode,
    execElapsed,
    paramDialogOpen,
    paramDialogParams,
    pendingSql,
    handleExecuteQuery,
    stopQuery,
    showExplainPlan,
    setActiveTab,
    setResultViewMode,
    setParamDialogOpen,
    setPendingSql,
    setResult,
    setMessages,
    setExplainPlan,
    cleanup,
  };
}
