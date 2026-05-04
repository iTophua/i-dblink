import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { AgGridReact } from 'ag-grid-react';

import {
  Button,
  Space,
  App,
  Tabs,
  TabsProps,
  Tag,
  Tooltip,
  Dropdown,
  Empty,
  Spin,
  Drawer,
  Select,
  Modal,
} from 'antd';
import {
  PlayCircleOutlined,
  SaveOutlined,
  ClearOutlined,
  FormatPainterOutlined,
  StopOutlined,
  LineChartOutlined,
  CopyOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  SettingOutlined,
  FullscreenOutlined,
  BugOutlined,
  DownloadOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { useDatabase } from '../hooks/useApi';
import { useThemeColors } from '../hooks/useThemeColors';
import { getShortcutDisplayText } from '../hooks/useMenuShortcuts';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { format as formatSql } from 'sql-formatter';
import { HistoryPanel } from './SQLEditor/HistoryPanel';
import { ResultGrid, ExplainPlanGrid } from './SQLEditor/ResultGrid';
import { SnippetManager } from './SnippetManager';
import { ParamDialog } from './ParamDialog';
import { extractParams, replaceParams } from '../utils/sqlParams';
import { splitSqlStatements } from '../utils/sqlUtils';
import { SQL_KEYWORDS, filterKeywordsByDbType } from '../constants/sqlKeywords';
import { SQL_FUNCTIONS, filterFunctionsByDbType } from '../constants/sqlFunctions';
import { api } from '../api';
import type { QueryResult, DatabaseType } from '../types/api';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface QueryResultWithTiming extends QueryResult {
  executionTime?: number;
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

interface SQLEditorProps {
  connectionId?: string | null;
  database?: string;
  defaultQuery?: string;
  availableDatabases?: string[];
  onDatabaseChange?: (database: string) => void;
  dbType?: DatabaseType;
  onQueryStatusChange?: (isQuerying: boolean) => void;
}



// 预编译的正则表达式（避免每次触发重新编译）
const REGEX_PATTERNS = {
  fromOrJoin: /\b(FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s*$/i,
  select: /\bSELECT\s+.*$/i,
  where: /\bWHERE\s+.*$/i,
  afterTableRef: /\b(FROM|JOIN)\s+(?:\w+\s*,\s*)*\w+\s*$/i,
  hasTableAlias: /\b(FROM|JOIN)\s+\w+\s+(?:AS\s+)?(\w+)\s*$/i,
};

export function SQLEditor({
  connectionId,
  database,
  defaultQuery,
  availableDatabases,
  onDatabaseChange,
  dbType: propDbType,
  onQueryStatusChange,
}: SQLEditorProps) {
  const { message } = App.useApp();
  const connections = useAppStore((state) => state.connections);
  const dbType =
    propDbType ||
    useMemo(() => {
      const conn = connections.find((c) => c.id === connectionId);
      return conn?.db_type;
    }, [connections, connectionId]);
  const [sql, setSql] = useState(defaultQuery || '');
  const [snippetManagerOpen, setSnippetManagerOpen] = useState(false);

  // 当 defaultQuery prop 变化时更新 SQL 内容（用于从外部打开带预设 SQL 的 Tab）
  useEffect(() => {
    if (defaultQuery) {
      setSql(defaultQuery);
    }
  }, [defaultQuery]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResultWithTiming | null>(null);
  const [results, setResults] = useState<QueryResultWithTiming[]>([]);
  const [activeTab, setActiveTab] = useState<'result' | 'messages' | 'explain'>('result');
  const [messages, setMessages] = useState<string[]>([]);
  const [explainPlan, setExplainPlan] = useState<any[]>([]);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [historyPanelVisible, setHistoryPanelVisible] = useState(false);
  const [transactionActive, setTransactionActive] = useState(false);
  const [paramDialogOpen, setParamDialogOpen] = useState(false);
  const [paramDialogParams, setParamDialogParams] = useState<string[]>([]);
  const [pendingSql, setPendingSql] = useState<string>('');
  const editorRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const schemaRef = useRef<{
    tables: Map<string, string[]>;
    views: Map<string, string[]>;
    databases: Set<string>;
  } | null>(null);
  const monacoRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const errorMarkersRef = useRef<any[]>([]);

  // 错误行号解析
  const parseErrorLine = useCallback((errorMsg: string): number | null => {
    const mysqlMatch = errorMsg.match(/at line (\d+)/i);
    if (mysqlMatch) return parseInt(mysqlMatch[1], 10);
    const pgMatch = errorMsg.match(/LINE (\d+):/i);
    if (pgMatch) return parseInt(pgMatch[1], 10);
    const genericMatch = errorMsg.match(/line (\d+)/i);
    if (genericMatch) return parseInt(genericMatch[1], 10);
    return null;
  }, []);

  // 高亮错误行
  const highlightError = useCallback(
    (errorMsg: string) => {
      if (!editorRef.current || !monacoRef.current) return;
      const errorLine = parseErrorLine(errorMsg);
      if (errorLine === null) return;
      const model = editorRef.current.getModel();
      if (!model) return;
      const monaco = monacoRef.current;
      const markers = [
        {
          severity: monaco.MarkerSeverity.Error,
          message: errorMsg,
          startLineNumber: errorLine,
          startColumn: 1,
          endLineNumber: errorLine,
          endColumn: model.getLineMaxColumn(errorLine),
        },
      ];
      monaco.editor.setModelMarkers(model, 'sql-error', markers);
      errorMarkersRef.current = markers;
    },
    [parseErrorLine]
  );

  // 清除错误标记
  const clearErrorMarkers = useCallback(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (model) {
      monacoRef.current.editor.setModelMarkers(model, 'sql-error', []);
      errorMarkersRef.current = [];
    }
  }, []);

  // 可拖拽调整编辑器/结果面板高度
  const [editorRatio, setEditorRatio] = useState(0.6); // 默认编辑器占 60%
  const isResizingRef = useRef(false);

  // 是否有查询结果需要展示（决定结果面板是否显示）
  const hasResult = result !== null || results.length > 0 || loading || explainPlan.length > 0;

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newRatio = (e.clientY - rect.top) / rect.height;
    setEditorRatio(Math.max(0.15, Math.min(0.85, newRatio)));
  }, []);

  const handleResizeEnd = useCallback(() => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  const handleResizeStart = useCallback(() => {
    isResizingRef.current = true;
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove, handleResizeEnd]);

  // 缓存预生成的补全建议，避免每次按键都重建对象
  const completionCacheRef = useRef<{
    keywordSuggestions: any[];
    functionSuggestions: any[];
    tableSuggestions: any[];
    viewSuggestions: any[];
    columnSuggestions: any[];
    tableNameToColumns: Map<string, string[]>;
    lastSchemaKey: string;
  } | null>(null);

  // 用于在 handleEditorMount 中引用最新的 handleExecuteQuery，避免闭包陷阱
  const handleExecuteQueryRef = useRef<() => void>(() => {});

  const tc = useThemeColors();

  const { executeQuery: executeQueryApi, getTables, getColumns } = useDatabase();

  // 监听 tab-action 事件（来自菜单或工具栏的快捷键）
  useEffect(() => {
    const handleTabAction = () => {
      handleExecuteQueryRef.current();
    };
    window.addEventListener('tab-action', handleTabAction as EventListener);
    return () => {
      window.removeEventListener('tab-action', handleTabAction as EventListener);
    };
  }, []);

  // 获取 schema 数据用于补全，并预生成缓存的 suggestions
  const fetchSchema = useCallback(async () => {
    if (!connectionId || !database) {
      schemaRef.current = null;
      completionCacheRef.current = null;
      return;
    }

    try {
      const tables = await getTables(connectionId, database, false);
      const tablesMap = new Map<string, string[]>();
      const viewsMap = new Map<string, string[]>();

      for (const table of tables) {
        const tableType = (table.table_type || '').toUpperCase().trim();
        const isView =
          tableType === 'VIEW' || tableType === 'SYSTEM VIEW' || tableType === 'MATERIALIZED VIEW';
        const targetMap = isView ? viewsMap : tablesMap;

        try {
          const columns = await getColumns(connectionId, table.table_name, database);
          targetMap.set(
            table.table_name,
            columns.map((c) => c.column_name)
          );
        } catch {
          targetMap.set(table.table_name, []);
        }
      }

      schemaRef.current = {
        tables: tablesMap,
        views: viewsMap,
        databases: availableDatabases
          ? new Set(availableDatabases)
          : database
            ? new Set([database])
            : new Set(),
      };

      // 预生成所有 schema 相关的 suggestions，避免每次按键都重建
      completionCacheRef.current = {
        keywordSuggestions: [],
        functionSuggestions: [],
        tableSuggestions: [],
        viewSuggestions: [],
        columnSuggestions: [],
        tableNameToColumns: new Map(tablesMap),
        lastSchemaKey: `${connectionId}.${database}`,
      };
    } catch (error) {
      console.error('Failed to fetch schema for completion:', error);
      schemaRef.current = null;
      completionCacheRef.current = null;
    }
  }, [connectionId, database, getTables, getColumns]);

  // 当连接或数据库变化时，重新获取 schema
  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  // 使用 useCallback 避免闭包陷阱，并预生成基础 suggestions
  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 预生成基础 suggestions（SQL 关键字和函数），这些不依赖 schema
    // 根据数据库类型过滤，只显示当前数据库支持的关键字和函数
    const filteredKeywords = filterKeywordsByDbType(SQL_KEYWORDS, dbType);
    const filteredFunctions = filterFunctionsByDbType(SQL_FUNCTIONS, dbType);

    const baseKeywordSuggestions = filteredKeywords.map((kw) => ({
      label: kw.label,
      kind: monaco.languages.CompletionItemKind.Keyword,
      insertText: kw.insertText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: kw.detail || '关键字',
    }));

    const baseFunctionSuggestions = filteredFunctions.map((fn) => ({
      label: fn.label,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: fn.insertText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: fn.detail,
    }));

    monaco.languages.registerCompletionItemProvider('sql', {
      // 去掉 async，减少 Promise 开销
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        // 获取光标前当前行的文本（用于上下文分析）
        const textBeforeCursor = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        // 获取当前语句类型的上下文
        const textBeforeCurrentLine = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const suggestions: any[] = [...baseKeywordSuggestions, ...baseFunctionSuggestions];

        // 上下文分析
        const isAfterFromOrJoin = REGEX_PATTERNS.fromOrJoin.test(textBeforeCursor);
        const isAfterSelect = REGEX_PATTERNS.select.test(textBeforeCursor);
        const isAfterWhere = REGEX_PATTERNS.where.test(textBeforeCursor);
        const isAfterTableRef = REGEX_PATTERNS.afterTableRef.test(textBeforeCursor);
        const hasTableAliasMatch = textBeforeCursor.match(REGEX_PATTERNS.hasTableAlias);

        // 判断语句类型（更智能的上下文）
        const upperText = textBeforeCurrentLine.toUpperCase();
        const isInSelectContext = upperText.includes('SELECT') && !upperText.includes('FROM');
        const isInFromContext =
          upperText.includes('FROM') &&
          !upperText.includes('WHERE') &&
          !upperText.includes('ORDER') &&
          !upperText.includes('GROUP');
        const isInWhereContext =
          upperText.includes('WHERE') &&
          !upperText.includes('ORDER') &&
          !upperText.includes('GROUP') &&
          !upperText.includes('LIMIT');
        const isInOrderByContext = upperText.includes('ORDER BY');
        const isInGroupByContext = upperText.includes('GROUP BY');
        const isInSetContext = upperText.includes('SET') && upperText.includes('UPDATE');
        const isInInsertContext = upperText.includes('INSERT INTO');

        const cache = completionCacheRef.current;
        const schema = schemaRef.current;

        if (schema && cache) {
          // 智能排序：根据上下文调整 suggestion 优先级

          // 1. 在 FROM / JOIN / INTO / UPDATE 之后 -> 优先表名和视图名
          if (isAfterFromOrJoin || isInFromContext) {
            for (const [tableName, columns] of schema.tables) {
              suggestions.unshift({
                label: tableName,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: tableName,
                range,
                detail: `表 (${columns.length} 列)`,
                sortText: '0', // 优先排序
              });
            }
            for (const [viewName, columns] of schema.views) {
              suggestions.unshift({
                label: viewName,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: viewName,
                range,
                detail: `视图 (${columns.length} 列)`,
                sortText: '0',
              });
            }
          }

          // 2. 在 SELECT 后或 WHERE 后 -> 优先列名和函数
          if (
            isAfterSelect ||
            isInSelectContext ||
            isAfterWhere ||
            isInWhereContext ||
            isInOrderByContext ||
            isInGroupByContext
          ) {
            // 添加所有列名（不带表前缀，方便使用）
            const addedColumns = new Set<string>();
            for (const [tableName, columns] of schema.tables) {
              for (const column of columns) {
                if (!addedColumns.has(column)) {
                  suggestions.unshift({
                    label: column,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: column,
                    range,
                    detail: `${tableName} 表的列`,
                    sortText: '0',
                  });
                  addedColumns.add(column);
                }
              }
            }

            // 添加表名.列名的格式（当有多个表时帮助区分）
            for (const [tableName, columns] of schema.tables) {
              for (const column of columns) {
                suggestions.push({
                  label: `${tableName}.${column}`,
                  kind: monaco.languages.CompletionItemKind.Field,
                  insertText: `${tableName}.${column}`,
                  range,
                  detail: `${tableName} 表的列`,
                  sortText: '1',
                });
              }
            }

            // 添加数据库名.表名.列名的格式（支持跨数据库引用）
            if (schema.databases && schema.databases.size > 0) {
              for (const db of schema.databases) {
                for (const [tableName, columns] of schema.tables) {
                  for (const column of columns) {
                    suggestions.push({
                      label: `${db}.${tableName}.${column}`,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: `${db}.${tableName}.${column}`,
                      range,
                      detail: `${db}.${tableName} 表的列`,
                      sortText: '1',
                    });
                  }
                }
              }
            }
          }

          // 3. 在 SET 后（UPDATE 语句）-> 只提供列名
          if (isInSetContext) {
            const addedColumns = new Set<string>();
            for (const [tableName, columns] of schema.tables) {
              for (const column of columns) {
                if (!addedColumns.has(column)) {
                  suggestions.unshift({
                    label: column,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: `${column} = `,
                    range,
                    detail: `${tableName} 表的列`,
                    sortText: '0',
                  });
                  addedColumns.add(column);
                }
              }
            }
          }

          // 4. 在 INSERT INTO 后 -> 提供表名
          if (isInInsertContext && !upperText.includes('VALUES')) {
            for (const [tableName, columns] of schema.tables) {
              suggestions.unshift({
                label: tableName,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: tableName,
                range,
                detail: `表 (${columns.length} 列)`,
                sortText: '0',
              });
            }
          }

          // 5. 如果用户输入了表别名，提供别名列名补全
          if (hasTableAliasMatch) {
            const alias = hasTableAliasMatch[2];
            // 找到别名对应的表（简单匹配：别名为表名时）
            for (const [tableName, columns] of schema.tables) {
              if (
                tableName.toLowerCase().startsWith(alias.toLowerCase()) ||
                alias.toLowerCase().startsWith(tableName.toLowerCase())
              ) {
                for (const column of columns) {
                  suggestions.unshift({
                    label: `${alias}.${column}`,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: `${alias}.${column}`,
                    range,
                    detail: `${tableName} 表 (别名: ${alias})`,
                    sortText: '0',
                  });
                }
              }
            }
          }

          // 默认情况：始终提供表名和视图名（但排序靠后）
          if (!isAfterFromOrJoin && !isInFromContext && !isInInsertContext) {
            for (const [tableName, columns] of schema.tables) {
              suggestions.push({
                label: tableName,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: tableName,
                range,
                detail: `表 (${columns.length} 列)`,
                sortText: '2',
              });
            }
            for (const [viewName, columns] of schema.views) {
              suggestions.push({
                label: viewName,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: viewName,
                range,
                detail: `视图 (${columns.length} 列)`,
                sortText: '2',
              });
            }
          }

          // 添加数据库名.表名/视图名的格式（支持跨数据库引用）
          if (schema.databases && schema.databases.size > 0) {
            for (const db of schema.databases) {
              for (const [tableName] of schema.tables) {
                suggestions.push({
                  label: `${db}.${tableName}`,
                  kind: monaco.languages.CompletionItemKind.Class,
                  insertText: `${db}.${tableName}`,
                  range,
                  detail: `${db}.${tableName} 表`,
                  sortText: '2',
                });
              }
              for (const [viewName] of schema.views) {
                suggestions.push({
                  label: `${db}.${viewName}`,
                  kind: monaco.languages.CompletionItemKind.Class,
                  insertText: `${db}.${viewName}`,
                  range,
                  detail: `${db}.${viewName} 视图`,
                  sortText: '2',
                });
              }
            }
          }
        }

        return { suggestions };
      },
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleExecuteQueryRef.current();
    });
  }, []);

  const handleExecuteQuery = useCallback(async () => {
    // 获取选中的 SQL，如果没有选中则使用整个 SQL
    const selectedSql = editorRef.current
      ?.getModel()
      ?.getValueInRange(editorRef.current.getSelection())
      ?.trim();

    let sqlToExecute = selectedSql || sql;

    if (!sqlToExecute.trim()) {
      message.warning('请输入 SQL 语句');
      return;
    }

    if (!connectionId) {
      message.warning('请先选择一个数据库连接');
      return;
    }

    if (!database) {
      message.warning('请先选择一个数据库');
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

    // 大数据保护：检测无 LIMIT 的 SELECT 查询
    const sqlUpper = sqlToExecute.trim().toUpperCase();
    const hasLimit = /\bLIMIT\b/.test(sqlUpper);
    const hasTop = /\bTOP\s/.test(sqlUpper);
    const hasRownum = /\bROWNUM\b/.test(sqlUpper);
    if (
      (sqlUpper.startsWith('SELECT') || sqlUpper.startsWith('/*')) &&
      !hasLimit &&
      !hasTop &&
      !hasRownum
    ) {
      const needConfirm = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '大查询警告',
          content:
            '您执行的查询似乎没有 LIMIT 限制，这可能会返回大量数据并导致内存溢出或性能问题。\n\n是否继续执行？',
          okText: '继续执行',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!needConfirm) {
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      setMessages([]);
      setResult(null);
      setResults([]);
      setExplainPlan([]);
      clearErrorMarkers();
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

        for (let i = 0; i < statements.length; i++) {
          try {
            const stmt = statements[i];
            if (abortControllerRef.current?.signal.aborted) break;

            const startTime = Date.now();
            const queryResult = await executeQueryApi(connectionId, stmt, database);
            const executionTime = Date.now() - startTime;

            const truncated = queryResult.rows.length > maxRows;
            if (truncated) {
              hasTruncated = true;
              queryResult.rows = queryResult.rows.slice(0, maxRows);
            }

            multiResults.push({ ...queryResult, executionTime });

            if (queryResult.error) {
              msgs.push(`语句 ${i + 1} ✗：${queryResult.error}`);
              totalErrors++;
              highlightError(queryResult.error);
              window.__sqlHistoryApi?.addHistory({
                sql: stmt,
                success: false,
                duration: executionTime,
              });
            } else {
              const rowCount = queryResult.rows.length;
              const affectedRows = queryResult.rows_affected || 0;
              if (rowCount > 0) {
                let msg = `语句 ${i + 1} ✓：返回 ${rowCount} 条记录，耗时 ${executionTime}ms`;
                if (truncated) msg += `（已截断至 ${maxRows} 行）`;
                msgs.push(msg);
              } else if (affectedRows > 0) {
                msgs.push(`语句 ${i + 1} ✓：影响 ${affectedRows} 行，耗时 ${executionTime}ms`);
              } else {
                msgs.push(`语句 ${i + 1} ✓：执行成功，耗时 ${executionTime}ms`);
              }
              totalSuccess++;
              window.__sqlHistoryApi?.addHistory({
                sql: stmt,
                success: true,
                duration: executionTime,
                rowCount: rowCount > 0 ? rowCount : affectedRows,
              });
            }
          } catch (error: any) {
            msgs.push(`语句 ${i + 1} ✗：${error.message || error}`);
            totalErrors++;
            window.__sqlHistoryApi?.addHistory({
              sql: statements[i],
              success: false,
            });
          }
        }

        if (hasTruncated) {
          message.warning(`部分查询结果超过 ${maxRows} 行，已截断显示。建议添加 LIMIT 限制。`);
        }

        setResults(multiResults);
        setMessages(msgs);

        if (totalErrors === 0) {
          message.success(`全部执行成功：${totalSuccess} 条语句`);
          setActiveTab('result');
        } else {
          message.error(`部分执行失败：${totalSuccess} 成功，${totalErrors} 失败`);
          setActiveTab('messages');
        }
      } else {
        // 单语句执行（原有逻辑）
        const startTime = Date.now();
        const queryResult = await executeQueryApi(connectionId, sqlToExecute, database);
        const executionTime = Date.now() - startTime;

        if (queryResult.error) {
          setMessages([`✗ 错误：${queryResult.error}`]);
          setActiveTab('messages');
          message.error(`SQL 执行失败：${queryResult.error}`);
          highlightError(queryResult.error);
          setResult({ ...queryResult, executionTime });
          window.__sqlHistoryApi?.addHistory({
            sql: sqlToExecute,
            success: false,
            duration: executionTime,
          });
        } else {
          const maxRows = useSettingsStore.getState().settings.maxResultRows;
          const truncated = queryResult.rows.length > maxRows;
          const truncatedRows = truncated ? queryResult.rows.slice(0, maxRows) : queryResult.rows;
          const rowCount = truncatedRows.length;
          const affectedRows = queryResult.rows_affected || 0;

          setResult({ ...queryResult, rows: truncatedRows, executionTime });

          clearErrorMarkers();

          if (rowCount > 0) {
            let msg = `✓ 查询成功，返回 ${rowCount} 条记录，耗时 ${executionTime}ms`;
            if (truncated) {
              msg += `（结果集已截断，仅显示前 ${maxRows} 行）`;
              message.warning(`查询结果超过 ${maxRows} 行，已截断显示。建议添加 LIMIT 限制。`);
            }
            setMessages([msg]);
          } else if (affectedRows > 0) {
            setMessages([`✓ 执行成功，影响 ${affectedRows} 行，耗时 ${executionTime}ms`]);
          } else {
            setMessages([`✓ 执行成功，耗时 ${executionTime}ms`]);
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

      // 保存历史记录（内存缓存，用于快速检索）
      setQueryHistory((prev) => [sqlToExecute, ...prev.slice(0, 49)]);
    } catch (error: any) {
      console.error('SQL execution error:', error);
      setMessages([`✗ 错误：${error.message || error}`]);
      setActiveTab('messages');
      message.error(`SQL 执行失败：${error.message || error}`);
      highlightError(error.message || error);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
      onQueryStatusChange?.(false);
    }
  }, [sql, connectionId, database, executeQueryApi]);

  // 同步 handleExecuteQuery 到 ref，供 Monaco 快捷键使用
  useEffect(() => {
    handleExecuteQueryRef.current = handleExecuteQuery;
  }, [handleExecuteQuery]);

  const stopQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      setMessages((prev) => [...prev, '⚠ 查询已停止']);
      message.warning('查询已停止');
      onQueryStatusChange?.(false);
    } else {
      message.info('没有正在执行的查询');
    }
  }, [onQueryStatusChange]);

  const showExplainPlan = useCallback(async () => {
    if (!sql.trim()) {
      message.warning('请输入 SQL 语句');
      return;
    }

    if (!connectionId) {
      message.warning('请先选择一个数据库连接');
      return;
    }

    try {
      setLoading(true);

      let trimmedSQL = sql.trim();
      if (trimmedSQL.endsWith(';')) {
        trimmedSQL = trimmedSQL.slice(0, -1).trim();
      }

      const explainSQL = `EXPLAIN ${trimmedSQL}`;
      const result = await executeQueryApi(connectionId, explainSQL, database);

      if (result.error) {
        message.error(`生成执行计划失败：${result.error}`);
      } else {
        setExplainPlan(result.rows as unknown[]);
        setActiveTab('explain');
        message.success('执行计划已生成');
      }
    } catch (error: any) {
      console.error('Explain plan error:', error);
      message.error(`生成执行计划失败：${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }, [sql, connectionId, database, executeQueryApi]);

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
      message.success('SQL 已格式化');
    } catch (e: any) {
      message.error(`格式化失败：${e.message || e}`);
    }
  }, [sql, dbType]);

  const handleBeginTransaction = useCallback(async () => {
    if (!connectionId) {
      message.warning('请先选择一个数据库连接');
      return;
    }
    try {
      await api.beginTransaction(connectionId);
      setTransactionActive(true);
      message.success('事务已开启');
    } catch (err: any) {
      message.error(`开启事务失败：${err.message || err}`);
    }
  }, [connectionId]);

  const handleCommitTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      await api.commitTransaction(connectionId);
      setTransactionActive(false);
      message.success('事务已提交');
    } catch (err: any) {
      message.error(`提交事务失败：${err.message || err}`);
    }
  }, [connectionId]);

  const handleRollbackTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      await api.rollbackTransaction(connectionId);
      setTransactionActive(false);
      message.success('事务已回滚');
    } catch (err: any) {
      message.error(`回滚事务失败：${err.message || err}`);
    }
  }, [connectionId]);

  const clearEditor = useCallback(() => {
    setSql('');
    setResult(null);
    setMessages([]);
    setExplainPlan([]);
    setActiveTab('result');
    message.success('编辑器已清空');
  }, []);

  const saveSQL = useCallback(() => {
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query.sql';
    a.click();
    URL.revokeObjectURL(url);
    message.success('SQL 已保存');
  }, [sql]);

  const copySQL = useCallback(() => {
    navigator.clipboard.writeText(sql);
    message.success('SQL 已复制到剪贴板');
  }, [sql]);

  const exportResult = useCallback(() => {
    const targetResult = result || (results.length > 0 ? results[0] : null);
    if (!targetResult || targetResult.rows.length === 0) {
      message.warning('没有可导出的数据');
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
    message.success('结果已导出为 CSV');
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
      <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <Spin size="large" tip="执行中..." />
          </div>
        ) : !connectionId ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty description="请先选择一个数据库连接" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : !result ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty description="暂无查询结果" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
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

    const resultLabel =
      results.length > 1
        ? `结果 (${results.length})`
        : result
          ? `结果 (${result.rows.length} 行)`
          : '结果';

    items.push({
      key: 'result',
      label: resultLabel,
      children: (
        <div
          style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {results.length > 1 ? (
            <Tabs
              type="card"
              size="small"
              style={{ padding: '0 8px' }}
              items={results.map((r, i) => ({
                key: `result-${i}`,
                label: `结果 ${i + 1} (${r.rows.length} 行)${r.executionTime ? ` · ${r.executionTime}ms` : ''}`,
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
      label: `消息 (${messages.length})`,
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
            <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
        label: '执行计划',
        children: (
          <div style={{ height: '100%', overflow: 'hidden' }}>
            <ExplainPlanGrid data={explainPlan} isDark={tc.isDark} />
          </div>
        ),
      });
    }

    return items;
  }, [results, result, messages, explainPlan, tc.isDark, renderResultTable, renderSingleResult]);

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
      }}
    >
      <div
        style={{
          padding: '4px 8px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--background-toolbar)',
        }}
      >
        <Space size="small">
          <Tooltip title={`执行 (${getShortcutDisplayText('execute-query')})`}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleExecuteQuery}
              loading={loading}
              disabled={!connectionId}
              style={{
                borderRadius: 4,
                fontWeight: 500,
              }}
              size="small"
            >
              执行
            </Button>
          </Tooltip>
          <Button
            icon={<StopOutlined />}
            onClick={stopQuery}
            disabled={!loading}
            danger
            style={{ borderRadius: 4 }}
            size="small"
          >
            停止
          </Button>

          <div
            style={{
              width: 1,
              height: 16,
              background: 'var(--border)',
              margin: '0 4px',
            }}
          />

          <Button
            icon={<FormatPainterOutlined />}
            onClick={formatSQL}
            style={{ borderRadius: 4 }}
            size="small"
          >
            格式化
          </Button>
          <Button
            icon={<LineChartOutlined />}
            onClick={showExplainPlan}
            disabled={!connectionId}
            style={{ borderRadius: 4 }}
            size="small"
          >
            执行计划
          </Button>

          <div
            style={{
              width: 1,
              height: 16,
              background: 'var(--border)',
              margin: '0 4px',
            }}
          />

          {!transactionActive ? (
            <Button
              icon={<ThunderboltOutlined />}
              onClick={handleBeginTransaction}
              disabled={!connectionId}
              style={{ borderRadius: 4 }}
              size="small"
            >
              开始事务
            </Button>
          ) : (
            <>
              <Button
                icon={<CheckCircleOutlined />}
                onClick={handleCommitTransaction}
                type="primary"
                style={{ borderRadius: 4 }}
                size="small"
              >
                提交
              </Button>
              <Button
                icon={<CloseCircleOutlined />}
                onClick={handleRollbackTransaction}
                danger
                style={{ borderRadius: 4 }}
                size="small"
              >
                回滚
              </Button>
            </>
          )}

          <div
            style={{
              width: 1,
              height: 16,
              background: 'var(--border)',
              margin: '0 4px',
            }}
          />

          <Tooltip title="注释/取消注释 (Ctrl+/)">
            <Button
              icon={<FileTextOutlined />}
              onClick={() => editorRef.current?.getAction('editor.action.commentLine')?.run()}
              style={{ borderRadius: 4 }}
              size="small"
            >
              注释
            </Button>
          </Tooltip>

          <Dropdown
            menu={{
              items: [
                { key: 'upper', label: '转大写' },
                { key: 'lower', label: '转小写' },
              ],
              onClick: ({ key }) => {
                const editor = editorRef.current;
                if (!editor) return;
                const model = editor.getModel();
                const selection = editor.getSelection();
                if (!model || !selection) return;
                const selectedText = model.getValueInRange(selection);
                if (!selectedText) return;
                const replaced =
                  key === 'upper' ? selectedText.toUpperCase() : selectedText.toLowerCase();
                editor.executeEdits('case-transform', [
                  { range: selection, text: replaced, forceMoveMarkers: true },
                ]);
              },
            }}
          >
            <Button icon={<FormatPainterOutlined />} style={{ borderRadius: 4 }} size="small">
              大小写
            </Button>
          </Dropdown>

          <Dropdown
            menu={{
              items: [
                { key: 'save', label: '保存 SQL', icon: <SaveOutlined /> },
                { key: 'copy', label: '复制 SQL', icon: <CopyOutlined /> },
                { key: 'clear', label: '清空编辑器', icon: <ClearOutlined /> },
                { key: 'snippets', label: '代码片段', icon: <BookOutlined /> },
                { type: 'divider' },
                { key: 'history', label: '查询历史', icon: <HistoryOutlined /> },
                { key: 'export', label: '导出结果', icon: <DownloadOutlined />, disabled: !result },
              ],
              onClick: ({ key }) => {
                if (key === 'save') saveSQL();
                else if (key === 'copy') copySQL();
                else if (key === 'clear') clearEditor();
                else if (key === 'export') exportResult();
                else if (key === 'history') setHistoryPanelVisible(true);
                else if (key === 'snippets') setSnippetManagerOpen(true);
              },
            }}
          >
            <Button icon={<FileTextOutlined />} style={{ borderRadius: 4 }} size="small">
              更多
            </Button>
          </Dropdown>
        </Space>

        <Space>
          {/* 数据库选择 */}
          {connectionId ? (
            availableDatabases && availableDatabases.length > 0 ? (
              <Select
                value={database || undefined}
                onChange={(value) => onDatabaseChange?.(value)}
                placeholder="选择数据库"
                showSearch
                optionFilterProp="label"
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                style={{ minWidth: 140 }}
                size="small"
                options={availableDatabases.map((db) => ({ label: db, value: db }))}
              />
            ) : (
              <span
                style={{
                  color: 'var(--color-error)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <WarningOutlined />
                未加载数据库
              </span>
            )
          ) : (
            <span style={{ color: 'var(--color-error)', fontSize: 12 }}>未选择连接</span>
          )}

          {result && !result.error && (
            <Space size="middle">
              <Tag color="success" icon={<CheckCircleOutlined />}>
                {result.rows.length} 条记录
              </Tag>
              <Tag color="processing" icon={<ClockCircleOutlined />}>
                执行成功
              </Tag>
            </Space>
          )}
          <Button
            icon={<FullscreenOutlined />}
            type="text"
            onClick={() => {
              if (editorRef.current) {
                editorRef.current.getAction('editor.action.fullScreen').run();
              }
            }}
          />
        </Space>
      </div>

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
            fontSize: 13,
            lineNumbers: 'on',
            roundedSelection: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            folding: true,
            renderLineHighlight: 'all',
            selectOnLineNumbers: true,
            cursorStyle: 'line',
            cursorBlinking: 'smooth',
            contextmenu: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            formatOnPaste: true,
            formatOnType: true,
          }}
        />
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
        title="查询历史"
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

// 组件已抽取到 ./SQLEditor/ResultGrid.tsx
