import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from 'antd';

// 按 macOS WKWebView（WebKit）处理输入法回车：这条路径依赖 UA 判断，必须在模块加载前固定
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    configurable: true,
  });
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return {
    ...actual,
    useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }),
  };
});

vi.mock('../../services/aiService', () => ({
  streamChat: vi.fn(),
}));

import { streamChat } from '../../services/aiService';
import { mockGetAllColumns } from '../setupTests';
import { AIChatPanel } from '../../components/AIChatPanel';
import { MarkdownRenderer } from '../../components/AIChatPanel/MarkdownRenderer';
import { PanelErrorBoundary } from '../../components/AIChatPanel/PanelErrorBoundary';
import { useAIStore } from '../../stores/aiStore';
import { useAIChatStore } from '../../stores/aiChatStore';
import {
  SQL_INJECT_EVENT,
  registerSqlReader,
  readSqlFromEditor,
} from '../../utils/activeSqlRegistry';
import type { Connection } from '../../stores/appStore';

const mockStreamChat = vi.mocked(streamChat);

const connections = [
  { id: 'c1', name: '测试库', db_type: 'mysql' },
  { id: 'c2', name: '分析库', db_type: 'clickhouse' },
] as unknown as Connection[];

function renderPanel(props: Partial<React.ComponentProps<typeof AIChatPanel>> = {}) {
  const onApplySQL = vi.fn();
  render(
    <App>
      <AIChatPanel
        connections={connections}
        selectedConnectionId={null}
        connectionDatabases={{}}
        onApplySQL={onApplySQL}
        onOpenSettings={vi.fn()}
        {...props}
      />
    </App>
  );
  return { onApplySQL };
}

const typeAndSend = async (text: string) => {
  const input = await screen.findByTestId('ai-composer-input');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByTestId('ai-send'));
};

/** 等异步流程走完（发送会先 await 表结构上下文，再发起请求） */
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** 构造带指定 timeStamp 的回车按键 */
const pressEnter = (input: HTMLElement, timeStamp = performance.now()) => {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  fireEvent(input, event);
};

// jsdom 没有 matchMedia，主题 hook（DatabaseIcon / 代码块高亮）启动时会用到
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  // 输入框自适应高度依赖 ResizeObserver，jsdom 同样没有
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

beforeEach(() => {
  useAIChatStore.setState({
    panelVisible: true,
    messages: [],
    streaming: false,
    connectionId: null,
    selectedDatabases: [],
    selectedTables: {},
  });
  useAIStore.setState({
    enabled: true,
    ready: true,
    checkStatus: vi.fn(async () => undefined),
  });
  mockStreamChat.mockReset();
  mockGetAllColumns.mockReset();
});

describe('AIChatPanel 输入法与回车', () => {
  it('组字过程中的回车是「上屏」，不发送', async () => {
    renderPanel();
    const input = await screen.findByTestId('ai-composer-input');
    fireEvent.change(input, { target: { value: '你好' } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true });
    await flush();

    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(useAIChatStore.getState().messages).toHaveLength(0);
  });

  it('WebKit 先 compositionend 后触发确认候选词的 keydown，这次回车也要吞掉', async () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
    renderPanel();
    const input = await screen.findByTestId('ai-composer-input');
    fireEvent.change(input, { target: { value: '你好' } });
    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    pressEnter(input, 1050);
    await flush();

    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(useAIChatStore.getState().messages).toHaveLength(0);
    nowSpy.mockRestore();
  });

  it('候选词上屏之后的回车正常发送', async () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
    mockStreamChat.mockResolvedValue('');
    renderPanel();
    const input = await screen.findByTestId('ai-composer-input');
    fireEvent.change(input, { target: { value: '你好' } });
    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);

    nowSpy.mockReturnValue(2000);
    pressEnter(input, 2000);
    await waitFor(() => expect(mockStreamChat).toHaveBeenCalledTimes(1));
    nowSpy.mockRestore();
  });

  it('Shift+Enter 换行，不发送', async () => {
    renderPanel();
    const input = await screen.findByTestId('ai-composer-input');
    fireEvent.change(input, { target: { value: '你好' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    await flush();
    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  it('未配置 AI 时回车不发送', async () => {
    useAIStore.setState({ ready: false, enabled: false });
    renderPanel();
    await screen.findByTestId('ai-chat-not-configured');
    expect(screen.queryByTestId('ai-composer-input')).not.toBeInTheDocument();
  });
});

describe('AIChatPanel 发送流程', () => {
  it('回车发送：请求为 system + user，回复流式落库并标记完成', async () => {
    mockStreamChat.mockImplementation(async (_messages, onChunk) => {
      onChunk('你');
      onChunk('好');
      return '你好';
    });
    renderPanel();
    await typeAndSend('在吗');

    await waitFor(() => expect(useAIChatStore.getState().streaming).toBe(false));
    expect(mockStreamChat).toHaveBeenCalledTimes(1);
    const request = mockStreamChat.mock.calls[0][0];
    expect(request.map((m) => m.role)).toEqual(['system', 'user']);
    expect(request[1].content).toBe('在吗');

    const messages = useAIChatStore.getState().messages;
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1]).toMatchObject({ content: '你好', status: 'done' });
    expect(messages[1].elapsedMs).toBeGreaterThanOrEqual(0);
    // 发送后清空输入框
    expect((screen.getByTestId('ai-composer-input') as HTMLTextAreaElement).value).toBe('');
  });

  it('请求失败落错误状态，重试沿用同一条提问且不重复添加用户消息', async () => {
    mockStreamChat.mockRejectedValue(new Error('网络错误'));
    renderPanel();
    await typeAndSend('问一下');

    await waitFor(() => expect(useAIChatStore.getState().streaming).toBe(false));
    expect(useAIChatStore.getState().messages[1]).toMatchObject({
      status: 'error',
      error: '网络错误',
    });
    expect(await screen.findByTestId('ai-msg-error')).toHaveTextContent('网络错误');

    mockStreamChat.mockImplementation(async (_messages, onChunk) => {
      onChunk('答');
      return '答';
    });
    fireEvent.click(screen.getByText('common.aiChat.retry'));

    await waitFor(() => expect(useAIChatStore.getState().streaming).toBe(false));
    expect(mockStreamChat).toHaveBeenCalledTimes(2);
    const roles = useAIChatStore.getState().messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant']);
    expect(mockStreamChat.mock.calls[1][0].map((m) => m.role)).toEqual(['system', 'user']);
    expect(useAIChatStore.getState().messages[1]).toMatchObject({ content: '答', status: 'done' });
  });

  it('停止生成保留已输出部分并标记为已停止', async () => {
    mockStreamChat.mockImplementation(
      (_messages, onChunk, _onError, signal) =>
        new Promise<string>((resolve) => {
          onChunk('前半段');
          signal?.addEventListener('abort', () => resolve('前半段'));
        })
    );
    renderPanel();
    await typeAndSend('写首诗');

    // 等请求真正发出后再点停止（整理上下文阶段点停止走的是另一条分支：撤掉占位回复）
    await waitFor(() => expect(mockStreamChat).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('ai-stop'));

    await waitFor(() => expect(useAIChatStore.getState().streaming).toBe(false));
    expect(useAIChatStore.getState().messages[1]).toMatchObject({
      content: '前半段',
      status: 'stopped',
    });
    expect(screen.getByTestId('ai-msg-stopped')).toBeInTheDocument();
  });

  it('表结构上下文超出上限时不发请求，在对话里给出可操作的提示', async () => {
    const longName = (i: number) => `col_${String(i).padStart(6, '0')}_${'x'.repeat(30)}`;
    mockGetAllColumns.mockResolvedValue({
      tables: {
        huge: Array.from({ length: 6000 }, (_, i) => ({
          column_name: longName(i),
          data_type: 'varchar(255)',
          is_nullable: 'YES',
        })),
      },
    });
    useAIChatStore.setState({ connectionId: 'c1', selectedDatabases: ['huge'] });
    renderPanel();
    await typeAndSend('查点数据');

    await waitFor(() => expect(useAIChatStore.getState().streaming).toBe(false));
    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(useAIChatStore.getState().messages[1]).toMatchObject({
      status: 'error',
      error: 'common.aiChat.contextTooLarge',
    });
  });
});

describe('AIChatPanel 引用当前 SQL', () => {
  const sql = 'SELECT id FROM t_user';

  it('点「引用 SQL」后随消息一起发送，并清空引用', async () => {
    mockStreamChat.mockResolvedValue('');
    renderPanel({ getActiveSql: () => ({ sql, selection: '' }) });
    const attach = await screen.findByTestId('ai-attach-sql');
    fireEvent.click(attach);
    expect(screen.getByTestId('ai-composer-attach')).toBeInTheDocument();

    await typeAndSend('解释一下');

    const request = mockStreamChat.mock.calls[0][0];
    expect(request[1].content).toContain(sql);
    expect(useAIChatStore.getState().messages[0].attachedSql).toBe(sql);
    expect(screen.queryByTestId('ai-composer-attach')).not.toBeInTheDocument();
  });

  it('空态的「解释 SQL」直接带上当前 SQL 发问', async () => {
    mockStreamChat.mockResolvedValue('');
    renderPanel({ getActiveSql: () => ({ sql, selection: 'SELECT id' }) });
    await screen.findByTestId('ai-quick-explain');

    fireEvent.click(
      screen.getByTestId('ai-quick-explain').querySelector('button') as HTMLButtonElement
    );

    await waitFor(() => expect(mockStreamChat).toHaveBeenCalledTimes(1));
    // 有选区时只引用选区
    expect(useAIChatStore.getState().messages[0].attachedSql).toBe('SELECT id');
  });
});

describe('AIChatPanel 上下文跟随与 SQL 写回', () => {
  it('面板打开时跟随连接树选中的连接，并默认勾选其已加载的库', async () => {
    renderPanel({
      selectedConnectionId: 'c2',
      connectionDatabases: {
        c2: [
          { database: 'ems', loaded: true },
          { database: 'sys', loaded: false },
        ],
      },
    });
    await screen.findByTestId('ai-composer-input');
    expect(useAIChatStore.getState()).toMatchObject({
      connectionId: 'c2',
      selectedDatabases: ['ems'],
    });
  });

  it('SQL 代码块提供「插入 / 替换」两个动作并带回写入方式', async () => {
    const onApplySQL = vi.fn();
    render(
      <App>
        <MarkdownRenderer
          content={'```sql\nSELECT 1\n```'}
          onApplySQL={onApplySQL}
          sqlApplyModes={['append', 'replace']}
        />
      </App>
    );
    fireEvent.click(screen.getByText('common.aiChat.replace'));
    fireEvent.click(screen.getByText('common.aiChat.insert'));
    expect(onApplySQL.mock.calls).toEqual([
      ['SELECT 1', 'replace'],
      ['SELECT 1', 'append'],
    ]);
  });

  it('行内代码不渲染成代码块，表格包在可横向滚动的容器里', () => {
    const { container } = render(
      <MarkdownRenderer content={'看 `t_order` 表：\n\n| a | b |\n|---|---|\n| 1 | 2 |'} />
    );
    expect(container.querySelector('[data-testid="ai-code-block"]')).toBeNull();
    expect(container.querySelector('.ai-md-code')).toHaveTextContent('t_order');
    expect(container.querySelector('.ai-md-table-wrap table')).toBeInTheDocument();
  });
});

describe('activeSqlRegistry 与编辑器写入', () => {
  it('按 tabKey 登记与读取当前 SQL，注销后读不到', () => {
    const unregister = registerSqlReader('sql-a', () => ({ sql: 'SELECT 1', selection: '' }));
    expect(readSqlFromEditor('sql-a')).toEqual({ sql: 'SELECT 1', selection: '' });
    expect(readSqlFromEditor('sql-b')).toBeNull();
    unregister();
    expect(readSqlFromEditor('sql-a')).toBeNull();
  });

  it('ai-sql-inject 事件携带目标 tabKey', () => {
    const listener = vi.fn();
    window.addEventListener(SQL_INJECT_EVENT, listener);
    window.dispatchEvent(
      new CustomEvent(SQL_INJECT_EVENT, {
        detail: { mode: 'replace', sql: 'SELECT 2', tabKey: 'sql-a' },
      })
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      mode: 'replace',
      sql: 'SELECT 2',
      tabKey: 'sql-a',
    });
    window.removeEventListener(SQL_INJECT_EVENT, listener);
  });
});

describe('PanelErrorBoundary', () => {
  it('子树渲染出错时显示兜底界面，重新加载后恢复', async () => {
    let shouldThrow = true;
    const Broken = () => {
      if (shouldThrow) throw new Error('渲染炸了');
      return <div data-testid="recovered">恢复了</div>;
    };
    // React 会把渲染错误打到 console.error，这里静音避免干扰测试输出
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <PanelErrorBoundary>
        <Broken />
      </PanelErrorBoundary>
    );

    expect(screen.getByTestId('ai-chat-error-boundary')).toHaveTextContent('渲染炸了');

    shouldThrow = false;
    await act(async () => {
      fireEvent.click(screen.getByText('common.aiChat.reloadPanel'));
    });

    expect(screen.getByTestId('recovered')).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});
