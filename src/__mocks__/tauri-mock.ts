// Tauri API Mock — injects window.__TAURI_INTERNALS__ for browser testing
const mockConnections = [
  {
    id: 'conn-1',
    name: 'Local MySQL',
    db_type: 'MySQL',
    host: '127.0.0.1',
    port: 13306,
    username: 'testuser',
    database: 'testdb',
    group_id: null,
    color: '#1890ff',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'conn-2',
    name: 'Local PostgreSQL',
    db_type: 'PostgreSQL',
    host: '127.0.0.1',
    port: 15432,
    username: 'testuser',
    database: 'testdb',
    group_id: null,
    color: '#52c41a',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'conn-3',
    name: 'Production DB',
    db_type: 'MySQL',
    host: '192.168.1.100',
    port: 3306,
    username: 'prod_user',
    database: 'proddb',
    group_id: 'group-1',
    color: '#ff4d4f',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const mockGroups = [
  {
    id: 'group-1',
    name: 'Production',
    color: '#ff4d4f',
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'group-2',
    name: 'Development',
    color: '#1890ff',
    sort_order: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'group-3',
    name: 'Testing',
    color: '#52c41a',
    sort_order: 3,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const mockTables = [
  {
    name: 'users',
    schema: 'public',
    type: 'table',
    row_count: 100,
    size: '64 KB',
    comment: '用户表',
  },
  {
    name: 'orders',
    schema: 'public',
    type: 'table',
    row_count: 500,
    size: '128 KB',
    comment: '订单表',
  },
  {
    name: 'products',
    schema: 'public',
    type: 'table',
    row_count: 50,
    size: '32 KB',
    comment: '商品表',
  },
  {
    name: 'order_items',
    schema: 'public',
    type: 'table',
    row_count: 800,
    size: '96 KB',
    comment: '订单明细',
  },
  {
    name: 'categories',
    schema: 'public',
    type: 'table',
    row_count: 10,
    size: '8 KB',
    comment: '分类表',
  },
];

const mockViews = [
  {
    name: 'user_order_summary',
    schema: 'public',
    type: 'view',
    row_count: 100,
    size: '0 B',
    comment: '用户订单汇总',
  },
];

const mockColumns = [
  {
    name: 'id',
    data_type: 'INTEGER',
    nullable: false,
    is_primary_key: true,
    default_value: null,
    extra: 'auto_increment',
    comment: '主键',
  },
  {
    name: 'username',
    data_type: 'VARCHAR(50)',
    nullable: false,
    is_primary_key: false,
    default_value: null,
    extra: '',
    comment: '用户名',
  },
  {
    name: 'email',
    data_type: 'VARCHAR(100)',
    nullable: true,
    is_primary_key: false,
    default_value: null,
    extra: '',
    comment: '邮箱',
  },
  {
    name: 'age',
    data_type: 'INTEGER',
    nullable: true,
    is_primary_key: false,
    default_value: null,
    extra: '',
    comment: '年龄',
  },
  {
    name: 'created_at',
    data_type: 'TIMESTAMP',
    nullable: true,
    is_primary_key: false,
    default_value: 'CURRENT_TIMESTAMP',
    extra: '',
    comment: '创建时间',
  },
  {
    name: 'updated_at',
    data_type: 'TIMESTAMP',
    nullable: true,
    is_primary_key: false,
    default_value: 'CURRENT_TIMESTAMP',
    extra: '',
    comment: '更新时间',
  },
];

const mockIndexes = [
  { name: 'idx_users_email', columns: ['email'], unique: true, index_type: 'BTREE', comment: '' },
  {
    name: 'idx_users_username',
    columns: ['username'],
    unique: true,
    index_type: 'BTREE',
    comment: '',
  },
];

const mockForeignKeys = [
  {
    name: 'fk_orders_user',
    column: 'user_id',
    ref_table: 'users',
    ref_column: 'id',
    on_delete: 'CASCADE',
    on_update: 'CASCADE',
  },
];

const mockProcedures = ['get_user_orders', 'get_user_stats', 'update_inventory'];
const mockFunctions = ['get_user_total_spent', 'calculate_discount', 'get_order_count'];

const mockTriggers = [
  {
    name: 'update_users_timestamp',
    event: 'UPDATE',
    table: 'users',
    timing: 'BEFORE',
    statement: '...',
  },
];

const mockEvents = [
  {
    name: 'cleanup_old_orders',
    status: 'ENABLED',
    interval: '1 DAY',
    last_executed: '2026-05-07T00:00:00Z',
  },
];

const mockSnippets = [
  {
    id: 'snippet-1',
    name: 'Get All Users',
    sql_text: 'SELECT * FROM users;',
    db_type: 'MySQL',
    category: 'SELECT',
    tags: 'users,query',
    is_private: false,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'snippet-2',
    name: 'Count Orders',
    sql_text: 'SELECT COUNT(*) FROM orders;',
    db_type: 'PostgreSQL',
    category: 'AGGREGATE',
    tags: 'count,orders',
    is_private: false,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'snippet-3',
    name: 'Find User',
    sql_text: 'SELECT * FROM users WHERE id = ?;',
    db_type: null,
    category: 'SELECT',
    tags: 'users,search',
    is_private: true,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const mockQueryResult = {
  columns: ['id', 'username', 'email', 'age', 'created_at'],
  rows: [
    [1, 'alice', 'alice@example.com', 25, '2026-01-01 00:00:00'],
    [2, 'bob', 'bob@example.com', 30, '2026-01-01 00:00:00'],
    [3, 'charlie', 'charlie@example.com', 35, '2026-01-01 00:00:00'],
    [4, 'diana', 'diana@example.com', 28, '2026-01-01 00:00:00'],
    [5, 'eve', 'eve@example.com', 22, '2026-01-01 00:00:00'],
  ],
  row_count: 5,
  affected_rows: 0,
  execution_time_ms: 12,
  sql: 'SELECT * FROM users LIMIT 5;',
};

const mockServerInfo = {
  version: '8.0.46',
  server_type: 'MySQL',
  character_set: 'utf8mb4',
  collation: 'utf8mb4_unicode_ci',
  uptime: '10 days 5 hours',
  max_connections: 151,
};

interface ConnectState {
  [connectionId: string]: boolean;
}
const connectState: ConnectState = {};
let connectionCounter = mockConnections.length;
let currentConnections = [...mockConnections];
let currentGroups = [...mockGroups];
let currentSnippets = [...mockSnippets];
let transactionState: { [key: string]: boolean } = {};

const responseMap: Record<string, (args?: any) => any> = {
  test_connection: () => true,
  connect_database: (args) => {
    if (args?.connectionId) connectState[args.connectionId] = true;
    return true;
  },
  disconnect_database: (args) => {
    if (args?.connectionId) connectState[args.connectionId] = false;
    return true;
  },
  get_connections: () => currentConnections,
  save_connection: (args) => {
    const input = args?.input;
    if (input?.id) {
      const idx = currentConnections.findIndex((c) => c.id === input.id);
      if (idx >= 0) {
        currentConnections[idx] = {
          ...currentConnections[idx],
          ...input,
          updated_at: new Date().toISOString(),
        };
        return currentConnections[idx];
      }
    }
    const newConn = {
      id: `conn-${++connectionCounter}`,
      ...input,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    currentConnections.push(newConn);
    return newConn;
  },
  delete_connection: (args) => {
    currentConnections = currentConnections.filter((c) => c.id !== args?.id);
    return null;
  },
  update_connection_password: () => null,
  get_groups: () => currentGroups,
  save_group: (args) => {
    const input = args?.input;
    if (input?.id) {
      const idx = currentGroups.findIndex((g) => g.id === input.id);
      if (idx >= 0) {
        currentGroups[idx] = { ...currentGroups[idx], ...input };
        return currentGroups[idx];
      }
    }
    const newGroup = {
      id: `group-${Date.now()}`,
      ...input,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    currentGroups.push(newGroup);
    return newGroup;
  },
  delete_group: (args) => {
    currentGroups = currentGroups.filter((g) => g.id !== args?.id);
    return null;
  },
  get_databases: () => ['testdb', 'information_schema', 'mysql', 'performance_schema'],
  get_tables: () => mockTables,
  get_tables_categorized: () => ({ tables: mockTables, views: mockViews }),
  get_table_structure: () => ({
    columns: mockColumns,
    indexes: mockIndexes,
    foreign_keys: mockForeignKeys,
  }),
  get_columns: () => mockColumns,
  get_indexes: () => mockIndexes,
  get_foreign_keys: () => mockForeignKeys,
  get_procedures: () => mockProcedures,
  get_functions: () => mockFunctions,
  get_procedure_body: () =>
    'CREATE OR REPLACE FUNCTION get_user_orders(p_user_id INT)\nRETURNS TABLE (...) AS $$\nBEGIN\n  RETURN QUERY SELECT * FROM orders WHERE user_id = p_user_id;\nEND;\n$$ LANGUAGE plpgsql;',
  get_function_body: () =>
    'CREATE OR REPLACE FUNCTION get_user_total_spent(p_user_id INT)\nRETURNS DECIMAL(10,2) AS $$\nBEGIN\n  RETURN (SELECT COALESCE(SUM(amount), 0) FROM orders WHERE user_id = p_user_id);\nEND;\n$$ LANGUAGE plpgsql;',
  execute_query: () => mockQueryResult,
  execute_ddl: () => null,
  truncate_table: () => null,
  drop_table: () => null,
  drop_view: () => null,
  rename_table: () => null,
  maintain_table: () => null,
  begin_transaction: (args) => {
    if (args?.connectionId) transactionState[args.connectionId] = true;
    return null;
  },
  commit_transaction: (args) => {
    if (args?.connectionId) transactionState[args.connectionId] = false;
    return null;
  },
  rollback_transaction: (args) => {
    if (args?.connectionId) transactionState[args.connectionId] = false;
    return null;
  },
  get_transaction_status: (args) =>
    args?.connectionId ? !!transactionState[args.connectionId] : false,
  get_server_info: () => mockServerInfo,
  get_table_ddl: () => [
    'CREATE TABLE users (\n  id INTEGER PRIMARY KEY AUTO_INCREMENT,\n  username VARCHAR(50) NOT NULL UNIQUE,\n  email VARCHAR(100),\n  age INT,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
    'CREATE INDEX idx_users_email ON users(email);',
    'CREATE INDEX idx_users_username ON users(username);',
  ],
  get_triggers: () => mockTriggers,
  get_events: () => mockEvents,
  save_snippet: (args) => {
    if (args?.id) {
      const idx = currentSnippets.findIndex((s) => s.id === args.id);
      if (idx >= 0) {
        currentSnippets[idx] = { ...currentSnippets[idx], ...args };
        return args.id;
      }
    }
    const newSnippet = {
      id: `snippet-${Date.now()}`,
      ...args,
      created_at: new Date().toISOString(),
    };
    currentSnippets.push(newSnippet);
    return newSnippet.id;
  },
  get_snippets: () => currentSnippets,
  delete_snippet: (args) => {
    currentSnippets = currentSnippets.filter((s) => s.id !== args?.id);
    return null;
  },
  stream_export_table: () => ({
    columns: mockColumns.map((c) => c.name),
    total_rows: 100,
    exported_rows: 100,
    file_path: '/tmp/export.csv',
  }),
  check_backup_tool: () => ({ available: true, path: '/usr/bin/mysqldump' }),
  backup_database: () => ({ file_path: '/tmp/backup.sql' }),
  restore_database: () => ({ success: true }),
  get_users: () => [
    { user: 'testuser', host: '%', password_last_changed: '2026-01-01', account_locked: 'N' },
    { user: 'root', host: 'localhost', password_last_changed: '2026-01-01', account_locked: 'N' },
  ],
  get_user_privileges: () => ({
    global_privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    database_privileges: { testdb: ['ALL'] },
  }),
  get_table_privileges: () => [
    { table_schema: 'testdb', table_name: 'users', privilege_type: 'SELECT' },
    { table_schema: 'testdb', table_name: 'orders', privilege_type: 'SELECT,INSERT' },
  ],
  create_user: () => null,
  drop_user: () => null,
  grant_privilege: () => null,
  revoke_privilege: () => null,
  compare_schema: () => ({
    summary: { total_differences: 3 },
    tables_only_in_source: [],
    tables_only_in_target: [],
    tables_in_both: [
      {
        table_name: 'users',
        differences: [
          { type: 'column_missing', object: 'email', detail: 'Column email missing in target' },
          {
            type: 'index_different',
            object: 'idx_users_email',
            detail: 'Index definition differs',
          },
        ],
      },
    ],
  }),
  batch_import: () => ({ success_count: 10, failed_count: 0, total_count: 10, last_error: null }),
  quit_app: () => null,
};

const tauriInvoke = async (cmd: string, args?: any) => {
  const handler = responseMap[cmd];
  if (handler) {
    await new Promise((r) => setTimeout(r, 50));
    return handler(args);
  }
  console.warn(`[Tauri Mock] Unhandled command: ${cmd}`, args);
  return null;
};

Object.defineProperty(window, '__TAURI_INTERNALS__', {
  value: {
    invoke: tauriInvoke,
    ipc: { postMessage: () => {} },
    metadata: { currentTarget: { all: [] } },
    convertFileSrc: (path: string) => path,
  },
  writable: false,
  configurable: false,
});
