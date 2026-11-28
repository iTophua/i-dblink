import { useState, useRef, useCallback, useEffect } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../../../hooks/useApi';
import { api } from '../../../api';
import { useSettingsStore } from '../../../stores/settingsStore';
import { splitSqlStatements, stringBackslashIsEscape } from '../../../utils/sqlUtils';
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
  // 执行前钩子（校验通过后、真正执行前调用）：手动事务模式借此确保事务已开启；抛错则中止执行
  onBeforeExecute?: () => Promise<void> | void;
  // 执行时读取事务路由意图：true = 进活跃事务（手动模式），false = 强制自动提交。
  // 不传则由 api 层默认（后端有活跃事务则进事务）。
  getUseTransaction?: () => boolean | undefined;
  // 事务会话 ID（查询 Tab 的 tabKey），透传给后端做会话级事务隔离
  sessionId?: string;
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
  onBeforeExecute,
  getUseTransaction,
  sessionId,
  editorRef,
}: UseQueryExecutionParams) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { executeQuery: executeQueryApi } = useDatabase();

  // 用 ref 包装外部传入的函数，避免 useCallback 闭包过期
  const getUseTransactionRef = useRef(getUseTransaction);
  useEffect(() => {
    getUseTransactionRef.current = getUseTransaction;
  }, [getUseTransaction]);
  const highlightErrorRef = useRef(highlightError);
  const clearErrorMarkersRef = useRef(clearErrorMarkers);
  useEffect(() => {
    highlightErrorRef.current = highlightError;
  }, [highlightError]);
  useEffect(() => {
    clearErrorMarkersRef.current = clearErrorMarkers;
  }, [clearErrorMarkers]);

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
  // 当前脚本批量执行的取消令牌：stop 时通知后端在语句间停止剩余语句
  const scriptTokenRef = useRef<string | null>(null);
  // 执行序号：执行中再次触发（或卸载）时加一，旧的一轮据此知道「已经不归自己管」，
  // 收尾时不再去动 loading、计时器、取消令牌这些共享状态
  const runSeqRef = useRef(0);
  const requestStartTimeRef = useRef(0);
  const returnedRowsRef = useRef(0);

  // Param dialog state shared with parent
  // 参数化查询已禁用：paramDialogParams 固定为空，paramDialogOpen/pendingSql
  // 保留以维持与 ParamDialog 组件的结构兼容（弹窗不再主动打开）。
  const [paramDialogOpen, setParamDialogOpen] = useState(false);
  const paramDialogParams: string[] = [];
  const [pendingSql, setPendingSql] = useState<string>('');

  const handleExecuteQuery = useCallback(
    async (explicitSql?: string) => {
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

      // 执行前钩子（手动事务模式借此确保事务开启）；失败已由钩子自行提示，静默中止
      try {
        await onBeforeExecute?.();
      } catch {
        return;
      }

      // 参数化查询已禁用（extractParams 始终返回 []），相关弹窗逻辑已移除。
      if (pendingSql) {
        sqlToExecute = pendingSql;
        setPendingSql('');
      }

      // 上一轮还在跑：先把它停干净（界面等待 + 后端批次）。只中止界面等待的话，
      // 旧批次的后端取消令牌会被下面新一轮的覆盖，「停止」就停不了还在跑的旧查询；
      // 旧一轮的收尾还会把新一轮的 loading 和计时器一并清掉
      if (scriptTokenRef.current) {
        api.cancelScriptBatch(scriptTokenRef.current);
        scriptTokenRef.current = null;
      }
      abortControllerRef.current?.abort();
      const runId = ++runSeqRef.current;

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

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        onQueryStatusChange?.(true);

        // 检测是否多语句（按分号分割，忽略字符串内的分号）。
        // 反斜杠在 PG / SQLite / SQL Server / Oracle 的字符串里是普通字符：当成转义符的话，
        // 以反斜杠结尾的值（Windows 路径之类）会让字符串不闭合，后面的语句被并进上一条
        const statements = splitSqlStatements(sqlToExecute, {
          backslashEscapes: stringBackslashIsEscape(dbType),
        });
        const isMultiStatement = statements.length > 1;

        if (isMultiStatement) {
          const multiResults: QueryResultWithTiming[] = [];
          const msgs: string[] = [];
          let totalErrors = 0;
          let totalSuccess = 0;
          const maxRows = useSettingsStore.getState().settings.maxResultRows;
          let hasTruncated = false;

          // 批量执行：整个脚本一次绑定调用，后端顺序逐条执行（语句间依赖保序），
          // 省去逐语句 IPC 往返/前端渲染churn/逐条历史提交；stop 可在语句间真正停止
          const cancelToken =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `script-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          scriptTokenRef.current = cancelToken;
          const useTx = getUseTransactionRef.current?.();
          const scriptResult = await api.executeScriptBatch(
            connectionId,
            statements,
            database,
            signal,
            { useTransaction: useTx, maxRows, cancelToken, sessionId: sessionId ?? '' }
          );
          // 绑定调用没法中断：被取代的那一轮晚返回时结果丢弃，也不能清掉新一轮的取消令牌
          if (runId !== runSeqRef.current) return;
          if (scriptTokenRef.current === cancelToken) scriptTokenRef.current = null;

          scriptResult.results.forEach((queryResult, i) => {
            const stmt = statements[i];
            const executionTime = queryResult.execution_time_ms ?? 0;

            // 防御性处理：后端 omitempty 可能导致 rows/columns 为 undefined
            const rows = queryResult.rows ?? [];
            const truncated = rows.length > maxRows || queryResult.truncated === true;
            if (rows.length > maxRows) {
              queryResult.rows = rows.slice(0, maxRows);
            } else {
              queryResult.rows = rows;
            }
            if (queryResult.truncated === true) {
              hasTruncated = true;
            }

            if (queryResult.error) {
              msgs.push(t('common.statementFailed', { index: i + 1, error: queryResult.error }));
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
                  index: i + 1,
                  count: rowCount,
                  time: executionTime,
                });
                if (truncated) msg += t('common.truncatedTo', { count: maxRows });
                msgs.push(msg);
              } else if (affectedRows > 0) {
                msgs.push(
                  t('common.statementAffected', {
                    index: i + 1,
                    count: affectedRows,
                    time: executionTime,
                  })
                );
              } else {
                msgs.push(t('common.statementExecuted', { index: i + 1, time: executionTime }));
              }
              totalSuccess++;
              window.__sqlHistoryApi?.addHistory({
                sql: stmt,
                success: true,
                duration: executionTime,
                rowCount: rowCount > 0 ? rowCount : affectedRows,
              });
            }
            multiResults.push({ ...queryResult, executionTime });
          });

          if (scriptResult.cancelled) {
            msgs.push('⚠ ' + t('common.queryStopped'));
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
            // 全部语句都没有结果集（DDL/DML）时，消息里的影响行数才有意义
            setActiveTab(
              multiResults.some((r) => (r.rows?.length ?? 0) > 0) ? 'result' : 'messages'
            );
          } else {
            message.error(
              `${t('common.partialExecutionFailed')}: ${totalSuccess} ${t('common.success')}, ${totalErrors} ${t('common.failed')}`
            );
            setActiveTab('messages');
          }
        } else {
          // 单语句执行（含连接断开自动重试）。
          // 与脚本共用批量通道（一条语句的"脚本"）：同一取消令牌机制，
          // stop 可中断正在执行的长查询（驱动 ctx 关闭查询），而非只弃 UI 等待
          const isConnectionError = (msg: string) => {
            const lower = msg.toLowerCase();
            return (
              lower.includes('connection') ||
              lower.includes('closed') ||
              lower.includes('eof') ||
              lower.includes('broken pipe') ||
              lower.includes('reset by peer') ||
              lower.includes('bad connection')
            );
          };

          const useTx = getUseTransactionRef.current?.();
          const maxRows = useSettingsStore.getState().settings.maxResultRows;
          const cancelToken =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `script-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          scriptTokenRef.current = cancelToken;
          // 限行随语句下推：后端扫描到 maxRows 即停（truncated=true），不再整表拉回
          const runSingle = async (): Promise<QueryResult> => {
            const sr = await api.executeScriptBatch(
              connectionId,
              [sqlToExecute],
              database,
              signal,
              { useTransaction: useTx, maxRows, cancelToken, sessionId: sessionId ?? '' }
            );
            if (runId !== runSeqRef.current) {
              // 已被新一轮执行取代：按取消处理（走下面同一条路径，不动共享状态）
              throw new DOMException('Aborted', 'AbortError');
            }
            // 后端确认被取消：与 UI 侧 abort 走同一条"已停止"路径
            if (sr.cancelled) {
              throw new DOMException('Aborted', 'AbortError');
            }
            return sr.results[0] ?? { columns: [], rows: [] };
          };

          let queryResult = await runSingle();
          // 如果查询因连接问题失败，等待 1 秒后重试一次
          if (queryResult.error && isConnectionError(queryResult.error)) {
            message.info(
              t('common.connectionLostReconnecting', {
                defaultValue: 'Connection lost, attempting to reconnect...',
              })
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
            // 等待的这一秒里又被重新执行（或标签页已关闭）：不再重试，免得白跑一次
            if (runId !== runSeqRef.current) return;
            queryResult = await runSingle();
          }
          if (scriptTokenRef.current === cancelToken) scriptTokenRef.current = null;

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
            const allRows = queryResult.rows ?? [];
            // 截断可能来自后端（maxRows 下推后停止扫描，truncated=true），
            // 也保留前端裁剪兜底（防御 maxRows 未生效的路径）
            const truncated = allRows.length > maxRows || queryResult.truncated === true;
            const truncatedRows =
              truncated && allRows.length > maxRows ? allRows.slice(0, maxRows) : allRows;
            const rowCount = truncatedRows.length;
            const affectedRows = queryResult.rows_affected || 0;

            setResult({
              ...queryResult,
              rows: truncatedRows,
              executionTime,
              totalTime,
              executedSql: sqlToExecute,
            });

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

            // 无结果集（UPDATE/DELETE/DDL）时切到消息，避免停在空白网格上
            setActiveTab(rowCount > 0 ? 'result' : 'messages');
            window.__sqlHistoryApi?.addHistory({
              sql: sqlToExecute,
              success: true,
              duration: executionTime,
              rowCount: rowCount > 0 ? rowCount : affectedRows,
            });
          }
        }
      } catch (error: unknown) {
        // 已被新一轮执行取代：结果丢弃，共享状态归新一轮管
        if (runId !== runSeqRef.current) return;
        // 检查是否是取消操作
        if (error instanceof DOMException && error.name === 'AbortError') {
          setMessages((prev) => [...prev, '⚠ ' + t('common.queryStopped')]);
          return;
        }

        console.error('SQL execution error:', error);
        setMessages([`✗ ${t('common.error')}: ${getErrorMessage(error)}`]);
        setActiveTab('messages');
        message.error(`${t('common.sqlExecutionFailed')}: ${getErrorMessage(error)}`);
        highlightErrorRef.current(getErrorMessage(error));
      } finally {
        // 已被新一轮执行取代：共享状态归新一轮管，这里什么都不动
        if (runId === runSeqRef.current) {
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
      }
    },
    [sql, connectionId, database, executeQueryApi, pendingSql]
  );

  const stopQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      // 脚本批量执行：通知后端停止剩余语句（绑定调用本身无法中断，
      // 后端在语句间检查令牌提前返回已完成的部分）
      if (scriptTokenRef.current) {
        api.cancelScriptBatch(scriptTokenRef.current);
        scriptTokenRef.current = null;
      }
      setLoading(false);
      setMessages((prev) => [...prev, '⚠ ' + t('common.queryStopped')]);
      message.warning(t('common.queryStopped'));
      onQueryStatusChange?.(false);
    } else {
      message.info(t('common.noQueryExecuting'));
    }
  }, [onQueryStatusChange, t]);

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
          message.info(
            t('common.explainPlanGenerated') +
              ': ' +
              (t('common.noExplainPlanData') ||
                'No tabular data returned (XML plan may be in messages).')
          );
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

  // 卸载（查询 Tab 被关闭）：停掉计时器和界面等待，并取消后端还在跑的批次。
  // 绑定调用本身没法中断，不取消的话一条长查询会在标签页关掉之后继续占着连接跑到结束
  const cleanup = useCallback(() => {
    if (execTimerRef.current) {
      clearInterval(execTimerRef.current);
      execTimerRef.current = null;
    }
    runSeqRef.current += 1; // 还在跑的那一轮收尾时不再动状态
    if (scriptTokenRef.current) {
      api.cancelScriptBatch(scriptTokenRef.current);
      scriptTokenRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

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
