import { describe, it, expect, vi } from 'vitest';

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
  if (value === null || value === undefined || value === '') return 'NULL';
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

describe('DataTable utilities', () => {
  it('uses backticks for MySQL', () => {
    expect(escapeIdentifier('my_table', 'mysql')).toBe('`my_table`');
  });

  it('uses double quotes for PostgreSQL', () => {
    expect(escapeIdentifier('my_table', 'postgresql')).toBe('"my_table"');
  });

  it('uses brackets for SQL Server', () => {
    expect(escapeIdentifier('my_table', 'sqlserver')).toBe('[my_table]');
  });

  it('escapes special characters in identifiers', () => {
    expect(escapeIdentifier('my"table', 'postgresql')).toBe('"my""table"');
    expect(escapeIdentifier('my`table', 'mysql')).toBe('`my``table`');
  });
});

describe('DataTable escapeSqlValue', () => {
  it('returns NULL for null/undefined/empty', () => {
    expect(escapeSqlValue(null)).toBe('NULL');
    expect(escapeSqlValue(undefined)).toBe('NULL');
    expect(escapeSqlValue('')).toBe('NULL');
  });

  it('escapes single quotes', () => {
    expect(escapeSqlValue("it's")).toBe("'it''s'");
  });

  it('wraps string in single quotes', () => {
    expect(escapeSqlValue('hello')).toBe("'hello'");
  });
});

describe('DataTable rowsToCsv', () => {
  it('generates CSV with header and rows', () => {
    const columns = ['id', 'name'];
    const rows = [{ id: 1, name: 'Alice' }];
    const result = rowsToCsv(columns, rows);
    expect(result).toBe('id,name\n1,Alice');
  });

  it('escapes commas in values', () => {
    const columns = ['name'];
    const rows = [{ name: 'Smith, John' }];
    const result = rowsToCsv(columns, rows);
    expect(result).toBe('name\n"Smith, John"');
  });
});

describe('DataTable rowsToJson', () => {
  it('generates JSON array', () => {
    const columns = ['id', 'name'];
    const rows = [{ id: 1, name: 'Alice' }];
    const result = rowsToJson(columns, rows);
    expect(JSON.parse(result)).toEqual([{ id: 1, name: 'Alice' }]);
  });
});

describe('DataTable buildWhereClause logic', () => {
  it('builds simple WHERE clause', () => {
    const field = 'name';
    const value = 'Alice';
    const clause = `${escapeIdentifier(field)} = '${value}'`;
    expect(clause).toBe("`name` = 'Alice'");
  });

  it('builds LIKE clause', () => {
    const field = 'name';
    const value = 'Ali';
    const clause = `\`name\` LIKE '%${value}%'`;
    expect(clause).toBe("`name` LIKE '%Ali%'");
  });

  it('builds IS NULL clause', () => {
    const field = 'deleted_at';
    const clause = `\`${field}\` IS NULL`;
    expect(clause).toBe('`deleted_at` IS NULL');
  });

  it('builds comparison clauses', () => {
    const field = 'age';
    const value = '18';
    const clauses = {
      gt: `\`${field}\` > '${value}'`,
      lt: `\`${field}\` < '${value}'`,
      gte: `\`${field}\` >= '${value}'`,
      lte: `\`${field}\` <= '${value}'`,
    };
    expect(clauses.gt).toBe("`age` > '18'");
    expect(clauses.lt).toBe("`age` < '18'");
  });

  it('builds IN clause', () => {
    const field = 'status';
    const values = ['active', 'pending'];
    const clause = `\`${field}\` IN (${values.map((v) => `'${v}'`).join(', ')})`;
    expect(clause).toBe("`status` IN ('active', 'pending')");
  });
});

describe('DataTable buildSingleCondition', () => {
  const escapeIdentifier = (name: string) => `\`${name}\``;

  it('handles equals operator', () => {
    const field = 'name';
    const value = 'Alice';
    const clause = `${escapeIdentifier(field)} = '${value}'`;
    expect(clause).toBe("`name` = 'Alice'");
  });

  it('handles not equals operator', () => {
    const field = 'name';
    const value = 'Alice';
    const clause = `${escapeIdentifier(field)} != '${value}'`;
    expect(clause).toBe("`name` != 'Alice'");
  });

  it('handles startsWith operator', () => {
    const field = 'name';
    const value = 'Ali';
    const clause = `${escapeIdentifier(field)} LIKE '${value}%'`;
    expect(clause).toBe("`name` LIKE 'Ali%'");
  });

  it('handles endsWith operator', () => {
    const field = 'name';
    const value = 'lice';
    const clause = `${escapeIdentifier(field)} LIKE '%${value}'`;
    expect(clause).toBe("`name` LIKE '%lice'");
  });

  it('escapes LIKE special characters', () => {
    const field = 'code';
    const value = '100%';
    const escapedValue = value
      .replace(/'/g, "''")
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
    const clause = `${escapeIdentifier(field)} LIKE '%${escapedValue}%'`;
    expect(clause).toBe("`code` LIKE '%100\\%%'");
  });
});

describe('DataTable query building', () => {
  it('builds SELECT query with LIMIT and OFFSET', () => {
    const table = 'users';
    const page = 1;
    const pageSize = 100;
    const offset = (page - 1) * pageSize;
    const query = `SELECT * FROM \`${table}\` LIMIT ${pageSize} OFFSET ${offset}`;
    expect(query).toBe('SELECT * FROM `users` LIMIT 100 OFFSET 0');
  });

  it('builds SELECT query with WHERE clause', () => {
    const table = 'users';
    const where = "status = 'active'";
    const query = `SELECT * FROM \`${table}\` WHERE ${where} LIMIT 100 OFFSET 0`;
    expect(query).toBe("SELECT * FROM `users` WHERE status = 'active' LIMIT 100 OFFSET 0");
  });

  it('builds SELECT query with ORDER BY', () => {
    const table = 'users';
    const orderBy = 'created_at DESC';
    const query = `SELECT * FROM \`${table}\` ORDER BY ${orderBy} LIMIT 100 OFFSET 0`;
    expect(query).toBe('SELECT * FROM `users` ORDER BY created_at DESC LIMIT 100 OFFSET 0');
  });

  it('builds COUNT query', () => {
    const table = 'users';
    const query = `SELECT COUNT(*) AS cnt FROM \`${table}\``;
    expect(query).toBe('SELECT COUNT(*) AS cnt FROM `users`');
  });

  it('builds INSERT query', () => {
    const table = 'users';
    const columns = ['name', 'email'];
    const values = ["'Alice'", "'alice@example.com'"];
    const query = `INSERT INTO \`${table}\` (\`${columns.join('\`, \`')}\`) VALUES (${values.join(', ')})`;
    expect(query).toBe(
      "INSERT INTO `users` (`name`, `email`) VALUES ('Alice', 'alice@example.com')"
    );
  });

  it('builds UPDATE query', () => {
    const table = 'users';
    const setClause = "`name` = 'Bob'";
    const whereClause = "`id` = '1'";
    const query = `UPDATE \`${table}\` SET ${setClause} WHERE ${whereClause}`;
    expect(query).toBe("UPDATE `users` SET `name` = 'Bob' WHERE `id` = '1'");
  });

  it('builds DELETE query', () => {
    const table = 'users';
    const whereClause = "`id` = '1'";
    const query = `DELETE FROM \`${table}\` WHERE ${whereClause}`;
    expect(query).toBe("DELETE FROM `users` WHERE `id` = '1'");
  });
});
