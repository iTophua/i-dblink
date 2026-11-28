/**
 * 结果集编辑的「认表」：从 SQL 里取出被查询的表（含限定部分），拼出写回用的表引用。
 * 认错表的后果是 UPDATE / DELETE 落到别的库、别的 schema 里的同名表上。
 */
import { describe, it, expect } from 'vitest';
import {
  buildResultSetTableRef,
  extractTableRefParts,
  tableLookupName,
} from '../../components/SQLEditor/resultTable';

const names = (parts: ReturnType<typeof extractTableRefParts>) =>
  parts ? parts.map((p) => p.name) : null;

describe('extractTableRefParts', () => {
  it.each([
    ['SELECT * FROM users', ['users']],
    ['select id from users where id > 1', ['users']],
    ['SELECT * FROM users;', ['users']],
    ['SELECT * FROM users -- 行尾注释\nWHERE id = 1', ['users']],
    ['SELECT * FROM /* 块注释 */ users u WHERE u.id = 1', ['users']],
    ['SELECT * FROM users AS u ORDER BY 1', ['users']],
    ['SELECT * FROM shop.users ORDER BY id', ['shop', 'users']],
    ['SELECT * FROM `shop`.`users` t WHERE t.id = 1', ['shop', 'users']],
    ['SELECT * FROM "sales"."Orders" LIMIT 10', ['sales', 'Orders']],
    ['SELECT * FROM [db].[dbo].[users]', ['db', 'dbo', 'users']],
    // 转义的引号还原
    ['SELECT * FROM `a``b`', ['a`b']],
    ['SELECT * FROM "a""b"', ['a"b']],
    ['SELECT * FROM [a]]b]', ['a]b']],
    // 字符串字面量里的 from 不是 FROM 子句
    ["SELECT 'from x' AS src, name FROM users WHERE id = 1", ['users']],
    ["SELECT * FROM notes WHERE body = 'from users to admins'", ['notes']],
  ])('%s', (sql, expected) => {
    expect(names(extractTableRefParts(sql))).toEqual(expected);
  });

  it.each([
    ['多表 JOIN', 'SELECT * FROM users u JOIN orders o ON o.user_id = u.id'],
    ['逗号连接', 'SELECT * FROM users, orders'],
    ['子查询', 'SELECT * FROM (SELECT * FROM users) t'],
    ['CTE', 'WITH x AS (SELECT 1) SELECT * FROM x'],
    ['UNION', 'SELECT id FROM users UNION SELECT id FROM admins'],
    ['PARTITION 子句', 'SELECT * FROM users PARTITION (p0)'],
    ['FOR UPDATE', 'SELECT * FROM users FOR UPDATE'],
    ['没有 FROM', 'SELECT 1'],
    ['INSERT', 'INSERT INTO users VALUES (1)'],
    ['空串', ''],
  ])('%s：定位不到唯一的表', (_name, sql) => {
    expect(extractTableRefParts(sql)).toBeNull();
  });

  it('记录每一段是否带引号', () => {
    expect(extractTableRefParts('SELECT * FROM public."Users"')).toEqual([
      { name: 'public', quoted: false },
      { name: 'Users', quoted: true },
    ]);
  });
});

describe('tableLookupName / buildResultSetTableRef', () => {
  it('限定名原样交给取列信息接口，由后端按库类型定位', () => {
    const parts = extractTableRefParts('SELECT * FROM shop.users')!;
    expect(tableLookupName(parts, 'mysql')).toBe('shop.users');
    // 标签页选的是别的库：不能让后端去当前库里找同名表
    expect(buildResultSetTableRef(parts, 'hr', 'mysql')).toBe('`shop`.`users`');
  });

  it('不带限定的表沿用标签页选中的库', () => {
    const parts = extractTableRefParts('SELECT * FROM users')!;
    expect(tableLookupName(parts, 'mysql')).toBe('users');
    expect(buildResultSetTableRef(parts, 'hr', 'mysql')).toBe('`hr`.`users`');
  });

  it('PG 系：schema 限定保留；不带引号的名字按小写写回', () => {
    expect(
      buildResultSetTableRef(
        extractTableRefParts('SELECT * FROM sales.orders')!,
        'app',
        'postgresql'
      )
    ).toBe('"sales"."orders"');
    // `FROM Users` 在 PG 里指的是 users；按 Users 加引号反而找不到表
    const bare = extractTableRefParts('SELECT * FROM Users')!;
    expect(tableLookupName(bare, 'postgresql')).toBe('users');
    expect(buildResultSetTableRef(bare, 'app', 'postgresql')).toBe('"users"');
  });

  it('PG 系：带引号的名字保留大小写', () => {
    const quoted = extractTableRefParts('SELECT * FROM "Users"')!;
    expect(tableLookupName(quoted, 'postgresql')).toBe('Users');
    expect(buildResultSetTableRef(quoted, 'app', 'postgresql')).toBe('"Users"');
  });

  it('MySQL 不折叠大小写', () => {
    const parts = extractTableRefParts('SELECT * FROM Users')!;
    expect(tableLookupName(parts, 'mysql')).toBe('Users');
    expect(buildResultSetTableRef(parts, 'app', 'mysql')).toBe('`app`.`Users`');
  });

  it('名字里的引号在写回时转义', () => {
    const parts = extractTableRefParts('SELECT * FROM `a``b`')!;
    expect(buildResultSetTableRef(parts, 'app', 'mysql')).toBe('`app`.`a``b`');
  });
});
