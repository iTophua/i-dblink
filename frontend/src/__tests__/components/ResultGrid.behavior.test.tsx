/**
 * ResultGrid 行为验证：认表（含限定部分）、编辑提交的落地检查、失败后不重复提交。
 * Glide 是画布网格，这里把它替换成记录 props 的桩，通过回调驱动编辑。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';

interface CapturedGlideProps {
  columns: Array<{ id: string; title: string }>;
  rows: Array<Record<string, unknown>>;
  editable: boolean;
  onCellEdited: (col: number, row: number, value: string) => void;
  isCellModified?: (row: Record<string, unknown>, colId: string) => boolean;
}

const getColumns = vi.fn();
const executeQuery = vi.fn();
const message = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
let glideProps: CapturedGlideProps | null = null;

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
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) };
});

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return { ...actual, App: { ...actual.App, useApp: () => ({ message }) } };
});

vi.mock('../../hooks/useApi', () => ({
  useDatabase: () => ({ getColumns, executeQuery }),
}));

vi.mock('../../components/DataTable/GlideDataTable', () => ({
  GlideDataTable: (props: CapturedGlideProps) => {
    glideProps = props;
    return <div data-testid="glide-grid" />;
  },
}));

import { ResultGrid } from '../../components/SQLEditor/ResultGrid';

type GridProps = ComponentProps<typeof ResultGrid>;

const COLUMNS = [
  { column_name: 'id', data_type: 'int', column_key: 'PRI' },
  { column_name: 'name', data_type: 'varchar(20)', column_key: '' },
  { column_name: 'note', data_type: 'varchar(20)', column_key: '' },
];

type GridOverrides = Omit<Partial<GridProps>, 'queryResult'> & {
  queryResult: GridProps['queryResult'];
};

const renderGrid = (overrides: GridOverrides) =>
  render(
    <ResultGrid isDark={false} connectionId="c1" database="hr" dbType="mysql" {...overrides} />
  );

const baseResult = (executedSql: string): GridProps['queryResult'] => ({
  columns: ['id', 'name', 'note'],
  rows: [
    [1, 'a', null],
    [2, 'b', 'c'],
  ],
  executedSql,
});

const edit = (col: number, row: number, value: string) => {
  act(() => {
    glideProps!.onCellEdited(col, row, value);
  });
};

const submit = async () => {
  // antd 按钮的可访问名里带着图标名（save common.submit），按结尾匹配
  await userEvent.click(screen.getByRole('button', { name: /common\.submit$/ }));
};

beforeEach(() => {
  cleanup();
  glideProps = null;
  getColumns.mockReset().mockResolvedValue(COLUMNS);
  executeQuery.mockReset().mockResolvedValue({ columns: [], rows: [], rows_affected: 1 });
});

describe('ResultGrid 认表', () => {
  // 只拿表名去查列信息，MySQL 会在当前库里找同名表：UPDATE 就写到别的库的同名表上去了
  it('SELECT * FROM shop.users：按限定名取列信息，写回的 SQL 带限定符', async () => {
    renderGrid({ queryResult: baseResult('SELECT * FROM shop.users WHERE id <= 2') });
    await waitFor(() => expect(glideProps?.editable).toBe(true));
    expect(getColumns).toHaveBeenCalledWith('c1', 'shop.users', 'hr');

    edit(1, 0, 'z');
    await waitFor(() =>
      expect(
        screen.getByText("UPDATE `shop`.`users` SET `name` = 'z' WHERE `id` = 1;")
      ).toBeInTheDocument()
    );

    await submit();
    await waitFor(() =>
      expect(executeQuery).toHaveBeenCalledWith(
        'c1',
        "UPDATE `shop`.`users` SET `name` = 'z' WHERE `id` = 1",
        'hr'
      )
    );
    expect(message.success).toHaveBeenCalledWith('common.submittedSuccessfully 1');
  });

  it('多表查询定位不到唯一的表：只读，不去取列信息', async () => {
    renderGrid({ queryResult: baseResult('SELECT * FROM users u JOIN orders o ON o.uid = u.id') });
    await waitFor(() => expect(screen.getByTestId('glide-grid')).toBeInTheDocument());
    expect(glideProps!.editable).toBe(false);
    expect(getColumns).not.toHaveBeenCalled();
  });

  // 新的列信息没回来之前，不能拿上一张表的主键去定位这一张表的行
  it('换了结果集、新表的列信息还没回来：不沿用上一张表的主键', async () => {
    getColumns.mockResolvedValue(COLUMNS);
    const { rerender } = renderGrid({ queryResult: baseResult('SELECT * FROM users') });
    await waitFor(() => expect(glideProps?.editable).toBe(true));

    getColumns.mockImplementation(() => new Promise(() => {}));
    rerender(
      <ResultGrid
        isDark={false}
        connectionId="c1"
        database="hr"
        dbType="mysql"
        queryResult={baseResult('SELECT id, name, note FROM admins')}
      />
    );
    await waitFor(() => expect(getColumns).toHaveBeenLastCalledWith('c1', 'admins', 'hr'));
    expect(glideProps!.editable).toBe(false);
  });

  // PG 不带 schema 时，各个 schema 里的同名表会合并在一起，主键可能是另一张表的
  it('取回的列信息有重名列：只读', async () => {
    getColumns.mockResolvedValue([...COLUMNS, ...COLUMNS]);
    renderGrid({ queryResult: baseResult('SELECT * FROM users') });
    await waitFor(() => expect(glideProps).toBeTruthy());
    expect(glideProps!.editable).toBe(false);
  });
});

describe('ResultGrid 编辑值', () => {
  it("NULL 改成空串会生成 SET col = ''；没有变化的编辑不生成 SQL", async () => {
    renderGrid({ queryResult: baseResult('SELECT * FROM users') });
    await waitFor(() => expect(glideProps?.editable).toBe(true));

    // 空值 → NULL：没有变化
    edit(2, 0, 'NULL');
    expect(screen.queryByText(/SQL ▶/)).toBeNull();

    // 空值 → 空串（用户在格子里输入后又清空）：以前被「字符串化后相同」吞掉
    edit(2, 0, '');
    await waitFor(() =>
      expect(
        screen.getByText("UPDATE `hr`.`users` SET `note` = '' WHERE `id` = 1;")
      ).toBeInTheDocument()
    );
  });

  it('重名列各是各的值', async () => {
    renderGrid({
      queryResult: {
        columns: ['id', 'id', 'name'],
        rows: [[7, 7, 'a']],
        executedSql: 'SELECT id, id, name FROM users',
      },
    });
    await waitFor(() => expect(glideProps).toBeTruthy());
    expect(glideProps!.columns.map((c) => c.id)).toEqual(['id', 'id#2', 'name']);
    expect(glideProps!.rows[0]).toMatchObject({ id: 7, 'id#2': 7, name: 'a' });
  });
});

describe('ResultGrid 提交', () => {
  // 主键值在界面上失真（BINARY(16) 显示成 [BLOB: n bytes]）时 WHERE 一行都匹配不上，
  // 以前照样报成功，编辑标记还被清掉
  it('UPDATE 一行都没碰到：报失败，编辑留在网格里', async () => {
    renderGrid({ queryResult: baseResult('SELECT * FROM users') });
    await waitFor(() => expect(glideProps?.editable).toBe(true));
    edit(1, 0, 'z');
    executeQuery
      .mockResolvedValueOnce({ columns: [], rows: [], rows_affected: 0 })
      .mockResolvedValueOnce({ columns: ['cnt'], rows: [[0]] });

    await submit();

    await waitFor(() =>
      expect(message.error).toHaveBeenCalledWith(
        'common.submitFailed: common.dataGrid.noRowMatched'
      )
    );
    expect(glideProps!.isCellModified!(glideProps!.rows[0], 'name')).toBe(true);
    expect(executeQuery).toHaveBeenLastCalledWith(
      'c1',
      'SELECT COUNT(*) FROM `hr`.`users` WHERE `id` = 1',
      'hr'
    );
  });

  it('中途失败：已落库的编辑移除，没执行的留在网格里', async () => {
    renderGrid({ queryResult: baseResult('SELECT * FROM users') });
    await waitFor(() => expect(glideProps?.editable).toBe(true));
    edit(1, 0, 'x');
    edit(1, 1, 'y');
    executeQuery
      .mockResolvedValueOnce({ columns: [], rows: [], rows_affected: 1 })
      .mockResolvedValueOnce({ columns: [], rows: [], error: 'lock wait timeout' });

    await submit();

    await waitFor(() =>
      expect(message.error).toHaveBeenCalledWith('common.submitFailed: lock wait timeout')
    );
    expect(glideProps!.isCellModified!(glideProps!.rows[0], 'name')).toBe(false);
    expect(glideProps!.isCellModified!(glideProps!.rows[1], 'name')).toBe(true);
  });

  it('全部成功后编辑状态清空', async () => {
    renderGrid({ queryResult: baseResult('SELECT * FROM users') });
    await waitFor(() => expect(glideProps?.editable).toBe(true));
    edit(1, 0, 'x');
    edit(1, 1, 'y');

    await submit();

    await waitFor(() =>
      expect(message.success).toHaveBeenCalledWith('common.submittedSuccessfully 2')
    );
    expect(glideProps!.isCellModified!(glideProps!.rows[0], 'name')).toBe(false);
    expect(glideProps!.isCellModified!(glideProps!.rows[1], 'name')).toBe(false);
  });
});
