import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';

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
  Menu,
  Divider,
} from 'antd';
import { useTranslation } from 'react-i18next';
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
import { formatShortcutForDisplay, getEffectiveShortcut } from '../constants/menuShortcuts';
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

interface QueryResultWithTiming extends QueryResult {
  executionTime?: number;
  totalTime?: number;
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

// ========== SQL 智能补全上下文分析器 ==========

/**
 * 提取当前 SQL 语句（从上一个 ; 到光标位置）
 */
function getCurrentStatement(text: string, cursorOffset: number): string {
  const beforeCursor = text.slice(0, cursorOffset);
  const lastSemicolon = beforeCursor.lastIndexOf(';');
  return beforeCursor.slice(lastSemicolon + 1);
}

/**
 * 检查位置是否在字符串或注释中（简化版）
 */
function isInStringOrComment(text: string, offset: number): boolean {
  let inString: string | null = null;
  let inComment = false;
  let i = 0;
  while (i < offset) {
    const ch = text[i];
    const next = text[i + 1];
    if (inComment) {
      if (ch === '\n') inComment = false;
      i++;
      continue;
    }
    if (inString) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '-' && next === '-') { inComment = true; i += 2; continue; }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end !== -1 && end < offset) { i = end + 2; continue; }
      return true;
    }
    if (ch === "'" || ch === '"' || ch === '`') inString = ch;
    i++;
  }
  return inString !== null || inComment;
}

/** 语句类型 */
type SqlStmtType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'ALTER' | 'DROP' | 'UNKNOWN';

function detectStatementType(stmt: string): SqlStmtType {
  const trimmed = stmt.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('CREATE')) return 'CREATE';
  if (trimmed.startsWith('ALTER')) return 'ALTER';
  if (trimmed.startsWith('DROP')) return 'DROP';
  return 'UNKNOWN';
}

/** 当前光标所在的关键字上下文 */
interface SqlContext {
  stmtType: SqlStmtType;
  isAfterFrom: boolean;
  isAfterJoin: boolean;
  isAfterSelect: boolean;
  isAfterWhere: boolean;
  isAfterOrderBy: boolean;
  isAfterGroupBy: boolean;
  isAfterHaving: boolean;
  isAfterSet: boolean;
  isAfterInsertInto: boolean;
  isAfterValues: boolean;
  isAfterUpdateTable: boolean;
  isAfterDeleteFrom: boolean;
  isAfterCreateTable: boolean;
  isAfterAlterTable: boolean;
  isAfterDrop: boolean;
  lastKeyword: string | null;
  tableRefs: string[]; // 当前语句中引用的表名（简单提取）
}

function analyzeSqlContext(textBeforeCursor: string): SqlContext {
  const upper = textBeforeCursor.toUpperCase();
  const ctx: SqlContext = {
    stmtType: detectStatementType(textBeforeCursor),
    isAfterFrom: false,
    isAfterJoin: false,
    isAfterSelect: false,
    isAfterWhere: false,
    isAfterOrderBy: false,
    isAfterGroupBy: false,
    isAfterHaving: false,
    isAfterSet: false,
    isAfterInsertInto: false,
    isAfterValues: false,
    isAfterUpdateTable: false,
    isAfterDeleteFrom: false,
    isAfterCreateTable: false,
    isAfterAlterTable: false,
    isAfterDrop: false,
    lastKeyword: null,
    tableRefs: [],
  };

  // 提取最后的关键字位置（使用反向搜索，避免子查询干扰）
  const keywords = [
    'FROM', 'JOIN', 'SELECT', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING',
    'SET', 'INSERT INTO', 'VALUES', 'UPDATE', 'DELETE FROM',
    'CREATE TABLE', 'ALTER TABLE', 'DROP',
  ];

  let lastPos = -1;
  for (const kw of keywords) {
    const pos = upper.lastIndexOf(kw);
    if (pos > lastPos) {
      lastPos = pos;
      ctx.lastKeyword = kw;
    }
  }

  // 简单提取表引用（FROM 和 JOIN 后的表名）
  const fromMatches = textBeforeCursor.match(/\bFROM\s+(\w+)/gi);
  if (fromMatches) {
    fromMatches.forEach(m => {
      const table = m.replace(/\bFROM\s+/i, '');
      if (!ctx.tableRefs.includes(table)) ctx.tableRefs.push(table);
    });
  }
  const joinMatches = textBeforeCursor.match(/\bJOIN\s+(\w+)/gi);
  if (joinMatches) {
    joinMatches.forEach(m => {
      const table = m.replace(/\bJOIN\s+/i, '');
      if (!ctx.tableRefs.includes(table)) ctx.tableRefs.push(table);
    });
  }

  // 判断上下文（基于最后关键字）
  switch (ctx.lastKeyword) {
    case 'FROM': ctx.isAfterFrom = true; break;
    case 'JOIN': ctx.isAfterJoin = true; break;
    case 'SELECT': ctx.isAfterSelect = true; break;
    case 'WHERE': ctx.isAfterWhere = true; break;
    case 'ORDER BY': ctx.isAfterOrderBy = true; break;
    case 'GROUP BY': ctx.isAfterGroupBy = true; break;
    case 'HAVING': ctx.isAfterHaving = true; break;
    case 'SET': ctx.isAfterSet = true; break;
    case 'INSERT INTO': ctx.isAfterInsertInto = true; break;
    case 'VALUES': ctx.isAfterValues = true; break;
    case 'UPDATE': ctx.isAfterUpdateTable = true; break;
    case 'DELETE FROM': ctx.isAfterDeleteFrom = true; break;
    case 'CREATE TABLE': ctx.isAfterCreateTable = true; break;
    case 'ALTER TABLE': ctx.isAfterAlterTable = true; break;
    case 'DROP': ctx.isAfterDrop = true; break;
  }

  return ctx;
}

/**
 * 判断是否需要列名建议
 */
function shouldSuggestColumns(ctx: SqlContext): boolean {
  return ctx.isAfterSelect || ctx.isAfterWhere || ctx.isAfterOrderBy ||
         ctx.isAfterGroupBy || ctx.isAfterHaving || ctx.isAfterSet ||
         ctx.isAfterInsertInto || ctx.isAfterUpdateTable || ctx.isAfterDeleteFrom;
}

/**
 * 判断是否需要表名建议
 */
function shouldSuggestTables(ctx: SqlContext): boolean {
  return ctx.isAfterFrom || ctx.isAfterJoin || ctx.isAfterInsertInto ||
         ctx.isAfterUpdateTable || ctx.isAfterDeleteFrom || ctx.isAfterAlterTable ||
         ctx.isAfterDrop;
}

/**
 * 获取数据库特定的数据类型建议
 */
function getDbSpecificDataTypes(dbType: string | undefined): string[] {
  if (!dbType) return ['INT', 'VARCHAR(255)', 'TEXT', 'DECIMAL(10,2)', 'DATETIME', 'BOOLEAN'];

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
      return [
        'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
        'VARCHAR(255)', 'TEXT', 'LONGTEXT',
        'DECIMAL(10,2)', 'FLOAT', 'DOUBLE',
        'DATETIME', 'TIMESTAMP', 'DATE', 'TIME',
        'BOOLEAN', 'JSON',
        'CHAR(1)', 'BINARY(16)', 'BLOB',
      ];
    case 'postgresql':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
      return [
        'INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL',
        'VARCHAR(255)', 'TEXT', 'CHAR(1)',
        'NUMERIC(10,2)', 'REAL', 'DOUBLE PRECISION',
        'TIMESTAMP', 'TIMESTAMPTZ', 'DATE', 'TIME',
        'BOOLEAN', 'JSON', 'JSONB', 'UUID',
        'BYTEA', 'ARRAY', 'INTERVAL',
      ];
    case 'sqlite':
      return [
        'INTEGER', 'REAL', 'TEXT', 'BLOB', 'NUMERIC',
        'BOOLEAN', 'DATETIME', 'DATE', 'TIME',
      ];
    case 'sqlserver':
      return [
        'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
        'VARCHAR(255)', 'NVARCHAR(255)', 'TEXT', 'NTEXT',
        'DECIMAL(10,2)', 'FLOAT', 'REAL', 'MONEY',
        'DATETIME', 'DATETIME2', 'DATE', 'TIME',
        'BIT', 'UNIQUEIDENTIFIER', 'VARBINARY(MAX)',
        'XML', 'GEOGRAPHY',
      ];
    case 'oracle':
    case 'dameng':
      return [
        'NUMBER(10,2)', 'INTEGER', 'BINARY_INTEGER',
        'VARCHAR2(255)', 'NVARCHAR2(255)', 'CLOB', 'NCLOB',
        'DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE',
        'BLOB', 'RAW(2000)', 'LONG RAW',
        'BOOLEAN', 'XMLTYPE',
      ];
    default:
      return ['INT', 'VARCHAR(255)', 'TEXT', 'DECIMAL(10,2)', 'DATETIME', 'BOOLEAN'];
  }
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
  const { t } = useTranslation();
  const { message } = App.useApp();
  const connections = useAppStore((state) => state.connections);
  const dbTypeFromStore = useMemo(() => {
    const conn = connections.find((c) => c.id === connectionId);
    return conn?.db_type;
  }, [connections, connectionId]);

  const dbType = propDbType || dbTypeFromStore;
  const [sql, setSql] = useState(defaultQuery || '');
  const [snippetManagerOpen, setSnippetManagerOpen] = useState(false);

  // 自定义右键菜单状态
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);

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
  const requestStartTimeRef = useRef(0);
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
  const dbTypeRef = useRef<DatabaseType | undefined>(dbType);
  const completionProviderRef = useRef<any>(null);

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

  // 缺失的 ref 定义（修复类型错误）
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const cleanupDisposablesRef = useRef<any[]>([]);
  const savedEditorStateRef = useRef<{ value: string; selections: any; position: any; modelUri: string } | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 占位函数（修复类型错误）
  const onSave = useCallback(() => {
    console.log('Save not implemented');
  }, []);

  const onFormat = useCallback(() => {
    console.log('Format not implemented');
  }, []);

  const onStop = useCallback(() => {
    console.log('Stop not implemented');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const setCursorPosition = useCallback((pos: any) => {
    // Placeholder
  }, []);

  const setSelectedText = useCallback((text: string) => {
    // Placeholder
  }, []);

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

  // 同步 dbType 到 ref，供 Monaco 补全使用
  useEffect(() => {
    dbTypeRef.current = dbType;
  }, [dbType]);

  const tc = useThemeColors();

  // 响应式切换 Monaco Editor 主题
  useEffect(() => {
    const monaco = monacoRef.current;
    if (monaco) {
      monaco.editor.setTheme(tc.isDark ? 'custom-dark' : 'custom-light');
    }
  }, [tc.isDark]);

  const { executeQuery: executeQueryApi, getTables, getColumns, getAllColumns } = useDatabase();

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

  // 获取 schema 数据用于补全，并预生成缓存的 suggestions - 优化版本
  const fetchSchema = useCallback(async () => {
    if (!connectionId || !database) {
      schemaRef.current = null;
      completionCacheRef.current = null;
      return;
    }

    try {
      // 检查缓存是否仍然有效
      const cacheKey = `${connectionId}.${database}`;
      if (completionCacheRef.current?.lastSchemaKey === cacheKey) {
        return; // 缓存有效，跳过重新获取
      }

      const startTime = performance.now();
      
      // 并行获取表和列信息
      const [tables, allColumnsResult] = await Promise.all([
        getTables(connectionId, database, false),
        getAllColumns(connectionId, database)
      ]);

      const tablesMap = new Map<string, string[]>();
      const viewsMap = new Map<string, string[]>();

      // 使用 requestIdleCallback 优化大数据集处理
      const processTables = () => {
        for (const table of tables) {
          const tableType = (table.table_type || '').toUpperCase().trim();
          const isView =
            tableType === 'VIEW' || tableType === 'SYSTEM VIEW' || tableType === 'MATERIALIZED VIEW';
          const targetMap = isView ? viewsMap : tablesMap;

          const columns = allColumnsResult[table.table_name];
          if (columns) {
            targetMap.set(
              table.table_name,
              columns.map((c) => c.column_name)
            );
          } else {
            targetMap.set(table.table_name, []);
          }
        }
      };

      // 大数据集分批处理
      if (tables.length > 100) {
        requestIdleCallback(processTables);
      } else {
        processTables();
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

      // 预生成常用 suggestions
      const generateCommonSuggestions = () => {
        const filteredKeywords = filterKeywordsByDbType(SQL_KEYWORDS, dbTypeRef.current);
        const filteredFunctions = filterFunctionsByDbType(SQL_FUNCTIONS, dbTypeRef.current);

        return {
          keywordSuggestions: filteredKeywords.map((kw) => ({
            label: kw.label,
            insertText: kw.insertText,
            detail: kw.detail || t('common.keyword'),
          })),
          functionSuggestions: filteredFunctions.map((fn) => ({
            label: fn.label,
            insertText: fn.insertText,
            detail: fn.detail,
          })),
          tableSuggestions: Array.from(tablesMap.keys()).map(tableName => ({
            label: tableName,
            detail: t('common.tableDetail', { count: tablesMap.get(tableName)?.length || 0 }),
          })),
          viewSuggestions: Array.from(viewsMap.keys()).map(viewName => ({
            label: viewName,
            detail: t('common.viewDetail', { count: viewsMap.get(viewName)?.length || 0 }),
          })),
          columnSuggestions: [],
          tableNameToColumns: new Map(tablesMap),
          lastSchemaKey: cacheKey,
        };
      };

      // 使用 requestIdleCallback 预生成 suggestions
      requestIdleCallback(() => {
        completionCacheRef.current = generateCommonSuggestions();
      });

      const endTime = performance.now();
      console.log(`Schema fetch completed in ${endTime - startTime}ms`);
    } catch (error) {
      console.error('Failed to fetch schema for completion:', error);
      schemaRef.current = null;
      completionCacheRef.current = null;
    }
  }, [connectionId, database, getTables, getAllColumns]);

  // 当连接或数据库变化时，重新获取 schema
  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  // 使用 useCallback 避免闭包陷阱，并预生成基础 suggestions
  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 优化配置：减少内存使用，提升性能
    editor.updateOptions({
      fontSize: 14,
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      minimap: { enabled: false }, // 禁用小地图减少内存
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: 'on',
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      selectOnLineNumbers: true,
      matchBrackets: 'near',
      autoIndent: 'keep',
      formatOnPaste: false,
      formatOnType: false,
      suggestOnTriggerCharacters: true,
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false,
      },
      parameterHints: {
        enabled: false,
      },
      wordBasedSuggestions: 'off',
      autoClosingBrackets: 'never',
      autoClosingQuotes: 'never',
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'always',
      renderWhitespace: 'selection',
      cursorBlinking: 'blink',
      mouseWheelZoom: false,
      multiCursorModifier: 'ctrlCmd',
      accessibilitySupport: 'auto',
      lineDecorationsWidth: 10,
      lineNumbersMinChars: 3,
      glyphMargin: false,
      contextmenu: false,
      acceptSuggestionOnEnter: 'on',
      // 性能优化配置
      suggestSelection: 'first',
      stickyScroll: { enabled: false },
      bracketPairColorization: { enabled: false },
      inlineSuggest: { enabled: false },
    });

    // 禁用双击选择单词
    editor.onMouseDown((e: any) => {
      if (e.event.detail === 2) {
        e.event.preventDefault();
        e.event.stopPropagation();
        if (e.target.position) {
          queueMicrotask(() => {
            editor.setPosition(e.target.position);
            editor.setSelection(
              new monaco.Selection(
                e.target.position.lineNumber,
                e.target.position.column,
                e.target.position.lineNumber,
                e.target.position.column
              )
            );
          });
        }
      }
    });

    // 自定义右键菜单
    editor.onContextMenu((e: any) => {
      e.event.preventDefault();
      e.event.stopPropagation();
      const editorDom = editor.getDomNode();
      if (!editorDom) return;
      const rect = editorDom.getBoundingClientRect();
      setContextMenuPos({
        x: e.event.posx - rect.left,
        y: e.event.posy - rect.top,
      });
      setContextMenuVisible(true);
    });

    // 点击其他地方关闭右键菜单
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    cleanupDisposablesRef.current.push({ dispose: () => document.removeEventListener('mousedown', handleClickOutside) });

    // 添加自定义主题（延迟加载以减少启动时间）
    monaco.editor.defineTheme('custom-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: '569CD6' },
          { token: 'type', foreground: '4EC9B0' },
          { token: 'string', foreground: 'CE9178' },
          { token: 'comment', foreground: '6A9955' },
          { token: 'number', foreground: 'B5CEA8' },
          { token: 'operator', foreground: 'D4D4D4' },
          { token: 'delimiter', foreground: 'D4D4D4' },
          { token: 'variable', foreground: '9CDCFE' },
          { token: 'function', foreground: 'DCDCAA' },
          { token: 'predefined', foreground: '4EC9B0' },
        ],
        colors: {
          'editor.background': '#1E1E1E',
          'editor.foreground': '#D4D4D4',
          'editorCursor.foreground': '#FFFFFF',
          'editor.lineHighlightBackground': '#2D2D30',
          'editor.selectionBackground': '#264F78',
          'editor.inactiveSelectionBackground': '#3A3D41',
          'editorLineNumber.foreground': '#858585',
          'editorLineNumber.activeForeground': '#FFFFFF',
          'editor.findMatchBackground': '#264F78',
          'editor.findMatchHighlightBackground': '#75BEFF',
          'editorHoverWidget.background': '#252526',
          'editorHoverWidget.border': '#404040',
          'editorSuggestWidget.background': '#252526',
          'editorSuggestWidget.border': '#404040',
          'editorSuggestWidget.selectedBackground': '#094771',
          'editorSuggestWidget.foreground': '#D4D4D4',
          'editorSuggestWidget.selectedForeground': '#FFFFFF',
          'editorWidget.background': '#252526',
          'editorWidget.border': '#404040',
          'editorWidget.resizeBorder': '#404040',
          'editorWidget.shadow': '#000000',
          'editorGroupHeader.tabsBackground': '#252526',
          'editorGroupHeader.noTabsBackground': '#1E1E1E',
          'editorGroup.border': '#404040',
          'editorGroup.dropBackground': '#094771',
          'editorGroupHeader.tabsBorder': '#404040',
          'editorGroupHeader.noTabsBorder': '#404040',
          'editorMarkerNavigation.background': '#2D2D30',
          'editorMarkerNavigation.border': '#404040',
          'editorOverviewRuler.background': '#1E1E1E',
          'editorOverviewRuler.border': '#404040',
          'editorIndentGuide.background': '#404040',
          'editorIndentGuide.activeBackground': '#707070',
          'editorWhitespace.foreground': '#404040',
        },
      });

    // 注册亮色主题
    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '0000FF' },
        { token: 'type', foreground: '267F99' },
        { token: 'string', foreground: 'A31515' },
        { token: 'comment', foreground: '008000' },
        { token: 'number', foreground: '098658' },
        { token: 'operator', foreground: '000000' },
        { token: 'delimiter', foreground: '000000' },
        { token: 'variable', foreground: '001080' },
        { token: 'function', foreground: '795E26' },
        { token: 'predefined', foreground: '267F99' },
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#000000',
        'editorCursor.foreground': '#000000',
        'editor.lineHighlightBackground': '#F3F3F3',
        'editor.selectionBackground': '#ADD6FF',
        'editor.inactiveSelectionBackground': '#E5EBF1',
        'editorLineNumber.foreground': '#237893',
        'editorLineNumber.activeForeground': '#0B216F',
        'editor.findMatchBackground': '#A8AC94',
        'editor.findMatchHighlightBackground': '#E2E6D4',
        'editorHoverWidget.background': '#F8F8F8',
        'editorHoverWidget.border': '#C8C8C8',
        'editorSuggestWidget.background': '#F8F8F8',
        'editorSuggestWidget.border': '#C8C8C8',
        'editorSuggestWidget.selectedBackground': '#D6D6D6',
        'editorSuggestWidget.foreground': '#000000',
        'editorSuggestWidget.selectedForeground': '#000000',
        'editorWidget.background': '#F8F8F8',
        'editorWidget.border': '#C8C8C8',
        'editorWidget.resizeBorder': '#C8C8C8',
        'editorWidget.shadow': '#A8A8A8',
        'editorGroupHeader.tabsBackground': '#F3F3F3',
        'editorGroupHeader.noTabsBackground': '#FFFFFF',
        'editorGroup.border': '#C8C8C8',
        'editorGroup.dropBackground': '#E8E8E8',
        'editorGroupHeader.tabsBorder': '#C8C8C8',
        'editorGroupHeader.noTabsBorder': '#C8C8C8',
        'editorMarkerNavigation.background': '#F3F3F3',
        'editorMarkerNavigation.border': '#C8C8C8',
        'editorOverviewRuler.background': '#FFFFFF',
        'editorOverviewRuler.border': '#C8C8C8',
        'editorIndentGuide.background': '#D3D3D3',
        'editorIndentGuide.activeBackground': '#939393',
        'editorWhitespace.foreground': '#D3D3D3',
      },
    });

    // 应用主题
    monaco.editor.setTheme(tc.isDark ? 'custom-dark' : 'custom-light');

    // 注销旧的补全提供者（如果存在）
    if (completionProviderRef.current) {
      completionProviderRef.current.dispose();
      completionProviderRef.current = null;
    }

    // 初始化补全提供者（智能上下文版本）
    completionProviderRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' ', '(', '[', '{', ',', '\n'],
      provideCompletionItems: (model: any, position: any) => {
        // 获取光标前当前行的文本
        const textBeforeCursor = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        // 如果当前行以分号结尾（允许尾部空格），表示 SQL 语句已结束，不提供建议
        if (/;\s*$/.test(textBeforeCursor)) {
          return { suggestions: [] };
        }

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        // 获取当前语句的完整文本（从上一个 ; 到光标）
        const fullText = model.getValue();
        const cursorOffset = model.getOffsetAt(position);
        const currentStatement = getCurrentStatement(fullText, cursorOffset);

        // 检查是否在字符串或注释中
        if (isInStringOrComment(fullText, cursorOffset)) {
          return { suggestions: [] };
        }

        // 使用新的上下文分析器
        const ctx = analyzeSqlContext(currentStatement);
        const currentDbType = dbTypeRef.current;

        // 根据最新的 dbType 过滤关键字和函数
        const filteredKeywords = filterKeywordsByDbType(SQL_KEYWORDS, currentDbType);
        const filteredFunctions = filterFunctionsByDbType(SQL_FUNCTIONS, currentDbType);

        const suggestions: any[] = [];

        const cache = completionCacheRef.current;
        const schema = schemaRef.current;

        // 根据上下文决定建议内容
        const needColumns = shouldSuggestColumns(ctx);
        const needTables = shouldSuggestTables(ctx);

        if (schema && cache) {
          // 1. 需要表名建议（FROM/JOIN/UPDATE/INSERT INTO/ALTER TABLE/DROP）
          if (needTables) {
            for (const [tableName, columns] of schema.tables) {
              suggestions.push({
                label: tableName,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: tableName,
                range,
                detail: t('common.tableDetail', { count: columns.length }),
                sortText: '0',
              });
            }
            for (const [viewName, columns] of schema.views) {
              suggestions.push({
                label: viewName,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: viewName,
                range,
                detail: t('common.viewDetail', { count: columns.length }),
                sortText: '0',
              });
            }
          }

          // 2. 需要列名建议
          if (needColumns) {
            const addedColumns = new Set<string>();

            // 2a. INSERT INTO 特定表 -> 只提供该表列名
            if (ctx.isAfterInsertInto && ctx.stmtType === 'INSERT') {
              const match = currentStatement.match(/INSERT\s+INTO\s+["\`\[]?(\w+)["\`\]]?/i);
              if (match && match[1]) {
                const tableName = match[1];
                const columns = schema.tables.get(tableName);
                if (columns) {
                  for (const column of columns) {
                    suggestions.push({
                      label: column,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: column,
                      range,
                      detail: t('common.tableColumns', { table: tableName }),
                      sortText: '0',
                    });
                  }
                }
              }
            }
            // 2b. UPDATE table SET -> 只提供 UPDATE 表的列名
            else if (ctx.isAfterSet && ctx.stmtType === 'UPDATE') {
              const match = currentStatement.match(/UPDATE\s+["\`\[]?(\w+)["\`\]]?/i);
              if (match && match[1]) {
                const tableName = match[1];
                const columns = schema.tables.get(tableName);
                if (columns) {
                  for (const column of columns) {
                    suggestions.push({
                      label: column,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: column,
                      range,
                      detail: t('common.tableColumns', { table: tableName }),
                      sortText: '0',
                    });
                  }
                }
              }
            }
            // 2c. 其他情况（SELECT/WHERE/ORDER BY/GROUP BY/HAVING）-> 提供已引用表的列名优先
            else {
              // 如果有已引用的表，优先提供这些表的列名
              const targetTables = ctx.tableRefs.length > 0 ? ctx.tableRefs : Array.from(schema.tables.keys());

              for (const tableName of targetTables) {
                const columns = schema.tables.get(tableName);
                if (columns) {
                  for (const column of columns) {
                    if (!addedColumns.has(column)) {
                      suggestions.push({
                        label: column,
                        kind: monaco.languages.CompletionItemKind.Field,
                        insertText: column,
                        range,
                        detail: t('common.tableColumns', { table: tableName }),
                        sortText: '0',
                      });
                      addedColumns.add(column);
                    }
                  }
                }
              }

              // 添加表名.列名格式（帮助多表查询时区分）
              for (const [tableName, columns] of schema.tables) {
                for (const column of columns) {
                  suggestions.push({
                    label: `${tableName}.${column}`,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: `${tableName}.${column}`,
                    range,
                    detail: t('common.tableColumns', { table: tableName }),
                    sortText: '1',
                  });
                }
              }

              // 跨数据库引用
              if (schema.databases && schema.databases.size > 0) {
                for (const db of schema.databases) {
                  for (const [tableName, columns] of schema.tables) {
                    for (const column of columns) {
                      suggestions.push({
                        label: `${db}.${tableName}.${column}`,
                        kind: monaco.languages.CompletionItemKind.Field,
                        insertText: `${db}.${tableName}.${column}`,
                        range,
                        detail: t('common.tableColumns', { table: `${db}.${tableName}` }),
                        sortText: '1',
                      });
                    }
                  }
                }
              }
            }
          }
        }

        // 3. 添加关键字和函数建议（根据上下文选择性添加）
        // 如果光标后有内容，优先添加关键字和函数
        const shouldAddKeywords = !needTables || suggestions.length === 0;
        if (shouldAddKeywords) {
          // 关键字排序：与当前上下文相关的优先
          const keywordSortMap: Record<string, number> = {
            'SELECT': ctx.stmtType === 'UNKNOWN' ? 0 : 10,
            'INSERT INTO': ctx.stmtType === 'UNKNOWN' ? 0 : 10,
            'UPDATE': ctx.stmtType === 'UNKNOWN' ? 0 : 10,
            'DELETE FROM': ctx.stmtType === 'UNKNOWN' ? 0 : 10,
            'FROM': ctx.isAfterSelect ? 0 : 10,
            'WHERE': ['SELECT', 'UPDATE', 'DELETE'].includes(ctx.stmtType) ? 1 : 10,
            'JOIN': ctx.isAfterFrom ? 1 : 10,
            'LEFT JOIN': ctx.isAfterFrom ? 1 : 10,
            'INNER JOIN': ctx.isAfterFrom ? 1 : 10,
            'GROUP BY': ctx.isAfterWhere || ctx.isAfterFrom ? 2 : 10,
            'ORDER BY': ctx.isAfterWhere || ctx.isAfterFrom ? 2 : 10,
            'HAVING': ctx.isAfterGroupBy ? 1 : 10,
            'LIMIT': ctx.isAfterWhere || ctx.isAfterOrderBy ? 2 : 10,
            'VALUES': ctx.isAfterInsertInto ? 0 : 10,
            'SET': ctx.stmtType === 'UPDATE' ? 0 : 10,
          };

          for (const kw of filteredKeywords) {
            const sortPriority = keywordSortMap[kw.label] ?? 5;
            suggestions.push({
              label: kw.label,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: kw.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: kw.detail || t('common.keyword'),
              sortText: String(sortPriority),
            });
          }

          // 函数建议
          for (const fn of filteredFunctions) {
            suggestions.push({
              label: fn.label,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: fn.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: fn.detail,
              sortText: '3',
            });
          }
        }

        // 4. CREATE TABLE / ALTER TABLE 上下文 -> 提供数据类型建议
        if ((ctx.isAfterCreateTable || ctx.isAfterAlterTable) && currentDbType) {
          const dataTypes = getDbSpecificDataTypes(currentDbType);
          for (const dt of dataTypes) {
            suggestions.push({
              label: dt,
              kind: monaco.languages.CompletionItemKind.TypeParameter,
              insertText: dt,
              range,
              detail: t('common.dataType'),
              sortText: '0',
            });
          }
        }

        return { suggestions };
      },
    });

    // 添加快捷键（批量注册以减少开销）
    const shortcuts = [
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, action: () => onSave?.() },
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, action: () => editor.getAction('actions.find')?.run() },
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, action: () => editor.getAction('editor.action.startFindActionReplace')?.run() },
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, action: () => editor.getAction('editor.action.duplicateSelection')?.run() },
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK, action: () => onFormat?.() },
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, action: () => handleExecuteQueryRef.current() },
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, action: () => {
        const position = editor.getPosition();
        if (position) {
          const lineText = editor.getModel()?.getLineContent(position.lineNumber);
          if (lineText?.trim()) {
            handleExecuteQueryRef.current();
          }
        }
      }},
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, action: () => onStop?.() },
    ];

    shortcuts.forEach(({ key, action }) => {
      editor.addCommand(key, action);
    });

    // 监听编辑器内容变化（使用防抖以减少频繁更新）
    let contentChangeTimeout: NodeJS.Timeout;
    const disposable = editor.onDidChangeModelContent(() => {
      clearTimeout(contentChangeTimeout);
      contentChangeTimeout = setTimeout(() => {
        const value = editor.getValue();
        setSql(value);
      }, 100); // 100ms 防抖
    });

    // 监听光标位置变化（使用节流以减少频繁更新）
    let cursorChangeTimeout: NodeJS.Timeout;
    const cursorDisposable = editor.onDidChangeCursorPosition(() => {
      clearTimeout(cursorChangeTimeout);
      cursorChangeTimeout = setTimeout(() => {
        const position = editor.getPosition();
        if (position) {
          const line = editor.getModel()?.getLineContent(position.lineNumber);
          if (line) {
            const column = position.column;
            setCursorPosition?.({ line: position.lineNumber, column, text: line });
          }
        }
      }, 50); // 50ms 节流
    });

    // 监听选择变化（使用节流）
    let selectionChangeTimeout: NodeJS.Timeout;
    const selectionDisposable = editor.onDidChangeCursorSelection(() => {
      clearTimeout(selectionChangeTimeout);
      selectionChangeTimeout = setTimeout(() => {
        const selection = editor.getSelection();
        if (selection) {
          const selectedText = editor.getModel()?.getValueInRange(selection);
          setSelectedText?.(selectedText || '');
        }
      }, 50);
    });

    // 监听窗口大小变化（使用防抖）
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          editor.layout({ width: rect.width, height: rect.height });
        }
      }, 100);
    };

    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(containerRef.current!);

    // 初始布局
    handleResize();

    // 保存清理函数
    cleanupDisposablesRef.current = [disposable, cursorDisposable, selectionDisposable];
  }, [onSave, onFormat, onStop, setCursorPosition, setSelectedText]);

  const handleExecuteQuery = useCallback(async () => {
    // 收起建议列表
    editorRef.current?.getAction('editor.action.hideSuggestWidget')?.run();

    // 获取选中的 SQL，如果没有选中则使用整个 SQL
    const selectedSql = editorRef.current
      ?.getModel()
      ?.getValueInRange(editorRef.current.getSelection())
      ?.trim();

    let sqlToExecute = selectedSql || sql;

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

    // 大数据保护：已禁用
    // const sqlUpper = sqlToExecute.trim().toUpperCase();
    // const hasLimit = /\bLIMIT\b/.test(sqlUpper);
    // const hasTop = /\bTOP\s/.test(sqlUpper);
    // const hasRownum = /\bROWNUM\b/.test(sqlUpper);
    // if (
    //   (sqlUpper.startsWith('SELECT') || sqlUpper.startsWith('/*')) &&
    //   !hasLimit &&
    //   !hasTop &&
    //   !hasRownum
    // ) {
    //   const needConfirm = await new Promise<boolean>((resolve) => {
    //     Modal.confirm({
    //       title: t('common.largeQueryWarning'),
    //       content: t('common.queryWithoutLimitWarning'),
    //       okText: t('common.continueExecution'),
    //       cancelText: t('common.cancel'),
    //       transitionName: '',
    //       maskTransitionName: '',
    //       onOk: () => resolve(true),
    //       onCancel: () => resolve(false),
    //     });
    //   });
    //   if (!needConfirm) {
    //     setLoading(false);
    //     return;
    //   }
    // }

    requestStartTimeRef.current = Date.now();
    try {
      setLoading(true);
      setMessages([]);

      setResults([]);
      setExplainPlan([]);
      clearErrorMarkers();
      
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
              const queryResult = await executeQueryApi(connectionId, stmt, database);
              const executionTime = queryResult.execution_time_ms ?? 0;

              const truncated = queryResult.rows.length > maxRows;
              if (truncated) {
                hasTruncated = true;
                queryResult.rows = queryResult.rows.slice(0, maxRows);
              }

              if (queryResult.error) {
                msgs.push(t('common.statementFailed', { index: i + index + 1, error: queryResult.error }));
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
            } catch (error: any) {
              msgs.push(t('common.statementFailed', { index: i + index + 1, error: error.message || error }));
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
        // 单语句执行（原有逻辑）
        const queryResult = await executeQueryApi(connectionId, sqlToExecute, database);
        const executionTime = queryResult.execution_time_ms ?? 0;
        const totalTime = Date.now() - requestStartTimeRef.current;

        if (queryResult.error) {
          setMessages([`✗ ${t('common.error')}: ${queryResult.error}`]);
          setActiveTab('messages');
          message.error(`${t('common.sqlExecutionFailed')}: ${queryResult.error}`);
          highlightError(queryResult.error);
          setResult({ ...queryResult, executionTime, totalTime });
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

          setResult({ ...queryResult, rows: truncatedRows, executionTime, totalTime });

          clearErrorMarkers();

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

      // 保存历史记录（内存缓存，用于快速检索）
      setQueryHistory((prev) => [sqlToExecute, ...prev.slice(0, 49)]);
    } catch (error: any) {
      // 检查是否是取消操作
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('Query was aborted');
        setMessages([...messages, '⚠ ' + t('common.queryStopped')]);
        return;
      }
      
      console.error('SQL execution error:', error);
      setMessages([`✗ ${t('common.error')}: ${error.message || error}`]);
      setActiveTab('messages');
      message.error(`${t('common.sqlExecutionFailed')}: ${error.message || error}`);
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

  // 组件卸载时清理资源 - 优化版本
  useEffect(() => {
    return () => {
      // 清理 Monaco Editor 补全提供者
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
        completionProviderRef.current = null;
      }
      
      // 保存编辑器状态以便恢复
      if (editorRef.current) {
        const model = editorRef.current.getModel();
        if (model) {
          const value = model.getValue();
          const selections = editorRef.current.getSelections();
          const position = editorRef.current.getPosition();
          
          savedEditorStateRef.current = {
            value,
            selections,
            position,
            modelUri: model.uri.toString(),
          };
        }
      }
      
      // 清理编辑器实例
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
      
      // 清理所有引用和缓存
      completionCacheRef.current = null;
      schemaRef.current = null;
      dbTypeRef.current = undefined;
      
      // 取消进行中的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      // 清理定时器
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      
      // 清理事件监听器
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, []);

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

    try {
      setLoading(true);

      let trimmedSQL = sql.trim();
      if (trimmedSQL.endsWith(';')) {
        trimmedSQL = trimmedSQL.slice(0, -1).trim();
      }

      const explainSQL = `EXPLAIN ${trimmedSQL}`;
      const result = await executeQueryApi(connectionId, explainSQL, database);

      if (result.error) {
        message.error(`${t('common.failedToGenerateExplainPlan')}: ${result.error}`);
      } else {
        setExplainPlan(result.rows as unknown[]);
        setActiveTab('explain');
        message.success(t('common.explainPlanGenerated'));
      }
    } catch (error: any) {
      console.error('Explain plan error:', error);
      message.error(`${t('common.failedToGenerateExplainPlan')}: ${error.message || error}`);
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
      message.success(t('common.sqlEditor.sqlFormatted'));
    } catch (e: any) {
      message.error(`${t('common.formattingFailed')}: ${e.message || e}`);
    }
  }, [sql, dbType]);

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

  const clearEditor = useCallback(() => {
    setSql('');
    setResult(null);
    setMessages([]);
    setExplainPlan([]);
    setActiveTab('result');
    message.success(t('common.editorCleared'));
  }, []);

  const saveSQL = useCallback(() => {
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query.sql';
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('common.sqlSaved'));
  }, [sql]);

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

    const resultLabel =
      results.length > 1
        ? `${t('common.resultLabel')} (${results.length})`
        : result
          ? `${t('common.resultLabel')} (${result.rows.length} ${t('common.rowsCount')})`
          : t('common.resultLabel');

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
      data-testid="sql-editor"
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
          <Tooltip
            title={`${t('common.sqlEditor.execute')} (${formatShortcutForDisplay(getEffectiveShortcut('execute-query', useSettingsStore.getState().settings.shortcuts || {}))})`}
          >
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
              data-testid="sql-execute-btn"
            >
              {t('common.executeButton')}
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
            {t('common.stopButton')}
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
            {t('common.formatButton')}
          </Button>
          <Button
            icon={<LineChartOutlined />}
            onClick={showExplainPlan}
            disabled={!connectionId}
            style={{ borderRadius: 4 }}
            size="small"
          >
            {t('common.explainPlanButton')}
          </Button>
          <Button
            icon={<StopOutlined />}
            onClick={stopQuery}
            disabled={!loading}
            danger
            style={{ borderRadius: 4 }}
            size="small"
          >
            {t('common.stopButton')}
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
              {t('common.beginTransaction')}
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
                {t('common.commitTransaction')}
              </Button>
              <Button
                icon={<CloseCircleOutlined />}
                onClick={handleRollbackTransaction}
                danger
                style={{ borderRadius: 4 }}
                size="small"
              >
                {t('common.rollbackTransaction')}
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

          <Tooltip title={t('common.sqlEditor.commentSQL') + ' (Ctrl+/)'}>
            <Button
              icon={<FileTextOutlined />}
              onClick={() => editorRef.current?.getAction('editor.action.commentLine')?.run()}
              style={{ borderRadius: 4 }}
              size="small"
            >
              {t('common.commentButton')}
            </Button>
          </Tooltip>

          <Dropdown
            menu={{
              items: [
                { key: 'upper', label: t('common.uppercase') },
                { key: 'lower', label: t('common.lowercase') },
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
              {t('common.caseButton')}
            </Button>
          </Dropdown>

          <Dropdown
            menu={{
              items: [
                { key: 'save', label: t('common.saveSql'), icon: <SaveOutlined /> },
                { key: 'copy', label: t('common.copySqlMenu'), icon: <CopyOutlined /> },
                { key: 'clear', label: t('common.clearEditor'), icon: <ClearOutlined /> },
                { key: 'snippets', label: t('common.codeSnippets'), icon: <BookOutlined /> },
                { type: 'divider' },
                { key: 'history', label: t('common.queryHistoryTitle'), icon: <HistoryOutlined /> },
                {
                  key: 'export',
                  label: t('common.exportResults'),
                  icon: <DownloadOutlined />,
                  disabled: !result,
                },
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
              {t('common.moreButton')}
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
                placeholder={t('common.selectDatabasePlaceholder')}
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
                {t('common.notLoaded')}
              </span>
            )
          ) : (
            <span style={{ color: 'var(--color-error)', fontSize: 12 }}>
              {t('common.notSelected')}
            </span>
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
            fontSize: 14,
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
          <div
            ref={contextMenuRef}
            style={{
              position: 'absolute',
              left: contextMenuPos.x,
              top: contextMenuPos.y,
              zIndex: 1000,
              background: tc.isDark ? '#252526' : '#FFFFFF',
              border: `1px solid ${tc.isDark ? '#404040' : '#E8E8E8'}`,
              borderRadius: 4,
              boxShadow: tc.isDark
                ? '0 4px 12px rgba(0,0,0,0.5)'
                : '0 4px 12px rgba(0,0,0,0.15)',
              minWidth: 180,
              padding: '4px 0',
            }}
          >
            <Menu
              mode="vertical"
              style={{
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
              }}
              selectable={false}
              items={[
                {
                  key: 'execute',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlayCircleOutlined style={{ color: 'var(--color-primary)' }} />
                      {t('common.executeButton')}
                    </span>
                  ),
                  disabled: !connectionId || loading,
                  onClick: () => {
                    setContextMenuVisible(false);
                    handleExecuteQuery();
                  },
                },
                {
                  key: 'execute-selected',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlayCircleOutlined style={{ color: 'var(--color-primary)' }} />
                      {t('common.executeSelected')}
                    </span>
                  ),
                  disabled: !connectionId || loading,
                  onClick: () => {
                    setContextMenuVisible(false);
                    handleExecuteQuery();
                  },
                },
                {
                  key: 'format',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FormatPainterOutlined />
                      {t('common.formatButton')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    formatSQL();
                  },
                },
                {
                  key: 'explain',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <LineChartOutlined />
                      {t('common.explainPlanButton')}
                    </span>
                  ),
                  disabled: !connectionId,
                  onClick: () => {
                    setContextMenuVisible(false);
                    showExplainPlan();
                  },
                },
                {
                  key: 'divider-1',
                  type: 'divider',
                },
                {
                  key: 'cut',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12 }}>✂️</span>
                      {t('common.cut')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    editorRef.current?.getAction('editor.action.clipboardCutAction')?.run();
                  },
                },
                {
                  key: 'copy',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CopyOutlined />
                      {t('common.copy')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    editorRef.current?.getAction('editor.action.clipboardCopyAction')?.run();
                  },
                },
                {
                  key: 'paste',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12 }}>📋</span>
                      {t('common.paste')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    editorRef.current?.getAction('editor.action.clipboardPasteAction')?.run();
                  },
                },
                {
                  key: 'select-all',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12 }}>☐</span>
                      {t('common.selectAll')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    const currentEditor = editorRef.current;
                    const currentMonaco = monacoRef.current;
                    if (!currentEditor || !currentMonaco) return;
                    const model = currentEditor.getModel();
                    if (!model) return;
                    const lineCount = model.getLineCount();
                    const lastColumn = model.getLineMaxColumn(lineCount);
                    currentEditor.setSelection(
                      new currentMonaco.Selection(1, 1, lineCount, lastColumn)
                    );
                  },
                },
                {
                  key: 'divider-2',
                  type: 'divider',
                },
                {
                  key: 'comment',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileTextOutlined />
                      {t('common.commentButton')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    editorRef.current?.getAction('editor.action.commentLine')?.run();
                  },
                },
                {
                  key: 'uppercase',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FormatPainterOutlined />
                      {t('common.uppercase')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    const currentEditor = editorRef.current;
                    if (!currentEditor) return;
                    const model = currentEditor.getModel();
                    const selection = currentEditor.getSelection();
                    if (!model || !selection) return;
                    const selectedText = model.getValueInRange(selection);
                    if (!selectedText) return;
                    currentEditor.executeEdits('case-transform', [
                      { range: selection, text: selectedText.toUpperCase(), forceMoveMarkers: true },
                    ]);
                  },
                },
                {
                  key: 'lowercase',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FormatPainterOutlined />
                      {t('common.lowercase')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    const currentEditor = editorRef.current;
                    if (!currentEditor) return;
                    const model = currentEditor.getModel();
                    const selection = currentEditor.getSelection();
                    if (!model || !selection) return;
                    const selectedText = model.getValueInRange(selection);
                    if (!selectedText) return;
                    currentEditor.executeEdits('case-transform', [
                      { range: selection, text: selectedText.toLowerCase(), forceMoveMarkers: true },
                    ]);
                  },
                },
                {
                  key: 'divider-3',
                  type: 'divider',
                },
                {
                  key: 'clear',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ClearOutlined />
                      {t('common.clearEditor')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    clearEditor();
                  },
                },
                {
                  key: 'save',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SaveOutlined />
                      {t('common.saveSql')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    saveSQL();
                  },
                },
                {
                  key: 'copy-sql',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CopyOutlined />
                      {t('common.copySqlMenu')}
                    </span>
                  ),
                  onClick: () => {
                    setContextMenuVisible(false);
                    copySQL();
                  },
                },
              ]}
            />
          </div>
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