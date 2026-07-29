import { create } from 'zustand';

/** 界面展示的聊天消息（仅 user/assistant，system prompt 发送时动态拼接） */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** assistant 消息流式输出中 */
  streaming?: boolean;
  /** 从内容中提取的 SQL 代码块（供复制/应用到编辑器） */
  sqlBlocks?: string[];
}

interface AIChatState {
  panelVisible: boolean;
  messages: ChatMessage[];
  /** 是否正在等待 AI 响应（发送后到流结束前） */
  streaming: boolean;

  // 上下文
  connectionId: string | null;
  /** 用户勾选的数据库（纳入表结构上下文） */
  selectedDatabases: string[];

  // Actions
  setPanelVisible: (v: boolean) => void;
  setConnection: (connId: string | null) => void;
  toggleDatabase: (db: string) => void;
  setSelectedDatabases: (dbs: string[]) => void;
  addUserMessage: (content: string) => void;
  /** 创建一条空的 assistant 消息（流式开始时） */
  startAssistantMessage: () => void;
  /** 流式追加内容到最后一条 assistant 消息 */
  appendAssistantChunk: (chunk: string) => void;
  /** 流结束：标记 streaming=false，提取 sqlBlocks */
  finalizeAssistantMessage: () => void;
  clearMessages: () => void;
}

/** 从文本中提取所有 ```sql 代码块内容 */
function extractSqlBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /```(?:sql)?\s*\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    blocks.push(m[1].trim());
  }
  return blocks;
}

/** 生成唯一消息 ID */
function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useAIChatStore = create<AIChatState>((set) => ({
  panelVisible: false,
  messages: [],
  streaming: false,
  connectionId: null,
  selectedDatabases: [],

  setPanelVisible: (v) => set({ panelVisible: v }),

  setConnection: (connId) =>
    set({ connectionId: connId, selectedDatabases: [] }),

  toggleDatabase: (db) =>
    set((s) => {
      const has = s.selectedDatabases.includes(db);
      return {
        selectedDatabases: has
          ? s.selectedDatabases.filter((d) => d !== db)
          : [...s.selectedDatabases, db],
      };
    }),

  setSelectedDatabases: (dbs) => set({ selectedDatabases: dbs }),

  addUserMessage: (content) =>
    set((s) => ({
      messages: [...s.messages, { id: genId(), role: 'user', content }],
      streaming: true,
    })),

  startAssistantMessage: () =>
    set((s) => ({
      messages: [...s.messages, { id: genId(), role: 'assistant', content: '', streaming: true }],
    })),

  appendAssistantChunk: (chunk) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
      }
      return { messages: msgs };
    }),

  finalizeAssistantMessage: () =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...last,
          streaming: false,
          sqlBlocks: extractSqlBlocks(last.content),
        };
      }
      return { messages: msgs, streaming: false };
    }),

  clearMessages: () => set({ messages: [], streaming: false }),
}));
