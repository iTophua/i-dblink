import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import {
  mockAIChatCreateSession,
  mockAIChatDeleteAllSessions,
  mockAIChatDeleteSession,
  mockAIChatGetMessages,
  mockAIChatListSessions,
  mockAIChatRenameSession,
  mockAIChatSaveMessages,
  mockAIChatUpdateSessionContext,
} from '../setupTests';
import { useAIChatStore } from '../../stores/aiChatStore';
import type { AIChatSessionSummary } from '../../stores/aiChatStore';
import {
  clearAIChatHistory,
  deleteAIChatSession,
  deriveTitle,
  flushAIChatHistory,
  formatRelativeTime,
  fromStoredMessage,
  installAIChatHistory,
  parseContext,
  refreshAIChatSessions,
  renameAIChatSession,
  resetAIChatHistoryForTests,
  resumeAIChatSession,
  serializeContext,
  startNewAIChat,
  toSessionSummary,
  toStoredMessage,
} from '../../services/aiChatHistory';

const SESSION_1 = {
  id: 'session-1',
  title: '',
  connection_id: null,
  context_json: '',
  created_at: '2026-01-01T00:00:00.000000000Z',
  updated_at: '2026-01-01T00:00:00.000000000Z',
};

function summary(patch: Partial<AIChatSessionSummary> = {}): AIChatSessionSummary {
  return {
    id: 'session-1',
    title: '旧对话',
    connectionId: 'conn-1',
    contextJson: serializeContext({ connectionId: 'conn-1', databases: ['old'], tables: {} }),
    createdAt: 1000,
    updatedAt: 2000,
    ...patch,
  };
}

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts?.n !== undefined ? `${key}:${opts.n}` : key) as unknown as TFunction;

let uninstall: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  useAIChatStore.setState({
    messages: [],
    sessionId: null,
    sessions: [],
    streaming: false,
    conversationSeq: 0,
    connectionId: null,
    selectedDatabases: [],
    selectedTables: {},
  });
  resetAIChatHistoryForTests();
  mockAIChatCreateSession.mockReset().mockResolvedValue(SESSION_1);
  mockAIChatSaveMessages.mockReset().mockResolvedValue(undefined);
  mockAIChatListSessions.mockReset().mockResolvedValue([]);
  mockAIChatGetMessages.mockReset().mockResolvedValue([]);
  mockAIChatRenameSession.mockReset().mockResolvedValue(undefined);
  mockAIChatUpdateSessionContext.mockReset().mockResolvedValue(undefined);
  mockAIChatDeleteSession.mockReset().mockResolvedValue(undefined);
  mockAIChatDeleteAllSessions.mockReset().mockResolvedValue(undefined);
  uninstall = installAIChatHistory();
});

afterEach(() => {
  uninstall();
  resetAIChatHistoryForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 走一轮完整对话：用户消息 + 回复落终态 */
function completeTurn(question: string, answer: string) {
  const st = useAIChatStore.getState();
  st.addUserMessage(question, 'select 1');
  const replyId = st.startAssistantMessage();
  st.appendAssistantChunk(replyId, answer);
  st.finishAssistantMessage(replyId, { status: 'done', elapsedMs: 12 });
  return replyId;
}

type SavedBatch = {
  sessionId: string;
  batch: { upserts: { id: string; content: string; status?: string }[]; deletes: string[] };
};

function savedBatches(): SavedBatch[] {
  return mockAIChatSaveMessages.mock.calls.map((call) => ({
    sessionId: call[0] as string,
    batch: call[1] as SavedBatch['batch'],
  }));
}

/** 所有批次里写过的消息（终态是立即落盘的，一条消息可能分在几批里） */
function allSavedUpserts() {
  return savedBatches().flatMap((b) => b.batch.upserts);
}

describe('pure helpers', () => {
  it('derives a single-line title capped at 30 characters', () => {
    expect(deriveTitle('  统计 每天\n的订单量  ')).toBe('统计 每天 的订单量');
    expect(deriveTitle('x'.repeat(40))).toBe(`${'x'.repeat(30)}…`);
    expect(deriveTitle('中文'.repeat(20))).toBe(`${'中文'.repeat(15)}…`);
    expect(deriveTitle('')).toBe('');
  });

  it('round-trips messages and turns unfinished streams into stopped ones', () => {
    const stored = toStoredMessage({
      id: 'a1',
      role: 'assistant',
      content: 'hi',
      status: 'done',
      elapsedMs: 12.4,
    });
    expect(stored).toEqual({
      id: 'a1',
      role: 'assistant',
      content: 'hi',
      status: 'done',
      elapsed_ms: 12,
    });

    expect(
      fromStoredMessage({ id: 'a2', role: 'assistant', content: '部分', status: 'streaming' })
    ).toEqual({ id: 'a2', role: 'assistant', content: '部分', status: 'stopped' });
    expect(
      fromStoredMessage({
        id: 'u1',
        role: 'user',
        content: 'q',
        attached_sql: 'select 1',
        elapsed_ms: 0,
      })
    ).toEqual({ id: 'u1', role: 'user', content: 'q', attachedSql: 'select 1', elapsedMs: 0 });
    // 未知 role / 状态不透传
    expect(
      fromStoredMessage({ id: 'x', role: 'system', content: '', status: 'weird' } as never)
    ).toEqual({
      id: 'x',
      role: 'user',
      content: '',
    });
  });

  it('parses nanosecond timestamps and survives garbage', () => {
    const s = toSessionSummary({
      ...SESSION_1,
      updated_at: '2026-11-25T03:07:18.123456789Z',
      title: '标题',
      connection_id: 'conn-9',
    });
    expect(s.updatedAt).toBe(Date.parse('2026-11-25T03:07:18.123Z'));
    expect(s.title).toBe('标题');
    expect(s.connectionId).toBe('conn-9');
    expect(toSessionSummary({ ...SESSION_1, updated_at: 'not-a-date' }).updatedAt).toBe(0);
  });

  it('serializes and parses the context defensively', () => {
    const ctx = { connectionId: 'c', databases: ['a'], tables: { a: ['t1'] } };
    expect(parseContext(serializeContext(ctx))).toEqual(ctx);
    expect(parseContext('')).toBeNull();
    expect(parseContext('{broken')).toBeNull();
    expect(parseContext('{"databases":"nope","tables":{"a":"nope"}}')).toEqual({
      connectionId: null,
      databases: [],
      tables: {},
    });
  });

  it('formats relative time', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(formatRelativeTime(now - 10_000, t)).toBe('common.aiChat.timeJustNow');
    expect(formatRelativeTime(now - 5 * 60_000, t)).toBe('common.aiChat.timeMinutesAgo:5');
    expect(formatRelativeTime(now - 3 * 3_600_000, t)).toBe('common.aiChat.timeHoursAgo:3');
    expect(formatRelativeTime(now - 2 * 86_400_000, t)).toBe('common.aiChat.timeDaysAgo:2');
    expect(formatRelativeTime(0, t)).toBe('');
  });
});

describe('automatic persistence', () => {
  it('creates a session on the first user message and saves the finished turn into it', async () => {
    const st = useAIChatStore.getState();
    st.setConnection('conn-1');
    st.setSelectedDatabases(['shop']);
    completeTurn('统计每天的订单量', '好的，这是统计 SQL');

    await flushAIChatHistory();

    expect(mockAIChatCreateSession).toHaveBeenCalledTimes(1);
    const [title, connectionId, contextJson] = mockAIChatCreateSession.mock.calls[0];
    expect(title).toBe('统计每天的订单量');
    expect(connectionId).toBe('conn-1');
    expect(JSON.parse(contextJson)).toEqual({
      connection_id: 'conn-1',
      databases: ['shop'],
      tables: {},
    });

    expect(savedBatches().every((b) => b.sessionId === 'session-1')).toBe(true);
    expect(allSavedUpserts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: '统计每天的订单量',
          attached_sql: 'select 1',
        }),
        expect.objectContaining({ content: '好的，这是统计 SQL', status: 'done', elapsed_ms: 12 }),
      ])
    );
    expect(useAIChatStore.getState().sessionId).toBe('session-1');
    expect(useAIChatStore.getState().sessions.map((s) => s.id)).toEqual(['session-1']);
  });

  it('checkpoints a streaming reply while it is in progress', async () => {
    const st = useAIChatStore.getState();
    st.addUserMessage('问', '');
    const replyId = st.startAssistantMessage();
    st.appendAssistantChunk(replyId, '第一段');

    // 占位回复走延迟合并：500ms 后第一次落盘
    await vi.advanceTimersByTimeAsync(600);
    expect(mockAIChatSaveMessages).toHaveBeenCalled();
    expect(savedBatches().at(-1)?.batch.upserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: replyId, content: '第一段', status: 'streaming' }),
      ])
    );

    // 流式期间每 2 秒存一次档
    st.appendAssistantChunk(replyId, '第二段');
    await vi.advanceTimersByTimeAsync(2000);
    expect(savedBatches().at(-1)?.batch.upserts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: replyId, content: '第一段第二段' })])
    );

    // 落终态后不再存档
    st.finishAssistantMessage(replyId, { status: 'done', elapsedMs: 5 });
    await flushAIChatHistory();
    const calls = mockAIChatSaveMessages.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockAIChatSaveMessages.mock.calls.length).toBe(calls);
  });

  it('never creates a session for an empty conversation', async () => {
    useAIChatStore.getState().setConnection('conn-1');
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockAIChatCreateSession).not.toHaveBeenCalled();
    expect(mockAIChatSaveMessages).not.toHaveBeenCalled();
  });

  it('keeps conversations apart: a new chat gets its own session', async () => {
    completeTurn('第一轮', '答一');
    await flushAIChatHistory();
    await startNewAIChat();
    expect(useAIChatStore.getState().sessionId).toBeNull();
    expect(useAIChatStore.getState().messages).toEqual([]);

    mockAIChatCreateSession.mockResolvedValue({ ...SESSION_1, id: 'session-2' });
    completeTurn('第二轮', '答二');
    await flushAIChatHistory();

    expect(mockAIChatCreateSession).toHaveBeenCalledTimes(2);
    expect(mockAIChatCreateSession.mock.calls[1][0]).toBe('第二轮');
    expect(useAIChatStore.getState().sessionId).toBe('session-2');
    expect(savedBatches().at(-1)?.sessionId).toBe('session-2');
  });

  it('regenerate deletes the old reply and appends the new one', async () => {
    const first = completeTurn('问', '旧答案');
    const st = useAIChatStore.getState();
    st.removeMessage(first);
    const second = st.startAssistantMessage();
    st.finishAssistantMessage(second, { status: 'done', elapsedMs: 3 });
    await flushAIChatHistory();

    const batches = savedBatches();
    expect(batches.some((b) => b.batch.deletes.includes(first))).toBe(true);
    const last = batches.at(-1);
    expect(last?.batch.upserts.map((u) => u.id)).toEqual([second]);
  });

  it('retries a failed write, then gives up without touching the conversation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAIChatSaveMessages.mockRejectedValue(new Error('disk full'));
    completeTurn('问', '答');

    // 第一批先要建会话，重试间隔 200ms + 400ms（输入区的延迟合并也占 500ms）
    await vi.advanceTimersByTimeAsync(3000);
    await flushAIChatHistory();

    // 用户消息与最终回复分两批写入，各自重试到 3 次后放弃
    expect(mockAIChatSaveMessages).toHaveBeenCalledTimes(6);
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(useAIChatStore.getState().messages).toHaveLength(2);
  });

  it('gives up without a session when creation keeps failing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAIChatCreateSession.mockRejectedValue(new Error('locked'));
    completeTurn('问', '答');

    // 提问和回复分两批，每批建会话都重试到 3 次（间隔 200ms + 400ms）
    await vi.advanceTimersByTimeAsync(3000);
    await flushAIChatHistory();

    expect(mockAIChatCreateSession).toHaveBeenCalledTimes(6);
    expect(useAIChatStore.getState().sessionId).toBeNull();
    expect(mockAIChatSaveMessages).not.toHaveBeenCalled();
  });

  it('retries a failed session creation instead of dropping the question', async () => {
    mockAIChatCreateSession.mockRejectedValueOnce(new Error('locked'));
    completeTurn('问', '答');

    await vi.advanceTimersByTimeAsync(3000);
    await flushAIChatHistory();

    // 提问没有丢：重试建会话成功后照常写进去
    expect(mockAIChatCreateSession).toHaveBeenCalledTimes(2);
    expect(useAIChatStore.getState().sessionId).toBe('session-1');
    expect(allSavedUpserts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '问' }),
        expect.objectContaining({ role: 'assistant', content: '答', status: 'done' }),
      ])
    );
  });

  it('a removed placeholder reply is not written back by its queued snapshot', async () => {
    const st = useAIChatStore.getState();
    st.addUserMessage('问', '');
    const replyId = st.startAssistantMessage(); // 占位回复：延迟 500ms 合并，此刻还在队列里
    st.removeMessage(replyId); // 整理上下文期间点了停止

    await flushAIChatHistory();

    // 后端对同一批先删后插：这一批里不能再带这条占位的插入
    const last = savedBatches().at(-1);
    expect(last?.batch.deletes).toContain(replyId);
    expect(allSavedUpserts().map((u) => u.id)).not.toContain(replyId);
  });

  it('writes context changes back to the current session (debounced)', async () => {
    useAIChatStore.setState({ sessionId: 'session-1', sessions: [summary()] });
    useAIChatStore.getState().setSelectedDatabases(['new-db']);

    await vi.advanceTimersByTimeAsync(300);
    expect(mockAIChatUpdateSessionContext).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    // 当前对话没有选连接：上下文里记的是 null（列表项上的 conn-1 只是历史元数据）
    expect(mockAIChatUpdateSessionContext).toHaveBeenCalledWith(
      'session-1',
      null,
      expect.any(String)
    );
    expect(JSON.parse(mockAIChatUpdateSessionContext.mock.calls[0][2]).databases).toEqual([
      'new-db',
    ]);
    expect(useAIChatStore.getState().sessions[0].contextJson).toContain('new-db');
  });

  it('saving the context does not move the session to the top of the list', async () => {
    useAIChatStore.setState({
      sessionId: 'session-1',
      sessions: [summary({ id: 'session-2', title: '更新的对话', updatedAt: 9000 }), summary()],
    });
    useAIChatStore.getState().setSelectedDatabases(['new-db']);

    await vi.advanceTimersByTimeAsync(700);

    const sessions = useAIChatStore.getState().sessions;
    expect(sessions.map((s) => s.id)).toEqual(['session-2', 'session-1']);
    expect(sessions[1].updatedAt).toBe(2000);
    expect(sessions[1].contextJson).toContain('new-db');
  });
});

describe('history operations', () => {
  it('loads the session list', async () => {
    mockAIChatListSessions.mockResolvedValue([
      { ...SESSION_1, id: 'a', updated_at: '2026-11-25T03:07:18.100000000Z' },
      { ...SESSION_1, id: 'b', updated_at: '2026-11-25T03:07:18.900000000Z' },
      null as unknown as typeof SESSION_1,
    ]);
    mockAIChatListSessions.mockResolvedValue([
      { ...SESSION_1, id: 'a', updated_at: '2026-11-25T03:07:18.100000000Z' },
      { ...SESSION_1, id: 'b', updated_at: '2026-11-25T03:07:18.900000000Z' },
    ]);
    await refreshAIChatSessions();
    expect(useAIChatStore.getState().sessions.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('resume restores messages and the saved context without writing the context back', async () => {
    completeTurn('现在的对话', '答');
    await flushAIChatHistory();
    useAIChatStore.getState().upsertSession(summary());
    mockAIChatGetMessages.mockResolvedValue([
      { id: 'u1', role: 'user', content: '历史提问', attached_sql: 'select 2' },
      { id: 'a1', role: 'assistant', content: '历史回答', status: 'streaming' },
    ]);

    await resumeAIChatSession('session-1');
    const s = useAIChatStore.getState();
    expect(s.sessionId).toBe('session-1');
    expect(s.messages).toEqual([
      { id: 'u1', role: 'user', content: '历史提问', attachedSql: 'select 2' },
      { id: 'a1', role: 'assistant', content: '历史回答', status: 'stopped' },
    ]);
    expect(s.connectionId).toBe('conn-1');
    expect(s.selectedDatabases).toEqual(['old']);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockAIChatUpdateSessionContext).not.toHaveBeenCalled();
  });

  it('deleting the current session returns the panel to a new chat', async () => {
    useAIChatStore.setState({ sessionId: 'session-1', sessions: [summary()] });
    completeTurn('问', '答');
    await flushAIChatHistory();

    await deleteAIChatSession('session-1');

    expect(mockAIChatDeleteSession).toHaveBeenCalledWith('session-1');
    const s = useAIChatStore.getState();
    expect(s.sessionId).toBeNull();
    expect(s.messages).toEqual([]);
    expect(s.sessions).toEqual([]);
  });

  it('deleting another session leaves the current conversation alone', async () => {
    useAIChatStore.setState({
      sessionId: 'session-1',
      sessions: [summary(), summary({ id: 'session-2' })],
      messages: [{ id: 'm1', role: 'user', content: 'x' }],
    });
    await deleteAIChatSession('session-2');
    expect(useAIChatStore.getState().sessionId).toBe('session-1');
    expect(useAIChatStore.getState().messages).toHaveLength(1);
    expect(useAIChatStore.getState().sessions.map((s) => s.id)).toEqual(['session-1']);
  });

  it('rename updates the title in place and does not touch the context', async () => {
    useAIChatStore.setState({ sessionId: 'session-1', sessions: [summary()] });
    await renameAIChatSession('session-1', '  新名字  ');
    expect(mockAIChatRenameSession).toHaveBeenCalledWith('session-1', '新名字');
    expect(useAIChatStore.getState().sessions[0]).toMatchObject({
      title: '新名字',
      updatedAt: 2000,
    });
    expect(mockAIChatUpdateSessionContext).not.toHaveBeenCalled();
  });

  it('clearing history wipes the list and the panel', async () => {
    useAIChatStore.setState({ sessionId: 'session-1', sessions: [summary()] });
    completeTurn('问', '答');
    await flushAIChatHistory();

    await clearAIChatHistory();

    expect(mockAIChatDeleteAllSessions).toHaveBeenCalledTimes(1);
    expect(useAIChatStore.getState().sessions).toEqual([]);
    expect(useAIChatStore.getState().messages).toEqual([]);
    expect(useAIChatStore.getState().sessionId).toBeNull();
  });

  it('propagates operation failures to the caller', async () => {
    mockAIChatGetMessages.mockRejectedValue(new Error('read failed'));
    await expect(resumeAIChatSession('session-1')).rejects.toThrow('read failed');
    mockAIChatRenameSession.mockRejectedValue(new Error('nope'));
    await expect(renameAIChatSession('session-1', 'x')).rejects.toThrow('nope');
  });
});
