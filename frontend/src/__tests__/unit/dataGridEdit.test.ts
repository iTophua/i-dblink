/**
 * 网格编辑的取值与提交：编辑器什么时候算「取消」、NULL 与空串怎么区分、
 * 一条编辑语句怎样才算成功、改动怎么比较。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  diffRowSetters,
  editorCommitValue,
  primaryKeyLiteral,
  runEditStatement,
  uniqueColumnIds,
} from '../../components/DataTable/utils';
import { valueToGridCell } from '../../components/DataTable/GlideDataTable';
import { getDialect } from '../../utils/sqlDialects';

// 第一个参数：是不是数值格
describe('editorCommitValue', () => {
  // Glide 关闭编辑器时不比较新旧值、一律回调：NULL 格子的编辑框本来就是空的，
  // 点进去再点走曾被上报成「改成了空串」
  it('没动过编辑框 = 取消，不上报任何值', () => {
    expect(editorCommitValue(false, '', false)).toBeUndefined();
    expect(editorCommitValue(false, '原值', false)).toBeUndefined();
    expect(editorCommitValue(true, '5', false)).toBeUndefined();
  });

  it('文本格原样上报：清空是空串，NULL 是上层的空值约定', () => {
    expect(editorCommitValue(false, '', true)).toBe('');
    expect(editorCommitValue(false, 'NULL', true)).toBe('NULL');
    expect(editorCommitValue(false, 'abc', true)).toBe('abc');
  });

  it('数值格：清空 = 置 NULL，不再写成空串', () => {
    expect(editorCommitValue(true, '', true)).toBe('NULL');
    expect(editorCommitValue(true, '  ', true)).toBe('NULL');
  });

  // Number('abc') 是 NaN，以前会把字符串 "NaN" 写进数值列
  it('数值格里不是数字的原文透传，交给数据库报错', () => {
    expect(editorCommitValue(true, 'abc', true)).toBe('abc');
    expect(editorCommitValue(true, '12.5', true)).toBe(12.5);
  });
});

describe('valueToGridCell：NULL 与空串是两个值', () => {
  // 只关心文本格的两个字段
  const asTextCell = (value: unknown) =>
    valueToGridCell(value, true) as { data: unknown; displayData?: string };

  it('NULL 显示为斜体 NULL，空串显示为空白', () => {
    const nullCell = asTextCell(null);
    const emptyCell = asTextCell('');
    expect(nullCell.displayData).toBe('NULL');
    expect(emptyCell.displayData).toBe('');
    // 编辑框的初始文本都是空：所以「没动过」不能靠比对值来判断
    expect(nullCell.data).toBe('');
    expect(emptyCell.data).toBe('');
  });

  it('真实的字符串 "NULL" 的 data 是它本身，不会和空值混淆', () => {
    const cell = asTextCell('NULL');
    expect(cell.data).toBe('NULL');
    expect(cell.displayData).toBe('NULL');
  });
});

describe('uniqueColumnIds', () => {
  it('重名列按出现次序编号', () => {
    expect(uniqueColumnIds(['id', 'name', 'id', 'id', 'name'])).toEqual([
      'id',
      'name',
      'id#2',
      'id#3',
      'name#2',
    ]);
  });

  it('没有重名时 id 就是列名', () => {
    expect(uniqueColumnIds(['id', 'name'])).toEqual(['id', 'name']);
  });
});

describe('diffRowSetters', () => {
  it('只列出真正改动的列', () => {
    expect(
      diffRowSetters([1, 'a', null, 1.1], [1, 'b', null, 1.1], ['id', 'name', 'note', 'amt'])
    ).toEqual({
      name: 'b',
    });
  });

  it('数字与它的字符串形式视为未改动', () => {
    expect(diffRowSetters([5, 'x'], ['5', 'x'], ['a', 'b'])).toEqual({});
  });

  it('null → 空串、空串 → null 都是改动', () => {
    // 以前 null 改成 '' 被「字符串化后相同」吞掉，'' 改成 NULL 也被吞掉
    expect(diffRowSetters(['a', null], ['a', ''], ['k', 'c'])).toEqual({ c: '' });
    expect(diffRowSetters(['a', ''], ['a', null], ['k', 'c'])).toEqual({ c: null });
  });
});

describe('primaryKeyLiteral', () => {
  const dialect = getDialect('mysql');
  const bigint = { data_type: 'bigint' };

  it('超出 JS 安全整数的大整数（以字符串到达）在整数列里写裸数字', () => {
    expect(primaryKeyLiteral(dialect, bigint, '123456789012345678')).toBe('123456789012345678');
  });

  it('字符串主键即使长得像数字也加引号', () => {
    expect(primaryKeyLiteral(dialect, { data_type: 'varchar(32)' }, '123456789012345678')).toBe(
      "'123456789012345678'"
    );
  });

  it('空值写 NULL', () => {
    expect(primaryKeyLiteral(dialect, bigint, null)).toBe('NULL');
  });
});

describe('runEditStatement', () => {
  const locate = { tableRef: '`db`.`users`', where: '`id` = 7' };
  const ok = { columns: [], rows: [], rows_affected: 1 };
  const noRowMatched = 'no-row-matched';

  it('报错就返回错误', async () => {
    const exec = vi.fn().mockResolvedValue({ ...ok, error: 'boom' });
    expect(
      await runEditStatement(exec, 'c', 'db', 'update', 'UPDATE …', locate, noRowMatched)
    ).toBe('boom');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('DELETE 没碰到任何行 = 失败', async () => {
    const exec = vi.fn().mockResolvedValue({ columns: [], rows: [], rows_affected: 0 });
    expect(
      await runEditStatement(exec, 'c', 'db', 'delete', 'DELETE …', locate, noRowMatched)
    ).toBe(noRowMatched);
  });

  it('UPDATE 报 0 行时回头确认行还在不在：不在 = 失败', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ columns: [], rows: [], rows_affected: 0 })
      .mockResolvedValueOnce({ columns: ['cnt'], rows: [[0]] });
    expect(
      await runEditStatement(exec, 'c', 'db', 'update', 'UPDATE …', locate, noRowMatched)
    ).toBe(noRowMatched);
    // 主键值在界面上失真（BINARY(16) 显示成 [BLOB: n bytes]）时，UPDATE 的 WHERE 一行都匹配不上
    expect(exec.mock.calls[1][1]).toBe('SELECT COUNT(*) FROM `db`.`users` WHERE `id` = 7');
  });

  // MySQL 默认只数「值真的变了」的行：新值与原值相同也报 0 行
  it('UPDATE 报 0 行但行还在（值没变）= 成功', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ columns: [], rows: [], rows_affected: 0 })
      .mockResolvedValueOnce({ columns: ['cnt'], rows: [[1]] });
    expect(
      await runEditStatement(exec, 'c', 'db', 'update', 'UPDATE …', locate, noRowMatched)
    ).toBeNull();
  });

  it('影响行数未知（驱动不回报）时不判，只认明确的 0', async () => {
    const exec = vi.fn().mockResolvedValue({ columns: [], rows: [] });
    expect(
      await runEditStatement(exec, 'c', 'db', 'update', 'UPDATE …', locate, noRowMatched)
    ).toBeNull();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('INSERT 不看影响行数', async () => {
    const exec = vi.fn().mockResolvedValue({ columns: [], rows: [], rows_affected: 0 });
    expect(
      await runEditStatement(exec, 'c', 'db', 'insert', 'INSERT …', locate, noRowMatched)
    ).toBeNull();
  });
});
