/**
 * 表的完整名字：PG 系和 SQL Server 带 schema（schema.表），其余库就是表名。
 * 不带 schema 时 PG 按 search_path 找同名表，数据页读的、改的可能是别的 schema 里的表
 */
import { describe, it, expect } from 'vitest';
import {
  qualifiedTableName,
  splitSchemaQualifiedTable,
  supportsSchemaQualifier,
} from '../../utils/qualifiedName';

describe('supportsSchemaQualifier', () => {
  it('PG 系和 SQL Server 认 schema', () => {
    for (const dbType of ['postgresql', 'kingbase', 'highgo', 'vastbase', 'sqlserver']) {
      expect(supportsSchemaQualifier(dbType), dbType).toBe(true);
    }
  });

  it('其余库不认：MySQL 的库是单独一个参数，Oracle / 达梦的 schema 不走这条', () => {
    for (const dbType of [
      'mysql',
      'mariadb',
      'sqlite',
      'oracle',
      'dameng',
      'clickhouse',
      'tdengine',
      undefined,
      '',
    ]) {
      expect(supportsSchemaQualifier(dbType), String(dbType)).toBe(false);
    }
  });
});

describe('qualifiedTableName', () => {
  it('认 schema 的库：带上 schema', () => {
    expect(qualifiedTableName('users', 'app', 'postgresql')).toBe('app.users');
    expect(qualifiedTableName('users', 'public', 'postgresql')).toBe('public.users');
    expect(qualifiedTableName('orders', 'sales', 'sqlserver')).toBe('sales.orders');
    expect(qualifiedTableName('t', 's', 'kingbase')).toBe('s.t');
  });

  it('表名本身已经带 schema、或名字里本来有点的，不再拼', () => {
    expect(qualifiedTableName('app.users', 'app', 'postgresql')).toBe('app.users');
    expect(qualifiedTableName('a.b.users', 'app', 'postgresql')).toBe('a.b.users');
  });

  it('没有 schema、或不认 schema 的库：原样返回', () => {
    expect(qualifiedTableName('users', undefined, 'postgresql')).toBe('users');
    expect(qualifiedTableName('users', '', 'postgresql')).toBe('users');
    expect(qualifiedTableName('users', null, 'postgresql')).toBe('users');
    expect(qualifiedTableName('users', 'app', 'mysql')).toBe('users');
    // Oracle 的 owner 不走这条：带了会被当成名字本身加引号，查询报错
    expect(qualifiedTableName('users', 'HR', 'oracle')).toBe('users');
    expect(qualifiedTableName('users', 'app', undefined)).toBe('users');
  });
});

describe('splitSchemaQualifiedTable', () => {
  it('恰好一个点的名字拆成 schema 和表名', () => {
    expect(splitSchemaQualifiedTable('app.users', 'postgresql')).toEqual({
      schema: 'app',
      table: 'users',
    });
    expect(splitSchemaQualifiedTable('sales.orders', 'sqlserver')).toEqual({
      schema: 'sales',
      table: 'orders',
    });
  });

  it('不是这个形式、或不认 schema 的库：返回 null', () => {
    expect(splitSchemaQualifiedTable('users', 'postgresql')).toBeNull();
    expect(splitSchemaQualifiedTable('a.b.users', 'postgresql')).toBeNull();
    expect(splitSchemaQualifiedTable('.users', 'postgresql')).toBeNull();
    expect(splitSchemaQualifiedTable('users.', 'postgresql')).toBeNull();
    expect(splitSchemaQualifiedTable('shop.users', 'mysql')).toBeNull();
    expect(splitSchemaQualifiedTable('app.users', undefined)).toBeNull();
  });
});
