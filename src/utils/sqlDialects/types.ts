/**
 * SQL 方言接口 - 为不同数据库提供统一的 SQL 生成接口
 */

import type { DatabaseType } from '../../types/api';

// ── 分页选项 ──────────────────────────────────────────────────────────────

export interface PaginationOptions {
  /** 跳过前 offset 条记录 */
  offset: number;
  /** 每页大小 */
  limit: number;
}

// ── 列定义 ──────────────────────────────────────────────────────────────

export interface DialectColumn {
  name: string;
  type: string;
  /** 长度/精度（如 VARCHAR(255) 中的 255，或 DECIMAL(10,2) 中的 10） */
  length?: number;
  /** 小数位（如 DECIMAL(10,2) 中的 2） */
  scale?: number;
  nullable: boolean;
  defaultValue?: string;
  comment?: string;
  isPrimary?: boolean;
}

// ── 索引定义 ────────────────────────────────────────────────────────────

export interface DialectIndex {
  name: string;
  type: 'PRIMARY' | 'UNIQUE' | 'INDEX';
  columns: string[];
}

// ── 外键定义 ────────────────────────────────────────────────────────────

export interface DialectForeignKey {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onUpdate: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' | 'SET DEFAULT';
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' | 'SET DEFAULT';
}

// ── CREATE TABLE 选项 ───────────────────────────────────────────────────

export interface CreateTableOptions {
  tableName: string;
  columns: DialectColumn[];
  indexes: DialectIndex[];
  foreignKeys: DialectForeignKey[];
}

// ── ALTER TABLE 选项 ────────────────────────────────────────────────────

export interface AlterColumnChange {
  type: 'add' | 'drop' | 'modify' | 'rename';
  column: DialectColumn;
  /** modify/rename 时的原始列名 */
  oldName?: string;
}

export interface AlterIndexChange {
  type: 'add' | 'drop';
  index: DialectIndex;
}

export interface AlterForeignKeyChange {
  type: 'add' | 'drop';
  foreignKey: DialectForeignKey;
}

export interface AlterTableOptions {
  tableName: string;
  columns: AlterColumnChange[];
  indexes: AlterIndexChange[];
  foreignKeys: AlterForeignKeyChange[];
}

// ── 方言接口 ────────────────────────────────────────────────────────────

export interface SqlDialect {
  /** 数据库类型标识 */
  readonly dbType: DatabaseType;

  /** 转义标识符 */
  escapeIdentifier(name: string): string;

  /** 转义值 */
  escapeValue(value: unknown): string;

  /** 构建表引用（支持 schema.table） */
  buildTableRef(tableName: string, schema?: string): string;

  /** 构建分页查询 */
  buildPaginationQuery(sql: string, options: PaginationOptions): string;

  /** 构建 COUNT 查询 */
  buildCountQuery(tableRef: string, whereClause?: string): string;

  /** 构建 SELECT 查询 */
  buildSelectQuery(tableRef: string, columns: string[], whereClause?: string, orderBy?: string, pagination?: PaginationOptions): string;

  /** 构建 INSERT 语句 */
  buildInsert(tableRef: string, columns: string[], values: unknown[][]): string[];

  /** 构建 UPDATE 语句 */
  buildUpdate(tableRef: string, setters: Record<string, unknown>, whereClause: string): string;

  /** 构建 DELETE 语句 */
  buildDelete(tableRef: string, whereClause: string): string;

  /** 构建 CREATE TABLE */
  buildCreateTable(options: CreateTableOptions): string;

  /** 构建 ALTER TABLE（返回多条语句） */
  buildAlterTable(options: AlterTableOptions): string[];

  /** 构建 DROP TABLE */
  buildDropTable(tableRef: string, ifExists?: boolean): string;

  /** 构建 LIKE 条件值（包含转义和 ESCAPE 子句） */
  buildLikeCondition(field: string, value: string): { condition: string; value: string };

  /** 构建 EXPLAIN 查询 */
  buildExplainQuery(sql: string): string;

  /** 获取表信息查询 */
  buildTableInfoQuery(tableName: string, schema?: string): string;

  /** 获取表 DDL 查询 */
  buildTableDDLQuery(tableName: string, schema?: string): string;

  /** 获取列注释 SQL */
  buildColumnComment(tableName: string, columnName: string, comment: string, schema?: string): string | null;

  /** 是否支持某种 ALTER TABLE 操作 */
  supportsAlterOperation(operation: 'modifyColumn' | 'dropColumn' | 'addIndex' | 'dropIndex' | 'addForeignKey' | 'dropForeignKey'): boolean;

  /** 是否将空字符串视为 NULL */
  emptyStringIsNull(): boolean;

  /** 获取布尔值的 SQL 表示 */
  formatBoolean(value: boolean): string;

  /** 获取当前时间函数 */
  getCurrentTimestamp(): string;
}

export type DialectRegistry = Record<DatabaseType, SqlDialect>;
