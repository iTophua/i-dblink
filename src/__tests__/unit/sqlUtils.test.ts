import { describe, it, expect } from 'vitest';

const escapeSqlString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "''");

const escapeSqlIdentifier = (value: string): string =>
  value.replace(/`/g, '``');

const splitSqlStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      current += char;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        current += char;
        current += nextChar;
        i++;
        continue;
      }
      current += char;
      continue;
    }

    if (inString) {
      if (char === '\\' && nextChar) {
        current += char;
        current += nextChar;
        i++;
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
      current += char;
      continue;
    }

    if (char === '-' && nextChar === '-') {
      inLineComment = true;
      current += char;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      current += char;
      current += nextChar;
      i++;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      current += char;
      continue;
    }

    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements;
};

describe('escapeSqlString', () => {
  it('escapes backslashes', () => {
    expect(escapeSqlString('C:\\path')).toBe('C:\\\\path');
  });

  it('escapes single quotes', () => {
    expect(escapeSqlString("it's")).toBe("it''s");
  });

  it('escapes both backslashes and quotes', () => {
    expect(escapeSqlString("C:\\it's")).toBe('C:\\\\it\'\'s');
  });

  it('returns unchanged for safe strings', () => {
    expect(escapeSqlString('hello')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(escapeSqlString('')).toBe('');
  });

  it('handles string with only special chars', () => {
    expect(escapeSqlString("''")).toBe("''''");
  });
});

describe('escapeSqlIdentifier', () => {
  it('escapes backticks', () => {
    expect(escapeSqlIdentifier('my`table')).toBe('my``table');
  });

  it('returns unchanged for safe identifiers', () => {
    expect(escapeSqlIdentifier('my_table')).toBe('my_table');
  });

  it('handles empty string', () => {
    expect(escapeSqlIdentifier('')).toBe('');
  });
});

describe('splitSqlStatements', () => {
  it('splits multiple statements', () => {
    const sql = 'SELECT * FROM users; INSERT INTO users VALUES (1);';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('SELECT * FROM users');
    expect(result[1]).toBe('INSERT INTO users VALUES (1)');
  });

  it('handles single statement without trailing semicolon', () => {
    const sql = 'SELECT * FROM users';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('SELECT * FROM users');
  });

  it('ignores semicolons inside strings', () => {
    const sql = "SELECT * FROM users WHERE name = 'John;Smith';";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("John;Smith");
  });

  it('handles both single and double quoted strings', () => {
    const sql = 'SELECT * FROM users WHERE name = "John;Smith";';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
  });

  it('handles backtick quoted strings', () => {
    const sql = 'SELECT * FROM `table`;';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
  });

  it('ignores semicolons in line comments', () => {
    const sql = 'SELECT * FROM users; -- comment; not executed';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('SELECT * FROM users');
    expect(result[1]).toBe('-- comment; not executed');
  });

  it('ignores semicolons in block comments', () => {
    const sql = 'SELECT /* comment; not executed; */ * FROM users; INSERT INTO t VALUES (1);';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('/* comment; not executed; */');
  });

  it('handles escaped characters in strings', () => {
    const sql = "SELECT * FROM users WHERE name = 'it\\'s';";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
  });

  it('handles empty statements', () => {
    const sql = 'SELECT * FROM users;;;INSERT INTO t VALUES (1);';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
  });

  it('handles whitespace-only statements', () => {
    const sql = 'SELECT * FROM users;   ;INSERT INTO t VALUES (1);';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
  });

  it('handles multiline statements', () => {
    const sql = `SELECT *
FROM users
WHERE id = 1;`;
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('FROM users');
  });

  it('handles nested block comments', () => {
    const sql = 'SELECT /* comment */ * FROM users;';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty string', () => {
    const result = splitSqlStatements('');
    expect(result).toHaveLength(0);
  });

  it('preserves semicolons in string values', () => {
    const sql = "INSERT INTO users (name) VALUES ('a;b'); SELECT * FROM users;";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("a;b");
  });
});
