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

vi.mock('../../bindings/idblink/backend/app', () => ({
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
  WriteSqlFile: vi.fn().mockResolvedValue(undefined),
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
}));

