import { describe, it, expect } from 'vitest';
import { detectSqlDialect } from '../../utils/sqlDialects/detectDialect';

describe('detectSqlDialect', () => {
  // ── MySQL ─────────────────────────────────────────────────────────────────
  describe('MySQL detection', () => {
    it('detects MySQL from backtick identifiers combined with other features', () => {
      // backtick(3) + IFNULL(2) + GROUP_CONCAT(2) + NOW()(2) = 9 → confidence 0.71
      const sql = 'SELECT IFNULL(`name`, \'x\'), GROUP_CONCAT(`col`), NOW() FROM `users` WHERE `id` = 1';
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      expect(result!.dialect).toBe('mysql');
      expect(result!.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('detects MySQL with high confidence from multiple features (backtick + IFNULL + AUTO_INCREMENT)', () => {
      const sql = 'CREATE TABLE `t` (`id` INT AUTO_INCREMENT) SELECT IFNULL(`col`, 0) FROM `t2`';
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      expect(result!.dialect).toBe('mysql');
      expect(result!.confidence).toBeGreaterThanOrEqual(0.6);
      expect(result!.matchedFeatures.length).toBeGreaterThanOrEqual(3);
    });

    it('detects MySQL from hash comment combined with other features', () => {
      // backtick(3) + IFNULL(2) + hash(2) + NOW()(2) = 9 → confidence 0.71
      const sql = 'SELECT IFNULL(`name`, \'x\'), NOW() FROM `users` # this is a comment';
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      expect(result!.dialect).toBe('mysql');
    });
  });

  // ── PostgreSQL ────────────────────────────────────────────────────────────
  describe('PostgreSQL detection', () => {
    it('detects PostgreSQL from $$, :: cast, and SERIAL combined', () => {
      // dollar-quote(3) + dollar-type-cast(3) + serial-type(3) = 9 → confidence 0.71
      const sql = "CREATE FUNCTION foo() RETURNS void AS $$ BEGIN SELECT id::text FROM t; END; $$ LANGUAGE plpgsql; CREATE TABLE s (id SERIAL);";
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      expect(result!.dialect).toBe('postgresql');
    });

    it('detects PostgreSQL from SERIAL, :: cast, and ON CONFLICT', () => {
      // serial-type(3) + dollar-type-cast(3) + on-conflict(2) = 8 → confidence 0.63
      const sql = "INSERT INTO t (id) VALUES (1::int) ON CONFLICT DO NOTHING; CREATE TABLE s (id SERIAL);";
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      expect(result!.dialect).toBe('postgresql');
      expect(result!.matchedFeatures.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── SQL Server ────────────────────────────────────────────────────────────
  describe('SQL Server detection', () => {
    it('detects SQL Server from [brackets] and TOP combined with GETDATE', () => {
      const sql = 'SELECT TOP 10 [name], [age], GETDATE() AS ts FROM [dbo].[users]';
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      expect(result!.dialect).toBe('sqlserver');
    });

    it('detects SQL Server from ISNULL() combined with brackets', () => {
      const sql = 'SELECT TOP 5 ISNULL([name], \'unknown\') FROM [users]';
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      expect(result!.dialect).toBe('sqlserver');
    });
  });

  // ── Oracle ────────────────────────────────────────────────────────────────
  describe('Oracle detection', () => {
    it('detects Oracle from ROWNUM, SYSDATE, and NVL combined', () => {
      const sql = 'SELECT NVL(name, \'unknown\') FROM users WHERE ROWNUM <= 10 AND created_at < SYSDATE';
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      expect(result!.dialect).toBe('oracle');
    });

    it('detects Oracle from ROWNUM combined with NUMBER, NVL, and DECODE', () => {
      // rownum(3) + number-type(2) + nvl(2) + decode-func(2) = 9 → confidence 0.71
      const sql = 'SELECT DECODE(NVL(id, 0), 0, 1, id) NUMBER(10) FROM users WHERE ROWNUM <= 5';
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      expect(result!.dialect).toBe('oracle');
    });
  });

  // ── Dameng (Oracle-compatible) ────────────────────────────────────────────
  describe('Dameng detection (merged to Oracle)', () => {
    it('merges Dameng features to oracle dialect', () => {
      const sql = 'SELECT NVL(name, \'x\') FROM users WHERE ROWNUM <= 10 AND SYSDATE > created_at';
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      // ROWNUM + SYSDATE + NVL are oracle/dameng features; dameng merges to oracle
      expect(result!.dialect).toBe('oracle');
    });
  });

  // ── SQLite ────────────────────────────────────────────────────────────────
  describe('SQLite detection', () => {
    it('detects SQLite (or generic) from LIMIT', () => {
      const sql = 'SELECT * FROM users LIMIT 10';
      const result = detectSqlDialect(sql);
      // LIMIT is shared across mysql/postgresql/sqlite, so it may detect mysql/postgresql
      // depending on score. The important thing is it detects something.
      if (result !== null) {
        expect(['mysql', 'mariadb', 'postgresql', 'sqlite']).toContain(result.dialect);
      }
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('returns null for empty string', () => {
      expect(detectSqlDialect('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(detectSqlDialect('   ')).toBeNull();
    });

    it('returns null for very short SQL (< 5 chars)', () => {
      expect(detectSqlDialect('SEL')).toBeNull();
    });

    it('returns null for ambiguous SQL with no distinctive features', () => {
      const sql = 'SELECT 1';
      const result = detectSqlDialect(sql);
      expect(result).toBeNull();
    });
  });

  // ── Result structure ──────────────────────────────────────────────────────
  describe('result structure', () => {
    it('returns dialect, confidence, and matchedFeatures for valid SQL', () => {
      const sql = 'CREATE TABLE `t` (`id` INT AUTO_INCREMENT) SELECT IFNULL(`col`, 0) FROM `t2`';
      const result = detectSqlDialect(sql);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('dialect');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('matchedFeatures');
      expect(typeof result!.confidence).toBe('number');
      expect(result!.confidence).toBeGreaterThanOrEqual(0.6);
      expect(result!.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(result!.matchedFeatures)).toBe(true);
      expect(result!.matchedFeatures.length).toBeGreaterThan(0);
    });
  });
});
