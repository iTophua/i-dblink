import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Tree, Spin, Dropdown, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  DatabaseOutlined,
  PlusOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import type { Connection } from '../../stores/appStore';
import { EnhancedEmptyState } from '../LoadingStates';
import { DatabaseIcon } from '../DatabaseIcon';
import { isBaseTable } from './utils/tableTypeHelpers';
import type { ConnectionTreeProps } from './types';
import { useTreeDialogs } from './hooks/useTreeDialogs';
import { useConnectionActions } from './hooks/useConnectionActions';
import { useContextMenuMenus } from './hooks/useContextMenuMenus';
import { useTreeHandlers } from './hooks/useTreeHandlers';
import { useTreeData } from './hooks/useTreeData';
import { useSearchExpand } from './hooks/useSearchExpand';
import { PropertiesModal } from './components/PropertiesModal';
import { ConnectionTreeDialogs } from './components/ConnectionTreeDialogs';

function getDbIcon(dbType: string, connected = true) {
  return <DatabaseIcon type={dbType} size={16} grayscale={!connected} />;
}

export function EnhancedConnectionTree(props: ConnectionTreeProps) {
  const {
    connections, groups, selectedId, selectedTableId,
    onSelect, onTableSelect, onObjectTypeSelect,
    onTableOpen, onViewOpen, onOpenDesigner, onOpenViewDefinition,
    onExpand, collapsed, searchText, expandedKeys, onExpandKeys,
    connectionDatabases, isLoading,
    onConnect, onDisconnect, onEditConnection, onDeleteConnection, onNewQuery,
    onOpenRoutine, onOpenTrigger,
    onDatabaseExpand, onDatabaseRefresh, onDatabaseClose, onDatabaseProperties,
    onLoadDatabases, onTableExpand,
    onSaveConnection, onSaveGroup, onDeleteGroup,
    onCreateConnection, onImportConnections, onBatchManage, onRefreshConnections,
  } = props;

  const { t } = useTranslation();

  // ── Refs ──
  const connectionDatabasesRef = useRef(connectionDatabases);
  const expandedKeysRef = useRef(expandedKeys);
  // 记录右键是否点在树节点上（节点有自己的菜单，避免和空白菜单同时弹出）
  const contextMenuOnNodeRef = useRef(false);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [emptyMenuOpen, setEmptyMenuOpen] = useState(false);

  // 原生捕获阶段监听 contextmenu：在 antd Dropdown 的 listener 之前执行，
  // 判断右键目标是否在树节点上，设置标记位供 Dropdown.onOpenChange 读取
  useEffect(() => {
    const el = treeContainerRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      contextMenuOnNodeRef.current = !!target.closest('.ant-tree-treenode');
    };
    // capture: true 让本 handler 先于 target 上的 antd Dropdown listener 执行
    el.addEventListener('contextmenu', handler, true);
    return () => el.removeEventListener('contextmenu', handler, true);
  }, []);

  useEffect(() => { connectionDatabasesRef.current = connectionDatabases; }, [connectionDatabases]);
  useEffect(() => { expandedKeysRef.current = expandedKeys; }, [expandedKeys]);

  // Keep prevTableCountsRef in sync (preserves original behavior)
  const prevTableCountsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const currentTableCounts = new Map<string, number>();
    Object.entries(connectionDatabases).forEach(([connId, dbs]) => {
      dbs.forEach((db) => {
        if (db.loaded) {
          const tableCount = db.tables.filter((t) => isBaseTable(t.table_type)).length;
          currentTableCounts.set(`${connId}::${db.database}`, tableCount);
        }
      });
    });
    prevTableCountsRef.current = currentTableCounts;
  }, [connectionDatabases]);

  // ── Derived data ──
  const groupedConnections = useMemo(() => {
    const map: Record<string, Connection[]> = {};
    connections.forEach((conn) => {
      const groupId = conn.group_id || 'ungrouped';
      if (!map[groupId]) map[groupId] = [];
      map[groupId].push(conn);
    });
    return map;
  }, [connections]);

  const filteredConnections = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter(
      (conn) => conn.name.toLowerCase().includes(q) || conn.host.toLowerCase().includes(q)
    );
  }, [connections, searchText]);

  // ── Hooks ──
  const dialogs = useTreeDialogs(onSaveGroup);
  const connectionActions = useConnectionActions(connections, groups, onSaveConnection, onRefreshConnections);

  const menus = useContextMenuMenus(
    groups, connections, expandedKeys, groupedConnections,
    {
      setGroupDialogOpen: dialogs.setGroupDialogOpen,
      setEditingGroup: dialogs.setEditingGroup,
      setParentGroupId: dialogs.setParentGroupId,
      setRenamingKey: dialogs.setRenamingKey,
      setRenameValue: dialogs.setRenameValue,
      setCopyTarget: dialogs.setCopyTarget,
      setCopyDialogOpen: dialogs.setCopyDialogOpen,
      setDumpTarget: dialogs.setDumpTarget,
      setDumpDialogOpen: dialogs.setDumpDialogOpen,
      setRunSqlTarget: dialogs.setRunSqlTarget,
      setRunSqlDialogOpen: dialogs.setRunSqlDialogOpen,
      setBackupRestoreTarget: dialogs.setBackupRestoreTarget,
      setBackupRestoreMode: dialogs.setBackupRestoreMode,
      setBackupRestoreOpen: dialogs.setBackupRestoreOpen,
      setUserManagementTarget: dialogs.setUserManagementTarget,
      setUserManagementOpen: dialogs.setUserManagementOpen,
      setSchemaCompareOpen: dialogs.setSchemaCompareOpen,
      setProcessListOpen: dialogs.setProcessListOpen,
      setProcessListTarget: dialogs.setProcessListTarget,
      setServerStatusOpen: dialogs.setServerStatusOpen,
      setServerStatusTarget: dialogs.setServerStatusTarget,
      setCreateDatabaseTarget: dialogs.setCreateDatabaseTarget,
      setCreateDatabaseOpen: dialogs.setCreateDatabaseOpen,
      setDataGeneratorTarget: dialogs.setDataGeneratorTarget,
      setDataGeneratorOpen: dialogs.setDataGeneratorOpen,
      setPropertiesType: dialogs.setPropertiesType,
      setPropertiesTarget: dialogs.setPropertiesTarget,
      setPropertiesOpen: dialogs.setPropertiesOpen,
      setPropertiesLoading: dialogs.setPropertiesLoading,
      setPropertiesContent: dialogs.setPropertiesContent,
    },
    {
      onConnect, onDisconnect, onExpand, onEditConnection, onDeleteConnection,
      onNewQuery, onExpandKeys, onDatabaseRefresh, onDatabaseClose, onDatabaseProperties,
      onTableOpen, onOpenDesigner, onOpenViewDefinition, onViewOpen, onDeleteGroup,
      handleCopyConnection: connectionActions.handleCopyConnection,
      handleMoveConnection: connectionActions.handleMoveConnection,
      onRefreshConnections,
    }
  );

  const treeHandlers = useTreeHandlers(
    connections,
    { onExpandKeys, onConnect, onExpand, onDatabaseExpand, onTableExpand, onLoadDatabases, onTableOpen, onViewOpen, onSelect, onTableSelect, onObjectTypeSelect },
    { expandedKeysRef, connectionDatabasesRef }
  );

  const handleRenameCommit = (groupId: string) => {
    if (!dialogs.renameValue.trim()) { dialogs.setRenamingKey(null); return; }
    const group = groups.find((g) => g.id === groupId);
    if (group && group.name !== dialogs.renameValue.trim()) {
      onSaveGroup({ id: groupId, name: dialogs.renameValue.trim(), icon: group.icon, color: group.color });
    }
    dialogs.setRenamingKey(null);
  };

  const { treeData } = useTreeData({
    groups, groupedConnections, connections, connectionDatabases,
    expandedKeys, searchText, selectedTableId,
    renamingKey: dialogs.renamingKey, renameValue: dialogs.renameValue,
    setRenameValue: dialogs.setRenameValue, menus,
    handlers: {
      handleTableClick: treeHandlers.handleTableClick,
      handleDoubleClick: treeHandlers.handleDoubleClick,
      handleRenameCommit,
      onTableOpen, onViewOpen, onNewQuery, onOpenRoutine, onOpenTrigger,
    },
  });

  useSearchExpand(searchText, filteredConnections, connectionDatabases, expandedKeysRef, onExpandKeys);

  // ── Group dialog cancel helper ──
  const handleGroupCancel = () => { dialogs.setGroupDialogOpen(false); dialogs.setEditingGroup(null); dialogs.setParentGroupId(null); };
  const openNewGroup = () => { dialogs.setEditingGroup(null); dialogs.setParentGroupId(null); dialogs.setGroupDialogOpen(true); };

  // ── Tree drag/drop handler ──
  const handleDrop = (info: any) => {
    const draggedKey = info.dragNode.key as string;
    const dropKey = info.node.key as string;
    if (dropKey.startsWith('group-')) { connectionActions.handleMoveConnection(draggedKey, dropKey.replace('group-', '')); return; }
    if (!info.dropToGap) return;
    const draggedConn = connections.find((c) => c.id === draggedKey);
    const dropConn = connections.find((c) => c.id === dropKey);
    if (!draggedConn || !dropConn) return;
    if (draggedConn.group_id === dropConn.group_id) {
      connectionActions.handleReorderConnection(draggedKey, dropKey);
    } else {
      connectionActions.handleMoveConnection(draggedKey, dropConn.group_id || 'default');
    }
  };

  const isDraggable = (node: any) => {
    const key = node.key.toString();
    return !key.startsWith('group-') && !key.startsWith('schema::') && !key.startsWith('db::') &&
      !key.startsWith('table::') && !key.startsWith('view::') && !key.startsWith('tables::') &&
      !key.startsWith('views::') && !key.startsWith('procedures::') && !key.startsWith('functions::') &&
      !key.startsWith('init-');
  };

  // ── Empty state ──
  const emptyState = collapsed ? (
    <EnhancedEmptyState
      icon={<DatabaseOutlined />}
      title={t('common.mainLayout.noConnections')}
      description={t('common.connectionTreeEmpty')}
      action={{ label: t('common.newConnection'), onClick: () => onCreateConnection?.(), icon: <PlusOutlined /> }}
    />
  ) : (
    <EnhancedEmptyState
      icon={<DatabaseOutlined />}
      title={t('common.mainLayout.noConnections')}
      description={t('common.connectionTreeEmptyDescription')}
      action={{ label: t('common.newConnection'), onClick: () => onCreateConnection?.(), icon: <PlusOutlined /> }}
      secondaryAction={{ label: t('common.importConnections'), onClick: () => onImportConnections?.(), icon: <FolderOutlined /> }}
      tips={[t('common.connectionTreeTip1'), t('common.connectionTreeTip2'), t('common.connectionTreeTip3')]}
    />
  );

  // ── Collapsed sidebar ──
  if (collapsed) {
    return (
      <div style={{ padding: '8px 12px' }}>
        {isLoading ? (
          <Spin size="small" />
        ) : connections.length === 0 ? emptyState : (
          connections.map((conn) => (
            <Dropdown key={conn.id} menu={menus.getConnectionMenu(conn)} trigger={['contextMenu']}>
              <div
                onClick={() => onSelect(conn.id)}
                style={{
                  padding: '8px', marginBottom: 4, borderRadius: 6, cursor: 'pointer',
                  background: selectedId === conn.id ? 'var(--row-selected-bg)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s',
                }}
              >
                {getDbIcon(conn.db_type, conn.status === 'connected')}
              </div>
            </Dropdown>
          ))
        )}
        <div style={{ marginTop: 8, padding: '6px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background-hover)', border: '1px dashed var(--border-color)' }} onClick={openNewGroup}>
          <PlusOutlined style={{ color: 'var(--text-tertiary)' }} />
        </div>
        <ConnectionTreeDialogs
          groupDialogOpen={dialogs.groupDialogOpen} editingGroup={dialogs.editingGroup}
          parentGroupId={dialogs.parentGroupId} onGroupDialogCancel={handleGroupCancel}
          onGroupSave={dialogs.handleGroupSave} connections={connections} connectionDatabases={connectionDatabases}
          dataGeneratorOpen={dialogs.dataGeneratorOpen} dataGeneratorTarget={dialogs.dataGeneratorTarget}
          onDataGeneratorCancel={() => { dialogs.setDataGeneratorOpen(false); dialogs.setDataGeneratorTarget(null); }}
          onDataGeneratorSuccess={() => { dialogs.setDataGeneratorOpen(false); dialogs.setDataGeneratorTarget(null); }}
        />
      </div>
    );
  }

  // ── Full tree ──
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .connection-tree-spin-wrapper, .connection-tree-spin-wrapper > .ant-spin-container { height: 100% !important; display: flex !important; flex-direction: column !important; }
        .connection-tree-spin-wrapper > .ant-spin-container > .ant-tree { flex: 1; min-height: 0; }
      `}</style>
      <Spin spinning={isLoading} size="small" wrapperClassName="connection-tree-spin-wrapper">
        {connections.length === 0 && !isLoading ? emptyState : (
          <>
            <Dropdown
              menu={menus.getEmptyAreaMenu()}
              trigger={['contextMenu']}
              open={emptyMenuOpen}
              onOpenChange={(open) => {
                // 节点右键时 contextMenuOnNodeRef 为 true，强制不打开空白菜单
                if (open && contextMenuOnNodeRef.current) {
                  setEmptyMenuOpen(false);
                  return;
                }
                setEmptyMenuOpen(open);
              }}
            >
              <div
                ref={treeContainerRef}
                style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
              >
                <Tree
                  showIcon={false} selectedKeys={selectedId ? [selectedId] : []} expandedKeys={expandedKeys}
                  onExpand={(keys, info) => treeHandlers.handleExpand(keys, info)}
                  onSelect={treeHandlers.handleSelect} treeData={treeData}
                  draggable={isDraggable} onDrop={handleDrop}
                  style={{ background: 'transparent', padding: '0 4px 8px', fontSize: 14, userSelect: 'none', height: '100%' }}
                  className="connection-tree" blockNode virtual
                />
              </div>
            </Dropdown>
          </>
        )}
      </Spin>

      <PropertiesModal
        propertiesOpen={dialogs.propertiesOpen} propertiesType={dialogs.propertiesType}
        propertiesTarget={dialogs.propertiesTarget} propertiesContent={dialogs.propertiesContent}
        propertiesLoading={dialogs.propertiesLoading} groups={groups}
        onClose={() => { dialogs.setPropertiesOpen(false); dialogs.setPropertiesTarget(null); dialogs.setPropertiesContent(''); }}
      />

      <ConnectionTreeDialogs
        groupDialogOpen={dialogs.groupDialogOpen} editingGroup={dialogs.editingGroup}
        parentGroupId={dialogs.parentGroupId} onGroupDialogCancel={handleGroupCancel}
        onGroupSave={dialogs.handleGroupSave} connections={connections} connectionDatabases={connectionDatabases}
        copyDialogOpen={dialogs.copyDialogOpen} copyTarget={dialogs.copyTarget}
        onCopyDialogCancel={() => { dialogs.setCopyDialogOpen(false); dialogs.setCopyTarget(null); }}
        onCopyDialogSuccess={() => { dialogs.setCopyDialogOpen(false); const pt = dialogs.copyTarget; dialogs.setCopyTarget(null); if (pt?.database) onDatabaseRefresh?.(pt.connId, pt.database); }}
        dumpDialogOpen={dialogs.dumpDialogOpen} dumpTarget={dialogs.dumpTarget}
        onDumpDialogCancel={() => { dialogs.setDumpDialogOpen(false); dialogs.setDumpTarget(null); }}
        onDumpDialogSuccess={() => { dialogs.setDumpDialogOpen(false); dialogs.setDumpTarget(null); }}
        runSqlDialogOpen={dialogs.runSqlDialogOpen} runSqlTarget={dialogs.runSqlTarget}
        onRunSqlDialogCancel={() => { dialogs.setRunSqlDialogOpen(false); dialogs.setRunSqlTarget(null); }}
        onRunSqlDialogSuccess={() => { dialogs.setRunSqlDialogOpen(false); dialogs.setRunSqlTarget(null); }}
        backupRestoreOpen={dialogs.backupRestoreOpen} backupRestoreMode={dialogs.backupRestoreMode} backupRestoreTarget={dialogs.backupRestoreTarget}
        onBackupRestoreCancel={() => { dialogs.setBackupRestoreOpen(false); dialogs.setBackupRestoreTarget(null); }}
        onBackupRestoreSuccess={() => { dialogs.setBackupRestoreOpen(false); dialogs.setBackupRestoreTarget(null); }}
        userManagementOpen={dialogs.userManagementOpen} userManagementTarget={dialogs.userManagementTarget}
        onUserManagementClose={() => { dialogs.setUserManagementOpen(false); dialogs.setUserManagementTarget(null); }}
        schemaCompareOpen={dialogs.schemaCompareOpen} onSchemaCompareClose={() => dialogs.setSchemaCompareOpen(false)}
        processListOpen={dialogs.processListOpen} processListTarget={dialogs.processListTarget}
        onProcessListClose={() => { dialogs.setProcessListOpen(false); dialogs.setProcessListTarget(null); }}
        serverStatusOpen={dialogs.serverStatusOpen} serverStatusTarget={dialogs.serverStatusTarget}
        onServerStatusClose={() => { dialogs.setServerStatusOpen(false); dialogs.setServerStatusTarget(null); }}
        createDatabaseOpen={dialogs.createDatabaseOpen} createDatabaseTarget={dialogs.createDatabaseTarget}
        onCreateDatabaseCancel={() => { dialogs.setCreateDatabaseOpen(false); dialogs.setCreateDatabaseTarget(null); }}
        onCreateDatabaseSuccess={() => { dialogs.setCreateDatabaseOpen(false); if (dialogs.createDatabaseTarget?.connId) onLoadDatabases?.(dialogs.createDatabaseTarget.connId); dialogs.setCreateDatabaseTarget(null); }}
        onLoadDatabases={onLoadDatabases}
        dataGeneratorOpen={dialogs.dataGeneratorOpen} dataGeneratorTarget={dialogs.dataGeneratorTarget}
        onDataGeneratorCancel={() => { dialogs.setDataGeneratorOpen(false); dialogs.setDataGeneratorTarget(null); }}
        onDataGeneratorSuccess={() => { dialogs.setDataGeneratorOpen(false); const tgt = dialogs.dataGeneratorTarget; dialogs.setDataGeneratorTarget(null); if (tgt?.database) onDatabaseRefresh?.(tgt.connId, tgt.database); }}
      />
    </div>
  );
}

export default EnhancedConnectionTree;
