/**
 * DataTable 行为测试：加载入口去重 / 脏状态上报 / 列布局持久化 /
 * 列宽按 id 回写 / 加载错误态与重试。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
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
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error 测试环境补齐浏览器 API
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const getColumns = vi.fn();
const executeQuery = vi.fn();
vi.mock('../../hooks/useApi', () => ({
  useDatabase: () => ({ getColumns, executeQuery }),
}));

interface CapturedGlideProps {
  columns: Array<{ id: string; width: number }>;
  hiddenColumns: Set<string>;
  onColumnResized: (col: { id: string }, width: number, index: number) => void;
}

let glideProps: CapturedGlideProps | null = null;
vi.mock('../../components/DataTable/GlideDataTable', () => ({
  GlideDataTable: (props: CapturedGlideProps) => {
    glideProps = props;
    return (
      <div data-testid="glide-grid">{props.columns.map((c) => `${c.id}:${c.width}`).join(',')}</div>
    );
  },
}));

import { DataTable } from '../../components/DataTable';

const COLUMNS = [
  { column_name: 'a', data_type: 'int', column_key: 'PRI' },
  { column_name: 'b', data_type: 'varchar', column_key: '' },
  { column_name: 'c', data_type: 'varchar', column_key: '' },
];

const baseProps = { connectionId: 'c1', tableName: 't1', database: 'db1' };

beforeEach(() => {
  cleanup();
  localStorage.clear();
  glideProps = null;
  getColumns.mockReset().mockResolvedValue(COLUMNS);
  executeQuery.mockReset().mockResolvedValue({
    columns: ['a', 'b', 'c'],
    rows: [[1, 'x', 'y']],
  });
});

describe('DataTable 行为验证', () => {
  it('挂载加载一次，新增行后上报脏状态，卸载复位', async () => {
    const onDirtyChange = vi.fn();
    const { unmount } = render(<DataTable {...baseProps} onDirtyChange={onDirtyChange} />);

    await waitFor(() => expect(screen.getByTestId('glide-grid')).toBeInTheDocument());
    const dataQueries = executeQuery.mock.calls.filter(([, sql]) => !/COUNT/i.test(sql));
    expect(dataQueries).toHaveLength(1);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    await userEvent.click(screen.getByText('common.addRowLabel'));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('从 localStorage 恢复列序 / 列宽 / 隐藏列', async () => {
    localStorage.setItem(
      'idblink:table-layout:v1:c1:db1:t1',
      JSON.stringify({ columnOrder: ['b', 'a'], colWidths: { a: 321 }, hiddenColumns: ['c'] })
    );
    render(<DataTable {...baseProps} />);
    await waitFor(() => expect(screen.getByTestId('glide-grid')).toBeInTheDocument());

    expect(glideProps!.columns.map((c) => c.id)).toEqual(['b', 'a', 'c']);
    expect(glideProps!.columns.find((c) => c.id === 'a')!.width).toBe(321);
    expect(glideProps!.hiddenColumns.has('c')).toBe(true);
  });

  it('列宽回调按列 id 回写（隐藏列导致索引错位时仍正确）', async () => {
    localStorage.setItem(
      'idblink:table-layout:v1:c1:db1:t1',
      JSON.stringify({ hiddenColumns: ['c'] })
    );
    render(<DataTable {...baseProps} />);
    await waitFor(() => expect(screen.getByTestId('glide-grid')).toBeInTheDocument());

    act(() => {
      // 可见列只有 a、b；故意传错索引，验证不按索引映射
      glideProps!.onColumnResized({ id: 'b' }, 222, 2);
    });
    await waitFor(() => {
      expect(glideProps!.columns.find((c) => c.id === 'b')!.width).toBe(222);
    });
    expect(glideProps!.columns.find((c) => c.id === 'c')!.width).not.toBe(222);
  });

  it('加载失败显示内联错误态，点重试后恢复', async () => {
    let dataCalls = 0;
    executeQuery.mockImplementation((_id: string, sql: string) => {
      if (/COUNT/i.test(sql)) {
        return Promise.resolve({ columns: ['count'], rows: [[1]] });
      }
      dataCalls += 1;
      return dataCalls === 1
        ? Promise.resolve({ columns: [], rows: [], error: 'boom' })
        : Promise.resolve({ columns: ['a', 'b', 'c'], rows: [[1, 'x', 'y']] });
    });

    render(<DataTable {...baseProps} />);
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
    expect(screen.getByText('common.failedToLoadData')).toBeInTheDocument();

    await userEvent.click(screen.getByText('common.dataGrid.retry'));
    await waitFor(() => expect(screen.queryByText('boom')).not.toBeInTheDocument());
    expect(screen.getByTestId('glide-grid')).toBeInTheDocument();
  });
});
