import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Drawer,
  Select,
  Checkbox,
  Button,
  Input,
  Space,
  Tooltip,
  Collapse,
  Tag,
  Popconfirm,
  App,
} from 'antd';
import {
  RobotOutlined,
  PauseCircleOutlined,
  SendOutlined,
  DatabaseOutlined,
  SettingOutlined,
  DeleteOutlined,
  LoadingOutlined,
  UserOutlined,
  CopyOutlined,
  BulbOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Connection } from '../../stores/appStore';
import type { DatabaseType } from '../../types/api';
import { useAIStore } from '../../stores/aiStore';
import { useAIChatStore } from '../../stores/aiChatStore';
import { streamChat } from '../../services/aiService';
import { buildTableInfo } from '../../utils/buildTableInfo';
import { MarkdownRenderer } from './MarkdownRenderer';
import { getErrorMessage } from '../../utils/getErrorMessage';

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
  const [statusChecking, setStatusChecking] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  // 应用启动时检查 AI 状态
  useEffect(() => {
    let cancelled = false;
    checkStatus().finally(() => {
      if (!cancelled) setStatusChecking(false);
    });
    return () => {
      cancelled = true;
    };
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

  // 流式输出时只有用户本来就在底部才自动滚动，避免打断向上翻看
  useEffect(() => {
    if (nearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleMessageListScroll = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // 当前连接信息
  const currentConn = connections.find((c) => c.id === connectionId);
  const currentDbType = (currentConn?.db_type as DatabaseType) || 'mysql';

  // 可选数据库列表（该连接已加载的库）
  const availableDatabases = connectionId
    ? (connectionDatabases[connectionId] || []).filter((d) => d.loaded).map((d) => d.database)
    : [];

  const sendPrompt = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || streaming) return;

    if (!ready) {
      message.warning(t('common.aiSettings.notConfigured'));
      return;
    }

    // 1. 先更新 UI（即时反馈）+ 设置 streaming=true 防止并发发送
    //    在此之后 buildTableInfo 期间用户无法再次点发送
    addUserMessage(trimmed);
    startAssistantMessage();
    setInput('');

    try {
      // 2. 异步构建表结构上下文（可能耗时数秒，在 UI 已更新后执行）
      const tableInfo = await buildTableInfo(connectionId || '', selectedDatabases);
      const systemPrompt = buildSystemPrompt(currentDbType, tableInfo);

      // 3. 构建发给后端的消息列表
      //    历史消息从 chatMessages 闭包取值（此时不含刚 add 的用户消息，因为 React 未重渲染），
      //    当前用户消息单独 append
      const historyMessages = chatMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const requestMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...historyMessages,
        { role: 'user' as const, content: trimmed },
      ];

      // 4. 流式发送（错误统一由 catch 处理，不传 onError 避免重复追加）
      const controller = new AbortController();
      abortRef.current = controller;
      await streamChat(requestMessages, (chunk) => appendAssistantChunk(chunk), undefined, controller.signal);
      abortRef.current = null;
      finalizeAssistantMessage();
    } catch (err) {
      appendAssistantChunk(`\n\n[Error] ${getErrorMessage(err)}`);
      abortRef.current = null;
      finalizeAssistantMessage();
    }
  }, [
    streaming, ready, connectionId, selectedDatabases, currentDbType,
    chatMessages, addUserMessage, startAssistantMessage, appendAssistantChunk,
    finalizeAssistantMessage, setInput, message, t,
  ]);

  const handleSend = useCallback(() => {
    sendPrompt(input);
  }, [input, sendPrompt]);

  const handleRetry = useCallback(() => {
    const lastUser = [...chatMessages].reverse().find((m) => m.role === 'user');
    if (lastUser) sendPrompt(lastUser.content);
  }, [chatMessages, sendPrompt]);

  const handleApplySQL = useCallback(
    (sql: string) => {
      onApplySQL(sql, 'append');
      message.success(t('common.aiChat.applied'));
    },
    [onApplySQL, message, t]
  );

  const handleCopyMessage = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => message.success(t('common.copiedToClipboard')),
        () => message.error(t('common.copyFailed'))
      );
    },
    [message, t]
  );

  const handleStop = useCallback(() => {
    if (!abortRef.current) return;
    appendAssistantChunk(`\n\n${t('common.aiChat.stopped')}`);
    abortRef.current.abort(); // streamChat 以已完成部分 resolve，随后正常 finalize
  }, [appendAssistantChunk, t]);

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
        <Space size={8}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-primary-alpha-15)',
              color: 'var(--color-primary)',
            }}
          >
            <RobotOutlined />
          </span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{t('common.ai')}</span>
          {currentConn && (
            <Tag bordered={false} style={{ fontSize: 10 }}>
              {dbTypeLabel}
            </Tag>
          )}
        </Space>
      }
      placement="right"
      width={496}
      mask={false}
      onClose={() => setPanelVisible(false)}
      open={panelVisible}
      className="ai-chat-drawer"
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      extra={
        chatMessages.length > 0 && (
          <Popconfirm
            title={t('common.aiChat.clearHistory')}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            onConfirm={() => clearMessages()}
          >
            <Button
              size="small"
              type="text"
              aria-label={t('common.aiChat.clearHistory')}
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        )
      }
    >
      {statusChecking ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'var(--text-tertiary)',
            fontSize: 12,
          }}
        >
          <LoadingOutlined />
          {t('common.aiChat.checking')}
        </div>
      ) : !enabled || !ready ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '0 32px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-primary-alpha-15)',
              color: 'var(--color-primary)',
              fontSize: 22,
            }}
          >
            <RobotOutlined />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {t('common.aiSettings.notConfigured')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            {t('common.aiChat.notConfiguredHint')}
          </div>
          <Button type="primary" icon={<SettingOutlined />} onClick={onOpenSettings}>
            {t('common.aiSettings.goToSettings')}
          </Button>
        </div>
      ) : (
        <>
          {/* ── 上下文配置区 ── */}
          <div
            style={{
              padding: '10px 12px 6px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--background-toolbar)',
              flexShrink: 0,
            }}
          >
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
                        <Space orientation="vertical" size={2} style={{ width: '100%' }}>
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
          <div
            ref={messageListRef}
            onScroll={handleMessageListScroll}
            style={{ flex: 1, overflow: 'auto', padding: '14px 14px 8px' }}
          >
            {chatMessages.length === 0 ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 12px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-primary-alpha-15)',
                    color: 'var(--color-primary)',
                    fontSize: 20,
                  }}
                >
                  <RobotOutlined />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>
                  {t('common.aiChat.emptyTitle')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {t('common.aiChat.emptyHint')}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    width: '100%',
                    marginTop: 16,
                  }}
                >
                  {(['suggestExplain', 'suggestOptimize', 'suggestDdl'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="ai-chat-suggestion"
                      onClick={() => setInput(t(`common.aiChat.${key}`))}
                    >
                      <BulbOutlined />
                      <span>{t(`common.aiChat.${key}`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onApplySQL={handleApplySQL}
                  onCopy={handleCopyMessage}
                  onRetry={handleRetry}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── 输入区 ── */}
          <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                padding: '6px 6px 6px 10px',
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--surface-elevated)',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('common.aiChat.inputPlaceholder')}
                autoSize={{ minRows: 1, maxRows: 4 }}
                variant="borderless"
                style={{
                  flex: 1,
                  fontSize: 13,
                  padding: '4px 0',
                  resize: 'none',
                  background: 'transparent',
                }}
              />
              {streaming && (
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<PauseCircleOutlined />}
                  onClick={handleStop}
                  title={t('common.aiChat.stopGeneration')}
                />
              )}
              <Button
                type="primary"
                shape="circle"
                size="small"
                icon={streaming ? <LoadingOutlined /> : <SendOutlined />}
                onClick={handleSend}
                disabled={streaming || !input.trim()}
                aria-label={t('common.aiChat.send')}
              />
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: 'var(--text-tertiary)',
                textAlign: 'right',
              }}
            >
              {t('common.aiChat.disclaimer')}
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
}

/** 单条消息：用户=淡主色气泡；助手=无气泡正文 + 复制/重试操作 */
function MessageBubble({
  msg,
  onApplySQL,
  onCopy,
  onRetry,
}: {
  msg: { role: 'user' | 'assistant'; content: string; streaming?: boolean; sqlBlocks?: string[] };
  onApplySQL: (sql: string) => void;
  onCopy: (text: string) => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const isUser = msg.role === 'user';
  const hasError = !isUser && /\[Error\]/.test(msg.content);

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        flexDirection: isUser ? 'row-reverse' : 'row',
        marginBottom: 14,
        maxWidth: '100%',
      }}
    >
      {/* 头像 */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isUser ? 'var(--color-primary)' : 'var(--color-primary-alpha-15)',
          color: isUser ? 'var(--surface-elevated)' : 'var(--color-primary)',
          fontSize: 12,
        }}
      >
        {isUser ? <UserOutlined /> : <RobotOutlined />}
      </div>

      <div
        style={{
          minWidth: 0,
          maxWidth: 'calc(100% - 34px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        {isUser ? (
          <div
            style={{
              background: 'var(--color-primary-alpha-15)',
              border: '1px solid var(--color-primary-alpha-30)',
              color: 'var(--text-primary)',
              padding: '6px 10px',
              borderRadius: '12px 2px 12px 12px',
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {msg.content}
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: hasError ? 'var(--color-error)' : 'var(--text-primary)',
                overflowWrap: 'anywhere',
                maxWidth: '100%',
                minWidth: 0,
              }}
            >
              <MarkdownRenderer content={msg.content || ''} onApplySQL={onApplySQL} />
              {msg.streaming && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <LoadingOutlined /> ...
                </span>
              )}
            </div>
            {!msg.streaming && msg.content && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4 }}>
                <Tooltip title={t('common.aiChat.copyMessage')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    style={{ fontSize: 11, color: 'var(--text-tertiary)' }}
                    onClick={() => onCopy(msg.content)}
                  />
                </Tooltip>
                {hasError && (
                  <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    style={{ fontSize: 11, color: 'var(--color-primary)' }}
                    onClick={onRetry}
                  >
                    {t('common.aiChat.retry')}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
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
