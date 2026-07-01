import { describe, it, expect } from 'vitest';
import {
  getCurrentStatement,
  isInStringOrComment,
  detectStatementType,
} from '../../components/SQLEditor/utils/sqlCompletion';

// ── getCurrentStatement ─────────────────────────────────────────────────────

describe('getCurrentStatement', () => {
  it('returns full text when there is no semicolon before cursor', () => {
    const text = 'SELECT * FROM users';
    expect(getCurrentStatement(text, text.length)).toBe('SELECT * FROM users');
  });

  it('returns text after the last semicolon', () => {
    const text = 'SELECT 1; SELECT * FROM users';
    expect(getCurrentStatement(text, text.length)).toBe(' SELECT * FROM users');
  });

  it('returns empty string when cursor is right after a semicolon', () => {
    const text = 'SELECT 1;';
    expect(getCurrentStatement(text, text.length)).toBe('');
  });

  it('returns partial statement when cursor is mid-statement', () => {
    const text = 'SELECT 1; SELECT * FROM users WHERE id = 1';
    // getCurrentStatement: text.slice(0, cursorOffset) then slice after last ";"
    // cursorOffset = 16 → beforeCursor = "SELECT 1; SELECT" (16 chars) → after ";" = " SELECT"
    const cursorOffset = 16;
    expect(getCurrentStatement(text, cursorOffset)).toBe(' SELECT');
  });

  it('handles multiple semicolons', () => {
    const text = 'SELECT 1; SELECT 2; SELECT 3';
    expect(getCurrentStatement(text, text.length)).toBe(' SELECT 3');
  });

  it('handles empty string', () => {
    expect(getCurrentStatement('', 0)).toBe('');
  });
});

// ── isInStringOrComment ─────────────────────────────────────────────────────

describe('isInStringOrComment', () => {
  it('returns false for normal SQL text', () => {
    expect(isInStringOrComment('SELECT * FROM users', 5)).toBe(false);
  });

  it('returns true when offset is inside a single-quoted string', () => {
    const text = "SELECT 'hello world' FROM t";
    const offset = text.indexOf('hello') + 3; // inside the string
    expect(isInStringOrComment(text, offset)).toBe(true);
  });

  it('returns false when offset is after a closed string', () => {
    const text = "SELECT 'hello' FROM t";
    const offset = text.indexOf('FROM'); // after the string
    expect(isInStringOrComment(text, offset)).toBe(false);
  });

  it('returns true when offset is inside a double-quoted string', () => {
    const text = 'SELECT "hello world" FROM t';
    const offset = text.indexOf('hello') + 3;
    expect(isInStringOrComment(text, offset)).toBe(true);
  });

  it('returns true when offset is inside a backtick-quoted string', () => {
    const text = 'SELECT `hello world` FROM t';
    const offset = text.indexOf('hello') + 3;
    expect(isInStringOrComment(text, offset)).toBe(true);
  });

  it('returns true when offset is inside a -- line comment', () => {
    const text = 'SELECT * -- this is a comment\nFROM t';
    const offset = text.indexOf('this') + 3;
    expect(isInStringOrComment(text, offset)).toBe(true);
  });

  it('returns false after line comment ends (newline)', () => {
    const text = 'SELECT * -- comment\nFROM t';
    const offset = text.indexOf('FROM');
    expect(isInStringOrComment(text, offset)).toBe(false);
  });

  it('returns true when offset is inside a block comment', () => {
    const text = 'SELECT /* block comment */ * FROM t';
    const offset = text.indexOf('block') + 3;
    expect(isInStringOrComment(text, offset)).toBe(true);
  });

  it('returns false after block comment ends', () => {
    const text = 'SELECT /* comment */ * FROM t';
    const offset = text.indexOf('FROM');
    expect(isInStringOrComment(text, offset)).toBe(false);
  });

  it('returns false at position 0', () => {
    expect(isInStringOrComment('SELECT 1', 0)).toBe(false);
  });
});

// ── detectStatementType ─────────────────────────────────────────────────────

describe('detectStatementType', () => {
  it('detects SELECT', () => {
    expect(detectStatementType('SELECT * FROM users')).toBe('SELECT');
  });

  it('detects INSERT', () => {
    expect(detectStatementType('INSERT INTO users (name) VALUES (\'Alice\')')).toBe('INSERT');
  });

  it('detects UPDATE', () => {
    expect(detectStatementType('UPDATE users SET name = \'Bob\'')).toBe('UPDATE');
  });

  it('detects DELETE', () => {
    expect(detectStatementType('DELETE FROM users WHERE id = 1')).toBe('DELETE');
  });

  it('detects CREATE', () => {
    expect(detectStatementType('CREATE TABLE users (id INT)')).toBe('CREATE');
  });

  it('detects ALTER', () => {
    expect(detectStatementType('ALTER TABLE users ADD COLUMN age INT')).toBe('ALTER');
  });

  it('detects DROP', () => {
    expect(detectStatementType('DROP TABLE users')).toBe('DROP');
  });

  it('returns UNKNOWN for empty string', () => {
    expect(detectStatementType('')).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for unrecognized statement', () => {
    expect(detectStatementType('EXPLAIN SELECT 1')).toBe('UNKNOWN');
  });

  it('is case-insensitive', () => {
    expect(detectStatementType('select * from users')).toBe('SELECT');
    expect(detectStatementType('  insert into t values (1)')).toBe('INSERT');
  });

  it('trims leading whitespace', () => {
    expect(detectStatementType('   SELECT 1')).toBe('SELECT');
  });
});
