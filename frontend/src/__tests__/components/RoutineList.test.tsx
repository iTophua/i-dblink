/**
 * 对象页里的过程 / 函数 / 触发器 / 序列列表（树上选中对应目录时显示）。
 *
 * 详情侧栏默认关着（和表列表一致）：单击一行只是选中，双击一行才打开它的定义；
 * 右上角的按钮开关侧栏并记住选择。过程 / 函数的定义按名字另取，触发器的定义随列表
 * 一起来，序列只有属性
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import type { RoutineKind } from '../../types/api';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }) };
});

// 定义视图（语法高亮）不在被测范围内：这里只要能看到传进去的文本
vi.mock('../../components/DDLViewer', () => ({
  DDLViewer: ({ ddl }: { ddl: string }) => <pre data-testid="ddl">{ddl}</pre>,
}));

import {
  mockGetFunctions,
  mockGetFunctionBody,
  mockGetProcedures,
  mockGetProcedureBody,
  mockGetSequences,
  mockGetTriggers,
} from '../setupTests';
import { RoutineList } from '../../components/RoutineList';

const SHOW_DETAIL_KEY = 'routinelist-show-detail';
const SEARCH_PLACEHOLDER = 'common.routineList.search';
const SELECT_HINT = 'common.routineList.selectHint';

const renderList = (kind: RoutineKind) =>
  render(
    <AntdApp>
      <RoutineList connectionId="c1" database="postgres" kind={kind} />
    </AntdApp>
  );

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
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

beforeEach(() => {
  localStorage.removeItem(SHOW_DETAIL_KEY);
  vi.mocked(navigator.clipboard.writeText).mockClear();
  for (const mock of [mockGetProcedures, mockGetFunctions, mockGetTriggers, mockGetSequences]) {
    mock.mockReset().mockResolvedValue([]);
  }
  mockGetProcedureBody.mockReset().mockResolvedValue('');
  mockGetFunctionBody.mockReset().mockResolvedValue('');
});

describe('RoutineList', () => {
  it.each([
    [
      'procedure',
      'sp_a',
      'CREATE OR REPLACE PROCEDURE sp_a() LANGUAGE SQL AS $$ INSERT INTO t VALUES (1) $$',
    ],
    [
      'function',
      'fn_a',
      'CREATE OR REPLACE FUNCTION fn_a(x INT) RETURNS INT LANGUAGE SQL AS $$ SELECT x + 1 $$',
    ],
  ] as const)('%s：列出名字，双击一行打开它的定义', async (kind, name, definition) => {
    mockGetProcedures.mockResolvedValue([name, 'zz_other']);
    mockGetFunctions.mockResolvedValue([name, 'zz_other']);
    mockGetProcedureBody.mockResolvedValue(definition);
    mockGetFunctionBody.mockResolvedValue(definition);
    renderList(kind);

    const row = (await screen.findByText(name)).closest('[data-routine-name]');
    expect(screen.getByText('zz_other')).toBeInTheDocument();
    // 侧栏默认关着：没有提示，也没有白发请求
    expect(screen.queryByText(SELECT_HINT)).toBeNull();
    expect(mockGetProcedureBody).not.toHaveBeenCalled();
    expect(mockGetFunctionBody).not.toHaveBeenCalled();

    // 单击只是选中
    fireEvent.click(screen.getByText(name));
    expect(row).toHaveClass('is-selected');
    expect(screen.queryByTestId('ddl')).toBeNull();
    expect(mockGetProcedureBody).not.toHaveBeenCalled();

    fireEvent.doubleClick(screen.getByText(name));

    expect(await screen.findByTestId('ddl')).toHaveTextContent(definition);
    const bodyRequest = kind === 'procedure' ? mockGetProcedureBody : mockGetFunctionBody;
    expect(bodyRequest).toHaveBeenCalledWith('c1', name, 'postgres');
    // 列表里一行、侧栏标题里一处
    expect(screen.getAllByText(name)).toHaveLength(2);
  });

  it('触发器：列表里带着定义，不用再请求；所在的表一起列出', async () => {
    mockGetTriggers.mockResolvedValue([
      {
        name: 'set_updated_at',
        table_name: 'orders',
        event_manipulation: 'UPDATE',
        action_timing: 'BEFORE',
        definition: 'CREATE TRIGGER set_updated_at BEFORE UPDATE ON orders',
      },
      { name: 'ts_insert_blocker', table_name: 'metrics' },
    ]);
    renderList('trigger');

    expect(await screen.findByText('set_updated_at')).toBeInTheDocument();
    // 各库的字段名不一样（table / table_name），都认
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.getByText('metrics')).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByText('set_updated_at'));

    expect(await screen.findByTestId('ddl')).toHaveTextContent('CREATE TRIGGER set_updated_at');
    expect(mockGetProcedureBody).not.toHaveBeenCalled();
    expect(screen.getAllByText('common.routineList.table')).toHaveLength(2);
    expect(screen.getAllByText('BEFORE')).toHaveLength(2);
  });

  it('序列：列出属性，双击一行打开全部属性', async () => {
    mockGetSequences.mockResolvedValue([
      {
        sequence_name: 'public.orders_id_seq',
        data_type: 'bigint',
        start_value: '1',
        minimum_value: '1',
        maximum_value: '9223372036854775807',
        increment: '1',
        cycle_option: 'NO',
      },
    ]);
    renderList('sequence');

    const name = await screen.findByText('public.orders_id_seq');
    const row = name.closest('[data-routine-name]');
    expect(row).toHaveTextContent('bigint');
    expect(row).toHaveTextContent('9223372036854775807');
    expect(screen.queryByText(SELECT_HINT)).toBeNull();

    fireEvent.doubleClick(name);

    // 行里一份、侧栏的属性里一份
    expect(await screen.findAllByText('9223372036854775807')).toHaveLength(2);
    expect(screen.getAllByText('common.routineList.cycle')).toHaveLength(2);
    expect(screen.getAllByText('common.dataType')).toHaveLength(2);
  });

  it('按名字过滤；没有匹配时给提示', async () => {
    mockGetProcedures.mockResolvedValue(['cagg_migrate_create_plan', 'drop_chunk']);
    renderList('procedure');
    await screen.findByText('drop_chunk');

    fireEvent.change(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), {
      target: { value: 'migrate' },
    });

    expect(screen.getByText('cagg_migrate_create_plan')).toBeInTheDocument();
    expect(screen.queryByText('drop_chunk')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), {
      target: { value: 'zzz' },
    });

    expect(screen.getByText('common.routineList.noMatching')).toBeInTheDocument();
  });

  it('取不到定义：显示原因', async () => {
    mockGetProcedures.mockResolvedValue(['sp_a']);
    mockGetProcedureBody.mockRejectedValue(new Error('permission denied'));
    renderList('procedure');

    fireEvent.doubleClick(await screen.findByText('sp_a'));

    expect(await screen.findByText('common.loadFailed')).toBeInTheDocument();
    expect(screen.getByText('permission denied')).toBeInTheDocument();
  });

  it.each([
    ['procedure', 'common.noProcedures'],
    ['function', 'common.noFunctions'],
    ['trigger', 'common.noTriggers'],
    ['sequence', 'common.noSequences'],
  ] as const)('%s：列表为空时提示这一类没有东西', async (kind, emptyKey) => {
    renderList(kind);

    expect(await screen.findByText(emptyKey)).toBeInTheDocument();
  });

  it('右上角的按钮开关详情侧栏，并记住这个选择', async () => {
    mockGetProcedures.mockResolvedValue(['sp_a']);
    const first = renderList('procedure');
    await screen.findByText('sp_a');

    // 没选中时工具栏只有「复制名称」「刷新」「详情」三个按钮，详情是最后一个
    const detailButton = () => screen.getAllByRole('button')[2];

    expect(screen.queryByText(SELECT_HINT)).toBeNull();
    fireEvent.click(detailButton());
    expect(screen.getByText(SELECT_HINT)).toBeInTheDocument();
    expect(localStorage.getItem(SHOW_DETAIL_KEY)).toBe('true');

    fireEvent.click(detailButton());
    expect(screen.queryByText(SELECT_HINT)).toBeNull();
    expect(localStorage.getItem(SHOW_DETAIL_KEY)).toBe('false');

    // 开着的时候换一个列表：侧栏跟着开
    fireEvent.click(detailButton());
    first.unmount();
    renderList('function');
    expect(await screen.findByText(SELECT_HINT)).toBeInTheDocument();
  });

  it('双击一行打开的侧栏不记入偏好', async () => {
    mockGetProcedures.mockResolvedValue(['sp_a']);
    mockGetProcedureBody.mockResolvedValue('CREATE OR REPLACE PROCEDURE sp_a() LANGUAGE SQL');
    renderList('procedure');

    fireEvent.doubleClick(await screen.findByText('sp_a'));

    expect(await screen.findByTestId('ddl')).toBeInTheDocument();
    expect(localStorage.getItem(SHOW_DETAIL_KEY)).toBeNull();
  });

  it('选中一行后可以复制名字', async () => {
    mockGetProcedures.mockResolvedValue(['sp_a']);
    renderList('procedure');

    fireEvent.click(await screen.findByText('sp_a'));
    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sp_a');
  });
});
