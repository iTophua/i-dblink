/**
 * 表引用里的 schema：PG 系和 SQL Server 的表名可以写成「schema.表」，按段加引号；
 * 库名不能当限定符。其余库的行为不变。
 *
 * 背景：数据页、导出、复制表、右键菜单、结果集拼表引用都走 buildTableRef。此前 PG 这边
 * 把整个名字当一个标识符，带上 schema 后拼成 "app.users"，查询报 relation 不存在；不带则按
 * search_path 找同名表，可能落到别的 schema 的表上。
 */
import { describe, it, expect } from 'vitest';
import { getDialect } from '../../utils/sqlDialects';
import type { DialectColumn } from '../../utils/sqlDialects';

describe('buildTableRef', () => {
  // PG 系共用同一个方言
  for (const dbType of ['postgresql', 'kingbase', 'highgo', 'vastbase'] as const) {
    it(`${dbType}：「schema.表」按段加引号，库名不当限定符`, () => {
      const dialect = getDialect(dbType);
      expect(dialect.buildTableRef('app.users', 'mydb')).toBe('"app"."users"');
      // 不带 schema：只有表名，第二个参数（库名）不拼进去
      expect(dialect.buildTableRef('users', 'mydb')).toBe('"users"');
      expect(dialect.buildTableRef('users')).toBe('"users"');
    });
  }

  it('PG：名字里的引号按标识符转义', () => {
    const dialect = getDialect('postgresql');
    expect(dialect.buildTableRef('we"ird.na"me')).toBe('"we""ird"."na""me"');
  });

  it('PG：不是恰好一个点的名字整个当一个标识符，不拆', () => {
    const dialect = getDialect('postgresql');
    // 名字里本来带点的表不能被拆开成别的表
    expect(dialect.buildTableRef('a.b.users')).toBe('"a.b.users"');
    expect(dialect.buildTableRef('.users')).toBe('".users"');
    expect(dialect.buildTableRef('users.')).toBe('"users."');
    expect(dialect.buildTableRef('a..users')).toBe('"a..users"');
  });

  it('SQL Server：「schema.表」两段各自加方括号', () => {
    const dialect = getDialect('sqlserver');
    expect(dialect.buildTableRef('dbo.users', 'mydb')).toBe('[dbo].[users]');
    expect(dialect.buildTableRef('sales.order]s')).toBe('[sales].[order]]s]');
    // 库名不能当限定符：两段的 [库].[表] 会被当成 schema.表
    expect(dialect.buildTableRef('users', 'mydb')).toBe('[users]');
  });

  // 其余库的行为不变：库名照旧当限定部分，名字里的点不拆
  it('MySQL 系：库名当限定部分，名字里的点不拆', () => {
    const dialect = getDialect('mysql');
    expect(dialect.buildTableRef('users', 'shop')).toBe('`shop`.`users`');
    expect(dialect.buildTableRef('users')).toBe('`users`');
    expect(dialect.buildTableRef('a.users', 'shop')).toBe('`shop`.`a.users`');
    expect(getDialect('mariadb').buildTableRef('users', 'shop')).toBe('`shop`.`users`');
    expect(getDialect('clickhouse').buildTableRef('users', 'shop')).toBe('`shop`.`users`');
  });

  it('SQLite / Oracle / 达梦：名字里带点的表原样加引号', () => {
    expect(getDialect('sqlite').buildTableRef('a.users')).toBe('"a.users"');
    expect(getDialect('oracle').buildTableRef('a.users')).toBe('"a.users"');
    expect(getDialect('dameng').buildTableRef('a.users')).toBe('"a.users"');
  });
});

const column = (name: string, type: string, extra: Partial<DialectColumn> = {}): DialectColumn => ({
  name,
  type,
  nullable: true,
  ...extra,
});

describe('PG 方言的建表 / 改表 / 注释', () => {
  const dialect = getDialect('postgresql');

  // 表设计器改已有表：表名带 schema 时 ALTER 要落到那张表上，而不是名叫 "app.users" 的表
  it('buildAlterTable：「schema.表」按段加引号', () => {
    const statements = dialect.buildAlterTable({
      tableName: 'app.users',
      columns: [{ type: 'add', column: column('note', 'text') }],
      indexes: [],
      foreignKeys: [],
    });
    expect(statements).toEqual(['ALTER TABLE "app"."users" ADD COLUMN "note" text;']);
  });

  it('buildCreateTable：表和索引带 schema', () => {
    const sql = dialect.buildCreateTable({
      tableName: 'app.users',
      columns: [column('id', 'integer', { nullable: false, isPrimary: true })],
      indexes: [{ name: 'users_id_idx', type: 'INDEX', columns: ['id'] }],
      foreignKeys: [],
    });
    expect(sql).toContain('CREATE TABLE "app"."users" (');
    expect(sql).toContain('CREATE INDEX "users_id_idx" ON "app"."users" ("id");');
  });

  // 此前表名用的是字符串字面量的引号：COMMENT ON COLUMN 'users'.'name' 本身就是语法错误
  it('列注释：表名按标识符转义', () => {
    expect(dialect.buildColumnComment('users', 'name', "it's", undefined)).toBe(
      `COMMENT ON COLUMN "users"."name" IS 'it''s';`
    );
    expect(dialect.buildColumnComment('app.users', 'name', 'x', undefined)).toBe(
      `COMMENT ON COLUMN "app"."users"."name" IS 'x';`
    );
    // 建表语句里带的列注释同样要能用
    const sql = dialect.buildCreateTable({
      tableName: 'app.users',
      columns: [column('id', 'integer', { comment: 'primary key' })],
      indexes: [],
      foreignKeys: [],
    });
    expect(sql).toContain(`COMMENT ON COLUMN "app"."users"."id" IS 'primary key';`);
    expect(sql).not.toContain(`COLUMN 'app.users'`);
  });

  // 第二个参数是调用方传的库名：此前拿它当 schema 过滤，PG 上一行都查不到
  it('表信息查询：schema 只从表名里取，库名不当过滤条件', () => {
    const qualified = dialect.buildTableInfoQuery('app.users', 'mydb');
    expect(qualified).toContain(`c.relname = 'users'`);
    expect(qualified).toContain(`n.nspname = 'app'`);
    expect(qualified).not.toContain(`'mydb'`);

    const bare = dialect.buildTableInfoQuery('users', 'mydb');
    expect(bare).toContain(`c.relname = 'users'`);
    // 不按库名过滤；同名表在多个 schema 里时优先当前 schema 的那张
    expect(bare).not.toContain(`n.nspname = '`);
    expect(bare).not.toContain(`'mydb'`);
    expect(bare).toContain(`ORDER BY (n.nspname = current_schema()) DESC`);
  });
});

describe('SQL Server 方言的建表 / 改表', () => {
  const dialect = getDialect('sqlserver');

  // 没有真实 SQL Server：这里只能确认表引用拼对了、语句合乎 T-SQL 语法（ADD 后的 COLUMN 可省）
  it('「schema.表」按段加方括号', () => {
    expect(
      dialect.buildAlterTable({
        tableName: 'sales.orders',
        columns: [{ type: 'add', column: column('note', 'nvarchar(100)') }],
        indexes: [],
        foreignKeys: [],
      })
    ).toEqual(['ALTER TABLE [sales].[orders] ADD [note] nvarchar(100);']);
    expect(
      dialect.buildCreateTable({
        tableName: 'sales.orders',
        columns: [column('id', 'int', { nullable: false })],
        indexes: [],
        foreignKeys: [],
      })
    ).toContain('CREATE TABLE [sales].[orders] (');
  });
});
