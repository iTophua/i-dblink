import { BaseDialect } from './base';
import type {
  SqlDialect,
  PaginationOptions,
  CreateTableOptions,
  AlterTableOptions,
} from './types';
import type { DatabaseType } from '../../types/api';

/**
 * PostgreSQL / Kingbase / HighGo / VastBase 方言
 */
class PostgreSQLDialect extends BaseDialect implements SqlDialect {
  readonly dbType: DatabaseType = 'postgresql';

  protected get quoteChar() {
    return { open: '"', close: '"' };
  }

  protected escapeQuote(name: string): string {
    return name.replace(/"/g, '""');
  }

  protected escapeStringValue(str: string): string {
    // PostgreSQL 标准字符串转义：' 转义为 ''
    return str.replace(/'/g, "''");
  }

  protected get currentTimestampFn() {
    return 'CURRENT_TIMESTAMP';
  }

  // PostgreSQL 中 database ≠ schema，连接已通过 resolvePGExec 切换到目标库
  // 表引用不应加 database 前缀，直接使用表名即可
  buildTableRef(tableName: string, _schema?: string): string {
    return this.escapeIdentifier(tableName);
  }

  // ── 分页 ──────────────────────────────────────────────────────────────

  buildPaginationQuery(sql: string, options: PaginationOptions): string {
    return `${sql} LIMIT ${options.limit} OFFSET ${options.offset}`;
  }

  // ── DDL ───────────────────────────────────────────────────────────────

  buildCreateTable(options: CreateTableOptions): string {
    const { tableName, columns, indexes, foreignKeys } = options;
    const parts: string[] = [];

    // 列定义
    for (const col of columns) {
      if (!col.name) continue;
      parts.push(`  ${this.buildColumnDef(col)}`);
    }

    // 主键约束（内联）
    const pkCols = columns.filter((c) => c.isPrimary).map((c) => this.escapeIdentifier(c.name));
    if (pkCols.length > 0 && !indexes.some((i) => i.type === 'PRIMARY')) {
      parts.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
    }

    // 唯一约束（内联）
    for (const idx of indexes) {
      if (idx.type === 'UNIQUE') {
        const cols = idx.columns.map((c) => this.escapeIdentifier(c)).join(', ');
        parts.push(`  CONSTRAINT ${this.escapeIdentifier(idx.name)} UNIQUE (${cols})`);
      }
    }

    // 外键（内联）
    for (const fk of foreignKeys) {
      if (!fk.name || !fk.column || !fk.referencedTable || !fk.referencedColumn) continue;
      parts.push(`  ${this.buildForeignKeyDef(fk)}`);
    }

    const statements: string[] = [
      `CREATE TABLE ${this.escapeIdentifier(tableName)} (\n${parts.join(',\n')}\n);`,
    ];

    // 普通索引需要单独的 CREATE INDEX 语句
    for (const idx of indexes) {
      if (idx.type === 'INDEX') {
        const cols = idx.columns.map((c) => this.escapeIdentifier(c)).join(', ');
        statements.push(
          `CREATE INDEX ${this.escapeIdentifier(idx.name)} ON ${this.escapeIdentifier(tableName)} (${cols});`
        );
      }
    }

    // 列注释
    for (const col of columns) {
      if (col.comment) {
        const commentSQL = this.buildColumnComment(tableName, col.name, col.comment);
        if (commentSQL) statements.push(commentSQL);
      }
    }

    return statements.join('\n');
  }

  buildAlterTable(options: AlterTableOptions): string[] {
    const { tableName, columns, indexes, foreignKeys } = options;
    const tableRef = this.escapeIdentifier(tableName);
    const statements: string[] = [];

    // 列变更
    for (const change of columns) {
      switch (change.type) {
        case 'add':
          statements.push(`ALTER TABLE ${tableRef} ADD COLUMN ${this.buildColumnDef(change.column)};`);
          break;
        case 'drop':
          statements.push(`ALTER TABLE ${tableRef} DROP COLUMN ${this.escapeIdentifier(change.column.name)};`);
          break;
        case 'modify': {
          const colName = this.escapeIdentifier(change.column.name);
          // PostgreSQL 修改列需要多条语句
          if (change.column.type) {
            statements.push(
              `ALTER TABLE ${tableRef} ALTER COLUMN ${colName} TYPE ${change.column.type};`
            );
          }
          if (change.column.defaultValue !== undefined) {
            statements.push(
              `ALTER TABLE ${tableRef} ALTER COLUMN ${colName} SET DEFAULT ${this.formatDefaultValue(change.column.defaultValue)};`
            );
          }
          if (!change.column.nullable) {
            statements.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${colName} SET NOT NULL;`);
          } else {
            statements.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${colName} DROP NOT NULL;`);
          }
          break;
        }
        case 'rename':
          if (change.oldName) {
            statements.push(
              `ALTER TABLE ${tableRef} RENAME COLUMN ${this.escapeIdentifier(change.oldName)} TO ${this.escapeIdentifier(change.column.name)};`
            );
          }
          break;
      }
    }

    // 索引变更
    for (const change of indexes) {
      if (change.type === 'drop') {
        statements.push(`DROP INDEX ${this.escapeIdentifier(change.index.name)};`);
      } else {
        const cols = change.index.columns.map((c) => this.escapeIdentifier(c)).join(', ');
        const unique = change.index.type === 'UNIQUE' ? 'UNIQUE ' : '';
        statements.push(
          `CREATE ${unique}INDEX ${this.escapeIdentifier(change.index.name)} ON ${tableRef} (${cols});`
        );
      }
    }

    // 外键变更
    for (const change of foreignKeys) {
      if (change.type === 'drop') {
        statements.push(`ALTER TABLE ${tableRef} DROP CONSTRAINT ${this.escapeIdentifier(change.foreignKey.name)};`);
      } else {
        statements.push(`ALTER TABLE ${tableRef} ADD ${this.buildForeignKeyDef(change.foreignKey)};`);
      }
    }

    return statements;
  }

  buildDropTable(tableRef: string, ifExists?: boolean): string {
    const ifExistsClause = ifExists ? 'IF EXISTS ' : '';
    return `DROP TABLE ${ifExistsClause}${tableRef};`;
  }

  // ── 条件 ──────────────────────────────────────────────────────────────

  buildLikeCondition(field: string, value: string): { condition: string; value: string } {
    // PostgreSQL 需要 ESCAPE 子句
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    return {
      condition: `${this.escapeIdentifier(field)} LIKE ? ESCAPE '\\'`,
      value: escaped,
    };
  }

  // ── 元数据查询 ────────────────────────────────────────────────────────

  buildExplainQuery(sql: string): string {
    return `EXPLAIN ${sql}`;
  }

  buildTableInfoQuery(tableName: string, schema?: string): string {
    const safeTable = this.escapeValue(tableName);
    const safeSchema = schema ? this.escapeValue(schema) : null;
    let sql = `
      SELECT c.relname AS table_name,
        CASE WHEN c.relkind = 'r' THEN 'BASE TABLE' WHEN c.relkind = 'v' THEN 'VIEW' ELSE c.relkind END AS table_type,
        NULL AS row_count,
        pg_table_size(c.oid) AS data_size,
        pg_total_relation_size(c.oid) AS total_size,
        obj_description(c.oid) AS comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = ${safeTable}
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
    `;
    if (safeSchema) {
      sql += ` AND n.nspname = ${safeSchema}`;
    }
    return sql;
  }

  buildTableDDLQuery(tableName: string, schema?: string): string {
    const safeTable = this.escapeValue(tableName);
    const safeSchema = schema ? this.escapeValue(schema) : 'public';
    return `SELECT pg_catalog.pg_get_tabledef(${safeSchema}.${safeTable}::regclass)`;
  }

  buildColumnComment(tableName: string, columnName: string, comment: string, schema?: string): string | null {
    const tableRef = schema
      ? `${this.escapeValue(schema)}.${this.escapeValue(tableName)}`
      : this.escapeValue(tableName);
    return `COMMENT ON COLUMN ${tableRef}.${this.escapeIdentifier(columnName)} IS '${this.escapeStringValue(comment)}';`;
  }

  // ── 特性 ──────────────────────────────────────────────────────────────

  supportsAlterOperation(
    _operation: 'modifyColumn' | 'dropColumn' | 'addIndex' | 'dropIndex' | 'addForeignKey' | 'dropForeignKey'
  ): boolean {
    return true;
  }

  emptyStringIsNull(): boolean {
    return false;
  }

  formatBoolean(value: boolean): string {
    return value ? 'TRUE' : 'FALSE';
  }

  // ── 辅助 ──────────────────────────────────────────────────────────────

  protected supportsTypeLength(type: string): boolean {
    // PostgreSQL 的 INTEGER, BIGINT, SMALLINT, SERIAL, BIGSERIAL 不支持长度
    const noLengthTypes = [
      'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL',
      'BOOLEAN', 'BOOL', 'JSON', 'JSONB', 'TEXT', 'BYTEA',
      'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIMETZ',
    ];
    if (noLengthTypes.includes(type.toUpperCase())) return false;
    return super.supportsTypeLength(type);
  }
}

export const postgresDialect = new PostgreSQLDialect();
