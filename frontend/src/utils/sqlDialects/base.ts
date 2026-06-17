import type {
  SqlDialect,
  PaginationOptions,
  CreateTableOptions,
  AlterTableOptions,
  DialectColumn,
  DialectIndex,
} from './types';
import type { DatabaseType } from '../../types/api';

/**
 * SQL 方言基础类 - 提供通用的默认实现
 */
export abstract class BaseDialect implements SqlDialect {
  abstract readonly dbType: DatabaseType;

  /** 引号字符 */
  protected abstract get quoteChar(): { open: string; close: string };

  /** 标识符中的引号转义 */
  protected abstract escapeQuote(name: string): string;

  /** 值中的字符串转义 */
  protected abstract escapeStringValue(str: string): string;

  /** 当前时间函数名 */
  protected abstract get currentTimestampFn(): string;

  // ── 标识符和值转义 ────────────────────────────────────────────────────

  escapeIdentifier(name: string): string {
    const { open, close } = this.quoteChar;
    return `${open}${this.escapeQuote(name)}${close}`;
  }

  escapeValue(value: unknown): string {
    // Symbol 仅用于表示 SQL 关键字占位（如 DEFAULT_MARKER）。
    // description 必须是合法的 SQL 裸关键字（DEFAULT / NULL / TRUE / FALSE / NOW() 等），
    // 这里做白名单校验，避免误用导致 SQL 语法错误或注入。
    if (typeof value === 'symbol') {
      const kw = value.description ?? 'DEFAULT';
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(kw)) {
        throw new Error(`Invalid SQL keyword from symbol description: ${kw}`);
      }
      return kw;
    }
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'boolean') {
      return this.formatBoolean(value);
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (value === '') {
      return this.emptyStringIsNull() ? 'NULL' : "''";
    }
    const str = String(value);
    return `'${this.escapeStringValue(str)}'`;
  }

  buildTableRef(tableName: string, schema?: string): string {
    const table = this.escapeIdentifier(tableName);
    if (schema) {
      return `${this.escapeIdentifier(schema)}.${table}`;
    }
    return table;
  }

  // ── 查询构建 ──────────────────────────────────────────────────────────

  abstract buildPaginationQuery(sql: string, options: PaginationOptions): string;

  buildCountQuery(tableRef: string, whereClause?: string): string {
    let sql = `SELECT COUNT(*) AS cnt FROM ${tableRef}`;
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    return sql;
  }

  buildSelectQuery(
    tableRef: string,
    columns: string[],
    whereClause?: string,
    orderBy?: string,
    pagination?: PaginationOptions
  ): string {
    const cols = columns.length > 0 ? columns.join(', ') : '*';
    let sql = `SELECT ${cols} FROM ${tableRef}`;
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }
    if (pagination) {
      return this.buildPaginationQuery(sql, pagination);
    }
    return sql;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────

  buildInsert(tableRef: string, columns: string[], values: unknown[][]): string[] {
    if (values.length === 0) return [];

    const colStr = columns.map((c) => this.escapeIdentifier(c)).join(', ');

    // 批量插入：多条 VALUES
    const valueStrs = values.map((row) => {
      const vals = row.map((v) => this.escapeValue(v));
      return `(${vals.join(', ')})`;
    });

    if (values.length === 1) {
      return [`INSERT INTO ${tableRef} (${colStr}) VALUES ${valueStrs[0]}`];
    }

    // 大多数数据库支持多行 VALUES
    return [`INSERT INTO ${tableRef} (${colStr}) VALUES\n${valueStrs.join(',\n')}`];
  }

  buildUpdate(tableRef: string, setters: Record<string, unknown>, whereClause: string): string {
    const entries = Object.entries(setters);
    if (entries.length === 0) throw new Error('Update requires at least one setter');

    const setStr = entries
      .map(([col, val]) => `${this.escapeIdentifier(col)} = ${this.escapeValue(val)}`)
      .join(', ');

    return `UPDATE ${tableRef} SET ${setStr} WHERE ${whereClause}`;
  }

  buildDelete(tableRef: string, whereClause: string): string {
    return `DELETE FROM ${tableRef} WHERE ${whereClause}`;
  }

  // ── DDL ───────────────────────────────────────────────────────────────

  abstract buildCreateTable(options: CreateTableOptions): string;

  abstract buildAlterTable(options: AlterTableOptions): string[];

  abstract buildDropTable(tableRef: string, ifExists?: boolean): string;

  // ── 条件 ──────────────────────────────────────────────────────────────

  buildLikeCondition(field: string, value: string, negate = false): { condition: string; value: string } {
    // 默认实现：使用 LIKE + ESCAPE '\'
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
    const op = negate ? 'NOT LIKE' : 'LIKE';
    return {
      condition: `${this.escapeIdentifier(field)} ${op} ? ESCAPE '\\'`,
      value: escaped,
    };
  }

  // ── 元数据查询 ────────────────────────────────────────────────────────

  abstract buildExplainQuery(sql: string): string;

  abstract buildTableInfoQuery(tableName: string, schema?: string): string;

  abstract buildTableDDLQuery(tableName: string, schema?: string): string;

  abstract buildColumnComment(
    tableName: string,
    columnName: string,
    comment: string,
    schema?: string
  ): string | null;

  // ── 特性支持 ──────────────────────────────────────────────────────────

  abstract supportsAlterOperation(
    operation: 'modifyColumn' | 'dropColumn' | 'addIndex' | 'dropIndex' | 'addForeignKey' | 'dropForeignKey'
  ): boolean;

  abstract emptyStringIsNull(): boolean;

  abstract formatBoolean(value: boolean): string;

  getCurrentTimestamp(): string {
    return this.currentTimestampFn;
  }

  // ── 辅助方法 ──────────────────────────────────────────────────────────

  /**
   * 生成列定义字符串（用于 CREATE TABLE / ALTER TABLE）
   */
  protected buildColumnDef(col: DialectColumn): string {
    let def = `${this.escapeIdentifier(col.name)} ${col.type}`;
    if (col.length !== undefined && col.length > 0 && this.supportsTypeLength(col.type)) {
      if (col.scale !== undefined && col.scale >= 0) {
        def += `(${col.length},${col.scale})`;
      } else {
        def += `(${col.length})`;
      }
    }
    if (!col.nullable) {
      def += ' NOT NULL';
    }
    if (col.defaultValue !== undefined) {
      def += ` DEFAULT ${this.formatDefaultValue(col.defaultValue)}`;
    }
    return def;
  }

  /**
   * 判断类型是否支持长度参数
   */
  protected supportsTypeLength(type: string): boolean {
    const noLengthTypes = [
      'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT',
      'SERIAL', 'BIGSERIAL', 'BOOLEAN', 'BOOL', 'JSON', 'JSONB',
      'TEXT', 'BLOB', 'BYTEA', 'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ',
      'TIMETZ', 'DATETIME', 'YEAR', 'CLOB', 'NCLOB', 'XML',
    ];
    return !noLengthTypes.includes(type.toUpperCase());
  }

  /**
   * 格式化默认值
   */
  protected formatDefaultValue(value: string): string {
    const upper = value.trim().toUpperCase();
    // 关键字和函数保留原样
    if (
      upper === 'NULL' ||
      upper === 'CURRENT_TIMESTAMP' ||
      upper === 'CURRENT_DATE' ||
      upper === 'CURRENT_TIME' ||
      upper.startsWith('NOW(') ||
      upper.startsWith('GETDATE(') ||
      upper.startsWith('SYSDATE(') ||
      upper === 'TRUE' ||
      upper === 'FALSE'
    ) {
      return value;
    }
    // 纯数字
    if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
      return value.trim();
    }
    // 字符串值
    return this.escapeValue(value);
  }

  /**
   * 生成外键定义
   */
  protected buildForeignKeyDef(fk: {
    name: string;
    column: string;
    referencedTable: string;
    referencedColumn: string;
    onUpdate: string;
    onDelete: string;
  }): string {
    return (
      `CONSTRAINT ${this.escapeIdentifier(fk.name)} ` +
      `FOREIGN KEY (${this.escapeIdentifier(fk.column)}) ` +
      `REFERENCES ${this.escapeIdentifier(fk.referencedTable)}(${this.escapeIdentifier(fk.referencedColumn)}) ` +
      `ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`
    );
  }

  /**
   * 生成索引定义（用于 CREATE TABLE 内联）
   */
  protected buildIndexDef(idx: DialectIndex, forInline: boolean, tableName?: string): string | null {
    const cols = idx.columns.map((c) => this.escapeIdentifier(c)).join(', ');
    if (idx.type === 'PRIMARY') {
      return `PRIMARY KEY (${cols})`;
    }
    if (forInline) {
      if (idx.type === 'UNIQUE') {
        return `CONSTRAINT ${this.escapeIdentifier(idx.name)} UNIQUE (${cols})`;
      }
      // 非唯一索引不建议内联在 CREATE TABLE 中（大部分数据库不支持）
      return null;
    }
    // 独立的 CREATE INDEX
    const unique = idx.type === 'UNIQUE' ? 'UNIQUE ' : '';
    const tableRef = tableName ? this.escapeIdentifier(tableName) : '';
    return `CREATE ${unique}INDEX ${this.escapeIdentifier(idx.name)} ON ${tableRef} (${cols})`;
  }
}
