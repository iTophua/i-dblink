export type TreeKeyType =
  | 'connection'
  | 'database'
  | 'table'
  | 'view'
  | 'schema'
  | 'tables-folder'
  | 'views-folder'
  | 'group'
  | 'procedure'
  | 'function'
  | 'trigger'
  | 'procedures-folder'
  | 'functions-folder'
  | 'triggers-folder'
  | 'sequence'
  | 'sequences-folder'
  | 'unknown';

export interface ParsedTreeKey {
  type: TreeKeyType;
  connectionId?: string;
  database?: string;
  schema?: string;
  name?: string;
  groupId?: string;
}

/**
 * Parse a tree node key like `conn::id`, `db::connId::dbName`,
 * `table::connId::db::tableName`, `schema::connId::db::schemaName`, etc.
 *
 * Also handles plain connection IDs and group keys like `group-xxx`.
 */
export function parseTreeKey(key: string): ParsedTreeKey {
  if (!key) return { type: 'unknown' };

  // group keys: group-{groupId}
  if (key.startsWith('group-')) {
    return { type: 'group', groupId: key.replace('group-', '') };
  }

  const parts = key.split('::');
  const prefix = parts[0];

  switch (prefix) {
    case 'db':
      return {
        type: 'database',
        connectionId: parts[1],
        database: parts[2],
      };
    case 'schema':
      return {
        type: 'schema',
        connectionId: parts[1],
        database: parts[2],
        schema: parts[3],
      };
    case 'table':
      // schema mode: table::connId::db::schema::name (5+ parts)
      // flat mode:   table::connId::db::name (4 parts)
      if (parts.length >= 5) {
        return {
          type: 'table',
          connectionId: parts[1],
          database: parts[2],
          schema: parts[3],
          name: parts.slice(4).join('::'),
        };
      }
      return {
        type: 'table',
        connectionId: parts[1],
        database: parts[2],
        name: parts.slice(3).join('::'),
      };
    case 'view':
      if (parts.length >= 5) {
        return {
          type: 'view',
          connectionId: parts[1],
          database: parts[2],
          schema: parts[3],
          name: parts.slice(4).join('::'),
        };
      }
      return {
        type: 'view',
        connectionId: parts[1],
        database: parts[2],
        name: parts.slice(3).join('::'),
      };
    case 'tables':
      return {
        type: 'tables-folder',
        connectionId: parts[1],
        database: parts[2],
        schema: parts[3],
      };
    case 'views':
      return {
        type: 'views-folder',
        connectionId: parts[1],
        database: parts[2],
        schema: parts[3],
      };
    case 'proc':
      return {
        type: 'procedure',
        connectionId: parts[1],
        database: parts[2],
        name: parts[3],
      };
    case 'func':
      return {
        type: 'function',
        connectionId: parts[1],
        database: parts[2],
        name: parts[3],
      };
    case 'trigger':
      return {
        type: 'trigger',
        connectionId: parts[1],
        database: parts[2],
        name: parts[3],
      };
    case 'procedures':
      return {
        type: 'procedures-folder',
        connectionId: parts[1],
        database: parts[2],
      };
    case 'functions':
      return {
        type: 'functions-folder',
        connectionId: parts[1],
        database: parts[2],
      };
    case 'triggers':
      return {
        type: 'triggers-folder',
        connectionId: parts[1],
        database: parts[2],
      };
    case 'seq':
      return {
        type: 'sequence',
        connectionId: parts[1],
        database: parts[2],
        name: parts[3],
      };
    case 'sequences':
      return {
        type: 'sequences-folder',
        connectionId: parts[1],
        database: parts[2],
      };
    default:
      // Plain connection ID (no prefix)
      return { type: 'connection', connectionId: key };
  }
}
