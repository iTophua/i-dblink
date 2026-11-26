import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Drawer, Popconfirm, Tooltip } from 'antd';
import { PlusOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Connection } from '../../stores/appStore';
import { useAIStore } from '../../stores/aiStore';
import { useAIChatStore } from '../../stores/aiChatStore';
import type { ChatMessage } from '../../stores/aiChatStore';
import { streamChat } from '../../services/aiService';
import type { AIChatMessage } from '../../api';
import {
  buildSchemaContext,
  buildSystemPrompt,
  composeUserContent,
  SCHEMA_MAX_CHARS,
  sqlLabelFor,
  toRequestHistory,
} from '../../utils/aiChat';
import { getErrorMessage } from '../../utils/getErrorMessage';
import type { SqlInjectMode } from '../../utils/activeSqlRegistry';
import { ContextBar } from './ContextBar';
import { MessageList } from './MessageList';
import { ChatEmptyState } from './EmptyState';
import { buildQuickActions } from './quickActions';
import type { QuickAction } from './quickActions';
import { Composer } from './Composer';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import { HistoryPopover } from './HistoryPopover';
import type { AttachedSql, ComposerHandle } from './Composer';
import {
  clearAIChatHistory,
  deleteAIChatSession,
  refreshAIChatSessions,
  renameAIChatSession,
  resumeAIChatSession,
  startNewAIChat,
} from '../../services/aiChatHistory';
import '../../styles/ai-chat.css';

const DEFAULT_WIDTH = 496;
const MIN_WIDTH = 380;
const MAX_WIDTH = 880;
/** 给左侧工作区至少留出的宽度 */
const MIN_WORKSPACE_WIDTH = 360;
const WIDTH_STORAGE_KEY = 'idblink.aiChatPanel.width';
/** 流式增量合并刷帧间隔：降低整条消息列表的重渲染频率 */
const CHUNK_FLUSH_MS = 40;

function clampWidth(width: number): number {
  const room = typeof window === 'undefined' ? MAX_WIDTH : window.innerWidth - MIN_WORKSPACE_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(width, MAX_WIDTH, room));
}

function loadPanelWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
    return saved >= MIN_WIDTH ? clampWidth(saved) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function savePanelWidth(width: number): void {
  try {
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  } catch {
    // 隐私模式等场景下写入失败不影响使用
  }
}

export interface AIChatPanelProps {
  connections: Connection[];
  /** 连接树当前选中连接 ID（面板打开时自动跟随） */
  selectedConnectionId: string | null;
  /** 各连接已加载的数据库列表（用于上下文勾选） */
  connectionDatabases: Record<string, { database: string; loaded: boolean }[]>;
  /** 把 SQL 写入当前 SQL 标签页（追加/替换；没有 SQL 标签页则新建） */
  onApplySQL: (sql: string, mode: SqlInjectMode) => void;
  /** 读取当前活动 SQL 标签页的全文与选区；没有 SQL 标签页返回 null */
  getActiveSql?: () => { sql: string; selection: string } | null;
  /** 打开 AI 设置 */
  onOpenSettings: () => void;
}

/**
 * AI 助手侧栏：贴边停靠（非悬浮卡片），可拖拽调宽。
 *
 * 结构：标题栏 → 上下文条（连接/库/表）→ 消息流 → 输入区。
 * 发送流程：先把用户消息与占位回复落进界面，再异步整理表结构上下文、发起流式请求；
 * 增量按 40ms 合并刷帧，历史消息对象引用不变，流式时只重渲染最后一条。
 */
export function AIChatPanel({
  connections,
  selectedConnectionId,
  connectionDatabases,
  onApplySQL,
  getActiveSql,
  onOpenSettings,
}: AIChatPanelProps) {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();

  const panelVisible = useAIChatStore((s) => s.panelVisible);
  const chatMessages = useAIChatStore((s) => s.messages);
  const streaming = useAIChatStore((s) => s.streaming);
  const connectionId = useAIChatStore((s) => s.connectionId);
  const setPanelVisible = useAIChatStore((s) => s.setPanelVisible);
  const sessionId = useAIChatStore((s) => s.sessionId);
  const sessions = useAIChatStore((s) => s.sessions);

  const enabled = useAIStore((s) => s.enabled);
  const ready = useAIStore((s) => s.ready);
  const checkStatus = useAIStore((s) => s.checkStatus);

  const [width, setWidth] = useState(loadPanelWidth);
  const [draft, setDraft] = useState('');
  const [attached, setAttached] = useState<AttachedSql | null>(null);
  const [statusChecking, setStatusChecking] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** 正在切换 / 删除的会话 id */
  const [historyBusy, setHistoryBusy] = useState<string | null>(null);
  const [historyClearing, setHistoryClearing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef('');
  const pendingRef = useRef('');
  const flushTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const latestWidthRef = useRef(width);
  const lastSyncedConnRef = useRef<string | null>(null);
  const connectionsRef = useRef(connections);
  const composerRef = useRef<ComposerHandle>(null);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

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

  // 历史会话列表：AI 可用后拉一次（空对话不落盘，之后由持久化层增量维护）
  const sessionsLoadedRef = useRef(false);
  useEffect(() => {
    if (statusChecking || !enabled || !ready || sessionsLoadedRef.current || !panelVisible) return;
    // 加载失败不算「拉过」：面板常驻，一次失败就再也不重试的话，这次运行就一直没有历史入口
    void refreshAIChatSessions().then((ok) => {
      if (ok) sessionsLoadedRef.current = true;
    });
  }, [statusChecking, enabled, ready, panelVisible]);

  /** 把面板上下文切到某个连接，并默认勾选其已加载的库 */
  const syncConnection = useCallback(
    (connId: string) => {
      const store = useAIChatStore.getState();
      store.setConnection(connId);
      store.setSelectedDatabases(
        (connectionDatabases[connId] || []).filter((d) => d.loaded).map((d) => d.database)
      );
    },
    [connectionDatabases]
  );

  // 面板打开时跟随连接树选中项（仅连接变化时），默认勾选该连接所有已加载数据库
  useEffect(() => {
    if (
      !panelVisible ||
      !selectedConnectionId ||
      selectedConnectionId === lastSyncedConnRef.current
    ) {
      return;
    }
    lastSyncedConnRef.current = selectedConnectionId;
    // 外部入口（ER 图「发给 AI」）刚指定过上下文：这次不跟随连接树，保住它设好的表选择
    if (Date.now() < useAIChatStore.getState().contextSyncHoldUntil) return;
    syncConnection(selectedConnectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelVisible, selectedConnectionId]);

  // 卸载时清掉未刷出的增量与定时器，并中止进行中的请求
  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
      abortRef.current?.abort();
    },
    []
  );

  const availableDatabases = useMemo(
    () =>
      connectionId
        ? (connectionDatabases[connectionId] || []).filter((d) => d.loaded).map((d) => d.database)
        : [],
    [connectionId, connectionDatabases]
  );

  const quickActions = useMemo(() => buildQuickActions(t, i18n.language), [t, i18n.language]);

  const flushPending = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const text = pendingRef.current;
    if (!text) return;
    pendingRef.current = '';
    useAIChatStore.getState().appendAssistantChunk(streamIdRef.current, text);
  }, []);

  const queueChunk = useCallback(
    (chunk: string) => {
      pendingRef.current += chunk;
      if (flushTimerRef.current !== null) return;
      flushTimerRef.current = window.setTimeout(flushPending, CHUNK_FLUSH_MS);
    },
    [flushPending]
  );

  /**
   * 发送一轮请求。regenerate=true 时不新增用户消息：丢掉末尾那条回复，
   * 沿用它的提问重新生成（重试失败、停止后继续、重新生成共用这条路径）。
   */
  const sendPrompt = useCallback(
    async (text: string, options?: { attachedSql?: string; regenerate?: boolean }) => {
      const store = useAIChatStore.getState();
      if (store.streaming) return;
      const regenerate = !!options?.regenerate;
      const content = text.trim();
      if (!regenerate && !content) return;
      if (!useAIStore.getState().ready) {
        message.warning(t('common.aiSettings.notConfigured'));
        return;
      }

      const language = i18n.language;
      const sqlLabel = sqlLabelFor(language);
      const source: ChatMessage[] = regenerate ? store.messages.slice(0, -1) : store.messages;
      const history = toRequestHistory(source, sqlLabel);
      if (regenerate && history[history.length - 1]?.role !== 'user') return;
      const userContent = regenerate
        ? history[history.length - 1].content
        : composeUserContent(content, options?.attachedSql, sqlLabel);

      // 面板被外部入口清空过（ER 图「发给 AI」）时，上一条回复的流可能还在跑：
      // 先中止它，它的内容不能再接进这次的回复
      abortRef.current?.abort();
      streamIdRef.current = '';
      pendingRef.current = '';
      const controller = new AbortController();
      abortRef.current = controller;
      let assistantId: string;
      if (regenerate) {
        useAIChatStore.getState().removeMessage(store.messages[store.messages.length - 1].id);
        assistantId = useAIChatStore.getState().startAssistantMessage();
      } else {
        useAIChatStore.getState().addUserMessage(content, options?.attachedSql);
        assistantId = useAIChatStore.getState().startAssistantMessage();
      }
      streamIdRef.current = assistantId;
      startedAtRef.current = performance.now();

      // 新对话会作废进行中的流：被作废的流收尾时不能再改写状态
      const isCurrent = () => streamIdRef.current === assistantId;
      const finish = (status: 'done' | 'error' | 'stopped', error?: string) => {
        if (!isCurrent()) return;
        flushPending();
        useAIChatStore.getState().finishAssistantMessage(assistantId, {
          status,
          error,
          elapsedMs: performance.now() - startedAtRef.current,
        });
        // 已经收尾：之后切换 / 新建会话时不能再把它改写成「已停止」
        streamIdRef.current = '';
        if (abortRef.current === controller) abortRef.current = null;
      };

      try {
        const schema = await buildSchemaContext({
          connectionId: store.connectionId,
          databases: store.selectedDatabases,
          tables: store.selectedTables,
        });
        // 整理上下文期间点了停止：这条回复还没开始，直接撤掉占位
        if (controller.signal.aborted) {
          if (isCurrent()) {
            streamIdRef.current = '';
            useAIChatStore.getState().removeMessage(assistantId);
          }
          if (abortRef.current === controller) abortRef.current = null;
          return;
        }
        if (schema.chars > SCHEMA_MAX_CHARS) {
          finish(
            'error',
            t('common.aiChat.contextTooLarge', { n: Math.round(schema.chars / 1000) })
          );
          return;
        }
        const dbType = connectionsRef.current.find((c) => c.id === store.connectionId)?.db_type;
        const requestMessages: AIChatMessage[] = [
          {
            role: 'system',
            content: buildSystemPrompt({ dbType, schemaText: schema.text, language }),
          },
          ...(regenerate ? history.slice(0, -1) : history),
          { role: 'user', content: userContent },
        ];
        await streamChat(
          requestMessages,
          (chunk: string) => {
            // 这条流已被新对话作废：之后到达的内容不属于任何回复
            if (isCurrent()) queueChunk(chunk);
          },
          undefined,
          controller.signal
        );
        finish(controller.signal.aborted ? 'stopped' : 'done');
      } catch (err) {
        finish('error', getErrorMessage(err));
      }
    },
    [message, t, i18n.language, queueChunk, flushPending]
  );

  const handleSend = useCallback(() => {
    if (streaming || !draft.trim()) return;
    if (!ready) {
      message.warning(t('common.aiSettings.notConfigured'));
      return;
    }
    const sql = attached?.sql;
    setDraft('');
    setAttached(null);
    sendPrompt(draft, { attachedSql: sql });
  }, [streaming, draft, attached, ready, message, t, sendPrompt]);

  const handleRegenerate = useCallback(() => {
    sendPrompt('', { regenerate: true });
  }, [sendPrompt]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort(); // 流以已完成部分收尾，随后按 stopped 落状态
  }, []);

  /** 引用当前 SQL：有选区只引用选区，否则引用整个编辑器 */
  const pickActiveSql = useCallback((): { sql: string; selection: string } | undefined => {
    const snapshot = getActiveSql?.();
    const selection = snapshot?.selection.trim();
    const sql = selection || snapshot?.sql.trim();
    return sql ? { sql, selection: selection ?? '' } : undefined;
  }, [getActiveSql]);

  const handleAttachSql = useCallback(() => {
    const picked = pickActiveSql();
    if (!picked) {
      message.info(t('common.aiChat.noSqlToAttach'));
      return;
    }
    setAttached({ sql: picked.sql, partial: !!picked.selection });
    composerRef.current?.focus();
  }, [pickActiveSql, message, t]);

  const runQuickAction = useCallback(
    (action: QuickAction, target?: string) => {
      let picked: { sql: string; selection: string } | undefined;
      if (action.requiresSql) {
        picked = pickActiveSql();
        if (!picked) {
          message.info(t('common.aiChat.noSqlToAttach'));
          return;
        }
      }
      // 「转换方言」必须先选目标数据库
      if (action.key === 'convert' && !target) return;
      const prompt =
        typeof action.prompt === 'function' ? action.prompt(target ?? '') : action.prompt;
      if (action.autoSend) {
        sendPrompt(prompt, { attachedSql: picked?.sql });
        return;
      }
      setDraft(prompt);
      setAttached(picked ? { sql: picked.sql, partial: !!picked.selection } : null);
      composerRef.current?.focus();
    },
    [pickActiveSql, sendPrompt, message, t]
  );

  const getConnectionName = useCallback(
    (connId: string | null) => connections.find((c) => c.id === connId)?.name,
    [connections]
  );

  const handleCopy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        message.error(t('common.copyFailed'));
        return false;
      }
    },
    [message, t]
  );

  const handleApplySql = useCallback(
    (sql: string, mode: SqlInjectMode) => {
      onApplySQL(sql, mode);
      message.success(
        mode === 'replace' ? t('common.aiChat.replacedInEditor') : t('common.aiChat.applied')
      );
    },
    [onApplySQL, message, t]
  );

  /**
   * 把进行中的回复按「已停止」收尾：切换/新建/删除会话前调用，
   * 这样最后一段已生成的内容也会落进历史（否则只留到上一次存档）。
   */
  const finalizeActiveStream = useCallback(() => {
    abortRef.current?.abort();
    const id = streamIdRef.current;
    if (!id) return;
    const stillStreaming =
      useAIChatStore.getState().messages.find((m) => m.id === id)?.status === 'streaming';
    // 只收尾真正进行中的回复：已经完成 / 失败的不能被改写成「已停止」（否则恢复会话时
    // 完成的回答显示成已停止、失败的回答丢掉错误信息）
    if (stillStreaming) flushPending(); // 先把缓冲里的内容接到这条回复上
    const reply = useAIChatStore.getState().messages.find((m) => m.id === id);
    streamIdRef.current = ''; // 仍在途的流收尾时发现 id 已换，不会再改写状态
    pendingRef.current = '';
    if (!stillStreaming) return;
    if (!reply?.content) {
      // 还没生成任何内容就被打断：占位回复直接撤掉（留成「已停止」的话，恢复会话时是个空气泡）
      useAIChatStore.getState().removeMessage(id);
      return;
    }
    useAIChatStore.getState().finishAssistantMessage(id, {
      status: 'stopped',
      elapsedMs: performance.now() - startedAtRef.current,
    });
  }, [flushPending]);

  // 外部入口（ER 图「发给 AI」）开新对话前发这个事件：把进行中的回复按「已停止」收尾。
  // 否则面板已经清空、旧流还在跑，它的内容会接进新对话的下一条回复
  useEffect(() => {
    const onInterrupt = () => finalizeActiveStream();
    window.addEventListener('ai-chat-interrupt', onInterrupt);
    return () => window.removeEventListener('ai-chat-interrupt', onInterrupt);
  }, [finalizeActiveStream]);

  const runHistoryAction = useCallback(
    async (id: string | null, action: () => Promise<void>) => {
      finalizeActiveStream();
      setHistoryBusy(id);
      try {
        await action();
      } catch (err) {
        message.error(`${t('common.aiChat.historyOpFailed')}: ${getErrorMessage(err)}`);
      } finally {
        setHistoryBusy(null);
        setHistoryOpen(false);
      }
    },
    [finalizeActiveStream, message, t]
  );

  const handleNewChat = useCallback(() => {
    setAttached(null);
    void runHistoryAction(null, async () => {
      await startNewAIChat();
      composerRef.current?.focus();
    });
  }, [runHistoryAction]);

  const handleResume = useCallback(
    (id: string) => {
      setAttached(null);
      // 点的就是当前对话：只是关掉弹层，不能把正在生成的回复打断
      if (useAIChatStore.getState().sessionId === id) {
        setHistoryOpen(false);
        return;
      }
      void runHistoryAction(id, () => resumeAIChatSession(id));
    },
    [runHistoryAction]
  );

  const handleRename = useCallback(
    async (id: string, title: string) => {
      try {
        await renameAIChatSession(id, title);
      } catch (err) {
        // 重命名不收尾进行中的回复，所以不走 runHistoryAction：失败提示要自己给
        message.error(`${t('common.aiChat.historyOpFailed')}: ${getErrorMessage(err)}`);
      }
    },
    [message, t]
  );

  const handleDelete = useCallback(
    (id: string) => runHistoryAction(id, () => deleteAIChatSession(id)),
    [runHistoryAction]
  );

  const handleClearHistory = useCallback(async () => {
    finalizeActiveStream();
    setHistoryClearing(true);
    try {
      await clearAIChatHistory();
    } catch (err) {
      message.error(`${t('common.aiChat.historyOpFailed')}: ${getErrorMessage(err)}`);
    } finally {
      setHistoryClearing(false);
      setHistoryOpen(false);
    }
  }, [finalizeActiveStream, message, t]);

  const lastMessage = chatMessages[chatMessages.length - 1];
  const aiUnavailable = !enabled || !ready;

  return (
    <Drawer
      placement="right"
      size={width}
      resizable={{
        onResize: (size) => {
          const next = clampWidth(size);
          latestWidthRef.current = next;
          setWidth(next);
        },
        onResizeEnd: () => savePanelWidth(latestWidthRef.current),
      }}
      mask={false}
      open={panelVisible}
      onClose={() => setPanelVisible(false)}
      afterOpenChange={(open) => {
        if (open) composerRef.current?.focus();
      }}
      rootClassName="ai-chat-drawer-root"
      className="ai-chat-drawer"
      closable={{ placement: 'end' }}
      title={
        <span className="ai-chat-title">
          <span className="ai-chat-title-icon">
            <RobotOutlined />
          </span>
          {t('common.ai')}
        </span>
      }
      extra={
        !statusChecking &&
        !aiUnavailable && (
          <div className="ai-chat-header-actions">
            {sessions.length > 0 && (
              <HistoryPopover
                sessions={sessions}
                currentSessionId={sessionId}
                getConnectionName={getConnectionName}
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                onSelect={handleResume}
                onRename={handleRename}
                onDelete={handleDelete}
                onClearAll={handleClearHistory}
                busyId={historyBusy}
                clearing={historyClearing}
              />
            )}
            {chatMessages.length > 0 && (
              <Popconfirm
                title={t('common.aiChat.newChatConfirm')}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                onConfirm={handleNewChat}
              >
                <Tooltip title={t('common.aiChat.newChat')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<PlusOutlined />}
                    aria-label={t('common.aiChat.newChat')}
                    data-testid="ai-new-chat"
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </div>
        )
      }
      styles={{
        header: { padding: '0 10px 0 16px' },
        body: { padding: 0, display: 'flex', flexDirection: 'column' },
      }}
    >
      <PanelErrorBoundary>
        {statusChecking ? (
          <div className="ai-chat-center ai-chat-muted" data-testid="ai-chat-checking">
            <span className="ai-thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {t('common.aiChat.checking')}
          </div>
        ) : aiUnavailable ? (
          <div
            className="ai-chat-center ai-chat-not-configured"
            data-testid="ai-chat-not-configured"
          >
            <div className="ai-chat-empty-hero">
              <RobotOutlined />
            </div>
            <div className="ai-chat-empty-title">{t('common.aiSettings.notConfigured')}</div>
            <div className="ai-chat-empty-hint">{t('common.aiChat.notConfiguredHint')}</div>
            <Button type="primary" icon={<SettingOutlined />} onClick={onOpenSettings}>
              {t('common.aiSettings.goToSettings')}
            </Button>
          </div>
        ) : (
          <>
            <ContextBar
              connections={connections}
              connectionId={connectionId}
              availableDatabases={availableDatabases}
              onSelectConnection={syncConnection}
            />
            <MessageList
              messages={chatMessages}
              canRegenerate={!streaming && lastMessage?.role === 'assistant'}
              onCopy={handleCopy}
              onRegenerate={handleRegenerate}
              applySql={handleApplySql}
              empty={
                <ChatEmptyState
                  actions={quickActions}
                  hasContext={!!connectionId}
                  contextName={connections.find((c) => c.id === connectionId)?.name}
                  onAction={runQuickAction}
                  recentSessions={sessions}
                  getConnectionName={getConnectionName}
                  onResume={handleResume}
                />
              }
            />
            <Composer
              ref={composerRef}
              value={draft}
              onChange={setDraft}
              onSend={handleSend}
              onStop={handleStop}
              streaming={streaming}
              attached={attached}
              onDetach={() => setAttached(null)}
              canAttachSql={!!getActiveSql?.()}
              onAttachSql={handleAttachSql}
              quickActions={quickActions}
              onQuickAction={runQuickAction}
            />
          </>
        )}
      </PanelErrorBoundary>
    </Drawer>
  );
}
