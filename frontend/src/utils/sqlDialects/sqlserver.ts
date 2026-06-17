import { BaseDialect } from './base';
import type {
  SqlDialect,
  PaginationOptions,
  CreateTableOptions,
  AlterTableOptions,
} from './types';
import type { DatabaseType } from '../../types/api';

/**
 * SQL Server 方言
 */
class SQLServerDialect extends BaseDialect implements SqlDialect {
  readonly dbType: DatabaseType = 'sqlserver';

  protected get quoteChar() {
    return { open: '[', close: ']' };
  }

  protected escapeQuote(name: string): string {
    return name.replace(/]/g, ']]');
  }

  protected escapeStringValue(str: string): string {
    return str.replace(/'/g, "''");
  }

  protected get currentTimestampFn() {
    return 'GETDATE()';
  }

  // ── 分页 ──────────────────────────────────────────────────────────────

  buildPaginationQuery(sql: string, options: PaginationOptions): string {
    // SQL Server 2012+ 使用 OFFSET FETCH
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
    const { tableName, columns, indexes, foreignKeys } = options;
    const tableRef = this.escapeIdentifier(tableName);
    const statements: string[] = [];

    // 列变更
    for (const change of columns) {
      switch (change.type) {
        case 'add':
          statements.push(`ALTER TABLE ${tableRef} ADD ${this.buildColumnDef(change.column)};`);
          break;
        case 'drop':
          statements.push(
            `ALTER TABLE ${tableRef} DROP COLUMN ${this.escapeIdentifier(change.column.name)};`
          );
          break;
        case 'modify': {
          const colName = this.escapeIdentifier(change.column.name);
          // SQL Server: ALTER COLUMN
          let def = `${colName} ${change.column.type}`;
          if (change.column.length && change.column.length > 0 && this.supportsTypeLength(change.column.type)) {
            def += `(${change.column.length})`;
          }
          if (!change.column.nullable) {
            def += ' NOT NULL';
          }
          statements.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${def};`);

          // 默认值需要单独处理
          if (change.column.defaultValue !== undefined) {
            const defaultConstraintName = `DF_${tableName}_${change.column.name}`;
            statements.push(
              `ALTER TABLE ${tableRef} DROP CONSTRAINT IF EXISTS ${this.escapeIdentifier(defaultConstraintName)};`
            );
            statements.push(
              `ALTER TABLE ${tableRef} ADD CONSTRAINT ${this.escapeIdentifier(defaultConstraintName)} DEFAULT ${this.formatDefaultValue(change.column.defaultValue)} FOR ${colName};`
            );
          }
          break;
        }
        case 'rename':
          if (change.oldName) {
            statements.push(
              `EXEC sp_rename '${tableName}.${change.oldName}', '${change.column.name}', 'COLUMN';`
            );
          }
          break;
      }
    }

    // 索引变更
    for (const change of indexes) {
      if (change.type === 'drop') {
        statements.push(`DROP INDEX ${this.escapeIdentifier(change.index.name)} ON ${tableRef};`);
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
        statements.push(
          `ALTER TABLE ${tableRef} DROP CONSTRAINT ${this.escapeIdentifier(change.foreignKey.name)};`
        );
      } else {
        statements.push(`ALTER TABLE ${tableRef} ADD ${this.buildForeignKeyDef(change.foreignKey)};`);
      }
    }

    return statements;
  }

  buildDropTable(tableRef: string, ifExists?: boolean): string {
    if (ifExists) {
      return `IF OBJECT_ID('${tableRef}', 'U') IS NOT NULL DROP TABLE ${tableRef};`;
    }
    return `DROP TABLE ${tableRef};`;
  }

  // ── 列定义（SQL Server 特有：不支持 COMMENT） ──────────────────────────

  protected buildColumnDef(col: import('./types').DialectColumn): string {
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
    // SQL Server 默认值在约束中处理
    return def;
  }

  // ── 条件 ──────────────────────────────────────────────────────────────

  buildLikeCondition(field: string, value: string, negate = false): { condition: string; value: string } {
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    const op = negate ? 'NOT LIKE' : 'LIKE';
    return {
      condition: `${this.escapeIdentifier(field)} ${op} ? ESCAPE '\\'`,
      value: escaped,
    };
  }

  // ── 元数据查询 ────────────────────────────────────────────────────────

  buildExplainQuery(sql: string): string {
    // SQL Server 使用 SHOWPLAN
    return `SET SHOWPLAN_XML ON;\n${sql};\nSET SHOWPLAN_XML OFF;`;
  }

  buildTableInfoQuery(tableName: string, schema?: string): string {
    const safeTable = this.escapeValue(tableName);
    const safeSchema = schema ? this.escapeValue(schema) : 'dbo';
    return `
      SELECT 
        t.name AS table_name,
        'BASE TABLE' AS table_type,
        p.rows AS row_count,
        SUM(a.total_pages) * 8192 AS data_size,
        SUM(a.used_pages) * 8192 AS index_size,
        NULL AS create_time,
        NULL AS update_time,
        NULL AS collation,
        ep.value AS comment
      FROM sys.tables t
      INNER JOIN sys.indexes i ON t.object_id = i.object_id
      INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
      INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
      LEFT JOIN sys.extended_properties ep ON t.object_id = ep.major_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
      WHERE t.name = ${safeTable} AND SCHEMA_NAME(t.schema_id) = ${safeSchema}
      GROUP BY t.object_id, t.name, p.rows, ep.value
    `;
  }

  buildTableDDLQuery(tableName: string, schema?: string): string {
    const safeTable = this.escapeValue(tableName);
    const safeSchema = schema ? this.escapeValue(schema) : 'dbo';
    return `
      SELECT 
        'CREATE TABLE [' + SCHEMA_NAME(t.schema_id) + '].[' + t.name + '] (' +
        STRING_AGG(
          '[' + c.name + '] ' + ty.name +
          CASE WHEN c.max_length = -1 THEN '(MAX)' 
               WHEN ty.name IN ('varchar', 'nvarchar', 'char', 'nchar', 'binary', 'varbinary') 
               THEN '(' + CAST(c.max_length AS VARCHAR) + ')'
               WHEN ty.name IN ('decimal', 'numeric') 
               THEN '(' + CAST(c.precision AS VARCHAR) + ',' + CAST(c.scale AS VARCHAR) + ')'
               ELSE '' 
          END +
          CASE WHEN c.is_nullable = 0 THEN ' NOT NULL' ELSE '' END,
          ', '
        ) +
        ');'
      FROM sys.tables t
      JOIN sys.columns c ON t.object_id = c.object_id
      JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      WHERE t.name = ${safeTable} AND SCHEMA_NAME(t.schema_id) = ${safeSchema}
      GROUP BY t.schema_id, t.name
    `;
  }

  buildColumnComment(tableName: string, columnName: string, comment: string, schema?: string): string | null {
    const safeSchema = schema ? this.escapeValue(schema) : 'dbo';
    return `EXEC sp_addextendedproperty 'MS_Description', '${this.escapeStringValue(comment)}', 'SCHEMA', ${safeSchema}, 'TABLE', '${this.escapeStringValue(tableName)}', 'COLUMN', '${this.escapeStringValue(columnName)}';`;
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
    return value ? '1' : '0';
  }
}

export const sqlserverDialect = new SQLServerDialect();
