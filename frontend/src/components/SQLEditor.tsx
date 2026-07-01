import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Editor from '@monaco-editor/react';

import {
  App,
  Tabs,
  TabsProps,
  Tag,
  Dropdown,
  Empty,
  Spin,
  Drawer,
  Space,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import { useAppStore } from '../stores/appStore';
import { format as formatSql } from 'sql-formatter';
import { HistoryPanel } from './SQLEditor/HistoryPanel';
import { ResultGrid, ExplainPlanGrid } from './SQLEditor/ResultGrid';
import { SnippetManager } from './SnippetManager';
import { ParamDialog } from './ParamDialog';
import { replaceParams } from '../utils/sqlParams';
import type { DatabaseType } from '../types/api';
import { SqlDialectBanner } from './SqlDialectBanner';

// Extracted hooks
import { useQueryExecution } from './SQLEditor/hooks/useQueryExecution';
import { useMonacoEditor } from './SQLEditor/hooks/useMonacoEditor';
import { useEditorResizer } from './SQLEditor/hooks/useEditorResizer';
import { useTransaction } from './SQLEditor/hooks/useTransaction';
import { useSqlDialectDetection } from './SQLEditor/hooks/useSqlDialectDetection';

// Extracted components
import { SQLEditorToolbar } from './SQLEditor/components/SQLEditorToolbar';
import { SQLEditorContextMenu } from './SQLEditor/components/SQLEditorContextMenu';

interface QueryResultWithTiming {
  executionTime?: number;
  totalTime?: number;
  executedSql?: string;
  columns: string[];
  rows: any[][];
  rows_affected?: number;
  error?: string;
  execution_time_ms?: number;
}

interface SQLEditorProps {
  connectionId?: string | null;
  database?: string;
  defaultQuery?: string;
  availableDatabases?: string[];
  onDatabaseChange?: (database: string) => void;
  dbType?: DatabaseType;
  onQueryStatusChange?: (isQuerying: boolean) => void;
}

export function SQLEditor({
  connectionId,
  database,
  defaultQuery,
  availableDatabases,
  onDatabaseChange,
  dbType: propDbType,
  onQueryStatusChange,
}: SQLEditorProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const tc = useThemeColors();
  const connections = useAppStore((state) => state.connections);
  const dbTypeFromStore = useMemo(() => {
    const conn = connections.find((c) => c.id === connectionId);
    return conn?.db_type;
  }, [connections, connectionId]);

  const dbType = propDbType || dbTypeFromStore;
  const [sql, setSql] = useState(defaultQuery || '');
  const [snippetManagerOpen, setSnippetManagerOpen] = useState(false);
  const [historyPanelVisible, setHistoryPanelVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 自定义右键菜单状态
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuMeasuredRef = useRef(false);
  const contextMenuSelectedSqlRef = useRef<string>('');

  // Ref to link handleExecuteQuery to Monaco shortcuts (avoids closure trap)
  const handleExecuteQueryRef = useRef<(explicitSql?: string) => void>(() => {});
  // Ref to link formatSQL to Monaco shortcuts
  const formatSQLRef = useRef<() => void>(() => {});

  // 当 defaultQuery prop 变化时更新 SQL 内容（用于从外部打开带预设 SQL 的 Tab）
  // 使用 ref 避免初始渲染时的同步 setState
  const defaultQueryRef = useRef(defaultQuery);
  useEffect(() => {
    if (defaultQuery && defaultQuery !== defaultQueryRef.current) {
      defaultQueryRef.current = defaultQuery;
      setSql(defaultQuery);
    }
  }, [defaultQuery]);

  // --- Extracted hooks ---

  // Editor resizer
  const { editorRatio, containerRef, handleResizeStart } = useEditorResizer();

  // Monaco editor (must be initialized before useQueryExecution since it provides highlightError/clearErrorMarkers)
  const {
    editorRef,
    monacoRef,
    handleEditorMount,
    highlightError,
    clearErrorMarkers,
  } = useMonacoEditor({
    connectionId,
    database,
    dbType,
    availableDatabases,
    sql,
    setSql,
    handleExecuteQueryRef,
    formatSQLRef,
    containerRef,
    setContextMenuVisible,
    setContextMenuPos,
    contextMenuSelectedSqlRef,
    contextMenuMeasuredRef,
  });

  // Query execution
  const {
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
  } = useQueryExecution({
    connectionId,
    database,
    sql,
    dbType,
    highlightError,
    clearErrorMarkers,
    onQueryStatusChange,
    editorRef,
  });

  // Transaction
  const {
    transactionActive,
    handleBeginTransaction,
    handleCommitTransaction,
    handleRollbackTransaction,
  } = useTransaction(connectionId);

  // SQL dialect detection
  const {
    dialectMismatch,
    handleQuickConvert,
    handleDismissDialectBanner,
  } = useSqlDialectDetection(connectionId, dbType, sql, setSql);

  // 同步 handleExecuteQuery 到 ref，供 Monaco 快捷键使用
  useEffect(() => {
    handleExecuteQueryRef.current = handleExecuteQuery;
  }, [handleExecuteQuery]);

  // 是否有查询结果需要展示（决定结果面板是否显示）
  const hasResult = result !== null || results.length > 0 || loading || explainPlan.length > 0;

  // 点击其他地方关闭右键菜单
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenuVisible(false);
    }
  }, []);
  useEffect(() => {
    if (contextMenuVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenuVisible, handleClickOutside]);

  // 右键菜单渲染后，检测是否超出视口并调整位置
  useEffect(() => {
    if (contextMenuVisible && contextMenuRef.current && !contextMenuMeasuredRef.current) {
      contextMenuMeasuredRef.current = true;
      const menuEl = contextMenuRef.current;
      const menuRect = menuEl.getBoundingClientRect();
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;
      let { x, y } = contextMenuPos;
      if (x + menuRect.width > vpW) {
        x = Math.max(0, vpW - menuRect.width - 4);
      }
      if (y + menuRect.height > vpH) {
        y = Math.max(0, vpH - menuRect.height - 4);
      }
      if (x !== contextMenuPos.x || y !== contextMenuPos.y) {
        setContextMenuPos({ x, y });
      }
    }
  }, [contextMenuVisible, contextMenuPos]);

  // 监听 tab-action 事件（来自菜单或工具栏的快捷键）
  useEffect(() => {
    const handleTabAction = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.action === 'execute-query') {
        handleExecuteQueryRef.current();
      }
    };
    window.addEventListener('tab-action', handleTabAction);
    return () => {
      window.removeEventListener('tab-action', handleTabAction);
    };
  }, []);

  // Format SQL
  const formatSQL = useCallback(() => {
    if (!editorRef.current) return;
    const dialectMap: Record<string, string> = {
      mysql: 'mysql',
      mariadb: 'mariadb',
      postgresql: 'postgresql',
      sqlite: 'sqlite',
      sqlserver: 'transactsql',
      oracle: 'plsql',
      dameng: 'oracle',
    };
    try {
      const formatted = formatSql(sql, {
        language: (dialectMap[dbType || ''] || 'mysql') as any,
        keywordCase: 'upper',
        indentStyle: 'standard',
        linesBetweenQueries: 2,
      });
      setSql(formatted);
      message.success(t('common.sqlEditor.sqlFormatted'));
    } catch (e: any) {
      message.error(`${t('common.formattingFailed')}: ${e.message || e}`);
    }
  }, [sql, dbType]);

  // 同步 formatSQL 到 ref，供 Monaco 快捷键调用
  useEffect(() => {
    formatSQLRef.current = formatSQL;
  }, [formatSQL]);

  // Editor utility actions
  const clearEditor = useCallback(() => {
    setSql('');
    setResult(null);
    setMessages([]);
    setExplainPlan([]);
    setActiveTab('result');
    message.success(t('common.editorCleared'));
  }, []);

  const saveSQL = useCallback(() => {
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    const fileName = `query_${ts}.sql`;
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('common.sqlSaved'));
  }, [sql, t]);

  const copySQL = useCallback(() => {
    navigator.clipboard.writeText(sql);
    message.success(t('common.sqlCopiedToClipboard'));
  }, [sql]);

  const exportResult = useCallback(() => {
    const targetResult = result || (results.length > 0 ? results[0] : null);
    if (!targetResult || targetResult.rows.length === 0) {
      message.warning(t('common.noDataToExport'));
      return;
    }

    const escapeCsv = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [
      targetResult.columns.map(escapeCsv).join(','),
      ...targetResult.rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_result.csv';
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('common.resultsExportedAsCsv'));
  }, [result, results]);

  // 渲染单个结果集的表格（AG Grid）
  const renderResultTable = useCallback(
    (queryResult: QueryResultWithTiming) => {
      return (
        <ResultGrid
          queryResult={queryResult}
          isDark={tc.isDark}
          executionTime={queryResult.executionTime}
          connectionId={connectionId || undefined}
          database={database}
          originalSql={sql}
          dbType={dbType}
        />
      );
    },
    [tc.isDark, connectionId, database, sql, dbType]
  );

  // 渲染单结果（用于 result 标签）
  const renderSingleResult = useMemo(
    () => (
      <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {!result ? (
          !connectionId ? (
            <div
              style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Empty
                description={t('common.pleaseSelectDatabaseConnection')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ) : loading ? (
            <div
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}
            >
              <Spin size="large" tip={t('common.executingLabel')} />
            </div>
          ) : (
            <div
              style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Empty description={t('common.noQueryResults')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )
        ) : (
          <ResultGrid
            queryResult={result}
            isDark={tc.isDark}
            executionTime={result.executionTime}
            connectionId={connectionId || undefined}
            database={database}
            originalSql={sql}
            dbType={dbType}
          />
        )}
      </div>
    ),
    [loading, connectionId, database, sql, dbType, result, tc.isDark]
  );

  // 结果面板 Tab items
  const resultTabItems = useMemo<NonNullable<TabsProps['items']>>(() => {
    const items: NonNullable<TabsProps['items']> = [];

    const allResults: QueryResultWithTiming[] =
      results.length > 0 ? results : result ? [result] : [];

    const showAsMulti =
      (resultViewMode === 'all' && allResults.length >= 1) ||
      (resultViewMode === 'auto' && allResults.length > 1);

    const resultLabel =
      allResults.length > 1
        ? `${t('common.resultLabel')} (${allResults.length})`
        : allResults.length === 1
          ? `${t('common.resultLabel')} (${allResults[0].rows.length} ${t('common.rowsCount')})`
          : t('common.resultLabel');

    items.push({
      key: 'result',
      label: (
        <Space size={4}>
          <span>{resultLabel}</span>
          {allResults.length > 1 && (
            <Dropdown
              menu={{
                items: [
                  { key: 'auto', label: t('common.autoDisplay') },
                  { key: 'all', label: t('common.showAllResults') },
                  { key: 'single', label: t('common.showSingleResult') },
                ],
                selectedKeys: [resultViewMode],
                onClick: ({ key }) => setResultViewMode(key as 'auto' | 'all' | 'single'),
              }}
              trigger={['click']}
            >
              <Tag
                style={{ fontSize: 10, lineHeight: '16px', cursor: 'pointer', padding: '0 4px', margin: 0 }}
                color="processing"
              >
                {resultViewMode === 'auto' ? t('common.autoDisplay') : resultViewMode === 'all' ? t('common.showAllResults') : t('common.showSingleResult')}
              </Tag>
            </Dropdown>
          )}
        </Space>
      ),
      children: (
        <div
          style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {showAsMulti ? (
            <Tabs
              type="card"
              size="small"
              style={{ padding: '0 8px' }}
              items={allResults.map((r, i) => ({
                key: `result-${i}`,
                label: `${t('common.resultLabel')} ${i + 1} (${r.rows.length} ${t('common.rowsCount')})${r.executionTime ? ` · ${r.executionTime}ms` : ''}`,
                children: renderResultTable(r),
              }))}
            />
          ) : (
            renderSingleResult
          )}
        </div>
      ),
    });

    items.push({
      key: 'messages',
      label: `${t('common.messageLabel')} (${messages.length})`,
      children: (
        <div
          style={{
            padding: 12,
            overflow: 'auto',
            height: '100%',
            background: 'var(--background-card)',
          }}
        >
          {messages.length === 0 ? (
            <Empty description={t('common.noMessages')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  fontSize: 13,
                  marginBottom: 6,
                  fontFamily: 'monospace',
                  lineHeight: 1.6,
                  wordBreak: 'break-all',
                }}
              >
                {msg.startsWith('✗') ? (
                  <span style={{ color: 'var(--color-error)' }}>{msg}</span>
                ) : msg.startsWith('⚠') ? (
                  <span style={{ color: 'var(--color-warning)' }}>{msg}</span>
                ) : (
                  <span style={{ color: 'var(--color-success)' }}>{msg}</span>
                )}
              </div>
            ))
          )}
        </div>
      ),
    });

    if (explainPlan.length > 0) {
      items.push({
        key: 'explain',
        label: t('common.executionPlan'),
        children: (
          <div style={{ height: '100%', overflow: 'hidden' }}>
            <ExplainPlanGrid data={explainPlan} isDark={tc.isDark} />
          </div>
        ),
      });
    }

    return items;
  }, [results, result, messages, explainPlan, tc.isDark, renderResultTable, renderSingleResult, resultViewMode]);

  // 当 Tab items 变化导致当前 activeTab 失效时，自动切换到第一个可用 Tab
  useEffect(() => {
    const validKeys = resultTabItems.map((item) => item!.key);
    if (!validKeys.includes(activeTab)) {
      setActiveTab('result');
    }
  }, [resultTabItems, activeTab]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--background-card)',
        ...(isFullscreen
          ? {
              position: 'fixed' as const,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9999,
              height: '100vh',
            }
          : {}),
      }}
      data-testid="sql-editor"
    >
      {/* Toolbar */}
      <SQLEditorToolbar
        loading={loading}
        connectionId={connectionId}
        handleExecuteQuery={handleExecuteQuery}
        stopQuery={stopQuery}
        showExplainPlan={showExplainPlan}
        execElapsed={execElapsed}
        formatSQL={formatSQL}
        editorRef={editorRef}
        transactionActive={transactionActive}
        handleBeginTransaction={handleBeginTransaction}
        handleCommitTransaction={handleCommitTransaction}
        handleRollbackTransaction={handleRollbackTransaction}
        saveSQL={saveSQL}
        copySQL={copySQL}
        clearEditor={clearEditor}
        exportResult={exportResult}
        setHistoryPanelVisible={setHistoryPanelVisible}
        setSnippetManagerOpen={setSnippetManagerOpen}
        database={database}
        availableDatabases={availableDatabases}
        onDatabaseChange={onDatabaseChange}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        dbType={dbType}
      />

      {/* SQL 方言转换提示 Banner */}
      {dialectMismatch && dbType && (
        <SqlDialectBanner
          sourceDialect={dialectMismatch.dialect}
          targetDialect={dbType}
          matchedFeatures={dialectMismatch.matchedFeatures}
          onQuickConvert={handleQuickConvert}
          onDismiss={handleDismissDialectBanner}
        />
      )}

      {/* 编辑器区域 — 无结果时占满，有结果时按 editorRatio 分配 */}
      <div
        style={{
          flex: hasResult ? `0 0 calc(${editorRatio * 100}% - 2px)` : 1,
          minHeight: hasResult ? 120 : 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Editor
          height="100%"
          language="sql"
          theme={tc.isDark ? 'vs-dark' : 'vs-light'}
          value={sql}
          onChange={(value) => setSql(value || '')}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            folding: true,
            foldingStrategy: 'auto',
            showFoldingControls: 'mouseover',
            renderLineHighlight: 'all',
            selectOnLineNumbers: true,
            cursorStyle: 'line',
            cursorBlinking: 'blink',
            contextmenu: false,
            quickSuggestions: {
              other: true,
              comments: false,
              strings: false,
            },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            formatOnPaste: false,
            formatOnType: false,
            matchBrackets: 'near',
            autoIndent: 'keep',
            parameterHints: { enabled: false },
            wordBasedSuggestions: 'off',
            autoClosingBrackets: 'never',
            autoClosingQuotes: 'never',
            mouseWheelZoom: false,
          }}
        />

        {/* 自定义右键菜单 */}
        {contextMenuVisible && (
          <SQLEditorContextMenu
            contextMenuRef={contextMenuRef}
            contextMenuPos={contextMenuPos}
            selectedSql={contextMenuSelectedSqlRef.current}
            connectionId={connectionId}
            loading={loading}
            handleExecuteQuery={handleExecuteQuery}
            formatSQL={formatSQL}
            showExplainPlan={showExplainPlan}
            saveSQL={saveSQL}
            copySQL={copySQL}
            clearEditor={clearEditor}
            editorRef={editorRef}
            monacoRef={monacoRef}
            onClose={() => setContextMenuVisible(false)}
          />
        )}
      </div>

      {/* 拖拽调整条 — 仅在有结果时显示 */}
      {hasResult && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            flex: '0 0 4px',
            background: 'var(--border)',
            cursor: 'row-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'var(--color-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'var(--border)';
          }}
        >
          <div
            style={{
              width: 24,
              height: 2,
              borderRadius: 1,
              background: 'var(--text-tertiary)',
              opacity: 0.5,
            }}
          />
        </div>
      )}

      {/* 结果面板区域 — 仅在有结果时显示 */}
      {hasResult && (
        <div
          style={{
            flex: 1,
            minHeight: 120,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Tabs
            type="card"
            size="small"
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as typeof activeTab)}
            style={{ background: 'var(--background-card)', padding: '0 8px' }}
            items={resultTabItems}
          />
        </div>
      )}

      {/* 查询历史抽屉 */}
      <Drawer
        title={t('common.queryHistoryTitle')}
        placement="right"
        width={400}
        onClose={() => setHistoryPanelVisible(false)}
        open={historyPanelVisible}
        styles={{ body: { padding: 0 } }}
      >
        <HistoryPanel
          onSelect={(selectedSql) => {
            setSql(selectedSql);
            setHistoryPanelVisible(false);
          }}
          onRerun={(rerunSql) => {
            setSql(rerunSql);
            setHistoryPanelVisible(false);
            // 等待 state 更新后触发执行
            setTimeout(() => handleExecuteQueryRef.current(rerunSql), 0);
          }}
          maxHistory={50}
          storageKey={`sql-history-${connectionId || 'global'}${database ? `-${database}` : ''}`}
        />
      </Drawer>

      {/* 代码片段抽屉 */}
      <SnippetManager
        open={snippetManagerOpen}
        onClose={() => setSnippetManagerOpen(false)}
        onInsert={(sqlText) => {
          setSql((prev) => (prev ? prev + '\n' + sqlText : sqlText));
        }}
        dbType={dbType}
      />

      {/* 参数输入对话框 */}
      <ParamDialog
        open={paramDialogOpen}
        params={paramDialogParams}
        onCancel={() => {
          setParamDialogOpen(false);
          setPendingSql('');
        }}
        onExecute={(values) => {
          setParamDialogOpen(false);
          const finalSql = replaceParams(pendingSql, values);
          setPendingSql('');
          // 设置替换后的 SQL 并执行
          setSql(finalSql);
          // 延迟执行以确保状态更新
          setTimeout(() => handleExecuteQuery(), 0);
        }}
      />
    </div>
  );
}
