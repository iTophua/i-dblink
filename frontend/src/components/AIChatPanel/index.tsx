import { useState, useRef, useEffect, useCallback } from 'react';
import { Drawer, Select, Checkbox, Button, Input, Space, Tooltip, Collapse, Tag, Empty, App } from 'antd';
import {
  RobotOutlined,
  SendOutlined,
  DatabaseOutlined,
  SettingOutlined,
  DeleteOutlined,
  LoadingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Connection } from '../../stores/appStore';
import type { DatabaseType } from '../../types/api';
import { useAIStore } from '../../stores/aiStore';
import { useAIChatStore } from '../../stores/aiChatStore';
import { streamChat } from '../../services/aiService';
import { buildTableInfo } from '../../utils/buildTableInfo';
import { MarkdownRenderer } from './MarkdownRenderer';

const { TextArea } = Input;

export interface AIChatPanelProps {
  connections: Connection[];
  /** 连接树当前选中连接 ID（面板打开时自动跟随） */
  selectedConnectionId: string | null;
  /** 各连接已加载的数据库列表（用于上下文勾选） */
  connectionDatabases: Record<
    string,
    { database: string; loaded: boolean }[]
  >;
  /** 应用 SQL 到编辑器（当前 SQL tab 追加/替换；无 SQL tab 新建） */
  onApplySQL: (sql: string, mode: 'append' | 'replace') => void;
  /** 打开 AI 设置 */
  onOpenSettings: () => void;
}

export function AIChatPanel({
  connections,
  selectedConnectionId,
  connectionDatabases,
  onApplySQL,
  onOpenSettings,
}: AIChatPanelProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const panelVisible = useAIChatStore((s) => s.panelVisible);
  const setPanelVisible = useAIChatStore((s) => s.setPanelVisible);
  const chatMessages = useAIChatStore((s) => s.messages);
  const streaming = useAIChatStore((s) => s.streaming);
  const connectionId = useAIChatStore((s) => s.connectionId);
  const selectedDatabases = useAIChatStore((s) => s.selectedDatabases);

  const setConnection = useAIChatStore((s) => s.setConnection);
  const setSelectedDatabases = useAIChatStore((s) => s.setSelectedDatabases);
  const addUserMessage = useAIChatStore((s) => s.addUserMessage);
  const startAssistantMessage = useAIChatStore((s) => s.startAssistantMessage);
  const appendAssistantChunk = useAIChatStore((s) => s.appendAssistantChunk);
  const finalizeAssistantMessage = useAIChatStore((s) => s.finalizeAssistantMessage);
  const clearMessages = useAIChatStore((s) => s.clearMessages);

  const ready = useAIStore((s) => s.ready);
  const enabled = useAIStore((s) => s.enabled);
  const checkStatus = useAIStore((s) => s.checkStatus);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 应用启动时检查 AI 状态
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // 面板打开时自动跟随连接树选中项（仅首次或连接变化时）
  const lastSyncedConnRef = useRef<string | null>(null);
  useEffect(() => {
    if (panelVisible && selectedConnectionId && selectedConnectionId !== lastSyncedConnRef.current) {
      lastSyncedConnRef.current = selectedConnectionId;
      setConnection(selectedConnectionId);
      // 默认勾选该连接所有已加载数据库
      const dbs = (connectionDatabases[selectedConnectionId] || [])
        .filter((d) => d.loaded)
        .map((d) => d.database);
      setSelectedDatabases(dbs);
    }
  }, [panelVisible, selectedConnectionId, connectionDatabases, setConnection, setSelectedDatabases]);

  // 流式输出时自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // 当前连接信息
  const currentConn = connections.find((c) => c.id === connectionId);
  const currentDbType = (currentConn?.db_type as DatabaseType) || 'mysql';

  // 可选数据库列表（该连接已加载的库）
  const availableDatabases = connectionId
    ? (connectionDatabases[connectionId] || []).filter((d) => d.loaded).map((d) => d.database)
    : [];

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    if (!ready) {
      message.warning(t('common.aiSettings.notConfigured'));
      return;
    }

    // 构建发给后端的消息列表（含 system prompt + 历史消息 + 当前输入）
    const tableInfo = await buildTableInfo(connectionId || '', selectedDatabases);
    const systemPrompt = buildSystemPrompt(currentDbType, tableInfo);

    const historyMessages = [
      ...chatMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const requestMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...historyMessages,
      { role: 'user' as const, content: trimmed },
    ];

    // 更新 UI：添加用户消息 + 空的 assistant 消息
    addUserMessage(trimmed);
    startAssistantMessage();
    setInput('');

    try {
      await streamChat(
        requestMessages,
        (chunk) => appendAssistantChunk(chunk),
        (err) => {
          appendAssistantChunk(`\n\n[Error] ${err}`);
        }
      );
      finalizeAssistantMessage();
    } catch (err) {
      appendAssistantChunk(`\n\n[Error] ${err instanceof Error ? err.message : String(err)}`);
      finalizeAssistantMessage();
    }
  }, [
    input, streaming, ready, connectionId, selectedDatabases, currentDbType,
    chatMessages, addUserMessage, startAssistantMessage, appendAssistantChunk,
    finalizeAssistantMessage, setInput, message, t,
  ]);

  const handleApplySQL = useCallback(
    (sql: string) => {
      onApplySQL(sql, 'append');
      message.success(t('common.aiChat.applied'));
    },
    [onApplySQL, message, t]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const dbTypeLabel = currentDbType.toUpperCase();

  return (
    <Drawer
      title={
        <Space size={6}>
          <RobotOutlined />
          <span>{t('common.ai')}</span>
          {currentConn && <Tag bordered={false} style={{ fontSize: 10 }}>{dbTypeLabel}</Tag>}
        </Space>
      }
      placement="right"
      width={480}
      onClose={() => setPanelVisible(false)}
      open={panelVisible}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      extra={
        chatMessages.length > 0 && (
          <Tooltip title={t('common.aiChat.clearHistory')}>
            <Button
              size="small"
              type="text"
              icon={<DeleteOutlined />}
              onClick={() => clearMessages()}
            />
          </Tooltip>
        )
      }
    >
      {/* ── 未配置提示 ── */}
      {(!enabled || !ready) ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: 'var(--text-secondary)',
          }}
        >
          <RobotOutlined style={{ fontSize: 40, color: 'var(--text-tertiary)' }} />
          <div style={{ fontSize: 13 }}>{t('common.aiSettings.notConfigured')}</div>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<SettingOutlined />}
            onClick={onOpenSettings}
          >
            {t('common.aiSettings.goToSettings')}
          </Button>
        </div>
      ) : (
        <>
          {/* ── 上下文配置区 ── */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {/* 连接选择 */}
            <Select
              value={connectionId || undefined}
              onChange={(v) => {
                setConnection(v);
                const dbs = (connectionDatabases[v] || []).filter((d) => d.loaded).map((d) => d.database);
                setSelectedDatabases(dbs);
              }}
              placeholder={t('common.aiChat.selectConnection')}
              size="small"
              style={{ width: '100%', marginBottom: 6 }}
              options={connections.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.db_type.toUpperCase()})`,
              }))}
              showSearch
              optionFilterProp="label"
            />

            {/* 数据库勾选 */}
            {availableDatabases.length > 0 && (
              <Collapse
                ghost
                size="small"
                defaultActiveKey={['ctx']}
                items={[{
                  key: 'ctx',
                  label: (
                    <Space size={4}>
                      <DatabaseOutlined style={{ fontSize: 11 }} />
                      <span style={{ fontSize: 12 }}>{t('common.aiChat.context')}</span>
                      <Tag color="blue" style={{ fontSize: 10, margin: 0, lineHeight: '16px' }}>
                        {selectedDatabases.length}
                      </Tag>
                    </Space>
                  ),
                  children: (
                    <div style={{ maxHeight: 100, overflow: 'auto' }}>
                      <Checkbox.Group
                        value={selectedDatabases}
                        onChange={(checked) => setSelectedDatabases(checked as string[])}
                        style={{ width: '100%' }}
                      >
                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                          {availableDatabases.map((db) => (
                            <Checkbox key={db} value={db} style={{ fontSize: 12 }}>
                              {db}
                            </Checkbox>
                          ))}
                        </Space>
                      </Checkbox.Group>
                      {availableDatabases.length > 1 && (
                        <Space size={8} style={{ marginTop: 4 }}>
                          <Button
                            size="small"
                            type="link"
                            style={{ fontSize: 11, padding: 0, height: 'auto' }}
                            onClick={() => setSelectedDatabases(availableDatabases)}
                          >
                            {t('common.aiChat.selectAll')}
                          </Button>
                          <Button
                            size="small"
                            type="link"
                            style={{ fontSize: 11, padding: 0, height: 'auto' }}
                            onClick={() => setSelectedDatabases([])}
                          >
                            {t('common.aiChat.selectNone')}
                          </Button>
                        </Space>
                      )}
                    </div>
                  ),
                }]}
              />
            )}
          </div>

          {/* ── 消息列表 ── */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
            {chatMessages.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('common.aiChat.emptyHint')}
                style={{ marginTop: 40 }}
              />
            ) : (
              chatMessages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} onApplySQL={handleApplySQL} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── 输入区 ── */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <Space.Compact style={{ width: '100%' }}>
              <TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('common.aiChat.inputPlaceholder')}
                autoSize={{ minRows: 1, maxRows: 4 }}
                size="small"
                disabled={streaming}
                style={{ borderRadius: '6px 0 0 6px' }}
              />
              <Button
                type="primary"
                icon={streaming ? <LoadingOutlined /> : <SendOutlined />}
                onClick={handleSend}
                disabled={streaming || !input.trim()}
                style={{ height: 'auto' }}
              />
            </Space.Compact>
          </div>
        </>
      )}
    </Drawer>
  );
}

/** 单条消息气泡 */
function MessageBubble({
  msg,
  onApplySQL,
}: {
  msg: { role: 'user' | 'assistant'; content: string; streaming?: boolean; sqlBlocks?: string[] };
  onApplySQL: (sql: string) => void;
}) {
  const isUser = msg.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'flex-start',
          flexDirection: isUser ? 'row-reverse' : 'row',
          maxWidth: '100%',
        }}
      >
        {/* 头像 */}
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isUser ? 'var(--color-primary)' : 'var(--background-secondary)',
            color: isUser ? '#fff' : 'var(--text-secondary)',
            fontSize: 11,
          }}
        >
          {isUser ? <UserOutlined /> : <RobotOutlined />}
        </div>
        {/* 内容 */}
        <div
          style={{
            background: isUser ? 'var(--color-primary)' : 'var(--background-secondary)',
            color: isUser ? '#fff' : 'var(--text-primary)',
            padding: '6px 10px',
            borderRadius: isUser ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
            fontSize: 13,
            lineHeight: 1.5,
            maxWidth: 'calc(100% - 30px)',
            overflow: 'hidden',
          }}
        >
          {isUser ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
          ) : (
            <>
              <MarkdownRenderer content={msg.content || ''} onApplySQL={onApplySQL} />
              {msg.streaming && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <LoadingOutlined /> ...
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 构建 system prompt（含数据库类型 + 表结构上下文） */
function buildSystemPrompt(dbType: string, tableInfo: string): string {
  let prompt = `你是一个 ${dbType} 数据库专家助手。帮助用户编写、分析、优化 SQL。\n\n`;
  prompt += `要求：\n`;
  prompt += `- 生成的 SQL 必须符合 ${dbType} 方言语法\n`;
  prompt += `- SQL 代码放在 \`\`\`sql 代码块中\n`;
  prompt += `- 解释用简洁的中文\n`;
  if (tableInfo) {
    prompt += `\n当前数据库的表结构（格式：库名.表名 (字段1 类型, 字段2 类型, ...)）：\n${tableInfo}\n`;
    prompt += `\n跨库查询时请使用"库名.表名"的完整引用格式。\n`;
  }
  return prompt;
}
