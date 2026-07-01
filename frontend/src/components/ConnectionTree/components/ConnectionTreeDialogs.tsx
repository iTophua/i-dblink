import React from 'react';
import type { Connection } from '../../../stores/appStore';
import { GroupDialog } from '../GroupDialog';
import { CopyTableDialog } from '../../CopyTableDialog';
import { DumpDialog } from '../../DumpDialog';
import { RunSqlFileDialog } from '../../RunSqlFileDialog';
import { BackupRestoreDialog } from '../../BackupRestoreDialog';
import { UserManagementDialog } from '../../UserManagementDialog';
import { SchemaCompareDialog } from '../../SchemaCompareDialog';
import { CreateDatabaseDialog } from '../CreateDatabaseDialog';

interface ConnectionTreeDialogsProps {
  // GroupDialog (always shown)
  groupDialogOpen: boolean;
  editingGroup: any | null;
  parentGroupId: string | null;
  onGroupDialogCancel: () => void;
  onGroupSave: (data: { id?: string; name: string; icon: string; color: string; parent_id?: string }) => void;

  // CopyTableDialog (optional)
  copyDialogOpen?: boolean;
  copyTarget?: { tableName: string; database?: string; connId: string } | null;
  connections: Connection[];
  connectionDatabases: Record<string, any[]>;
  onCopyDialogCancel?: () => void;
  onCopyDialogSuccess?: () => void;

  // DumpDialog (optional)
  dumpDialogOpen?: boolean;
  dumpTarget?: { tableName: string; database?: string; connId: string } | null;
  onDumpDialogCancel?: () => void;
  onDumpDialogSuccess?: () => void;

  // RunSqlFileDialog (optional)
  runSqlDialogOpen?: boolean;
  runSqlTarget?: { connId: string; database?: string } | null;
  onRunSqlDialogCancel?: () => void;
  onRunSqlDialogSuccess?: () => void;

  // BackupRestoreDialog (optional)
  backupRestoreOpen?: boolean;
  backupRestoreMode?: 'backup' | 'restore';
  backupRestoreTarget?: { connId: string; database: string } | null;
  onBackupRestoreCancel?: () => void;
  onBackupRestoreSuccess?: () => void;

  // UserManagementDialog (optional)
  userManagementOpen?: boolean;
  userManagementTarget?: { connId: string; database?: string } | null;
  onUserManagementClose?: () => void;

  // SchemaCompareDialog (optional)
  schemaCompareOpen?: boolean;
  onSchemaCompareClose?: () => void;

  // CreateDatabaseDialog (optional)
  createDatabaseOpen?: boolean;
  createDatabaseTarget?: { connId: string; dbType?: string } | null;
  onCreateDatabaseCancel?: () => void;
  onCreateDatabaseSuccess?: () => void;
  onLoadDatabases?: (connectionId: string) => void;
}

const noop = () => {};

export const ConnectionTreeDialogs: React.FC<ConnectionTreeDialogsProps> = ({
  groupDialogOpen,
  editingGroup,
  parentGroupId,
  onGroupDialogCancel,
  onGroupSave,
  copyDialogOpen = false,
  copyTarget = null,
  connections,
  connectionDatabases,
  onCopyDialogCancel = noop,
  onCopyDialogSuccess = noop,
  dumpDialogOpen = false,
  dumpTarget = null,
  onDumpDialogCancel = noop,
  onDumpDialogSuccess = noop,
  runSqlDialogOpen = false,
  runSqlTarget = null,
  onRunSqlDialogCancel = noop,
  onRunSqlDialogSuccess = noop,
  backupRestoreOpen = false,
  backupRestoreMode = 'backup',
  backupRestoreTarget = null,
  onBackupRestoreCancel = noop,
  onBackupRestoreSuccess = noop,
  userManagementOpen = false,
  userManagementTarget = null,
  onUserManagementClose = noop,
  schemaCompareOpen = false,
  onSchemaCompareClose = noop,
  createDatabaseOpen = false,
  createDatabaseTarget = null,
  onCreateDatabaseCancel = noop,
  onCreateDatabaseSuccess = noop,
  onLoadDatabases,
}) => {
  return (
    <>
      <GroupDialog
        open={groupDialogOpen}
        editingGroup={editingGroup}
        parentGroupId={parentGroupId}
        onCancel={onGroupDialogCancel}
        onSave={onGroupSave}
      />

      <CopyTableDialog
        open={copyDialogOpen}
        sourceTable={copyTarget?.tableName || ''}
        sourceDatabase={copyTarget?.database}
        connectionId={copyTarget?.connId || ''}
        dbType={connections.find((c) => c.id === copyTarget?.connId)?.db_type}
        databases={
          copyTarget ? connectionDatabases[copyTarget.connId]?.map((d: any) => d.database) || [] : []
        }
        onCancel={onCopyDialogCancel}
        onSuccess={onCopyDialogSuccess}
      />

      <DumpDialog
        open={dumpDialogOpen}
        tableName={dumpTarget?.tableName || ''}
        database={dumpTarget?.database}
        connectionId={dumpTarget?.connId || ''}
        onCancel={onDumpDialogCancel}
        onSuccess={onDumpDialogSuccess}
      />

      <RunSqlFileDialog
        open={runSqlDialogOpen}
        connectionId={runSqlTarget?.connId || ''}
        database={runSqlTarget?.database}
        onCancel={onRunSqlDialogCancel}
        onSuccess={onRunSqlDialogSuccess}
      />

      <BackupRestoreDialog
        open={backupRestoreOpen}
        mode={backupRestoreMode}
        connectionId={backupRestoreTarget?.connId || ''}
        database={backupRestoreTarget?.database}
        dbType={connections.find((c) => c.id === backupRestoreTarget?.connId)?.db_type || ''}
        onCancel={onBackupRestoreCancel}
        onSuccess={onBackupRestoreSuccess}
      />

      <UserManagementDialog
        open={userManagementOpen}
        connectionId={userManagementTarget?.connId || ''}
        database={userManagementTarget?.database}
        onClose={onUserManagementClose}
      />

      <SchemaCompareDialog
        open={schemaCompareOpen}
        connections={connections}
        onClose={onSchemaCompareClose}
      />

      <CreateDatabaseDialog
        open={createDatabaseOpen}
        connectionId={createDatabaseTarget?.connId || ''}
        dbType={createDatabaseTarget?.dbType}
        onCancel={onCreateDatabaseCancel}
        onSuccess={() => {
          onCreateDatabaseSuccess();
          if (createDatabaseTarget?.connId) {
            onLoadDatabases?.(createDatabaseTarget.connId);
          }
        }}
      />
    </>
  );
};
