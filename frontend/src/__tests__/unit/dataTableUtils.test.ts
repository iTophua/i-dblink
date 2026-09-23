import { describe, it, expect } from 'vitest';
import { buildWhereClause, type FilterCondition } from '../../components/DataTable/utils';

const cond = (
  partial: Partial<FilterCondition> & Pick<FilterCondition, 'id'>
): FilterCondition => ({
  field: '',
  operator: '',
  value: '',
  logic: 'AND',
  enabled: true,
  ...partial,
});

describe('buildWhereClause（停用勾选与分组）', () => {
  it('拼接多个启用条件（AND/OR 来自各行 logic）', () => {
    const sql = buildWhereClause([
      cond({ id: '1', field: 'a', operator: 'equals', value: '1' }),
      cond({ id: '2', field: 'b', operator: 'greaterThan', value: '2', logic: 'OR' }),
    ]);
    expect(sql).toBe("`a` = '1' OR `b` > '2'");
  });

  it('停用条件不参与拼接且不留悬空连接词', () => {
    const sql = buildWhereClause([
      cond({ id: '1', field: 'a', operator: 'equals', value: '1', enabled: false }),
      cond({ id: '2', field: 'b', operator: 'equals', value: '2' }),
    ]);
    expect(sql).toBe("`b` = '2'");
  });

  it('全部停用/未填写时返回空串', () => {
    expect(
      buildWhereClause([
        cond({ id: '1', field: 'a', operator: 'equals', value: '1', enabled: false }),
      ])
    ).toBe('');
    expect(buildWhereClause([cond({ id: '1' })])).toBe('');
  });

  it('组内部分停用：保留组括号', () => {
    const sql = buildWhereClause([
      cond({ id: 's', isGroupStart: true }),
      cond({ id: '1', field: 'a', operator: 'equals', value: '1', enabled: false }),
      cond({ id: '2', field: 'b', operator: 'equals', value: '2', logic: 'OR' }),
      cond({ id: 'e', isGroupEnd: true }),
      cond({ id: '3', field: 'c', operator: 'isNotNull' }),
    ]);
    expect(sql).toBe("( `b` = '2' ) AND `c` IS NOT NULL");
  });

  it('组内全部停用：丢弃空括号与悬空连接词', () => {
    const sql = buildWhereClause([
      cond({ id: '0', field: 'x', operator: 'equals', value: '0' }),
      cond({ id: 's', isGroupStart: true }),
      cond({ id: '1', field: 'a', operator: 'equals', value: '1', enabled: false }),
      cond({ id: 'e', isGroupEnd: true }),
    ]);
    expect(sql).toBe("`x` = '0'");
  });

  it('并列分组之间用组内首个有效条件的 logic 连接', () => {
    const sql = buildWhereClause([
      cond({ id: 's1', isGroupStart: true }),
      cond({ id: '1', field: 'a', operator: 'equals', value: '1' }),
      cond({ id: 'e1', isGroupEnd: true }),
      cond({ id: 's2', isGroupStart: true }),
      cond({ id: '2', field: 'b', operator: 'equals', value: '2', logic: 'OR' }),
      cond({ id: 'e2', isGroupEnd: true }),
    ]);
    expect(sql).toBe("( `a` = '1' ) OR ( `b` = '2' )");
  });

  it('未填 field/operator 的半成品条件被跳过', () => {
    const sql = buildWhereClause([
      cond({ id: '1', field: 'a', operator: 'equals', value: '1' }),
      cond({ id: '2', operator: 'equals', value: '' }),
    ]);
    expect(sql).toBe("`a` = '1'");
  });
});

const escapeIdentifier = (name: string, dbType?: string): string => {
  const { open, close } = (() => {
    switch (dbType) {
      case 'postgresql':
      case 'kingbase':
      case 'highgo':
      case 'vastbase':
      case 'oracle':
      case 'dameng':
        return { open: '"', close: '"' };
      case 'sqlserver':
        return { open: '[', close: ']' };
      default:
        return { open: '`', close: '`' };
    }
  })();

  const escapeQuote = (n: string): string => {
    switch (dbType) {
      case 'postgresql':
      case 'kingbase':
      case 'highgo':
      case 'vastbase':
      case 'oracle':
      case 'dameng':
        return n.replace(/"/g, '""');
      case 'sqlserver':
        return n.replace(/]/g, ']]');
      default:
        return n.replace(/`/g, '``');
    }
  };

  return `${open}${escapeQuote(name)}${close}`;
};

const escapeSqlValue = (value: any): string => {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }
  const str = String(value);
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/"/g, '""')
    .replace(/\0/g, '\\0');
  return `'${escaped}'`;
};

const rowsToCsv = (columns: string[], rows: Record<string, any>[]): string => {
  const escape = (val: unknown) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = columns.map(escape).join(',');
  const body = rows.map((row) => columns.map((c) => escape(row[c])).join(',')).join('\n');
  return `${header}\n${body}`;
};

const rowsToJson = (columns: string[], rows: Record<string, any>[]): string => {
  const objs = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col) => {
      obj[col] = row[col];
    });
    return obj;
  });
  return JSON.stringify(objs, null, 2);
};

describe('escapeIdentifier', () => {
  it('uses backticks for MySQL (default)', () => {
    expect(escapeIdentifier('my_table')).toBe('`my_table`');
    expect(escapeIdentifier('my_table', 'mysql')).toBe('`my_table`');
  });

  it('uses double quotes for PostgreSQL', () => {
    expect(escapeIdentifier('my_table', 'postgresql')).toBe('"my_table"');
  });

  it('uses double quotes for Oracle', () => {
    expect(escapeIdentifier('my_table', 'oracle')).toBe('"my_table"');
  });

  it('uses brackets for SQL Server', () => {
    expect(escapeIdentifier('my_table', 'sqlserver')).toBe('[my_table]');
  });

  it('escapes quotes in identifier name for PostgreSQL', () => {
    expect(escapeIdentifier('my"table', 'postgresql')).toBe('"my""table"');
  });

  it('escapes backticks in identifier name for MySQL', () => {
    expect(escapeIdentifier('my`table', 'mysql')).toBe('`my``table`');
  });

  it('escapes brackets in identifier name for SQL Server', () => {
    expect(escapeIdentifier('my]table', 'sqlserver')).toBe('[my]]table]');
  });

  it('handles Dameng', () => {
    expect(escapeIdentifier('my_table', 'dameng')).toBe('"my_table"');
  });

  it('handles Kingbase', () => {
    expect(escapeIdentifier('my_table', 'kingbase')).toBe('"my_table"');
  });

  it('handles Highgo', () => {
    expect(escapeIdentifier('my_table', 'highgo')).toBe('"my_table"');
  });

  it('handles VastBase', () => {
    expect(escapeIdentifier('my_table', 'vastbase')).toBe('"my_table"');
  });
});

describe('escapeSqlValue', () => {
  it('returns NULL for null', () => {
    expect(escapeSqlValue(null)).toBe('NULL');
  });

  it('returns NULL for undefined', () => {
    expect(escapeSqlValue(undefined)).toBe('NULL');
  });

  it('returns NULL for empty string', () => {
    expect(escapeSqlValue('')).toBe('NULL');
  });

  it('escapes single quotes', () => {
    expect(escapeSqlValue("it's")).toBe("'it''s'");
  });

  it('escapes backslashes', () => {
    expect(escapeSqlValue('C:\\path')).toBe("'C:\\\\path'");
  });

  it('wraps string in single quotes', () => {
    expect(escapeSqlValue('hello')).toBe("'hello'");
  });

  it('handles numbers', () => {
    expect(escapeSqlValue(42)).toBe("'42'");
  });

  it('handles zero', () => {
    expect(escapeSqlValue(0)).toBe("'0'");
  });
});

describe('rowsToCsv', () => {
  it('generates CSV with header and rows', () => {
    const columns = ['id', 'name'];
    const rows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];
    const result = rowsToCsv(columns, rows);
    expect(result).toBe('id,name\n1,Alice\n2,Bob');
  });

  it('escapes commas in values', () => {
    const columns = ['name'];
    const rows = [{ name: 'Smith, John' }];
    const result = rowsToCsv(columns, rows);
    expect(result).toBe('name\n"Smith, John"');
  });

  it('escapes double quotes in values', () => {
    const columns = ['name'];
    const rows = [{ name: 'He said "Hello"' }];
    const result = rowsToCsv(columns, rows);
    expect(result).toBe('name\n"He said ""Hello"""');
  });

  it('handles newlines in values', () => {
    const columns = ['desc'];
    const rows = [{ desc: 'Line1\nLine2' }];
    const result = rowsToCsv(columns, rows);
    expect(result).toBe('desc\n"Line1\nLine2"');
  });

  it('handles null values', () => {
    const columns = ['id', 'name'];
    const rows = [{ id: 1, name: null }];
    const result = rowsToCsv(columns, rows);
    expect(result).toBe('id,name\n1,');
  });

  it('handles empty rows', () => {
    const columns = ['id', 'name'];
    const rows: Record<string, any>[] = [];
    const result = rowsToCsv(columns, rows);
    expect(result).toBe('id,name\n');
  });
});

describe('rowsToJson', () => {
  it('generates JSON array', () => {
    const columns = ['id', 'name'];
    const rows = [{ id: 1, name: 'Alice' }];
    const result = rowsToJson(columns, rows);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual([{ id: 1, name: 'Alice' }]);
  });

  it('only includes specified columns', () => {
    const columns = ['id'];
    const rows = [{ id: 1, name: 'Alice', extra: 'data' }];
    const result = rowsToJson(columns, rows);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual([{ id: 1 }]);
  });

  it('handles null values', () => {
    const columns = ['id', 'name'];
    const rows = [{ id: 1, name: null }];
    const result = rowsToJson(columns, rows);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual([{ id: 1, name: null }]);
  });

  it('handles empty rows', () => {
    const columns = ['id', 'name'];
    const rows: Record<string, any>[] = [];
    const result = rowsToJson(columns, rows);
    expect(result).toBe('[]');
  });
});
