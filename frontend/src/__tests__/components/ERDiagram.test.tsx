import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }) };
});

import { mockGetERDiagram } from '../setupTests';
import { ERDiagram } from '../../components/ERDiagram';
import { useAIChatStore } from '../../stores/aiChatStore';
import type { ERDiagram as ERDiagramData } from '../../types/api';

const sample: ERDiagramData = {
  tables: [
    {
      id: 'user',
      name: 'user',
      comment: '用户表',
      columns: [
        { name: 'id', data_type: 'bigint', nullable: false, is_pk: true },
        { name: 'org_id', data_type: 'bigint', nullable: false, is_pk: false },
        { name: 'name', data_type: 'varchar(64)', nullable: false, is_pk: false },
      ],
    },
    {
      id: 'org',
      name: 'org',
      comment: '',
      columns: [
        { name: 'id', data_type: 'bigint', nullable: false, is_pk: true },
        { name: 'code', data_type: 'varchar(32)', nullable: true, is_pk: false },
      ],
    },
  ],
  edges: [
    {
      name: 'fk_user_org',
      from_table: 'user',
      from_column: 'org_id',
      to_table: 'org',
      to_column: 'id',
      seq: 1,
    },
  ],
};

function renderDiagram(props: Partial<React.ComponentProps<typeof ERDiagram>> = {}) {
  render(
    <App>
      <ERDiagram connectionId="c1" connectionName="测试库" database="shop" {...props} />
    </App>
  );
}

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
  // React Flow 靠 ResizeObserver 量画布尺寸
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
  mockGetERDiagram.mockReset();
  useAIChatStore.setState({
    panelVisible: false,
    connectionId: null,
    selectedDatabases: [],
    selectedTables: {},
    contextSyncHoldUntil: 0,
  });
});

describe('ERDiagram', () => {
  it('加载后画出表节点、主键 / 外键标记和统计', async () => {
    mockGetERDiagram.mockResolvedValue(sample);
    renderDiagram();

    expect(await screen.findByTestId('er-table-user')).toBeInTheDocument();
    expect(screen.getByTestId('er-table-org')).toBeInTheDocument();
    expect(
      screen.getByText('2 common.erDiagram.tableCount · 1 common.erDiagram.relationshipCount')
    ).toBeInTheDocument();

    const user = screen.getByTestId('er-table-user');
    // 紧凑模式：主键 + 外键列各一行，其余折叠成「+1 列」
    expect(user.querySelectorAll('.er-row.is-pk')).toHaveLength(1);
    expect(user.querySelectorAll('.er-badge.is-fk')).toHaveLength(1);
    expect(user).toHaveTextContent('+1 common.erDiagram.columns');
    // org 只有主键是关键列，code 同样被折叠
    expect(screen.getByTestId('er-table-org')).toHaveTextContent('+1 common.erDiagram.columns');
    // 表注释放在表头的悬停提示里
    expect(user.querySelector('.er-table-header')).toHaveAttribute('title', '用户表');
  });

  it('切到全部列后折叠行消失', async () => {
    mockGetERDiagram.mockResolvedValue(sample);
    renderDiagram();
    await screen.findByTestId('er-table-user');

    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() =>
      expect(screen.queryByText('+1 common.erDiagram.columns')).not.toBeInTheDocument()
    );
    expect(screen.getByTestId('er-table-user').querySelectorAll('.er-row')).toHaveLength(3);
  });

  it('点表出现操作条；「发给 AI 助手」把选中的表和关联表设为上下文并打开面板', async () => {
    mockGetERDiagram.mockResolvedValue(sample);
    const onOpenTable = vi.fn();
    renderDiagram({ onOpenTable });
    await screen.findByTestId('er-table-user');

    fireEvent.click(screen.getByTestId('er-table-org'));
    const selection = await screen.findByTestId('er-selection');
    expect(selection).toHaveTextContent('org');

    // 关联表变淡：user 与 org 直接相连，不该被淡出
    expect(screen.getByTestId('er-table-user')).not.toHaveClass('is-dimmed');

    fireEvent.click(screen.getByTestId('er-ask-ai'));
    await waitFor(() => expect(useAIChatStore.getState().panelVisible).toBe(true));
    const store = useAIChatStore.getState();
    expect(store.connectionId).toBe('c1');
    expect(store.selectedDatabases).toEqual(['shop']);
    expect([...(store.selectedTables.shop ?? [])].sort()).toEqual(['org', 'user']);
    expect(store.contextSyncHoldUntil).toBeGreaterThan(Date.now());
    expect(store.messages).toEqual([]);

    fireEvent.click(screen.getByText('common.erDiagram.openTable'));
    expect(onOpenTable).toHaveBeenCalledWith('org');
  });

  it('加载失败给出错误与重试入口，重试成功后出图', async () => {
    mockGetERDiagram.mockRejectedValueOnce(new Error('connection refused'));
    renderDiagram();

    expect(await screen.findByTestId('er-error')).toHaveTextContent('connection refused');
    expect(screen.getByTestId('er-error')).toHaveTextContent('common.erDiagram.loadFailed');

    mockGetERDiagram.mockResolvedValue(sample);
    await act(async () => {
      fireEvent.click(screen.getByText('common.erDiagram.reload'));
    });
    expect(await screen.findByTestId('er-table-user')).toBeInTheDocument();
    expect(screen.queryByTestId('er-error')).not.toBeInTheDocument();
  });

  it('库里没有表时显示空态，不渲染画布', async () => {
    mockGetERDiagram.mockResolvedValue({ tables: [], edges: [] });
    renderDiagram();
    expect(await screen.findByTestId('er-empty')).toHaveTextContent('common.erDiagram.empty');
    expect(document.querySelector('.er-flow')).not.toBeInTheDocument();
  });

  it('通用路径的库在工具栏上标出「逐表读取中」', async () => {
    mockGetERDiagram.mockResolvedValue({ ...sample, slow_path: true, warnings: ['t1: boom'] });
    renderDiagram();
    expect(await screen.findByText('common.erDiagram.slowPath')).toBeInTheDocument();
  });
});
