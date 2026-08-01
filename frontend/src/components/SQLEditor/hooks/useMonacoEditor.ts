import { useRef, useCallback, useEffect } from 'react';
import type { OnMount } from '@monaco-editor/react';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../../../hooks/useApi';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { SQL_KEYWORDS, filterKeywordsByDbType } from '../../../constants/sqlKeywords';
import { SQL_FUNCTIONS, filterFunctionsByDbType } from '../../../constants/sqlFunctions';
import { SQL_LIVE_TEMPLATES } from '../../../constants/sqlLiveTemplates';
import { useSettingsStore } from '../../../stores/settingsStore';
import type { DatabaseType } from '../../../types/api';
import {
  getCurrentStatement,
  isInStringOrComment,
  analyzeSqlContext,
  shouldSuggestColumns,
  shouldSuggestTables,
  getDbSpecificDataTypes,
} from '../utils/sqlCompletion';

export interface UseMonacoEditorParams {
  connectionId?: string | null;
  database?: string;
  dbType?: DatabaseType;
  availableDatabases?: string[];
  sql: string;
  setSql: (sql: string) => void;
  // Ref to the latest handleExecuteQuery (avoids closure trap in Monaco shortcuts)
  handleExecuteQueryRef: React.MutableRefObject<(explicitSql?: string) => void>;
  // Ref to the latest formatSQL function
  formatSQLRef: React.MutableRefObject<() => void>;
  // Container ref（曾用于 resize observer，现已改用 Monaco 内置 automaticLayout，保留接口字段向后兼容）
  containerRef?: React.RefObject<HTMLDivElement | null>;
  // Context menu state setters (managed here since used only in editor mount)
  setContextMenuVisible: (v: boolean) => void;
  setContextMenuPos: (pos: { x: number; y: number }) => void;
  contextMenuSelectedSqlRef: React.MutableRefObject<string>;
  contextMenuMeasuredRef: React.MutableRefObject<boolean>;
  // SQL 编辑器自动换行（默认关闭）
  editorWordWrap: boolean;
}

export function useMonacoEditor({
  connectionId,
  database,
  dbType,
  availableDatabases,
  sql,
  setSql,
  handleExecuteQueryRef,
  formatSQLRef,
  setContextMenuVisible,
  setContextMenuPos,
  contextMenuSelectedSqlRef,
  contextMenuMeasuredRef,
  editorWordWrap,
}: UseMonacoEditorParams) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const { getTables, getAllColumns } = useDatabase();

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const completionProviderRef = useRef<any>(null);
  const schemaRef = useRef<{
    tables: Map<string, string[]>;
    views: Map<string, string[]>;
    databases: Set<string>;
  } | null>(null);
  const completionCacheRef = useRef<{
    keywordSuggestions: any[];
    functionSuggestions: any[];
    tableSuggestions: any[];
    viewSuggestions: any[];
    columnSuggestions: any[];
    tableNameToColumns: Map<string, string[]>;
    lastSchemaKey: string;
  } | null>(null);
  const dbTypeRef = useRef<DatabaseType | undefined>(dbType);
  const cleanupDisposablesRef = useRef<any[]>([]);
  const idleCallbackIdsRef = useRef<Set<number>>(new Set());
  const editorDebounceTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const savedEditorStateRef = useRef<{ value: string; selections: any; position: any; modelUri: string } | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorMarkersRef = useRef<any[]>([]);

  // 同步 dbType 到 ref
  useEffect(() => {
    dbTypeRef.current = dbType;
  }, [dbType]);

  // 响应式切换自动换行（运行时修改设置后即时生效）
  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap: editorWordWrap ? 'on' : 'off' });
  }, [editorWordWrap]);

  // 响应式切换 Monaco Editor 主题
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

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
        'editor.background': tc.background,
        'editor.foreground': tc.textPrimary,
        'editorCursor.foreground': '#FFFFFF',
        'editor.lineHighlightBackground': tc.backgroundToolbar,
        'editor.selectionBackground': tc.backgroundActive,
        'editor.inactiveSelectionBackground': tc.backgroundHover,
        'editorLineNumber.foreground': tc.textTertiary,
        'editorLineNumber.activeForeground': tc.primary,
        'editor.findMatchBackground': tc.backgroundActive,
        'editor.findMatchHighlightBackground': tc.backgroundHover,
        'editorHoverWidget.background': tc.backgroundCard,
        'editorHoverWidget.border': tc.border,
        'editorSuggestWidget.background': tc.backgroundCard,
        'editorSuggestWidget.border': tc.border,
        'editorSuggestWidget.selectedBackground': tc.backgroundActive,
        'editorSuggestWidget.foreground': tc.textPrimary,
        'editorSuggestWidget.selectedForeground': tc.textPrimary,
        'editorWidget.background': tc.backgroundCard,
        'editorWidget.border': tc.border,
        'editorWidget.resizeBorder': tc.border,
        'editorWidget.shadow': '#000000',
        'editorGroupHeader.tabsBackground': tc.backgroundToolbar,
        'editorGroupHeader.noTabsBackground': tc.background,
        'editorGroup.border': tc.border,
        'editorGroup.dropBackground': tc.backgroundActive,
        'editorGroupHeader.tabsBorder': tc.border,
        'editorGroupHeader.noTabsBorder': tc.border,
        'editorMarkerNavigation.background': tc.backgroundToolbar,
        'editorMarkerNavigation.border': tc.border,
        'editorOverviewRuler.background': tc.background,
        'editorOverviewRuler.border': tc.border,
        'editorIndentGuide.background': tc.border,
        'editorIndentGuide.activeBackground': tc.textTertiary,
        'editorWhitespace.foreground': tc.border,
      },
    });

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
        'editor.background': tc.background,
        'editor.foreground': tc.textPrimary,
        'editorCursor.foreground': tc.textPrimary,
        'editor.lineHighlightBackground': tc.backgroundToolbar,
        'editor.selectionBackground': tc.backgroundActive,
        'editor.inactiveSelectionBackground': tc.backgroundHover,
        'editorLineNumber.foreground': tc.textTertiary,
        'editorLineNumber.activeForeground': tc.primary,
        'editor.findMatchBackground': tc.backgroundActive,
        'editor.findMatchHighlightBackground': tc.backgroundHover,
        'editorHoverWidget.background': tc.backgroundCard,
        'editorHoverWidget.border': tc.border,
        'editorSuggestWidget.background': tc.backgroundCard,
        'editorSuggestWidget.border': tc.border,
        'editorSuggestWidget.selectedBackground': tc.backgroundHover,
        'editorSuggestWidget.foreground': tc.textPrimary,
        'editorSuggestWidget.selectedForeground': tc.textPrimary,
        'editorWidget.background': tc.backgroundCard,
        'editorWidget.border': tc.border,
        'editorWidget.resizeBorder': tc.border,
        'editorWidget.shadow': '#A8A8A8',
        'editorGroupHeader.tabsBackground': tc.backgroundToolbar,
        'editorGroupHeader.noTabsBackground': tc.backgroundCard,
        'editorGroup.border': tc.border,
        'editorGroup.dropBackground': tc.backgroundHover,
        'editorGroupHeader.tabsBorder': tc.border,
        'editorGroupHeader.noTabsBorder': tc.border,
        'editorMarkerNavigation.background': tc.backgroundToolbar,
        'editorMarkerNavigation.border': tc.border,
        'editorOverviewRuler.background': tc.backgroundCard,
        'editorOverviewRuler.border': tc.border,
        'editorIndentGuide.background': tc.border,
        'editorIndentGuide.activeBackground': tc.textTertiary,
        'editorWhitespace.foreground': tc.border,
      },
    });

    monaco.editor.setTheme(tc.isDark ? 'custom-dark' : 'custom-light');
  }, [tc]);

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

          const lookupKey = table.schema ? `${table.schema}.${table.table_name}` : table.table_name;
          const columns = allColumnsResult[lookupKey];
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
        const id = requestIdleCallback(processTables);
        idleCallbackIdsRef.current.add(id);
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
      const id = requestIdleCallback(() => {
        completionCacheRef.current = generateCommonSuggestions();
      });
      idleCallbackIdsRef.current.add(id);

      const endTime = performance.now();
      console.log(`Schema fetch completed in ${endTime - startTime}ms`);
    } catch (error) {
      console.error('Failed to fetch schema for completion:', error);
      schemaRef.current = null;
      completionCacheRef.current = null;
    }
  }, [connectionId, database, getTables, getAllColumns, availableDatabases]);

  // 当连接或数据库变化时，重新获取 schema
  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  // Error marker helpers (exposed for useQueryExecution)
  const parseErrorLine = useCallback((errorMsg: string): number | null => {
    const mysqlMatch = errorMsg.match(/at line (\d+)/i);
    if (mysqlMatch) return parseInt(mysqlMatch[1], 10);
    const pgMatch = errorMsg.match(/LINE (\d+):/i);
    if (pgMatch) return parseInt(pgMatch[1], 10);
    const genericMatch = errorMsg.match(/line (\d+)/i);
    if (genericMatch) return parseInt(genericMatch[1], 10);
    return null;
  }, []);

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

  const clearErrorMarkers = useCallback(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (model) {
      monacoRef.current.editor.setModelMarkers(model, 'sql-error', []);
      errorMarkersRef.current = [];
    }
  }, []);

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
      wordWrap: editorWordWrap ? 'on' : 'off',
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
      foldingStrategy: 'auto',
      showFoldingControls: 'mouseover',
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

    // 支持双击选中单词（Monaco Editor 默认行为）

    // 自定义右键菜单
    editor.onContextMenu((e: any) => {
      e.event.preventDefault();
      e.event.stopPropagation();
      const selection = editor.getSelection();
      const selected = selection && !selection.isEmpty()
        ? (editor.getModel()?.getValueInRange(selection)?.trim() || '')
        : '';
      contextMenuSelectedSqlRef.current = selected;
      setContextMenuPos({
        x: e.event.posx,
        y: e.event.posy,
      });
      contextMenuMeasuredRef.current = false;
      setContextMenuVisible(true);
    });

    // 应用主题（defineTheme 已移至 useEffect，监听 tc 变化）
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

        // 5. Live template suggestions (SQL code snippets with tab-stop placeholders)
        const liveTemplatesEnabled = useSettingsStore.getState().settings.liveTemplatesEnabled;
        if (liveTemplatesEnabled !== false) {
          for (const template of SQL_LIVE_TEMPLATES) {
            // Skip if restricted to DB types that don't match
            if (template.dbTypes && currentDbType && !template.dbTypes.includes(currentDbType)) {
              continue;
            }
            suggestions.push({
              label: template.trigger,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: template.body,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: t(`common.liveTemplates.${template.nameKey}`),
              documentation: t(`common.liveTemplates.${template.descriptionKey}`),
              range,
              sortText: '2',
            });
          }
        }

        return { suggestions };
      },
    });

    // Placeholder callbacks
    const onSave = () => { console.log('Save not implemented'); };
    const onFormat = () => { console.log('Format not implemented'); };
    const onStop = () => { console.log('Stop not implemented'); };
    const setCursorPosition = (pos: any) => { /* Placeholder */ };
    const setSelectedText = (text: string) => { /* Placeholder */ };

    // 添加快捷键（批量注册以减少开销）
    const shortcuts = [
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, action: () => onSave?.() },
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, action: () => editor.getAction('actions.find')?.run() },
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, action: () => editor.getAction('editor.action.startFindActionReplace')?.run() },
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, action: () => editor.getAction('editor.action.duplicateSelection')?.run() },
      { key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK, action: () => formatSQLRef.current() },
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
    let contentChangeTimeout: ReturnType<typeof setTimeout> | undefined;
    const disposable = editor.onDidChangeModelContent(() => {
      if (contentChangeTimeout) clearTimeout(contentChangeTimeout);
      contentChangeTimeout = setTimeout(() => {
        const value = editor.getValue();
        setSql(value);
      }, 100); // 100ms 防抖
      editorDebounceTimersRef.current.add(contentChangeTimeout);
    });

    // 监听光标位置变化（使用节流以减少频繁更新）
    let cursorChangeTimeout: ReturnType<typeof setTimeout> | undefined;
    const cursorDisposable = editor.onDidChangeCursorPosition(() => {
      if (cursorChangeTimeout) clearTimeout(cursorChangeTimeout);
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
      editorDebounceTimersRef.current.add(cursorChangeTimeout);
    });

    // 监听选择变化（使用节流）
    let selectionChangeTimeout: ReturnType<typeof setTimeout> | undefined;
    const selectionDisposable = editor.onDidChangeCursorSelection(() => {
      if (selectionChangeTimeout) clearTimeout(selectionChangeTimeout);
      selectionChangeTimeout = setTimeout(() => {
        const selection = editor.getSelection();
        if (selection) {
          const selectedText = editor.getModel()?.getValueInRange(selection);
          setSelectedText?.(selectedText || '');
        }
      }, 50);
      editorDebounceTimersRef.current.add(selectionChangeTimeout);
    });

    // 布局：依赖 Monaco 内置 automaticLayout（测量编辑器自身 DOM，准确无延迟）。
    // 曾用自定义 ResizeObserver + 防抖 editor.layout()，但因观察的是外层容器
    // （含工具栏 ~30px），导致编辑器视口偏大、底部被 overflow:hidden 裁剪。

    // 保存清理函数
    cleanupDisposablesRef.current = [disposable, cursorDisposable, selectionDisposable];
  }, [tc, setSql, setContextMenuVisible, setContextMenuPos]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // 清理 Monaco Editor 补全提供者
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
        completionProviderRef.current = null;
      }

      // 清理编辑器注册的 disposable
      cleanupDisposablesRef.current.forEach((d) => {
        try {
          d?.dispose?.();
        } catch {
          // ignore
        }
      });
      cleanupDisposablesRef.current = [];

      // 清理所有 pending 的防抖定时器
      editorDebounceTimersRef.current.forEach((t) => clearTimeout(t));
      editorDebounceTimersRef.current.clear();

      // 清理所有 pending 的 requestIdleCallback
      idleCallbackIdsRef.current.forEach((id) => cancelIdleCallback(id));
      idleCallbackIdsRef.current.clear();

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
      
      // 清理定时器
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, []);

  return {
    editorRef,
    monacoRef,
    handleEditorMount,
    highlightError,
    clearErrorMarkers,
  };
}
