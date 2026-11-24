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

interface AIChatState {
  panelVisible: boolean;
  messages: ChatMessage[];
  /** 是否正在等待 AI 响应（发送后到流结束前） */
  streaming: boolean;

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
  clearMessages: () => void;
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

export const useAIChatStore = create<AIChatState>((set) => ({
  panelVisible: false,
  messages: [],
  streaming: false,
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
    set((s) => ({
      messages: [...s.messages, { id, role: 'user', content, attachedSql }],
      streaming: true,
    }));
    return id;
  },

  startAssistantMessage: () => {
    const id = genId();
    set((s) => ({
      messages: [...s.messages, { id, role: 'assistant', content: '', status: 'streaming' }],
      streaming: true,
    }));
    return id;
  },

  // 只替换目标消息对象，其余消息保持引用不变 → 列表里的历史消息可以跳过重渲染
  appendAssistantChunk: (id, chunk) =>
    set((s) => ({
      messages: updateMessage(s.messages, id, (m) => ({ ...m, content: m.content + chunk })),
    })),

  finishAssistantMessage: (id, result) =>
    set((s) => ({
      messages: updateMessage(s.messages, id, (m) => ({
        ...m,
        status: result.status,
        error: result.error,
        elapsedMs: result.elapsedMs,
      })),
      streaming: false,
    })),

  // 移除的是正在流式输出的那条时，一并结束 streaming（如整理上下文期间点了停止）
  removeMessage: (id) =>
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== id),
      streaming: false,
    })),

  clearMessages: () => set({ messages: [], streaming: false }),
}));
