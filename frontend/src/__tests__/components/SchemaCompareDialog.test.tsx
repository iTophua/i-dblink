import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }) };
});

import { mockCompareSchema, mockExecuteDDL } from '../setupTests';
import { SchemaCompareDialog } from '../../components/SchemaCompareDialog';
import { syncStatements } from '../../utils/schemaSync';
import type { ConnectionOutput } from '../../types/api';

const connections = [
  {
    id: 'c1',
    name: '主库',
    db_type: 'mysql',
    host: 'h',
    port: 3306,
    username: 'u',
    status: 'connected',
  },
  {
    id: 'c2',
    name: '备库',
    db_type: 'postgresql',
    host: 'h',
    port: 5432,
    username: 'u',
    status: 'connected',
  },
] as unknown as ConnectionOutput[];

const ADD_REMARK = 'ALTER TABLE "orders" ADD COLUMN "remark" varchar(255) NULL';
const ADD_INDEX = 'CREATE INDEX "idx_a" ON "orders" ("a")';
const NOTE_EXTRA =
  '-- 目标表多出的列 legacy_col（删除会丢数据，确认后手动执行）：\n-- ALTER TABLE "orders" DROP COLUMN "legacy_col"';

function diffWith(alterSql: string[]) {
  return {
    diffs: [
      {
        table_name: 'orders',
        has_diffs: true,
        column_diffs: [
          { column_name: 'remark', source_def: 'varchar(255) NULL', diff_type: 'missing' },
        ],
        index_diffs: [],
        foreign_key_diffs: [],
        alter_sql: alterSql,
      },
    ],
  };
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
  mockCompareSchema.mockReset();
  mockExecuteDDL.mockReset().mockResolvedValue(undefined);
});

/** 在 antd 6 的 Select 里选一项：展开后点下拉里可见的那份选项 */
async function openDialog() {
  render(
    <App>
      <SchemaCompareDialog open onClose={vi.fn()} connections={connections} />
    </App>
  );
  // 弹窗打开后有一个微任务在重置表单；等它跑完再操作，否则刚展开的下拉会被这次重渲染收起
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

async function pick(testId: string, optionText: string) {
  const root = screen.getByTestId(testId);
  await act(async () => {
    fireEvent.mouseDown(root.querySelector('input[role="combobox"]') ?? root);
  });
  const options = await screen.findAllByText(
    (content) => typeof content === 'string' && content.includes(optionText),
    {
      selector:
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
    }
  );
  await act(async () => {
    fireEvent.click(options[options.length - 1]);
  });
}

/** 选好源和目标并点「比较结构」 */
async function startCompare(sourceDb = 'shop', targetDb = 'shop_test') {
  await pick('schema-compare-source-conn', '主库');
  await pick('schema-compare-target-conn', '备库');
  const inputs = screen.getAllByPlaceholderText('common.exampleDb');
  fireEvent.change(inputs[0], { target: { value: sourceDb } });
  fireEvent.change(inputs[1], { target: { value: targetDb } });
  await act(async () => {
    fireEvent.click(screen.getByText('common.compareStructure'));
  });
}

/** 选好源和目标并比对，等 orders 的结果出来，返回给后端的比对参数 */
async function compareWith(sourceDb = 'shop', targetDb = 'shop_test') {
  await startCompare(sourceDb, targetDb);
  // 等结果渲染出来（只有注释的表没有「执行同步」按钮，不能等按钮）
  await screen.findByText('orders');
  return mockCompareSchema.mock.calls[0];
}

describe('syncStatements', () => {
  it('keeps statements and drops comment-only entries', () => {
    expect(
      syncStatements([
        ADD_REMARK,
        '-- 目标表多出的列 legacy_col：\n-- ALTER TABLE "orders" DROP COLUMN "legacy_col"',
        ADD_INDEX + ';',
        '',
      ])
    ).toEqual([ADD_REMARK, ADD_INDEX]);
  });

  it('strips leading comment lines from an entry that also carries a statement', () => {
    expect(syncStatements(['-- note\n' + ADD_REMARK])).toEqual([ADD_REMARK]);
  });

  it('tolerates missing input', () => {
    expect(syncStatements(undefined)).toEqual([]);
    expect(syncStatements(null)).toEqual([]);
  });
});

describe('SchemaCompareDialog 执行同步', () => {
  it('allows the same connection on both sides (two databases on one instance)', async () => {
    await openDialog();
    const root = screen.getByTestId('schema-compare-target-conn');
    await act(async () => {
      fireEvent.mouseDown(root.querySelector('input[role="combobox"]') ?? root);
    });
    const labels = await screen.findAllByText(
      (content) => typeof content === 'string' && content.includes('(mysql)'),
      {
        selector:
          '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
      }
    );
    expect(labels.length).toBeGreaterThan(0);
  });

  it('asks for confirmation, then runs each additive statement on the TARGET database only', async () => {
    mockCompareSchema.mockResolvedValue(diffWith([ADD_REMARK, NOTE_EXTRA, ADD_INDEX]));
    await openDialog();
    const request = await compareWith();
    // compareSchema 按位置参数调用绑定：源连接、源库、目标连接、目标库
    expect(request).toEqual(['c1', 'shop', 'c2', 'shop_test', null]);
    expect(mockExecuteDDL).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('schema-compare-execute'));
    });
    expect(await screen.findByText('common.schemaSyncConfirm')).toBeInTheDocument();
    expect(mockExecuteDDL).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    });
    await waitFor(() => expect(mockExecuteDDL).toHaveBeenCalledTimes(2));
    // executeDDL 的四个参数：连接、语句、库、事务会话（空 = 自动提交）
    expect(mockExecuteDDL.mock.calls).toEqual([
      ['c2', ADD_REMARK, 'shop_test', ''],
      ['c2', ADD_INDEX, 'shop_test', ''],
    ]);
  });

  it('does nothing when cancelled', async () => {
    mockCompareSchema.mockResolvedValue(diffWith([ADD_REMARK]));
    await openDialog();
    await compareWith();
    await act(async () => {
      fireEvent.click(screen.getByTestId('schema-compare-execute'));
    });
    await screen.findByText('common.schemaSyncConfirm');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    });
    await waitFor(() =>
      expect(screen.queryByText('common.schemaSyncConfirm')).not.toBeInTheDocument()
    );
    expect(mockExecuteDDL).not.toHaveBeenCalled();
  });

  it('offers no execute button when there is nothing executable', async () => {
    mockCompareSchema.mockResolvedValue(diffWith([NOTE_EXTRA]));
    await openDialog();
    await compareWith();
    // 目标表多出的列只以注释列出：界面上不该出现一个点了没反应的「执行同步」
    expect(screen.queryByTestId('schema-compare-execute')).not.toBeInTheDocument();
    expect(mockExecuteDDL).not.toHaveBeenCalled();
  });

  it('disables execution when source and target are different kinds of databases', async () => {
    // MySQL → PG：语句里的类型没做方言转换，后端标了不能执行
    mockCompareSchema.mockResolvedValue({ ...diffWith([ADD_REMARK]), sync_supported: false });
    await openDialog();
    await compareWith();
    expect(screen.getByText('common.schemaCompareCrossDialect')).toBeInTheDocument();
    expect(screen.getByTestId('schema-compare-execute')).toBeDisabled();
  });

  it('warns about tables that could not be read instead of showing an empty result', async () => {
    mockCompareSchema.mockResolvedValue({
      diffs: [],
      errors: [
        'orders: relation "orders" does not exist',
        'users: permission denied: relation users',
      ],
      sync_supported: true,
    });
    await openDialog();
    await startCompare();
    await screen.findByText('common.schemaCompareIncomplete');
    expect(screen.getByText('common.schemaCompareIncomplete')).toBeInTheDocument();
    expect(screen.getByText(/relation "orders" does not exist/)).toBeInTheDocument();
    // 读取失败时结果不完整，不能报「完全一致」
    expect(screen.queryByText('common.schemasIdentical')).not.toBeInTheDocument();
  });

  it('lists tables that only exist in the target', async () => {
    mockCompareSchema.mockResolvedValue({
      ...diffWith([ADD_REMARK]),
      target_only_tables: ['audit_log'],
    });
    await openDialog();
    await compareWith();
    // 测试里的 t 不做插值，只能确认这一行出现了
    expect(screen.getByTestId('schema-compare-target-only')).toBeInTheDocument();
  });

  it('marks a table that is missing in the target and offers nothing to execute', async () => {
    const base = diffWith(['-- 目标库没有表 orders：请先按源表结构建表，再重新比较']).diffs[0];
    mockCompareSchema.mockResolvedValue({ diffs: [{ ...base, table_missing: true }] });
    await openDialog();
    await compareWith();
    expect(screen.getAllByText('common.schemaCompareTableMissing').length).toBeGreaterThan(0);
    expect(screen.getByText('common.schemaCompareTableMissingHint')).toBeInTheDocument();
    expect(screen.queryByTestId('schema-compare-execute')).not.toBeInTheDocument();
  });

  it('shows every column of a composite index and foreign key', async () => {
    const diff = {
      diffs: [
        {
          table_name: 'orders',
          has_diffs: true,
          column_diffs: [],
          index_diffs: [
            {
              index_name: 'idx_ab',
              column_name: 'a',
              column_names: ['a', 'b'],
              is_unique: false,
              diff_type: 'missing',
            },
          ],
          foreign_key_diffs: [
            {
              constraint_name: 'fk_pair',
              column_name: 'x',
              column_names: ['x', 'y'],
              referenced_table: 'parent',
              referenced_column: 'p',
              referenced_columns: ['p', 'q'],
              diff_type: 'missing',
            },
          ],
          alter_sql: [],
        },
      ],
    };
    mockCompareSchema.mockResolvedValue(diff);
    await openDialog();
    await compareWith();
    expect(screen.getByText('a, b')).toBeInTheDocument();
    expect(screen.getByText('x, y')).toBeInTheDocument();
    expect(screen.getByText('p, q')).toBeInTheDocument();
  });

  it('stops at the first failing statement and reports which one', async () => {
    mockCompareSchema.mockResolvedValue(diffWith([ADD_REMARK, ADD_INDEX]));
    mockExecuteDDL.mockRejectedValueOnce(new Error('relation "orders" does not exist'));
    await openDialog();
    await compareWith();
    await act(async () => {
      fireEvent.click(screen.getByTestId('schema-compare-execute'));
    });
    await screen.findByText('common.schemaSyncConfirm');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    });
    await waitFor(() => expect(mockExecuteDDL).toHaveBeenCalledTimes(1));
    // 第一条就失败：第二条不再执行
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockExecuteDDL).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText((content) => content.includes('relation "orders" does not exist'))
    ).toBeInTheDocument();
  });
});
