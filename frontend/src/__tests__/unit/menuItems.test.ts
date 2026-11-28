/**
 * 右键「复制为 INSERT / UPDATE / DELETE」生成的 SQL：行定位必须用全部主键列，
 * 表引用要带上结果集 SQL 里的限定部分。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCopyAsDeleteItem,
  createCopyAsInsertItem,
  createCopyAsUpdateItem,
} from '../../components/ContextMenu/menuItems';
import type { MenuItemConfig, MenuContext } from '../../components/ContextMenu/types';
import type { ColumnInfo } from '../../types/api';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

const t = (key: string) => key;
/** 点菜单项，返回最后一次写进剪贴板的文本 */
const copiedText = (item: MenuItemConfig): string => {
  item.onClick();
  const calls = writeText.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as string;
};

const column = (name: string, dataType: string, key = ''): ColumnInfo => ({
  column_name: name,
  data_type: dataType,
  is_nullable: 'YES',
  column_key: key,
});
const compositeKey: ColumnInfo[] = [
  column('a', 'int', 'PRI'),
  column('b', 'int', 'PRI'),
  column('v', 'varchar(10)'),
];
const rows = [
  { a: 1, b: 2, v: 'x' },
  { a: 1, b: 3, v: 'y' },
];
const baseContext: MenuContext = {
  dbType: 'mysql',
  tableName: 't',
  database: 'db',
  columns: compositeKey,
  queryColumns: ['a', 'b', 'v'],
  selectedRows: rows,
};

describe('复制为 UPDATE / DELETE：行定位用全部主键列', () => {
  // 只取第一列主键时，两条语句的 WHERE 都是 a = 1：每一条都会同时改到两行
  it('复合主键全列 AND', () => {
    expect(copiedText(createCopyAsUpdateItem(baseContext, t, vi.fn()))).toBe(
      "UPDATE `db`.`t` SET `v` = 'x' WHERE `a` = 1 AND `b` = 2;\n" +
        "UPDATE `db`.`t` SET `v` = 'y' WHERE `a` = 1 AND `b` = 3;"
    );
    expect(copiedText(createCopyAsDeleteItem(baseContext, t, vi.fn()))).toBe(
      'DELETE FROM `db`.`t` WHERE `a` = 1 AND `b` = 2;\nDELETE FROM `db`.`t` WHERE `a` = 1 AND `b` = 3;'
    );
  });

  it('主键列不出现在 SET 里', () => {
    const sql = copiedText(createCopyAsUpdateItem(baseContext, t, vi.fn()));
    expect(sql).not.toMatch(/SET[^W]*`[ab]` =/);
  });

  it('结果集 SQL 里带了限定部分时，用带限定部分的表引用', () => {
    const update = copiedText(
      createCopyAsUpdateItem(
        { ...baseContext, tableRef: '`shop`.`users`', database: 'hr' },
        t,
        vi.fn()
      )
    );
    expect(update).toContain("UPDATE `shop`.`users` SET `v` = 'x'");
    const insert = copiedText(
      createCopyAsInsertItem({ ...baseContext, tableRef: '`shop`.`users`' }, t, vi.fn())
    );
    expect(insert).toContain('INSERT INTO `shop`.`users` (`a`, `b`, `v`) VALUES');
  });

  it('大整数主键在整数列里写裸数字', () => {
    const context: MenuContext = {
      ...baseContext,
      columns: [column('id', 'bigint', 'PRI'), compositeKey[2]],
      queryColumns: ['id', 'v'],
      selectedRows: [{ id: '123456789012345678', v: 'x' }],
    };
    expect(copiedText(createCopyAsDeleteItem(context, t, vi.fn()))).toBe(
      'DELETE FROM `db`.`t` WHERE `id` = 123456789012345678;'
    );
  });

  it('主键值为空的行定位不了，跳过；全都定位不了就不写剪贴板', () => {
    const item = createCopyAsDeleteItem(
      { ...baseContext, selectedRows: [{ a: null, b: 2, v: 'x' }] },
      t,
      vi.fn()
    );
    item.onClick();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('没有主键信息时菜单项不可用', () => {
    expect(createCopyAsUpdateItem({ ...baseContext, columns: [] }, t, vi.fn()).disabled).toBe(true);
  });
});
