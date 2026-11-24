import { describe, it, expect, beforeEach } from 'vitest';
import { useAIChatStore } from '../../stores/aiChatStore';

const reset = () =>
  useAIChatStore.setState({
    panelVisible: false,
    messages: [],
    streaming: false,
    connectionId: null,
    selectedDatabases: [],
    selectedTables: {},
  });

beforeEach(reset);

describe('aiChatStore 消息流转', () => {
  it('一轮完整回复：用户消息 → 占位回复 → 追加内容 → 正常结束', () => {
    const store = useAIChatStore.getState();
    store.addUserMessage('你好', 'SELECT 1');
    const id = useAIChatStore.getState().startAssistantMessage();

    let state = useAIChatStore.getState();
    expect(state.streaming).toBe(true);
    expect(state.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(state.messages[0].attachedSql).toBe('SELECT 1');
    expect(state.messages[1]).toMatchObject({ id, status: 'streaming', content: '' });

    state.appendAssistantChunk(id, '你');
    state.appendAssistantChunk(id, '好');
    state.finishAssistantMessage(id, { status: 'done', elapsedMs: 1200 });

    state = useAIChatStore.getState();
    expect(state.streaming).toBe(false);
    expect(state.messages[1]).toMatchObject({ content: '你好', status: 'done', elapsedMs: 1200 });
  });

  it('失败与中止分别落状态，并保留失败原因', () => {
    useAIChatStore.getState().addUserMessage('问');
    const errId = useAIChatStore.getState().startAssistantMessage();
    useAIChatStore.getState().finishAssistantMessage(errId, { status: 'error', error: '超时' });
    expect(useAIChatStore.getState().messages[1]).toMatchObject({ status: 'error', error: '超时' });
    expect(useAIChatStore.getState().streaming).toBe(false);

    useAIChatStore.getState().addUserMessage('再问');
    const stopId = useAIChatStore.getState().startAssistantMessage();
    useAIChatStore.getState().appendAssistantChunk(stopId, '部分');
    useAIChatStore.getState().finishAssistantMessage(stopId, { status: 'stopped', elapsedMs: 300 });
    const last = useAIChatStore.getState().messages[3];
    expect(last).toMatchObject({ content: '部分', status: 'stopped' });
    expect(last.error).toBeUndefined();
  });

  it('重新生成：移除末尾回复后 streaming 复位，再开新流', () => {
    useAIChatStore.getState().addUserMessage('问');
    const first = useAIChatStore.getState().startAssistantMessage();
    useAIChatStore.getState().finishAssistantMessage(first, { status: 'error', error: 'x' });

    useAIChatStore.getState().removeMessage(first);
    expect(useAIChatStore.getState().messages.map((m) => m.role)).toEqual(['user']);
    expect(useAIChatStore.getState().streaming).toBe(false);

    const second = useAIChatStore.getState().startAssistantMessage();
    expect(useAIChatStore.getState().streaming).toBe(true);
    // 向已移除的旧流追加内容不会生效
    useAIChatStore.getState().appendAssistantChunk(first, 'ghost');
    expect(useAIChatStore.getState().messages[1]).toMatchObject({ id: second, content: '' });
  });

  it('流式追加只替换目标消息，其余消息保持引用不变', () => {
    useAIChatStore.getState().addUserMessage('问');
    const a = useAIChatStore.getState().startAssistantMessage();
    useAIChatStore.getState().finishAssistantMessage(a, { status: 'done' });
    useAIChatStore.getState().addUserMessage('再问');
    useAIChatStore.getState().startAssistantMessage();

    const before = useAIChatStore.getState().messages;
    useAIChatStore.getState().appendAssistantChunk(a, 'x');
    const after = useAIChatStore.getState().messages;

    // 被改写的是已结束的 a 本身；这里验证的是其余消息对象引用稳定
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
  });
});

describe('aiChatStore 上下文选择', () => {
  it('换连接清空库与表级筛选', () => {
    useAIChatStore.getState().setConnection('c1');
    useAIChatStore.getState().setSelectedDatabases(['a', 'b']);
    useAIChatStore.getState().setDatabaseTables('a', ['t1']);

    useAIChatStore.getState().setConnection('c2');
    expect(useAIChatStore.getState()).toMatchObject({
      connectionId: 'c2',
      selectedDatabases: [],
      selectedTables: {},
    });
  });

  it('表级筛选：设置、恢复整库、随库移除', () => {
    useAIChatStore.getState().setConnection('c1');
    useAIChatStore.getState().setSelectedDatabases(['a', 'b']);
    useAIChatStore.getState().setDatabaseTables('a', ['t1']);
    expect(useAIChatStore.getState().selectedTables).toEqual({ a: ['t1'] });

    useAIChatStore.getState().setDatabaseTables('a', null);
    expect(useAIChatStore.getState().selectedTables).toEqual({});

    useAIChatStore.getState().setDatabaseTables('b', ['t2']);
    useAIChatStore.getState().setSelectedDatabases(['a']);
    expect(useAIChatStore.getState().selectedTables).toEqual({});
  });

  it('清空对话同时结束流式状态', () => {
    useAIChatStore.getState().addUserMessage('问');
    useAIChatStore.getState().startAssistantMessage();
    useAIChatStore.getState().clearMessages();
    expect(useAIChatStore.getState()).toMatchObject({ messages: [], streaming: false });
  });
});
