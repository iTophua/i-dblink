import { create } from 'zustand';

/** assistant 回复的结束方式：正常 / 失败 / 用户中止 */
export type AssistantStatus = 'streaming' | 'done' | 'error' | 'stopped';

/** 界面展示的聊天消息（仅 user/assistant，system prompt 发送时动态拼接） */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 仅 assistant */
  status?: AssistantStatus;
  /** status=error 时的失败原因 */
  error?: string;
  /** 仅 assistant：从发出请求到结束的耗时（毫秒） */
  elapsedMs?: number;
  /** 仅 user：随消息一并发给模型的编辑器 SQL（界面以引用块回显） */
  attachedSql?: string;
}

export interface FinishResult {
  status: Exclude<AssistantStatus, 'streaming'>;
  error?: string;
  elapsedMs?: number;
}

/** 历史会话列表里的一项（消息内容不在这里，切换时另取） */
export interface AIChatSessionSummary {
  id: string;
  title: string;
  connectionId: string | null;
  /** 发问时的表结构上下文（JSON 原文，恢复会话时解析） */
  contextJson: string;
  createdAt: number;
  updatedAt: number;
}

/** 一次对话的表结构上下文快照 */
export interface ChatContextSnapshot {
  connectionId: string | null;
  databases: string[];
  tables: Record<string, string[]>;
}

/**
 * 消息变更事件：持久化层（services/aiChatHistory.ts）订阅后合并写盘。
 * sessionId 为 null 表示当前对话还没落过盘（首条消息发出后才建会话）。
 */
export type ChatMutation =
  | { type: 'upsert'; sessionId: string | null; message: ChatMessage }
  | { type: 'delete'; sessionId: string | null; id: string };

type MutationListener = (mutation: ChatMutation) => void;
const mutationListeners = new Set<MutationListener>();

/** 订阅消息变更；返回取消函数 */
export function subscribeChatMutations(listener: MutationListener): () => void {
  mutationListeners.add(listener);
  return () => {
    mutationListeners.delete(listener);
  };
}

function emit(mutation: { type: 'upsert'; message: ChatMessage } | { type: 'delete'; id: string }) {
  if (mutationListeners.size === 0) return;
  const { sessionId } = useAIChatStore.getState();
  for (const listener of mutationListeners) {
    listener({ ...mutation, sessionId } as ChatMutation);
  }
}

interface AIChatState {
  panelVisible: boolean;
  messages: ChatMessage[];
  /** 是否正在等待 AI 响应（发送后到流结束前） */
  streaming: boolean;

  /** 当前对话对应的本地会话；null = 新对话还没落盘 */
  sessionId: string | null;
  /** 历史会话（最近更新在前） */
  sessions: AIChatSessionSummary[];
  /** 对话代际：每次新对话 / 切换会话 +1，持久化层据此区分「哪一轮对话在等建会话」 */
  conversationSeq: number;
  /**
   * 在这个时间点之前，面板打开时不跟随连接树的选中项。
   * ER 图「发给 AI」这类外部入口指定好上下文后置位，保住它设好的表选择；
   * 用时间而不是开关，是为了不会因为面板早已打开而留下一个过期的标记。
   */
  contextSyncHoldUntil: number;

  // 上下文
  connectionId: string | null;
  /** 纳入表结构上下文的数据库 */
  selectedDatabases: string[];
  /** 表级筛选：db → 表名列表。未出现的库表示整库纳入 */
  selectedTables: Record<string, string[]>;

  // Actions
  setPanelVisible: (v: boolean) => void;
  setConnection: (connId: string | null) => void;
  setSelectedDatabases: (dbs: string[]) => void;
  setDatabaseTables: (db: string, tables: string[] | null) => void;
  /** 追加用户消息，返回消息 id */
  addUserMessage: (content: string, attachedSql?: string) => string;
  /** 创建一条空的 assistant 消息（流式开始时），返回消息 id */
  startAssistantMessage: () => string;
  /** 向指定 assistant 消息追加内容 */
  appendAssistantChunk: (id: string, chunk: string) => void;
  /** 流结束：写入状态、失败原因与耗时 */
  finishAssistantMessage: (id: string, result: FinishResult) => void;
  removeMessage: (id: string) => void;
  /** 开始新对话：清空消息并脱离当前会话（已落盘的内容留在历史里） */
  clearMessages: () => void;

  // 会话（由 services/aiChatHistory.ts 调用）
  setCurrentSession: (id: string | null) => void;
  setContextSyncHold: (until: number) => void;
  setSessions: (sessions: AIChatSessionSummary[]) => void;
  /** 新增或替换列表里的一项（保持最近更新在前） */
  upsertSession: (session: AIChatSessionSummary) => void;
  removeSessionFromList: (id: string) => void;
  /** 载入一个历史会话：整体替换消息与上下文，不产生持久化事件 */
  hydrateConversation: (args: {
    sessionId: string;
    messages: ChatMessage[];
    context: ChatContextSnapshot | null;
  }) => void;
}

/** 生成唯一消息 ID */
function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateMessage(
  messages: ChatMessage[],
  id: string,
  patch: (msg: ChatMessage) => ChatMessage
): ChatMessage[] {
  const idx = messages.findIndex((m) => m.id === id);
  if (idx < 0) return messages;
  const next = messages.slice();
  next[idx] = patch(next[idx]);
  return next;
}

/** 按 updatedAt 倒序插入/替换，同一 id 只保留一份 */
function sortSessions(sessions: AIChatSessionSummary[]): AIChatSessionSummary[] {
  return sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export const useAIChatStore = create<AIChatState>((set) => ({
  panelVisible: false,
  messages: [],
  streaming: false,
  sessionId: null,
  sessions: [],
  conversationSeq: 0,
  contextSyncHoldUntil: 0,
  connectionId: null,
  selectedDatabases: [],
  selectedTables: {},

  setPanelVisible: (v) => set({ panelVisible: v }),

  // 换连接即清空库/表选择：库表属于旧连接，带过去没有意义
  setConnection: (connId) =>
    set({ connectionId: connId, selectedDatabases: [], selectedTables: {} }),

  setSelectedDatabases: (dbs) =>
    set((s) => ({
      selectedDatabases: dbs,
      // 已移出范围的库，其表级筛选一并丢弃
      selectedTables: Object.fromEntries(
        Object.entries(s.selectedTables).filter(([db]) => dbs.includes(db))
      ),
    })),

  // tables 传 null 表示恢复整库
  setDatabaseTables: (db, tables) =>
    set((s) => {
      const next = { ...s.selectedTables };
      if (tables === null) delete next[db];
      else next[db] = tables;
      return { selectedTables: next };
    }),

  addUserMessage: (content, attachedSql) => {
    const id = genId();
    const message: ChatMessage = { id, role: 'user', content, attachedSql };
    set((s) => ({ messages: [...s.messages, message], streaming: true }));
    emit({ type: 'upsert', message });
    return id;
  },

  startAssistantMessage: () => {
    const id = genId();
    const message: ChatMessage = { id, role: 'assistant', content: '', status: 'streaming' };
    set((s) => ({ messages: [...s.messages, message], streaming: true }));
    emit({ type: 'upsert', message });
    return id;
  },

  // 只替换目标消息对象，其余消息保持引用不变 → 列表里的历史消息可以跳过重渲染
  appendAssistantChunk: (id, chunk) =>
    set((s) => ({
      messages: updateMessage(s.messages, id, (m) => ({ ...m, content: m.content + chunk })),
    })),

  finishAssistantMessage: (id, result) => {
    let final: ChatMessage | undefined;
    set((s) => ({
      messages: updateMessage(s.messages, id, (m) => {
        final = {
          ...m,
          status: result.status,
          error: result.error,
          elapsedMs: result.elapsedMs,
        };
        return final;
      }),
      streaming: false,
    }));
    // 流结束是终态：立刻落盘（流式过程中的增量由持久化层定期存档）
    if (final) emit({ type: 'upsert', message: final });
  },

  // 移除的是正在流式输出的那条时，一并结束 streaming（如整理上下文期间点了停止）
  removeMessage: (id) => {
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== id),
      streaming: false,
    }));
    emit({ type: 'delete', id });
  },

  clearMessages: () =>
    set((s) => ({
      messages: [],
      streaming: false,
      sessionId: null,
      conversationSeq: s.conversationSeq + 1,
    })),

  setCurrentSession: (id) => set({ sessionId: id }),

  setContextSyncHold: (until) => set({ contextSyncHoldUntil: until }),

  setSessions: (sessions) => set({ sessions: sortSessions(sessions) }),

  upsertSession: (session) =>
    set((s) => ({
      sessions: sortSessions([session, ...s.sessions.filter((item) => item.id !== session.id)]),
    })),

  removeSessionFromList: (id) =>
    set((s) => ({ sessions: s.sessions.filter((item) => item.id !== id) })),

  hydrateConversation: ({ sessionId, messages, context }) =>
    set((s) => ({
      sessionId,
      messages,
      streaming: false,
      conversationSeq: s.conversationSeq + 1,
      connectionId: context?.connectionId ?? null,
      selectedDatabases: context?.databases ?? [],
      selectedTables: context?.tables ?? {},
    })),
}));
