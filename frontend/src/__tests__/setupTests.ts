import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);

export const mockTestConnection = vi.fn().mockResolvedValue(undefined);
export const mockConnectDatabase = vi.fn().mockResolvedValue(undefined);
export const mockDisconnectDatabase = vi.fn().mockResolvedValue(undefined);
export const mockGetConnections = vi.fn().mockResolvedValue([]);
export const mockSaveConnection = vi.fn().mockResolvedValue(undefined);
export const mockUpdateConnectionPassword = vi.fn().mockResolvedValue(undefined);
export const mockDeleteConnection = vi.fn().mockResolvedValue(undefined);
export const mockGetGroups = vi.fn().mockResolvedValue([]);
export const mockSaveGroup = vi.fn().mockResolvedValue(undefined);
export const mockDeleteGroup = vi.fn().mockResolvedValue(undefined);
export const mockGetDatabases = vi.fn().mockResolvedValue([]);
export const mockGetTables = vi.fn().mockResolvedValue([]);
export const mockGetTablesCategorized = vi.fn().mockResolvedValue({ tables: [], views: [] });
export const mockGetTableStructure = vi.fn().mockResolvedValue({ columns: [], indexes: [], foreign_keys: [] });
export const mockGetColumns = vi.fn().mockResolvedValue([]);
export const mockGetAllColumns = vi.fn().mockResolvedValue({ tables: {} });
export const mockGetIndexes = vi.fn().mockResolvedValue([]);
export const mockGetForeignKeys = vi.fn().mockResolvedValue([]);
export const mockGetProcedures = vi.fn().mockResolvedValue([]);
export const mockGetFunctions = vi.fn().mockResolvedValue([]);
export const mockGetProcedureBody = vi.fn().mockResolvedValue('');
export const mockGetFunctionBody = vi.fn().mockResolvedValue('');
export const mockExecuteQuery = vi.fn().mockResolvedValue({ columns: [], rows: [] });
export const mockExecuteQueryLimited = vi.fn().mockResolvedValue({ columns: [], rows: [] });
export const mockExecuteScriptBatch = vi.fn().mockResolvedValue({ results: [] });
export const mockCancelScriptBatch = vi.fn().mockResolvedValue(undefined);
export const mockExecuteDDL = vi.fn().mockResolvedValue(undefined);
export const mockTruncateTable = vi.fn().mockResolvedValue(undefined);
export const mockDropTable = vi.fn().mockResolvedValue(undefined);
export const mockDropView = vi.fn().mockResolvedValue(undefined);
export const mockRenameTable = vi.fn().mockResolvedValue(undefined);
export const mockMaintainTable = vi.fn().mockResolvedValue(undefined);
export const mockBeginTransaction = vi.fn().mockResolvedValue(undefined);
export const mockCommitTransaction = vi.fn().mockResolvedValue(true);
export const mockRollbackTransaction = vi.fn().mockResolvedValue(true);
export const mockGetTransactionStatus = vi.fn().mockResolvedValue(false);
export const mockGetServerInfo = vi.fn().mockResolvedValue({});
export const mockGetTableDDL = vi.fn().mockResolvedValue([]);
export const mockGetTriggers = vi.fn().mockResolvedValue([]);
export const mockGetSequences = vi.fn().mockResolvedValue([]);
export const mockGetEvents = vi.fn().mockResolvedValue([]);
export const mockSaveSnippet = vi.fn().mockResolvedValue('test-id');
export const mockGetSnippets = vi.fn().mockResolvedValue([]);
export const mockDeleteSnippet = vi.fn().mockResolvedValue(undefined);
export const mockStreamExportTable = vi.fn().mockResolvedValue({});
export const mockCheckBackupTool = vi.fn().mockResolvedValue({ available: false });
export const mockBackupDatabase = vi.fn().mockResolvedValue({});
export const mockRestoreDatabase = vi.fn().mockResolvedValue({});
export const mockGetUsers = vi.fn().mockResolvedValue({});
export const mockGetUserPrivileges = vi.fn().mockResolvedValue({});
export const mockGetTablePrivileges = vi.fn().mockResolvedValue([]);
export const mockCreateUser = vi.fn().mockResolvedValue(undefined);
export const mockDropUser = vi.fn().mockResolvedValue(undefined);
export const mockGrantPrivilege = vi.fn().mockResolvedValue(undefined);
export const mockRevokePrivilege = vi.fn().mockResolvedValue(undefined);
export const mockCompareSchema = vi.fn().mockResolvedValue({});
export const mockBatchImport = vi.fn().mockResolvedValue({ success_count: 0, failed_count: 0, total_count: 0 });
export const mockQuitApp = vi.fn().mockResolvedValue(undefined);
export const mockGreet = vi.fn().mockResolvedValue('');
export const mockGetConnectionSSHCredentials = vi.fn().mockResolvedValue({ password: '', passphrase: '' });
export const mockGetConnectionPassword = vi.fn().mockResolvedValue('');
export const mockWriteAppLog = vi.fn().mockResolvedValue(undefined);
export const mockGetLogFolderPath = vi.fn().mockResolvedValue('/tmp/idblink-logs');
export const mockOpenLogFolder = vi.fn().mockResolvedValue(undefined);
export const mockAIChatListSessions = vi.fn().mockResolvedValue([]);
export const mockAIChatCreateSession = vi.fn().mockResolvedValue({
  id: 'session-1',
  title: '',
  connection_id: null,
  context_json: '',
  created_at: '2026-01-01T00:00:00.000000000Z',
  updated_at: '2026-01-01T00:00:00.000000000Z',
});
export const mockAIChatRenameSession = vi.fn().mockResolvedValue(undefined);
export const mockAIChatUpdateSessionContext = vi.fn().mockResolvedValue(undefined);
export const mockAIChatDeleteSession = vi.fn().mockResolvedValue(undefined);
export const mockAIChatDeleteAllSessions = vi.fn().mockResolvedValue(undefined);
export const mockAIChatGetMessages = vi.fn().mockResolvedValue([]);
export const mockAIChatSaveMessages = vi.fn().mockResolvedValue(undefined);
export const mockGetERDiagram = vi.fn().mockResolvedValue({ tables: [], edges: [] });
export const mockCompareTableData = vi.fn().mockResolvedValue({
  key_columns: [],
  compare_columns: [],
  source_only_columns: [],
  target_only_columns: [],
  source_rows: 0,
  target_rows: 0,
  same_count: 0,
  modified_count: 0,
  source_only_count: 0,
  target_only_count: 0,
  truncated: false,
  warnings: [],
  modified: [],
  source_only: [],
  target_only: [],
  sql: '',
  sql_counts: { update: 0, insert: 0, delete: 0 },
  sql_truncated: false,
});

vi.mock('../../bindings/idblink/backend/app', () => ({
  WriteAppLog: mockWriteAppLog,
  GetLogFolderPath: mockGetLogFolderPath,
  OpenLogFolder: mockOpenLogFolder,
  AIChatListSessions: mockAIChatListSessions,
  AIChatCreateSession: mockAIChatCreateSession,
  AIChatRenameSession: mockAIChatRenameSession,
  AIChatUpdateSessionContext: mockAIChatUpdateSessionContext,
  AIChatDeleteSession: mockAIChatDeleteSession,
  AIChatDeleteAllSessions: mockAIChatDeleteAllSessions,
  AIChatGetMessages: mockAIChatGetMessages,
  AIChatSaveMessages: mockAIChatSaveMessages,
  GetERDiagram: mockGetERDiagram,
  CompareTableData: mockCompareTableData,
  TestConnection: mockTestConnection,
  ConnectDatabase: mockConnectDatabase,
  DisconnectDatabase: mockDisconnectDatabase,
  GetConnections: mockGetConnections,
  GetConnectionPassword: mockGetConnectionPassword,
  GetConnectionSSHCredentials: mockGetConnectionSSHCredentials,
  SaveConnection: mockSaveConnection,
  UpdateConnectionPassword: mockUpdateConnectionPassword,
  DeleteConnection: mockDeleteConnection,
  GetGroups: mockGetGroups,
  SaveGroup: mockSaveGroup,
  DeleteGroup: mockDeleteGroup,
  GetDatabases: mockGetDatabases,
  GetTables: mockGetTables,
  GetTablesCategorized: mockGetTablesCategorized,
  GetTableStructure: mockGetTableStructure,
  GetColumns: mockGetColumns,
  GetAllColumns: mockGetAllColumns,
  GetIndexes: mockGetIndexes,
  GetForeignKeys: mockGetForeignKeys,
  GetProcedures: mockGetProcedures,
  GetFunctions: mockGetFunctions,
  GetProcedureBody: mockGetProcedureBody,
  GetFunctionBody: mockGetFunctionBody,
  ExecuteQuery: mockExecuteQuery,
  ExecuteQueryLimited: mockExecuteQueryLimited,
  ExecuteScriptBatch: mockExecuteScriptBatch,
  CancelScriptBatch: mockCancelScriptBatch,
  ExecuteDDL: mockExecuteDDL,
  TruncateTable: mockTruncateTable,
  DropTable: mockDropTable,
  DropView: mockDropView,
  RenameTable: mockRenameTable,
  MaintainTable: mockMaintainTable,
  BeginTransaction: mockBeginTransaction,
  CommitTransaction: mockCommitTransaction,
  RollbackTransaction: mockRollbackTransaction,
  GetTransactionStatus: mockGetTransactionStatus,
  GetServerInfo: mockGetServerInfo,
  GetTableDDL: mockGetTableDDL,
  GetTriggers: mockGetTriggers,
  GetSequences: mockGetSequences,
  GetEvents: mockGetEvents,
  SaveSnippet: mockSaveSnippet,
  GetSnippets: mockGetSnippets,
  DeleteSnippet: mockDeleteSnippet,
  StreamExportTable: mockStreamExportTable,
  CheckBackupTool: mockCheckBackupTool,
  BackupDatabase: mockBackupDatabase,
  RestoreDatabase: mockRestoreDatabase,
  GetUsers: mockGetUsers,
  GetUserPrivileges: mockGetUserPrivileges,
  GetTablePrivileges: mockGetTablePrivileges,
  CreateUser: mockCreateUser,
  DropUser: mockDropUser,
  GrantPrivilege: mockGrantPrivilege,
  RevokePrivilege: mockRevokePrivilege,
  CompareSchema: mockCompareSchema,
  BatchImport: mockBatchImport,
  QuitApp: mockQuitApp,
  Greet: mockGreet,
  SetNativeWindowAppearance: vi.fn(() => Promise.resolve()),
  ReadSqlFile: vi.fn().mockResolvedValue(''),
  TakePendingOpenFile: vi.fn().mockResolvedValue(''),
  SetCloseGuardState: vi.fn().mockResolvedValue(undefined),
  OpenResultPopup: vi.fn().mockResolvedValue('result-1'),
  SaveSqlFileDialog: vi.fn().mockResolvedValue(''),
  SaveStartupTheme: vi.fn().mockResolvedValue(undefined),
  WriteSqlFile: vi.fn().mockResolvedValue(undefined),
  ReadImportFile: vi.fn().mockResolvedValue({ name: '', data: '' }),
}));

vi.mock('@wailsio/runtime', () => ({
  JSONStream: vi.fn(() => ({
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: vi.fn(),
    close: vi.fn(),
    bufferedAmount: 0,
  })),
  Events: {
    On: vi.fn(() => vi.fn()),
    Once: vi.fn(() => vi.fn()),
    Off: vi.fn(),
    OffAll: vi.fn(),
    Emit: vi.fn(() => Promise.resolve(true)),
  },
  Window: {
    SetTitle: vi.fn(() => Promise.resolve()),
    Minimise: vi.fn(() => Promise.resolve()),
    Hide: vi.fn(() => Promise.resolve()),
    SetBackgroundColour: vi.fn(() => Promise.resolve()),
  },
  Dialogs: {
    OpenFile: vi.fn(() => Promise.resolve('')),
    SaveFile: vi.fn(() => Promise.resolve('')),
  },
}));

