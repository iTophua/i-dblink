import { BaseDialect } from './base';
import type {
  SqlDialect,
  PaginationOptions,
  CreateTableOptions,
  AlterTableOptions,
} from './types';
import type { DatabaseType } from '../../types/api';

/**
 * SQLite 方言
 */
class SQLiteDialect extends BaseDialect implements SqlDialect {
  readonly dbType: DatabaseType = 'sqlite';

  protected get quoteChar() {
    return { open: '"', close: '"' };
  }

  protected escapeQuote(name: string): string {
    return name.replace(/"/g, '""');
  }

  protected escapeStringValue(str: string): string {
    return str.replace(/'/g, "''");
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

    return statements.join('\n');
  }

  buildAlterTable(options: AlterTableOptions): string[] {
    const { tableName, columns } = options;
    const tableRef = this.escapeIdentifier(tableName);
    const statements: string[] = [];

    // SQLite 3.35.0+ 支持 ADD COLUMN 和 DROP COLUMN
    for (const change of columns) {
      switch (change.type) {
        case 'add':
          statements.push(`ALTER TABLE ${tableRef} ADD COLUMN ${this.buildColumnDef(change.column)};`);
          break;
        case 'drop':
          statements.push(`ALTER TABLE ${tableRef} DROP COLUMN ${this.escapeIdentifier(change.column.name)};`);
          break;
        case 'modify':
          // SQLite 不支持 MODIFY COLUMN，需要重建表
          statements.push(
            `-- SQLite does not support MODIFY COLUMN directly. Consider recreating the table.`
          );
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

    // 索引变更：SQLite 支持 CREATE INDEX / DROP INDEX
    for (const change of options.indexes) {
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

    // 外键变更：SQLite 3.35.0+ 不支持，需要重建表
    if (options.foreignKeys.length > 0) {
      statements.push(`-- SQLite does not support ALTER TABLE for foreign keys. Consider recreating the table.`);
    }

    return statements;
  }

  buildDropTable(tableRef: string, ifExists?: boolean): string {
    const ifExistsClause = ifExists ? 'IF EXISTS ' : '';
    return `DROP TABLE ${ifExistsClause}${tableRef};`;
  }

  // ── 条件 ──────────────────────────────────────────────────────────────

  buildLikeCondition(field: string, value: string): { condition: string; value: string } {
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    return {
      condition: `${this.escapeIdentifier(field)} LIKE ? ESCAPE '\\'`,
      value: escaped,
    };
  }

  // ── 元数据查询 ────────────────────────────────────────────────────────

  buildExplainQuery(sql: string): string {
    return `EXPLAIN QUERY PLAN ${sql}`;
  }

  buildTableInfoQuery(tableName: string, _schema?: string): string {
    const safeTable = this.escapeValue(tableName);
    return `SELECT name, type, sql FROM sqlite_master WHERE name = ${safeTable} AND type = 'table'`;
  }

  buildTableDDLQuery(tableName: string, _schema?: string): string {
    const safeTable = this.escapeValue(tableName);
    return `SELECT sql FROM sqlite_master WHERE name = ${safeTable} AND type = 'table'`;
  }

  buildColumnComment(): string | null {
    return null; // SQLite 不支持列注释
  }

  // ── 特性 ──────────────────────────────────────────────────────────────

  supportsAlterOperation(
    operation: 'modifyColumn' | 'dropColumn' | 'addIndex' | 'dropIndex' | 'addForeignKey' | 'dropForeignKey'
  ): boolean {
    switch (operation) {
      case 'modifyColumn':
      case 'addForeignKey':
      case 'dropForeignKey':
        return false;
      default:
        return true;
    }
  }

  emptyStringIsNull(): boolean {
    return false;
  }

  formatBoolean(value: boolean): string {
    return value ? '1' : '0';
  }
}

export const sqliteDialect = new SQLiteDialect();
