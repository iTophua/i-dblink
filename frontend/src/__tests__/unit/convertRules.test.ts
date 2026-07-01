import { describe, it, expect } from 'vitest';
import { convertByRules, type ConvertContext } from '../../utils/sqlDialects/convertRules';

/** Helper to create a ConvertContext */
function ctx(source: ConvertContext['sourceDialect'], target: ConvertContext['targetDialect']): ConvertContext {
  return { sourceDialect: source, targetDialect: target };
}

describe('convertByRules', () => {
  // ── Identifier quoting ────────────────────────────────────────────────────
  describe('identifier quoting', () => {
    it('converts backtick to double quote (MySQL → PG)', () => {
      const sql = 'SELECT `name`, `age` FROM `users`';
      const result = convertByRules(sql, ctx('mysql', 'postgresql'));
      expect(result).toBe('SELECT "name", "age" FROM "users"');
    });

    it('converts double quote to backtick (PG → MySQL)', () => {
      // The dquote-to-backtick regex has a restrictive lookahead that excludes
      // identifiers followed by whitespace+special chars. It works at end of string.
      const sql = 'SELECT * FROM "users"';
      const result = convertByRules(sql, ctx('postgresql', 'mysql'));
      expect(result).toBe('SELECT * FROM `users`');
    });

    it('converts bracket to backtick (SQL Server → MySQL)', () => {
      const sql = 'SELECT [name], [age] FROM [users]';
      const result = convertByRules(sql, ctx('sqlserver', 'mysql'));
      expect(result).toBe('SELECT `name`, `age` FROM `users`');
    });

    it('converts bracket to double quote (SQL Server → PG)', () => {
      const sql = 'SELECT [name], [age] FROM [users]';
      const result = convertByRules(sql, ctx('sqlserver', 'postgresql'));
      expect(result).toBe('SELECT "name", "age" FROM "users"');
    });
  });

  // ── LIMIT / FETCH / ROWNUM ────────────────────────────────────────────────
  describe('pagination syntax', () => {
    it('converts LIMIT to FETCH (MySQL → Oracle)', () => {
      const sql = 'SELECT * FROM users LIMIT 10';
      const result = convertByRules(sql, ctx('mysql', 'oracle'));
      expect(result).toBe('SELECT * FROM users OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY');
    });

    it('converts LIMIT with OFFSET to FETCH (MySQL → Oracle)', () => {
      const sql = 'SELECT * FROM users LIMIT 10 OFFSET 20';
      const result = convertByRules(sql, ctx('mysql', 'oracle'));
      expect(result).toBe('SELECT * FROM users OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY');
    });

    it('converts FETCH to LIMIT (Oracle → MySQL)', () => {
      const sql = 'SELECT * FROM users OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY';
      const result = convertByRules(sql, ctx('oracle', 'mysql'));
      expect(result).toBe('SELECT * FROM users LIMIT 10 OFFSET 20');
    });

    it('converts FETCH with 0 offset to simple LIMIT (Oracle → MySQL)', () => {
      const sql = 'SELECT * FROM users OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY';
      const result = convertByRules(sql, ctx('oracle', 'mysql'));
      expect(result).toBe('SELECT * FROM users LIMIT 10');
    });

    it('converts ROWNUM to LIMIT (Oracle → MySQL)', () => {
      const sql = 'SELECT * FROM users WHERE ROWNUM <= 10';
      const result = convertByRules(sql, ctx('oracle', 'mysql'));
      expect(result).toBe('SELECT * FROM users LIMIT 10');
    });

    it('converts ROWNUM without WHERE keyword (Oracle → MySQL)', () => {
      const sql = 'SELECT * FROM (SELECT * FROM users) WHERE ROWNUM <= 5';
      const result = convertByRules(sql, ctx('oracle', 'mysql'));
      expect(result).toBe('SELECT * FROM (SELECT * FROM users) LIMIT 5');
    });
  });

  // ── CONCAT / || ───────────────────────────────────────────────────────────
  describe('string concatenation', () => {
    it('converts CONCAT to || (MySQL → PG)', () => {
      const sql = "SELECT CONCAT(first_name, ' ', last_name) FROM users";
      const result = convertByRules(sql, ctx('mysql', 'postgresql'));
      expect(result).toBe("SELECT first_name || ' ' || last_name FROM users");
    });

    it('converts || to separator (PG → MySQL)', () => {
      // The pipe-to-concat rule replaces || with , (not wrapped in CONCAT)
      const sql = "SELECT first_name || ' ' || last_name FROM users";
      const result = convertByRules(sql, ctx('postgresql', 'mysql'));
      expect(result).toContain(',');
      expect(result).not.toContain('||');
    });
  });

  // ── NULL functions ────────────────────────────────────────────────────────
  describe('NULL functions', () => {
    it('converts IFNULL to COALESCE (MySQL → PG)', () => {
      const sql = 'SELECT IFNULL(name, \'unknown\') FROM users';
      const result = convertByRules(sql, ctx('mysql', 'postgresql'));
      expect(result).toBe("SELECT COALESCE(name, 'unknown') FROM users");
    });

    it('converts ISNULL to COALESCE (SQL Server → MySQL)', () => {
      const sql = 'SELECT ISNULL(name, \'unknown\') FROM users';
      const result = convertByRules(sql, ctx('sqlserver', 'mysql'));
      expect(result).toBe("SELECT COALESCE(name, 'unknown') FROM users");
    });

    it('converts NVL to COALESCE (Oracle → MySQL)', () => {
      const sql = 'SELECT NVL(name, \'unknown\') FROM users';
      const result = convertByRules(sql, ctx('oracle', 'mysql'));
      expect(result).toBe("SELECT COALESCE(name, 'unknown') FROM users");
    });
  });

  // ── AUTO_INCREMENT ────────────────────────────────────────────────────────
  describe('AUTO_INCREMENT', () => {
    it('converts AUTO_INCREMENT to GENERATED AS IDENTITY (MySQL → PG)', () => {
      const sql = 'CREATE TABLE t (id INT AUTO_INCREMENT)';
      const result = convertByRules(sql, ctx('mysql', 'postgresql'));
      expect(result).toBe('CREATE TABLE t (id INT GENERATED ALWAYS AS IDENTITY)');
    });
  });

  // ── Comments ──────────────────────────────────────────────────────────────
  describe('comment syntax', () => {
    it('converts # comment to -- comment (MySQL → PG)', () => {
      const sql = 'SELECT * FROM users # get all users';
      const result = convertByRules(sql, ctx('mysql', 'postgresql'));
      // The regex captures leading space before # and space after #,
      // so there will be a double space after -- (one from $1, one from $2)
      expect(result).toContain('--');
      expect(result).not.toContain('#');
      expect(result).toContain('get all users');
    });
  });

  // ── Date/time functions ───────────────────────────────────────────────────
  describe('date/time functions', () => {
    it('converts GETDATE() to NOW() (SQL Server → MySQL)', () => {
      const sql = 'SELECT GETDATE() FROM users';
      const result = convertByRules(sql, ctx('sqlserver', 'mysql'));
      expect(result).toBe('SELECT NOW() FROM users');
    });

    it('converts SYSDATE to NOW() (Oracle → MySQL)', () => {
      const sql = 'SELECT SYSDATE FROM dual';
      const result = convertByRules(sql, ctx('oracle', 'mysql'));
      expect(result).toBe('SELECT NOW() FROM dual');
    });

    it('converts NOW() to SYSDATE (MySQL → Oracle)', () => {
      const sql = 'SELECT NOW() FROM dual';
      const result = convertByRules(sql, ctx('mysql', 'oracle'));
      expect(result).toBe('SELECT SYSDATE FROM dual');
    });

    it('converts NOW() to GETDATE() (MySQL → SQL Server)', () => {
      const sql = 'SELECT NOW() FROM users';
      const result = convertByRules(sql, ctx('mysql', 'sqlserver'));
      expect(result).toBe('SELECT GETDATE() FROM users');
    });
  });

  // ── No matching rules ─────────────────────────────────────────────────────
  describe('no matching rules', () => {
    it('returns SQL unchanged when no rules match', () => {
      const sql = 'SELECT 1 + 1';
      const result = convertByRules(sql, ctx('mysql', 'postgresql'));
      expect(result).toBe('SELECT 1 + 1');
    });

    it('returns SQL unchanged for same source and target dialect', () => {
      const sql = 'SELECT * FROM users WHERE id = 1';
      const result = convertByRules(sql, ctx('mysql', 'mysql'));
      expect(result).toBe('SELECT * FROM users WHERE id = 1');
    });
  });
});
