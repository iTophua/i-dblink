import { describe, it, expect } from 'vitest';
import { parseTreeKey } from '../../components/ConnectionTree/utils/treeKeyParser';

describe('parseTreeKey', () => {
  // ── Empty / unknown ───────────────────────────────────────────────────────
  describe('empty and unknown keys', () => {
    it('returns unknown for empty string', () => {
      expect(parseTreeKey('')).toEqual({ type: 'unknown' });
    });
  });

  // ── Group keys ────────────────────────────────────────────────────────────
  describe('group keys', () => {
    it('parses group key', () => {
      expect(parseTreeKey('group-myGroup')).toEqual({
        type: 'group',
        groupId: 'myGroup',
      });
    });

    it('parses group key with UUID-like id', () => {
      expect(parseTreeKey('group-abc123-def456')).toEqual({
        type: 'group',
        groupId: 'abc123-def456',
      });
    });
  });

  // ── Plain connection ID ───────────────────────────────────────────────────
  describe('plain connection ID (no prefix)', () => {
    it('parses plain connection key', () => {
      expect(parseTreeKey('conn-uuid-1234')).toEqual({
        type: 'connection',
        connectionId: 'conn-uuid-1234',
      });
    });
  });

  // ── Database ──────────────────────────────────────────────────────────────
  describe('database keys', () => {
    it('parses database key', () => {
      expect(parseTreeKey('db::conn1::mydb')).toEqual({
        type: 'database',
        connectionId: 'conn1',
        database: 'mydb',
      });
    });
  });

  // ── Schema ────────────────────────────────────────────────────────────────
  describe('schema keys', () => {
    it('parses schema key', () => {
      expect(parseTreeKey('schema::conn1::mydb::public')).toEqual({
        type: 'schema',
        connectionId: 'conn1',
        database: 'mydb',
        schema: 'public',
      });
    });
  });

  // ── Table ─────────────────────────────────────────────────────────────────
  describe('table keys', () => {
    it('parses table key in flat mode (4 parts)', () => {
      expect(parseTreeKey('table::conn1::mydb::users')).toEqual({
        type: 'table',
        connectionId: 'conn1',
        database: 'mydb',
        name: 'users',
      });
    });

    it('parses table key in schema mode (5 parts)', () => {
      expect(parseTreeKey('table::conn1::mydb::public::users')).toEqual({
        type: 'table',
        connectionId: 'conn1',
        database: 'mydb',
        schema: 'public',
        name: 'users',
      });
    });

    it('handles table name with :: in it (joins remaining parts)', () => {
      expect(parseTreeKey('table::conn1::mydb::public::weird::name')).toEqual({
        type: 'table',
        connectionId: 'conn1',
        database: 'mydb',
        schema: 'public',
        name: 'weird::name',
      });
    });
  });

  // ── View ──────────────────────────────────────────────────────────────────
  describe('view keys', () => {
    it('parses view key in flat mode (4 parts)', () => {
      expect(parseTreeKey('view::conn1::mydb::v_users')).toEqual({
        type: 'view',
        connectionId: 'conn1',
        database: 'mydb',
        name: 'v_users',
      });
    });

    it('parses view key in schema mode (5 parts)', () => {
      expect(parseTreeKey('view::conn1::mydb::public::v_users')).toEqual({
        type: 'view',
        connectionId: 'conn1',
        database: 'mydb',
        schema: 'public',
        name: 'v_users',
      });
    });
  });

  // ── Folder keys ───────────────────────────────────────────────────────────
  describe('folder keys', () => {
    it('parses tables-folder key', () => {
      expect(parseTreeKey('tables::conn1::mydb::public')).toEqual({
        type: 'tables-folder',
        connectionId: 'conn1',
        database: 'mydb',
        schema: 'public',
      });
    });

    it('parses views-folder key', () => {
      expect(parseTreeKey('views::conn1::mydb::public')).toEqual({
        type: 'views-folder',
        connectionId: 'conn1',
        database: 'mydb',
        schema: 'public',
      });
    });

    it('parses procedures-folder key', () => {
      expect(parseTreeKey('procedures::conn1::mydb')).toEqual({
        type: 'procedures-folder',
        connectionId: 'conn1',
        database: 'mydb',
      });
    });

    it('parses functions-folder key', () => {
      expect(parseTreeKey('functions::conn1::mydb')).toEqual({
        type: 'functions-folder',
        connectionId: 'conn1',
        database: 'mydb',
      });
    });

    it('parses triggers-folder key', () => {
      expect(parseTreeKey('triggers::conn1::mydb')).toEqual({
        type: 'triggers-folder',
        connectionId: 'conn1',
        database: 'mydb',
      });
    });

    it('parses sequences-folder key', () => {
      expect(parseTreeKey('sequences::conn1::mydb')).toEqual({
        type: 'sequences-folder',
        connectionId: 'conn1',
        database: 'mydb',
      });
    });
  });

  // ── Procedure / Function / Trigger / Sequence ─────────────────────────────
  describe('routine and object keys', () => {
    it('parses procedure key', () => {
      expect(parseTreeKey('proc::conn1::mydb::sp_get_user')).toEqual({
        type: 'procedure',
        connectionId: 'conn1',
        database: 'mydb',
        name: 'sp_get_user',
      });
    });

    it('parses function key', () => {
      expect(parseTreeKey('func::conn1::mydb::fn_calc')).toEqual({
        type: 'function',
        connectionId: 'conn1',
        database: 'mydb',
        name: 'fn_calc',
      });
    });

    it('parses trigger key', () => {
      expect(parseTreeKey('trigger::conn1::mydb::trg_audit')).toEqual({
        type: 'trigger',
        connectionId: 'conn1',
        database: 'mydb',
        name: 'trg_audit',
      });
    });

    it('parses sequence key', () => {
      expect(parseTreeKey('seq::conn1::mydb::seq_id')).toEqual({
        type: 'sequence',
        connectionId: 'conn1',
        database: 'mydb',
        name: 'seq_id',
      });
    });
  });
});
