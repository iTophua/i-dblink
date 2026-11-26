import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }) };
});

import { mockCompareTableData, mockGetDatabases, mockGetTablesCategorized } from '../setupTests';
import { DataCompareDialog } from '../../components/DataCompareDialog';
import {
  buildCompareRequest,
  cellText,
  splitKeyColumns,
} from '../../components/DataCompareDialog/helpers';
import type { DataCompareResult } from '../../types/api';
import type { Connection } from '../../stores/appStore';

const connections = [
  { id: 'c1', name: '主库', db_type: 'mysql', status: 'connected' },
  { id: 'c2', name: '备库', db_type: 'postgresql', status: 'connected' },
  { id: 'c3', name: '离线库', db_type: 'mysql', status: 'disconnected' },
] as unknown as Connection[];

const sample: DataCompareResult = {
  key_columns: ['id'],
  compare_columns: ['name', 'amount'],
  source_only_columns: [],
  target_only_columns: ['legacy'],
  source_rows: 10,
  target_rows: 11,
  same_count: 7,
  modified_count: 2,
  source_only_count: 1,
  target_only_count: 2,
  truncated: false,
  warnings: [],
  modified: [
    {
      key: { id: { is_null: false, value: '2' } },
      changes: [
        {
          column: 'name',
          source: { is_null: false, value: 'new' },
          target: { is_null: false, value: 'old' },
        },
        {
          column: 'note',
          source: { is_null: false, value: 'x' },
          target: { is_null: true, value: '' },
        },
      ],
    },
  ],
  source_only: [
    {
      key: { id: { is_null: false, value: '4' } },
      row: { name: { is_null: false, value: 'D' }, amount: { is_null: false, value: '7.25' } },
    },
  ],
  target_only: [{ key: { id: { is_null: false, value: '3' } } }],
  sql: "-- sync\nUPDATE `t` SET `name` = 'new' WHERE `id` = 2;\n",
  sql_counts: { update: 2, insert: 1, delete: 2 },
  sql_truncated: false,
};

/** 在 antd Select 里选一项：先展开，再点下拉里的选项 */
async function pick(testId: string, label: string) {
  // antd 6 的 Select：data-testid 落在 .ant-select 根节点上，展开要按它里面的 combobox 输入框
  const root = screen.getByTestId(testId);
  fireEvent.mouseDown(root.querySelector('input[role="combobox"]') ?? root);
  // 下拉里同一项会渲染两份（可见列表 + 无障碍用的隐藏列表），点最后一份即可
  const options = await screen.findAllByText(label, {
    selector: '.ant-select-item-option-content',
  });
  await act(async () => {
    fireEvent.click(options[options.length - 1]);
  });
}

function renderDialog(props: Partial<React.ComponentProps<typeof DataCompareDialog>> = {}) {
  const onClose = vi.fn();
  const onOpenSql = vi.fn();
  render(
    <App>
      <DataCompareDialog
        open
        onClose={onClose}
        connections={connections}
        onOpenSql={onOpenSql}
        {...props}
      />
    </App>
  );
  return { onClose, onOpenSql };
}

beforeAll(() => {
  // antd Table 的响应式监听用 matchMedia，jsdom 里同样没有
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
  // antd Select 的虚拟列表依赖 ResizeObserver，jsdom 里没有
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
  mockGetDatabases
    .mockReset()
    .mockImplementation(async (id: string) => (id === 'c1' ? ['prod', 'test'] : ['other']));
  mockGetTablesCategorized.mockReset().mockResolvedValue({
    tables: [
      { table_name: 'orders', table_type: 'BASE TABLE' },
      { table_name: 'users', table_type: 'BASE TABLE' },
    ],
    views: [],
  });
  mockCompareTableData.mockReset().mockResolvedValue(sample);
});

describe('data compare helpers', () => {
  it('splits the key column input on commas, Chinese commas and whitespace', () => {
    expect(splitKeyColumns('a, b，c  d')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitKeyColumns('  ')).toEqual([]);
  });

  it('renders NULL for null cells', () => {
    expect(cellText(undefined)).toBe('NULL');
    expect(cellText({ is_null: true, value: '' })).toBe('NULL');
    expect(cellText({ is_null: false, value: '0' })).toBe('0');
  });

  it('builds the request only when both tables are chosen', () => {
    const base = {
      keyColumns: ' a,b ',
      maxRows: 5000,
      maxStatements: 100,
    };
    expect(
      buildCompareRequest({
        ...base,
        source: { connectionId: 's', database: 'db1', table: 't' },
        target: { connectionId: 'g', table: 't' },
      })
    ).toEqual({
      source_connection_id: 's',
      source_database: 'db1',
      source_table: 't',
      target_connection_id: 'g',
      target_database: undefined,
      target_table: 't',
      key_columns: ['a', 'b'],
      max_rows: 5000,
      max_statements: 100,
    });
    expect(
      buildCompareRequest({
        ...base,
        source: { connectionId: 's', table: 't' },
        target: { connectionId: 'g' },
      })
    ).toBeNull();
  });
});

describe('DataCompareDialog', () => {
  it('presets the source, follows with the target, and sends the compare request', async () => {
    renderDialog({ preset: { connectionId: 'c1', database: 'prod' } });

    await pick('dc-source-table', 'orders');
    // 目标连接和表跟着源走；选了目标库之后，库里有同名的表就自动带上，不用再选
    await pick('dc-target-database', 'test');
    expect(await screen.findByTestId('dc-target-table')).toHaveTextContent('orders');

    await act(async () => {
      fireEvent.click(screen.getByTestId('dc-run'));
    });

    await waitFor(() => expect(screen.getByTestId('dc-result')).toBeInTheDocument());
    expect(mockCompareTableData).toHaveBeenCalledWith({
      source_connection_id: 'c1',
      source_database: 'prod',
      source_table: 'orders',
      target_connection_id: 'c1',
      target_database: 'test',
      target_table: 'orders',
      key_columns: [],
      max_rows: 100000,
      max_statements: 2000,
    });
    expect(screen.getByTestId('dc-tile-same')).toHaveTextContent('7');
    expect(screen.getByTestId('dc-tile-modified')).toHaveTextContent('2');
    expect(screen.getByTestId('dc-tile-targetOnly')).toHaveTextContent('2');
    expect(
      screen.getByText('common.dataCompare.targetOnlyCols:{"cols":"legacy"}')
    ).toBeInTheDocument();

    // 内容不同：列出变化的列，NULL 也照常显示
    expect(screen.getByText('old')).toBeInTheDocument();
    expect(screen.getByText('new')).toBeInTheDocument();
    expect(screen.getAllByText('NULL').length).toBeGreaterThan(0);
  });

  it('locks both sides while a compare is in flight', async () => {
    let release: (value: DataCompareResult) => void = () => {};
    mockCompareTableData.mockImplementation(
      () =>
        new Promise<DataCompareResult>((resolve) => {
          release = resolve;
        })
    );
    renderDialog({ preset: { connectionId: 'c1', database: 'prod' } });
    await pick('dc-source-table', 'orders');
    await pick('dc-target-database', 'test');
    expect(await screen.findByTestId('dc-target-table')).toHaveTextContent('orders');

    await act(async () => {
      fireEvent.click(screen.getByTestId('dc-run'));
    });
    // 比对没回来之前不能换表：否则结果（和「在 SQL 标签页中打开」用的目标）对不上表单里的选择
    expect(screen.getByTestId('dc-swap')).toBeDisabled();
    expect(
      screen.getByTestId('dc-source-connection').querySelector('input[role="combobox"]')
    ).toBeDisabled();
    expect(
      screen.getByTestId('dc-target-table').querySelector('input[role="combobox"]')
    ).toBeDisabled();

    await act(async () => {
      release(sample);
    });
    await waitFor(() => expect(screen.getByTestId('dc-result')).toBeInTheDocument());
    expect(screen.getByTestId('dc-swap')).toBeEnabled();
    expect(
      screen.getByTestId('dc-source-connection').querySelector('input[role="combobox"]')
    ).toBeEnabled();
  });

  it('shows the sync script with its statement counts', async () => {
    const { onOpenSql, onClose } = renderDialog({
      preset: { connectionId: 'c1', database: 'prod' },
    });
    await pick('dc-source-table', 'users');
    await pick('dc-target-database', 'test');
    await pick('dc-target-table', 'users');
    await act(async () => {
      fireEvent.click(screen.getByTestId('dc-run'));
    });
    await screen.findByTestId('dc-result');

    await act(async () => {
      fireEvent.click(screen.getByTestId('dc-view-sql'));
    });
    expect(await screen.findByTestId('dc-sql')).toHaveTextContent("UPDATE `t` SET `name` = 'new'");
    expect(screen.getByText('UPDATE 2 · INSERT 1 · DELETE 2')).toBeInTheDocument();
    expect(screen.getByText('common.dataCompare.sqlNote')).toBeInTheDocument();

    // 只是把脚本放进目标库的 SQL 标签页：连接和库取自这次比对的目标
    await act(async () => {
      fireEvent.click(screen.getByText('common.dataCompare.openInSqlTab'));
    });
    expect(onOpenSql).toHaveBeenCalledWith('c1', 'test', sample.sql);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not send anything until both sides are chosen', async () => {
    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByTestId('dc-run'));
    });
    expect(mockCompareTableData).not.toHaveBeenCalled();
    expect(screen.getByText('common.dataCompare.selectSides')).toBeInTheDocument();
  });

  it('surfaces backend errors and keeps the form', async () => {
    mockCompareTableData.mockRejectedValue(
      new Error('source table has no primary key; specify key_columns')
    );
    renderDialog({ preset: { connectionId: 'c1', database: 'prod' } });
    await pick('dc-source-table', 'orders');
    await pick('dc-target-database', 'test');
    await pick('dc-target-table', 'orders');
    await act(async () => {
      fireEvent.click(screen.getByTestId('dc-run'));
    });

    expect(await screen.findByTestId('dc-error')).toHaveTextContent(
      'source table has no primary key'
    );
    expect(screen.queryByTestId('dc-result')).not.toBeInTheDocument();
  });

  it('swaps source and target', async () => {
    renderDialog({ preset: { connectionId: 'c1', database: 'prod' } });
    await pick('dc-source-table', 'orders');
    await pick('dc-target-database', 'test');
    await pick('dc-target-table', 'orders');

    await act(async () => {
      fireEvent.click(screen.getByTestId('dc-swap'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('dc-run'));
    });
    await waitFor(() => expect(mockCompareTableData).toHaveBeenCalled());
    const call = mockCompareTableData.mock.calls[0][0];
    expect(call.source_database).toBe('test');
    expect(call.target_database).toBe('prod');
  });

  it('passes key columns from the input', async () => {
    renderDialog({ preset: { connectionId: 'c1', database: 'prod' } });
    await pick('dc-source-table', 'orders');
    await pick('dc-target-database', 'test');
    await pick('dc-target-table', 'orders');
    fireEvent.change(screen.getByPlaceholderText('common.dataCompare.keyColumnsHint'), {
      target: { value: 'order_no, line' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('dc-run'));
    });
    await waitFor(() => expect(mockCompareTableData).toHaveBeenCalled());
    expect(mockCompareTableData.mock.calls[0][0].key_columns).toEqual(['order_no', 'line']);
  });

  it('says so when the tables are already identical', async () => {
    mockCompareTableData.mockResolvedValue({
      ...sample,
      modified_count: 0,
      source_only_count: 0,
      target_only_count: 0,
      modified: [],
      source_only: [],
      target_only: [],
      sql: '',
      sql_counts: { update: 0, insert: 0, delete: 0 },
    });
    renderDialog({ preset: { connectionId: 'c1', database: 'prod' } });
    await pick('dc-source-table', 'orders');
    await pick('dc-target-database', 'test');
    await pick('dc-target-table', 'orders');
    await act(async () => {
      fireEvent.click(screen.getByTestId('dc-run'));
    });
    expect(await screen.findByTestId('dc-identical')).toBeInTheDocument();
    expect(screen.queryByTestId('dc-view-sql')).not.toBeInTheDocument();
  });
});
