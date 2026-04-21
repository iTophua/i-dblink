import { useState, useRef, useCallback, useMemo } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Button, Space, message, Tabs, theme, Tag, Tooltip, Dropdown, Empty, Spin, Table, Drawer } from 'antd';
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
  AppstoreOutlined,
  BugOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useDatabase } from '../hooks/useApi';
import { HistoryPanel } from './SQLEditor/HistoryPanel';
import type { QueryResult } from '../types/api';

interface QueryResultWithTiming extends QueryResult {
  executionTime?: number;
}

interface SQLEditorProps {
  connectionId?: string | null;
  defaultQuery?: string;
}

export function SQLEditor({ connectionId, defaultQuery }: SQLEditorProps) {
  const [sql, setSql] = useState(defaultQuery || '-- 输入 SQL 语句\nSELECT * FROM users LIMIT 100;');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [results, setResults] = useState<QueryResultWithTiming[]>([]);
  const [activeTab, setActiveTab] = useState<'result' | 'results' | 'messages' | 'explain'>('result');
  const [messages, setMessages] = useState<string[]>([]);
  const [explainPlan, setExplainPlan] = useState<any[]>([]);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [historyPanelVisible, setHistoryPanelVisible] = useState(false);
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
      setResult(null);
      setResults([]);
      abortControllerRef.current = new AbortController();

      // 检测是否多语句（按分号分割）
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      const isMultiStatement = statements.length > 1;
      
      if (isMultiStatement) {
        const multiResults: QueryResultWithTiming[] = [];
        const msgs: string[] = [];
        let totalErrors = 0;
        let totalSuccess = 0;

      for (let i = 0; i < statements.length; i++) {
        try {
          const stmt = statements[i];
          if (abortControllerRef.current?.signal.aborted) break;

          const startTime = Date.now();
          const queryResult = await executeQueryApi(connectionId, stmt);
          const executionTime = Date.now() - startTime;

          multiResults.push({ ...queryResult, executionTime });

          if (queryResult.error) {
            msgs.push(`语句 ${i + 1} ✗：${queryResult.error}`);
            totalErrors++;
          } else {
            const rowCount = queryResult.rows.length;
            const affectedRows = queryResult.rows_affected || 0;
            if (rowCount > 0) {
              msgs.push(`语句 ${i + 1} ✓：返回 ${rowCount} 条记录，耗时 ${executionTime}ms`);
            } else if (affectedRows > 0) {
              msgs.push(`语句 ${i + 1} ✓：影响 ${affectedRows} 行，耗时 ${executionTime}ms`);
            } else {
              msgs.push(`语句 ${i + 1} ✓：执行成功，耗时 ${executionTime}ms`);
            }
            totalSuccess++;
          }
        } catch (error: any) {
          msgs.push(`语句 ${i + 1} ✗：${error.message || error}`);
          totalErrors++;
        }
      }

      setResults(multiResults);
      setMessages(msgs);

      if (totalErrors === 0) {
        message.success(`全部执行成功：${totalSuccess} 条语句`);
        setActiveTab('results');
      } else {
        message.error(`部分执行失败：${totalSuccess} 成功，${totalErrors} 失败`);
        setActiveTab('messages');
      }
      } else {
        // 单语句执行（原有逻辑）
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
        }
      }
      
      // 保存历史记录
      setQueryHistory(prev => [sql, ...prev.slice(0, 49)]);  // 增加到 50 条
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

  // 渲染单个结果集的表格
  const renderResultTable = useCallback((queryResult: QueryResult) => {
    if (queryResult.error) {
      return (
        <Empty description={`错误：${queryResult.error}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      );
    }
    
    if (queryResult.rows.length === 0) {
      return (
        <Empty description="查询成功，但没有返回数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      );
    }
    
    const columns = queryResult.columns.map((col, i) => ({
      title: col,
      dataIndex: i,
      key: col,
      width: 120,
      ellipsis: true,
      render: (val: any) => val === null || val === undefined ? <span style={{ color: '#999', fontStyle: 'italic' }}>NULL</span> : String(val),
    }));
    
    const dataSource = queryResult.rows.map((row, i) => {
      const obj: any = { key: i };
      row.forEach((cell, j) => {
        obj[j] = cell;
      });
      return obj;
    });
    
    return (
      <Table
        columns={columns}
        dataSource={dataSource}
        size="small"
        pagination={{ pageSize: 100, showSizeChanger: true, showTotal: (total) => `共 ${total} 行` }}
        scroll={{ x: 'max-content', y: 300 }}
        style={{ fontSize: 12 }}
      />
    );
  }, []);

  // 渲染单结果（用于 result 标签）
  const renderSingleResult = useMemo(() => (
    <div style={{ height: '100%', overflow: 'auto', padding: '0 16px' }}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Spin size="large" tip="执行中..." />
        </div>
      ) : !connectionId ? (
        <Empty description="请先选择一个数据库连接" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : !result ? (
        <Empty description="暂无查询结果" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : result.error ? (
        <Empty description={`错误：${result.error}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : result.rows.length === 0 ? (
        <Empty description="查询成功，但没有返回数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: isDarkMode ? '#141414' : '#fafafa', position: 'sticky', top: 0, zIndex: 1 }}>
              {result.columns.map((col, i) => (
                <th key={i} style={{ padding: '4px 8px', textAlign: 'left', borderBottom: `2px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`, fontWeight: 600, color: isDarkMode ? '#f6f6f6' : '#0f0f0f' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? (isDarkMode ? '#1f1f1f' : '#fff') : (isDarkMode ? '#141414' : '#fafafa') }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '3px 8px', borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`, color: isDarkMode ? '#bfbfbf' : '#595959' }}>
                    {cell === null || cell === undefined ? (
                      <span style={{ color: '#999', fontStyle: 'italic' }}>NULL</span>
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
  ), [loading, connectionId, result, isDarkMode]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      minHeight: 0,
      background: isDarkMode ? '#1f1f1f' : '#fff'
    }}>
      <div style={{ 
        padding: '4px 8px', 
        borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: isDarkMode ? '#141414' : '#fafafa',
      }}>
        <Space size="small">
          <Button 
            type="primary" 
            icon={<PlayCircleOutlined />} 
            onClick={handleExecuteQuery}
            loading={loading}
            disabled={!connectionId}
            style={{ 
              borderRadius: 4,
              fontWeight: 500
            }}
            size="small"
          >
            执行
          </Button>
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
          
          <div style={{ 
            width: 1, 
            height: 16, 
            background: isDarkMode ? '#434343' : '#d9d9d9',
            margin: '0 4px'
          }} />
          
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
                else if (key === 'history') setHistoryPanelVisible(true);
              }
            }}
          >
            <Button icon={<FileTextOutlined />} style={{ borderRadius: 4 }} size="small">
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
        borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        overflow: 'hidden',
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

      <div style={{ flex: '1 1 0', minHeight: 150, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'result' | 'results' | 'messages' | 'explain')}
          size="small"
          style={{
            background: isDarkMode ? '#1f1f1f' : '#fff',
            padding: '0 8px'
          }}
          items={(() => {
            const items: any[] = [
              {
                key: 'result',
                label: (
                  <span>
                    <CheckCircleOutlined style={{ marginRight: 4 }} />
                    结果 {result && result.rows.length > 0 && `(${result.rows.length})`}
                  </span>
                ),
                children: renderSingleResult,
              },
            ];

            if (results.length > 1) {
              items.push({
                key: 'results',
                label: (
                  <span>
                    <AppstoreOutlined style={{ marginRight: 4 }} />
                    多结果 ({results.length})
                  </span>
                ),
                children: (
                  <Tabs
                    type="card"
                    size="small"
                    items={results.map((r, i) => ({
                      key: `result-${i}`,
                      label: `结果 ${i + 1} (${r.rows.length} 行) ${r.executionTime ? `${r.executionTime}ms` : ''}`,
                      children: renderResultTable(r),
                    }))}
                  />
                ),
              });
            }

            items.push({
              key: 'messages',
              label: (
                <span>
                  <InfoCircleOutlined style={{ marginRight: 4 }} />
                  消息 {messages.length > 0 && `(${messages.length})`}
                </span>
              ),
              children: (
                <div style={{ height: '100%', overflow: 'auto', padding: '8px 16px', fontSize: 13, fontFamily: 'monospace' }}>
                  {messages.length === 0 ? (
                    <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    messages.map((msg, i) => (
                      <div key={i} style={{ padding: '4px 0', color: msg.startsWith('✗') ? '#ff4d4f' : msg.startsWith('⚠') ? '#faad14' : '#52c41a' }}>
                        {msg}
                      </div>
                    ))
                  )}
                </div>
              ),
            });

            items.push({
              key: 'explain',
              label: (
                <span>
                  <LineChartOutlined style={{ marginRight: 4 }} />
                  执行计划
                </span>
              ),
              children: (
                <div style={{ height: '100%', overflow: 'auto', padding: '0 16px' }}>
                  {explainPlan.length === 0 ? (
                    <Empty description="暂无执行计划" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: isDarkMode ? '#141414' : '#fafafa', position: 'sticky', top: 0 }}>
                          {Object.keys(explainPlan[0] || {}).map((key, i) => (
                            <th key={i} style={{ padding: '4px 8px', textAlign: 'left', borderBottom: `2px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`, fontWeight: 600 }}>
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {explainPlan.map((row, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? (isDarkMode ? '#1f1f1f' : '#fff') : (isDarkMode ? '#141414' : '#fafafa') }}>
                            {Object.values(row).map((cell: any, j) => (
                              <td key={j} style={{ padding: '3px 8px', borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}` }}>
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
            });

            return items;
          })()}
        />
      </div>
      
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
        />
      </Drawer>
    </div>
  );
}
