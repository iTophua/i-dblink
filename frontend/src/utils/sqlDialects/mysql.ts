import { BaseDialect } from './base';
import type {
  SqlDialect,
  PaginationOptions,
  CreateTableOptions,
  AlterTableOptions,
  DialectColumn,
} from './types';
import type { DatabaseType } from '../../types/api';

/**
 * MySQL / MariaDB 方言
 */
class MySQLDialect extends BaseDialect implements SqlDialect {
  readonly dbType: DatabaseType = 'mysql';

  protected get quoteChar() {
    return { open: '`', close: '`' };
  }

  protected escapeQuote(name: string): string {
    return name.replace(/`/g, '``');
  }

  protected escapeStringValue(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\0/g, '\\0');
  }

  protected get currentTimestampFn() {
    return 'CURRENT_TIMESTAMP';
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

    // 索引（MySQL 支持内联）
    for (const idx of indexes) {
      const def = this.buildIndexDef(idx, true);
      if (def) parts.push(`  ${def}`);
    }

    // 外键
    for (const fk of foreignKeys) {
      if (!fk.name || !fk.column || !fk.referencedTable || !fk.referencedColumn) continue;
      parts.push(`  ${this.buildForeignKeyDef(fk)}`);
    }

    // 自动添加主键（如果没有显式 PRIMARY KEY 索引）
    const pkCols = columns.filter((c) => c.isPrimary).map((c) => this.escapeIdentifier(c.name));
    if (pkCols.length > 0 && !indexes.some((i) => i.type === 'PRIMARY')) {
      parts.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
    }

    return `CREATE TABLE ${this.escapeIdentifier(tableName)} (\n${parts.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
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
        case 'modify':
          if (change.oldName) {
            statements.push(`ALTER TABLE ${tableRef} CHANGE COLUMN ${this.escapeIdentifier(change.oldName)} ${this.buildColumnDef(change.column)};`);
          } else {
            statements.push(`ALTER TABLE ${tableRef} MODIFY COLUMN ${this.buildColumnDef(change.column)};`);
          }
          break;
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
        statements.push(`ALTER TABLE ${tableRef} DROP INDEX ${this.escapeIdentifier(change.index.name)};`);
      } else {
        const cols = change.index.columns.map((c) => this.escapeIdentifier(c)).join(', ');
        if (change.index.type === 'UNIQUE') {
          statements.push(
            `ALTER TABLE ${tableRef} ADD CONSTRAINT ${this.escapeIdentifier(change.index.name)} UNIQUE (${cols});`
          );
        } else {
          statements.push(`ALTER TABLE ${tableRef} ADD INDEX ${this.escapeIdentifier(change.index.name)} (${cols});`);
        }
      }
    }

    // 外键变更
    for (const change of foreignKeys) {
      if (change.type === 'drop') {
        statements.push(`ALTER TABLE ${tableRef} DROP FOREIGN KEY ${this.escapeIdentifier(change.foreignKey.name)};`);
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

  // ── 列定义（MySQL 特有：支持 COMMENT） ─────────────────────────────────

  protected buildColumnDef(col: DialectColumn): string {
    let def = super.buildColumnDef(col);
    if (col.comment) {
      def += ` COMMENT '${this.escapeStringValue(col.comment)}'`;
    }
    return def;
  }

  // ── 条件 ──────────────────────────────────────────────────────────────

  buildLikeCondition(field: string, value: string): { condition: string; value: string } {
    // MySQL 默认 \ 是转义字符
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
    return {
      condition: `${this.escapeIdentifier(field)} LIKE ?`,
      value: escaped,
    };
  }

  // ── 元数据查询 ────────────────────────────────────────────────────────

  buildExplainQuery(sql: string): string {
    return `EXPLAIN ${sql}`;
  }

  buildTableInfoQuery(tableName: string, schema?: string): string {
    const safeTable = this.escapeValue(tableName);
    if (schema) {
      const safeSchema = this.escapeValue(schema);
      return `SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, CREATE_TIME, UPDATE_TIME, TABLE_COLLATION, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${safeSchema} AND TABLE_NAME = ${safeTable}`;
    }
    return `SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, CREATE_TIME, UPDATE_TIME, TABLE_COLLATION, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_NAME = ${safeTable}`;
  }

  buildTableDDLQuery(tableName: string, schema?: string): string {
    const safeTable = this.escapeIdentifier(tableName);
    if (schema) {
      return `SHOW CREATE TABLE ${this.escapeIdentifier(schema)}.${safeTable}`;
    }
    return `SHOW CREATE TABLE ${safeTable}`;
  }

  buildColumnComment(tableName: string, columnName: string, comment: string, schema?: string): string | null {
    const tableRef = schema
      ? `${this.escapeIdentifier(schema)}.${this.escapeIdentifier(tableName)}`
      : this.escapeIdentifier(tableName);
    return `ALTER TABLE ${tableRef} MODIFY COLUMN ${this.escapeIdentifier(columnName)} ... COMMENT '${this.escapeStringValue(comment)}'`;
  }

  // ── 特性 ──────────────────────────────────────────────────────────────

  supportsAlterOperation(
    _operation: 'modifyColumn' | 'dropColumn' | 'addIndex' | 'dropIndex' | 'addForeignKey' | 'dropForeignKey'
  ): boolean {
    return true; // MySQL 支持所有 ALTER TABLE 操作
  }

  emptyStringIsNull(): boolean {
    return false;
  }

  formatBoolean(value: boolean): string {
    return value ? 'TRUE' : 'FALSE';
  }
}

export const mysqlDialect = new MySQLDialect();
