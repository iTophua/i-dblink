import { useState, useCallback } from 'react';
import type { ConnectionGroup } from '../../../stores/appStore';

export function useTreeDialogs(
  onSaveGroup: (data: { id?: string; name: string; icon: string; color: string; parent_id?: string }) => void
) {
  // Group dialog
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ConnectionGroup | null>(null);
  const [parentGroupId, setParentGroupId] = useState<string | null>(null);

  // Rename
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Copy table dialog
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState<{
    tableName: string;
    database?: string;
    connId: string;
  } | null>(null);

  // Dump dialog
  const [dumpDialogOpen, setDumpDialogOpen] = useState(false);
  const [dumpTarget, setDumpTarget] = useState<{
    tableName: string;
    database?: string;
    connId: string;
  } | null>(null);

  // Run SQL file dialog
  const [runSqlDialogOpen, setRunSqlDialogOpen] = useState(false);
  const [runSqlTarget, setRunSqlTarget] = useState<{ connId: string; database?: string } | null>(null);

  // Backup/Restore dialog
  const [backupRestoreOpen, setBackupRestoreOpen] = useState(false);
  const [backupRestoreMode, setBackupRestoreMode] = useState<'backup' | 'restore'>('backup');
  const [backupRestoreTarget, setBackupRestoreTarget] = useState<{
    connId: string;
    database: string;
  } | null>(null);

  // User management dialog
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [userManagementTarget, setUserManagementTarget] = useState<{
    connId: string;
    database?: string;
  } | null>(null);

  // Create database dialog
  const [createDatabaseOpen, setCreateDatabaseOpen] = useState(false);
  const [createDatabaseTarget, setCreateDatabaseTarget] = useState<{
    connId: string;
    dbType?: string;
  } | null>(null);

  // Process list dialog
  const [processListOpen, setProcessListOpen] = useState(false);
  const [processListTarget, setProcessListTarget] = useState<{
    connId: string;
    database?: string;
  } | null>(null);

  // Server status dialog
  const [serverStatusOpen, setServerStatusOpen] = useState(false);
  const [serverStatusTarget, setServerStatusTarget] = useState<{
    connId: string;
  } | null>(null);

  // Schema compare dialog
  const [schemaCompareOpen, setSchemaCompareOpen] = useState(false);

  // Data generator dialog
  const [dataGeneratorOpen, setDataGeneratorOpen] = useState(false);
  const [dataGeneratorTarget, setDataGeneratorTarget] = useState<{
    connId: string;
    database?: string;
    tableName?: string;
  } | null>(null);

  // Properties modal
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [propertiesType, setPropertiesType] = useState<
    'connection' | 'table' | 'view' | 'procedure' | 'function' | 'trigger' | 'group'
  >('table');
  const [propertiesTarget, setPropertiesTarget] = useState<{
    connId: string;
    name: string;
    database?: string;
    data?: any;
  } | null>(null);
  const [propertiesContent, setPropertiesContent] = useState<string>('');
  const [propertiesLoading, setPropertiesLoading] = useState(false);

  const handleGroupSave = useCallback(
    async (data: {
      id?: string;
      name: string;
      icon: string;
      color: string;
      parent_id?: string;
    }) => {
      onSaveGroup(data);
      setGroupDialogOpen(false);
      setEditingGroup(null);
      setParentGroupId(null);
    },
    [onSaveGroup]
  );

  return {
    // Group dialog
    groupDialogOpen,
    setGroupDialogOpen,
    editingGroup,
    setEditingGroup,
    parentGroupId,
    setParentGroupId,

    // Rename
    renamingKey,
    setRenamingKey,
    renameValue,
    setRenameValue,

    // Copy table dialog
    copyDialogOpen,
    setCopyDialogOpen,
    copyTarget,
    setCopyTarget,

    // Dump dialog
    dumpDialogOpen,
    setDumpDialogOpen,
    dumpTarget,
    setDumpTarget,

    // Run SQL file dialog
    runSqlDialogOpen,
    setRunSqlDialogOpen,
    runSqlTarget,
    setRunSqlTarget,

    // Backup/Restore dialog
    backupRestoreOpen,
    setBackupRestoreOpen,
    backupRestoreMode,
    setBackupRestoreMode,
    backupRestoreTarget,
    setBackupRestoreTarget,

    // User management dialog
    userManagementOpen,
    setUserManagementOpen,
    userManagementTarget,
    setUserManagementTarget,

    // Create database dialog
    createDatabaseOpen,
    setCreateDatabaseOpen,
    createDatabaseTarget,
    setCreateDatabaseTarget,

    // Process list dialog
    processListOpen,
    setProcessListOpen,
    processListTarget,
    setProcessListTarget,

    // Server status dialog
    serverStatusOpen,
    setServerStatusOpen,
    serverStatusTarget,
    setServerStatusTarget,

    // Schema compare dialog
    schemaCompareOpen,
    setSchemaCompareOpen,

    // Data generator dialog
    dataGeneratorOpen,
    setDataGeneratorOpen,
    dataGeneratorTarget,
    setDataGeneratorTarget,

    // Properties modal
    propertiesOpen,
    setPropertiesOpen,
    propertiesType,
    setPropertiesType,
    propertiesTarget,
    setPropertiesTarget,
    propertiesContent,
    setPropertiesContent,
    propertiesLoading,
    setPropertiesLoading,

    // Handlers
    handleGroupSave,
  };
}
