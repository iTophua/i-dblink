import { BaseDialect } from './base';
import type {
  SqlDialect,
  PaginationOptions,
  CreateTableOptions,
  AlterTableOptions,
} from './types';
import type { DatabaseType } from '../../types/api';

/**
 * Oracle / Dameng 方言
 */
class OracleDialect extends BaseDialect implements SqlDialect {
  readonly dbType: DatabaseType = 'oracle';

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
    return 'SYSDATE';
  }

  // ── 分页 ──────────────────────────────────────────────────────────────

  buildPaginationQuery(sql: string, options: PaginationOptions): string {
    // Oracle 12c+ 使用 OFFSET FETCH
    return `${sql}\nOFFSET ${options.offset} ROWS\nFETCH NEXT ${options.limit} ROWS ONLY`;
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
      `CREATE TABLE ${this.escapeIdentifier(tableName)} (\n${parts.join(',\n')}\n)`,
    ];

    // 普通索引需要单独的 CREATE INDEX 语句
    for (const idx of indexes) {
      if (idx.type === 'INDEX') {
        const cols = idx.columns.map((c) => this.escapeIdentifier(c)).join(', ');
        statements.push(
          `CREATE INDEX ${this.escapeIdentifier(idx.name)} ON ${this.escapeIdentifier(tableName)} (${cols})`
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

    return statements.join(';\n');
  }

  buildAlterTable(options: AlterTableOptions): string[] {
    const { tableName, columns, indexes, foreignKeys } = options;
    const tableRef = this.escapeIdentifier(tableName);
    const statements: string[] = [];

    // 列变更
    for (const change of columns) {
      switch (change.type) {
        case 'add':
          statements.push(`ALTER TABLE ${tableRef} ADD (${this.buildColumnDef(change.column)})`);
          break;
        case 'drop':
          statements.push(
            `ALTER TABLE ${tableRef} DROP COLUMN ${this.escapeIdentifier(change.column.name)}`
          );
          break;
        case 'modify': {
          const colName = this.escapeIdentifier(change.column.name);
          // Oracle: MODIFY（没有 COLUMN 关键字）
          let def = `${colName} ${change.column.type}`;
          if (change.column.length && change.column.length > 0 && this.supportsTypeLength(change.column.type)) {
            if (change.column.scale !== undefined && change.column.scale >= 0) {
              def += `(${change.column.length},${change.column.scale})`;
            } else {
              def += `(${change.column.length})`;
            }
          }
          if (!change.column.nullable) {
            def += ' NOT NULL';
          }
          statements.push(`ALTER TABLE ${tableRef} MODIFY ${def}`);

          if (change.column.defaultValue !== undefined) {
            statements.push(
              `ALTER TABLE ${tableRef} MODIFY ${colName} DEFAULT ${this.formatDefaultValue(change.column.defaultValue)}`
            );
          }
          break;
        }
        case 'rename':
          if (change.oldName) {
            statements.push(
              `ALTER TABLE ${tableRef} RENAME COLUMN ${this.escapeIdentifier(change.oldName)} TO ${this.escapeIdentifier(change.column.name)}`
            );
          }
          break;
      }
    }

    // 索引变更
    for (const change of indexes) {
      if (change.type === 'drop') {
        statements.push(`DROP INDEX ${this.escapeIdentifier(change.index.name)}`);
      } else {
        const cols = change.index.columns.map((c) => this.escapeIdentifier(c)).join(', ');
        const unique = change.index.type === 'UNIQUE' ? 'UNIQUE ' : '';
        statements.push(
          `CREATE ${unique}INDEX ${this.escapeIdentifier(change.index.name)} ON ${tableRef} (${cols})`
        );
      }
    }

    // 外键变更
    for (const change of foreignKeys) {
      if (change.type === 'drop') {
        statements.push(`ALTER TABLE ${tableRef} DROP CONSTRAINT ${this.escapeIdentifier(change.foreignKey.name)}`);
      } else {
        statements.push(`ALTER TABLE ${tableRef} ADD ${this.buildForeignKeyDef(change.foreignKey)}`);
      }
    }

    return statements;
  }

  buildDropTable(tableRef: string, ifExists?: boolean): string {
    if (ifExists) {
      return `BEGIN EXECUTE IMMEDIATE 'DROP TABLE ${tableRef}'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;`;
    }
    return `DROP TABLE ${tableRef}`;
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
    return `EXPLAIN PLAN FOR ${sql}`;
  }

  buildTableInfoQuery(tableName: string, schema?: string): string {
    const safeTable = this.escapeValue(tableName.toUpperCase());
    const safeSchema = schema ? this.escapeValue(schema.toUpperCase()) : null;
    let sql = `
      SELECT t.TABLE_NAME, t.NUM_ROWS AS row_count, 
        (t.BLOCKS * 8192) AS data_size,
        tc.COMMENTS AS comment
      FROM ALL_TABLES t
      LEFT JOIN ALL_TAB_COMMENTS tc ON t.TABLE_NAME = tc.TABLE_NAME AND t.OWNER = tc.OWNER
      WHERE t.TABLE_NAME = ${safeTable}
    `;
    if (safeSchema) {
      sql += ` AND t.OWNER = ${safeSchema}`;
    }
    return sql;
  }

  buildTableDDLQuery(tableName: string, schema?: string): string {
    const safeTable = this.escapeValue(tableName.toUpperCase());
    const safeSchema = schema ? this.escapeValue(schema.toUpperCase()) : null;
    if (safeSchema) {
      return `SELECT DBMS_METADATA.GET_DDL('TABLE', ${safeTable}, ${safeSchema}) FROM DUAL`;
    }
    return `SELECT DBMS_METADATA.GET_DDL('TABLE', ${safeTable}) FROM DUAL`;
  }

  buildColumnComment(tableName: string, columnName: string, comment: string, schema?: string): string | null {
    const tableRef = schema
      ? `${this.escapeValue(schema)}.${this.escapeValue(tableName)}`
      : this.escapeValue(tableName);
    return `COMMENT ON COLUMN ${tableRef}.${this.escapeIdentifier(columnName)} IS '${this.escapeStringValue(comment)}'`;
  }

  // ── 特性 ──────────────────────────────────────────────────────────────

  supportsAlterOperation(
    _operation: 'modifyColumn' | 'dropColumn' | 'addIndex' | 'dropIndex' | 'addForeignKey' | 'dropForeignKey'
  ): boolean {
    return true;
  }

  emptyStringIsNull(): boolean {
    return true; // Oracle 中空字符串 == NULL
  }

  formatBoolean(value: boolean): string {
    return value ? '1' : '0';
  }

  // ── 辅助 ──────────────────────────────────────────────────────────────

  protected supportsTypeLength(type: string): boolean {
    const noLengthTypes = [
      'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'NUMBER',
      'BOOLEAN', 'JSON', 'CLOB', 'NCLOB', 'BLOB', 'BFILE',
      'DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE',
    ];
    if (noLengthTypes.includes(type.toUpperCase())) return false;
    return super.supportsTypeLength(type);
  }
}

export const oracleDialect = new OracleDialect();
