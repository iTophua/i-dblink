import { useState, useRef, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Button, Space, message, Tabs, theme, Tag, Tooltip, Dropdown, Empty, Spin } from 'antd';
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
  WarningOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  FullscreenOutlined,
  BugOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useDatabase } from '../hooks/useApi';
import type { QueryResult } from '../types/api';

interface SQLEditorProps {
  connectionId?: string | null;
  defaultQuery?: string;
}

export function SQLEditor({ connectionId, defaultQuery }: SQLEditorProps) {
  const [sql, setSql] = useState(defaultQuery || '-- 输入 SQL 语句\nSELECT * FROM users LIMIT 100;');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [activeTab, setActiveTab] = useState<'result' | 'messages' | 'explain'>('result');
  const [messages, setMessages] = useState<string[]>([]);
  const [explainPlan, setExplainPlan] = useState<any[]>([]);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const editorRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';
  
  const { executeQuery: executeQueryApi } = useDatabase();

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        return {
          suggestions: [
            { label: 'SELECT', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'SELECT ${1:*} FROM ${2:table}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'INSERT INTO', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'UPDATE', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'DELETE FROM', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'DELETE FROM ${1:table} WHERE ${2:condition}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'WHERE', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'WHERE', range },
            { label: 'ORDER BY', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'ORDER BY ${1:column}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'GROUP BY', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'GROUP BY ${1:column}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'LIMIT', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'LIMIT ${1:100}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'JOIN', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'JOIN ${1:table} ON ${2:condition}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'LEFT JOIN', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'LEFT JOIN ${1:table} ON ${2:condition}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'COUNT(*)', kind: monaco.languages.CompletionItemKind.Function, insertText: 'COUNT(*)', range },
            { label: 'SUM()', kind: monaco.languages.CompletionItemKind.Function, insertText: 'SUM(${1:column})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'AVG()', kind: monaco.languages.CompletionItemKind.Function, insertText: 'AVG(${1:column})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'MAX()', kind: monaco.languages.CompletionItemKind.Function, insertText: 'MAX(${1:column})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
            { label: 'MIN()', kind: monaco.languages.CompletionItemKind.Function, insertText: 'MIN(${1:column})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
          ]
        };
      }
    });

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        handleExecuteQuery();
      }
    );
  };

  const handleExecuteQuery = useCallback(async () => {
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
      setMessages([]);
      abortControllerRef.current = new AbortController();
      
      const startTime = Date.now();
      
      const queryResult = await executeQueryApi(connectionId, sql);
      const executionTime = Date.now() - startTime;
      
      if (queryResult.error) {
        setMessages([`✗ 错误：${queryResult.error}`]);
        setActiveTab('messages');
        message.error(`SQL 执行失败：${queryResult.error}`);
      } else {
        setResult(queryResult);
        const rowCount = queryResult.rows.length;
        const affectedRows = queryResult.rows_affected || 0;
        
        if (rowCount > 0) {
          setMessages([`✓ 查询成功，返回 ${rowCount} 条记录，耗时 ${executionTime}ms`]);
        } else if (affectedRows > 0) {
          setMessages([`✓ 执行成功，影响 ${affectedRows} 行，耗时 ${executionTime}ms`]);
        } else {
          setMessages([`✓ 执行成功，耗时 ${executionTime}ms`]);
        }
        
        setActiveTab('result');
        setQueryHistory(prev => [sql, ...prev.slice(0, 9)]);
      }
    } catch (error: any) {
      console.error('SQL execution error:', error);
      setMessages([`✗ 错误：${error.message || error}`]);
      setActiveTab('messages');
      message.error(`SQL 执行失败：${error.message || error}`);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [sql, connectionId, executeQueryApi]);

  const stopQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      setMessages(prev => [...prev, '⚠ 查询已停止']);
      message.warning('查询已停止');
    } else {
      message.info('没有正在执行的查询');
    }
  }, []);

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
      
      const explainSQL = `EXPLAIN ${sql}`;
      const result = await executeQueryApi(connectionId, explainSQL);
      
      if (result.error) {
        message.error(`生成执行计划失败：${result.error}`);
      } else {
        setExplainPlan(result.rows as any[]);
        setActiveTab('explain');
        message.success('执行计划已生成');
      }
    } catch (error: any) {
      console.error('Explain plan error:', error);
      message.error(`生成执行计划失败：${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }, [sql, connectionId, executeQueryApi]);

  const formatSQL = useCallback(() => {
    if (!editorRef.current) return;
    
    const formatted = sql
      .replace(/\b(SELECT|FROM|WHERE|AND|OR|ORDER|BY|GROUP|LIMIT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|JOIN|ON|AS|IN|NOT|NULL|IS|LIKE|BETWEEN|EXISTS)\b/gi, match => match.toUpperCase())
      .replace(/,/g, ',\n  ')
      .replace(/\bFROM\b/i, '\nFROM')
      .replace(/\bWHERE\b/i, '\nWHERE')
      .replace(/\bORDER BY\b/i, '\nORDER BY')
      .replace(/\bGROUP BY\b/i, '\nGROUP BY')
      .replace(/\bLIMIT\b/i, '\nLIMIT');
    
    setSql(formatted);
    message.success('SQL 已格式化');
  }, [sql]);

  const clearEditor = useCallback(() => {
    setSql('');
    setResult(null);
    setMessages([]);
    setExplainPlan([]);
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
    if (!result || result.rows.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    const csv = [
      result.columns.join(','),
      ...result.rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_result.csv';
    a.click();
    URL.revokeObjectURL(url);
    message.success('结果已导出为 CSV');
  }, [result]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      minHeight: 0,
      background: isDarkMode ? '#1f1f1f' : '#fff'
    }}>
      <div style={{ 
        padding: '12px 16px', 
        borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: isDarkMode ? '#141414' : '#fafafa',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
      }}>
        <Space size="middle">
          <Button 
            type="primary" 
            icon={<PlayCircleOutlined />} 
            onClick={handleExecuteQuery}
            loading={loading}
            disabled={!connectionId}
            style={{ 
              borderRadius: 6,
              boxShadow: '0 2px 4px rgba(24, 144, 255, 0.3)',
              fontWeight: 500
            }}
          >
            执行 (Ctrl+Enter)
          </Button>
          <Button 
            icon={<StopOutlined />} 
            onClick={stopQuery}
            disabled={!loading}
            danger
            style={{ borderRadius: 6 }}
          >
            停止
          </Button>
          
          <div style={{ 
            width: 1, 
            height: 24, 
            background: isDarkMode ? '#434343' : '#d9d9d9',
            margin: '0 8px'
          }} />
          
          <Button 
            icon={<FormatPainterOutlined />} 
            onClick={formatSQL}
            style={{ borderRadius: 6 }}
          >
            格式化
          </Button>
          <Button 
            icon={<LineChartOutlined />} 
            onClick={showExplainPlan}
            disabled={!connectionId}
            style={{ borderRadius: 6 }}
          >
            执行计划
          </Button>
          
          <Dropdown
            menu={{
              items: [
                { key: 'save', label: '保存 SQL', icon: <SaveOutlined /> },
                { key: 'copy', label: '复制 SQL', icon: <CopyOutlined /> },
                { key: 'clear', label: '清空编辑器', icon: <ClearOutlined /> },
                { type: 'divider' },
                { key: 'history', label: '查询历史', icon: <HistoryOutlined /> },
                { key: 'export', label: '导出结果', icon: <DownloadOutlined />, disabled: !result },
              ],
              onClick: ({ key }) => {
                if (key === 'save') saveSQL();
                else if (key === 'copy') copySQL();
                else if (key === 'clear') clearEditor();
                else if (key === 'export') exportResult();
              }
            }}
          >
            <Button icon={<FileTextOutlined />} style={{ borderRadius: 6 }}>
              更多
            </Button>
          </Dropdown>
        </Space>
        
        <Space>
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

      <div style={{ 
        flex: '2 1 0',
        minHeight: 150,
        borderBottom: `4px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        overflow: 'hidden',
        boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <Editor
          height="100%"
          language="sql"
          theme={isDarkMode ? 'vs-dark' : 'vs-light'}
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

      <div style={{ flex: '1 1 0', minHeight: 150, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'result' | 'messages' | 'explain')}
          size="small"
          style={{ 
            background: isDarkMode ? '#1f1f1f' : '#fff',
            padding: '0 16px'
          }}
          items={[
            {
              key: 'result',
              label: (
                <span>
                  <CheckCircleOutlined style={{ marginRight: 4 }} />
                  结果 {result && result.rows.length > 0 && `(${result.rows.length})`}
                </span>
              ),
              children: (
                <div style={{ 
                  height: '100%', 
                  overflow: 'auto',
                  padding: '0 16px'
                }}>
                  {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                      <Spin size="large" tip="执行中..." />
                    </div>
                  ) : !connectionId ? (
                    <Empty 
                      description="请先选择一个数据库连接" 
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                  ) : !result ? (
                    <Empty 
                      description="暂无查询结果" 
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                  ) : result.error ? (
                    <Empty 
                      description={`错误：${result.error}`}
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                  ) : result.rows.length === 0 ? (
                    <Empty 
                      description="查询成功，但没有返回数据" 
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                  ) : (
                    <table style={{ 
                      width: '100%', 
                      borderCollapse: 'collapse',
                      fontSize: 13,
                    }}>
                      <thead>
                        <tr style={{ 
                          background: isDarkMode ? '#141414' : '#fafafa',
                          position: 'sticky',
                          top: 0,
                          zIndex: 1,
                        }}>
                          {result.columns.map((col, i) => (
                            <th 
                              key={i}
                              style={{ 
                                padding: '8px 12px', 
                                textAlign: 'left',
                                borderBottom: `2px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
                                fontWeight: 600,
                                color: isDarkMode ? '#f6f6f6' : '#0f0f0f',
                              }}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, i) => (
                          <tr 
                            key={i}
                            style={{ 
                              background: i % 2 === 0 
                                ? (isDarkMode ? '#1f1f1f' : '#fff')
                                : (isDarkMode ? '#141414' : '#fafafa'),
                            }}
                          >
                            {row.map((cell, j) => (
                              <td 
                                key={j}
                                style={{ 
                                  padding: '6px 12px',
                                  borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
                                  color: isDarkMode ? '#bfbfbf' : '#595959',
                                }}
                              >
                                {cell === null ? (
                                  <span style={{ color: isDarkMode ? '#595959' : '#bfbfbf', fontStyle: 'italic' }}>NULL</span>
                                ) : (
                                  String(cell)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ),
            },
            {
              key: 'messages',
              label: (
                <span>
                  <InfoCircleOutlined style={{ marginRight: 4 }} />
                  消息 {messages.length > 0 && `(${messages.length})`}
                </span>
              ),
              children: (
                <div style={{ 
                  height: '100%', 
                  overflow: 'auto',
                  padding: '8px 16px',
                  fontSize: 13,
                  fontFamily: 'monospace',
                }}>
                  {messages.length === 0 ? (
                    <Empty 
                      description="暂无消息" 
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                  ) : (
                    messages.map((msg, i) => (
                      <div 
                        key={i}
                        style={{ 
                          padding: '4px 0',
                          color: msg.startsWith('✗') 
                            ? '#ff4d4f' 
                            : msg.startsWith('⚠') 
                              ? '#faad14' 
                              : '#52c41a'
                        }}
                      >
                        {msg}
                      </div>
                    ))
                  )}
                </div>
              ),
            },
            {
              key: 'explain',
              label: (
                <span>
                  <LineChartOutlined style={{ marginRight: 4 }} />
                  执行计划
                </span>
              ),
              children: (
                <div style={{ 
                  height: '100%', 
                  overflow: 'auto',
                  padding: '0 16px'
                }}>
                  {explainPlan.length === 0 ? (
                    <Empty 
                      description="暂无执行计划" 
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                  ) : (
                    <table style={{ 
                      width: '100%', 
                      borderCollapse: 'collapse',
                      fontSize: 13,
                    }}>
                      <thead>
                        <tr style={{ 
                          background: isDarkMode ? '#141414' : '#fafafa',
                          position: 'sticky',
                          top: 0,
                        }}>
                          {Object.keys(explainPlan[0] || {}).map((key, i) => (
                            <th 
                              key={i}
                              style={{ 
                                padding: '8px 12px', 
                                textAlign: 'left',
                                borderBottom: `2px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
                                fontWeight: 600,
                              }}
                            >
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {explainPlan.map((row, i) => (
                          <tr 
                            key={i}
                            style={{ 
                              background: i % 2 === 0 
                                ? (isDarkMode ? '#1f1f1f' : '#fff')
                                : (isDarkMode ? '#141414' : '#fafafa'),
                            }}
                          >
                            {Object.values(row).map((cell: any, j) => (
                              <td 
                                key={j}
                                style={{ 
                                  padding: '6px 12px',
                                  borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
                                }}
                              >
                                {String(cell || 'NULL')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
