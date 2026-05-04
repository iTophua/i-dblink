import { describe, it, expect } from 'vitest';
import { escapeSqlValue, escapeSqlIdentifier, splitSqlStatements } from '../../utils/sqlUtils';

describe('escapeSqlValue', () => {
  it('escapes backslashes', () => {
    expect(escapeSqlValue('C:\\path')).toBe("'C:\\\\path'");
  });

  it('escapes single quotes', () => {
    expect(escapeSqlValue("it's")).toBe("'it''s'");
  });

  it('escapes both backslashes and quotes', () => {
    expect(escapeSqlValue("C:\\it's")).toBe("'C:\\\\it''s'");
  });

  it('returns NULL for null', () => {
    expect(escapeSqlValue(null)).toBe('NULL');
  });

  it('returns NULL for undefined', () => {
    expect(escapeSqlValue(undefined)).toBe('NULL');
  });

  it('returns NULL for empty string', () => {
    expect(escapeSqlValue('')).toBe('NULL');
  });

  it('handles string with only special chars', () => {
    expect(escapeSqlValue("''")).toBe("''''''");
  });
});

describe('escapeSqlIdentifier', () => {
  it('escapes backticks for MySQL', () => {
    expect(escapeSqlIdentifier('my`table', 'mysql')).toBe('`my``table`');
  });

  it('escapes double quotes for PostgreSQL', () => {
    expect(escapeSqlIdentifier('my"table', 'postgresql')).toBe('"my""table"');
  });

  it('escapes brackets for SQL Server', () => {
    expect(escapeSqlIdentifier('my]table', 'sqlserver')).toBe('[my]]table]');
  });

  it('returns wrapped for safe identifiers', () => {
    expect(escapeSqlIdentifier('my_table', 'mysql')).toBe('`my_table`');
  });

  it('handles empty string', () => {
    expect(escapeSqlIdentifier('')).toBe('``');
  });

  it('uses backticks by default', () => {
    expect(escapeSqlIdentifier('test')).toBe('`test`');
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
    expect(result[0]).toContain('John;Smith');
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
    expect(result[0]).toContain('a;b');
  });
});
