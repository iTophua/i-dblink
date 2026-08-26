import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Tree, Spin, Dropdown, Menu } from 'antd';
// Dropdown 仅用于折叠态侧栏连接菜单（见 collapsed 分支）；空白菜单用手动浮动 div
import { useTranslation } from 'react-i18next';
import {
  DatabaseOutlined,
  PlusOutlined,
  FolderOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { Connection } from '../../stores/appStore';
import { EnhancedEmptyState } from '../LoadingStates';
import { DatabaseIcon } from '../DatabaseIcon';
import { isBaseTable } from './utils/tableTypeHelpers';
import { matchesConnection } from './utils/searchUtils';
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
    onExpand, collapsed, searchText, expandedKeys, onExpandKeys, onClearSearch, onCancelConnect,
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
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<React.ComponentRef<typeof Tree>>(null);
  // 搜索清除后需要滚动定位到的连接节点
  const pendingScrollKeyRef = useRef<string | null>(null);
  // 树容器实测高度：传给 Tree 的 height 属性启用真正的虚拟滚动。
  // 没有数值型 height 时 rc-virtual-list 走非虚拟渲染——无内部滚动容器，
  // treeRef.scrollTo 是 no-op（滚动实际发生在 Sider 上），滚动定位永远失效
  const [treeHeight, setTreeHeight] = useState(0);
  // 空白区域右键菜单（受控，不参与 contextmenu 事件竞争）
  const [emptyMenuOpen, setEmptyMenuOpen] = useState(false);
  const [emptyMenuPos, setEmptyMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 容器挂载/尺寸变化时测量高度（树在空态与正常态间切换会重新挂载，ref callback 处理）
  const attachTreeContainer = useCallback((el: HTMLDivElement | null) => {
    treeContainerRef.current = el;
    if (!el) {
      setTreeHeight(0);
      return;
    }
    // jsdom（测试环境）没有 ResizeObserver：跳过测量，保持非虚拟渲染
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const h = Math.floor(entries[0]?.contentRect.height ?? 0);
      setTreeHeight((prev) => (prev !== h ? h : prev));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (treeContainerRef.current === el) treeContainerRef.current = null;
    };
  }, []);

  // 原生捕获阶段监听 contextmenu：彻底解决"节点右键与空白右键双菜单重叠"。
  // 关键认知：外层 Dropdown 的 trigger 监听器挂在它的 trigger 子元素上，capture 事件流
  // 是 window → document → 外层trigger → ... → target。要让 capture handler 先于外层
  // trigger 的监听器，必须挂在 document 上。统一裁决：
  //   - 命中节点（.ant-tree-node-content-wrapper / .ant-tree-treenode）→ 关空白菜单，
  //     让节点内层 Dropdown 接管（不阻止事件，内层正常处理）
  //   - 命中空白 → 阻止默认菜单 + 阻止冒泡（防止内层误触发）+ 记录坐标 + 开空白菜单
  useEffect(() => {
    // 每次事件时读取 ref.current（树在空态↔正常态切换会重新挂载容器，不能在闭包里固化元素）
    const handler = (e: MouseEvent) => {
      const el = treeContainerRef.current;
      if (!el) return;
      const target = e.target as HTMLElement;
      if (!el.contains(target)) return;
      const onNode = !!target.closest('.ant-tree-node-content-wrapper, .ant-tree-treenode');
      if (onNode) {
        setEmptyMenuOpen(false);
        return;
      }
      // 空白区域
      e.preventDefault();
      setEmptyMenuPos({ x: e.clientX, y: e.clientY });
      setEmptyMenuOpen(true);
    };
    document.addEventListener('contextmenu', handler, true);
    return () => document.removeEventListener('contextmenu', handler, true);
  }, []);

  // ESC 关闭空白区域菜单
  useEffect(() => {
    if (!emptyMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEmptyMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [emptyMenuOpen]);

  useEffect(() => { connectionDatabasesRef.current = connectionDatabases; }, [connectionDatabases]);
  useEffect(() => { expandedKeysRef.current = expandedKeys; }, [expandedKeys]);

  // 搜索清除后（防抖值变空、树已恢复完整数据），滚动到用户打开的连接。
  // 清空搜索会触发全量树重建（所有连接×库×表），大树重排可能超过单次延时——
  // 补滚一次保证 scrollTo 落在重建完成之后（幂等，重复滚动无害）
  useEffect(() => {
    if (!searchText && pendingScrollKeyRef.current) {
      const key = pendingScrollKeyRef.current;
      pendingScrollKeyRef.current = null;
      const scrollToConn = () => {
        treeRef.current?.scrollTo({ key, align: 'top' });
      };
      const t1 = setTimeout(scrollToConn, 120);
      const t2 = setTimeout(scrollToConn, 400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [searchText]);

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

  // 与 useTreeData 的连接匹配口径一致（名称/主机/用户名/类型/默认库），
  // 供 useSearchExpand 决定在哪些连接里自动展开命中节点
  const filteredConnections = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter((conn) => matchesConnection(conn, q));
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

  // 搜索自动展开/恢复（提前调用以获取 protectConnectionKeys）
  const { protectConnectionKeys } = useSearchExpand(
    searchText, filteredConnections, connectionDatabases, expandedKeysRef, onExpandKeys
  );

  // 搜索态下用户展开/双击连接：保护其子树不被恢复收起 + 清空搜索后滚动定位到该连接
  const handleClearSearchWithScroll = (connectionId?: string) => {
    if (connectionId && searchText.trim()) {
      const conn = connections.find((c) => c.id === connectionId);
      protectConnectionKeys(
        connectionId,
        conn?.group_id && conn.group_id !== 'default' ? [`group-${conn.group_id}`] : []
      );
      pendingScrollKeyRef.current = connectionId;
    }
    onClearSearch?.();
  };

  const treeHandlers = useTreeHandlers(
    connections,
    { onExpandKeys, onConnect, onExpand, onDatabaseExpand, onTableExpand, onLoadDatabases, onTableOpen, onViewOpen, onSelect, onTableSelect, onObjectTypeSelect, onClearSearch: handleClearSearchWithScroll },
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
      onCancelConnect,
    },
  });

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
        {connections.length === 0 && !isLoading ? emptyState : searchText.trim() && treeData.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 12,
            }}
          >
            <SearchOutlined style={{ fontSize: 20, display: 'block', marginBottom: 8, opacity: 0.5 }} />
            {t('common.connectionTreeNoMatch', { query: searchText.trim() })}
          </div>
        ) : (
          <>
            {/*
              空白区域右键菜单：手动渲染的浮动菜单（position: fixed）。
              不用 antd Dropdown 的 trigger 机制——那样会与节点内层 Dropdown 竞争
              同一个 contextmenu 事件。改由 document capture handler 判定为"空白"后
              手动设置 emptyMenuPos + emptyMenuOpen，菜单在指定坐标弹出。
              点击/右键外部、ESC、菜单项点击后自动关闭。
            */}
            {emptyMenuOpen && (
              <>
                {/* 透明遮罩：捕获外部点击/右键以关闭菜单 */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 1049 }}
                  onClick={() => setEmptyMenuOpen(false)}
                  onContextMenu={(e) => {
                    // 外部右键：先关当前菜单，让默认右键行为正常（如再次触发 capture）
                    e.preventDefault();
                    setEmptyMenuOpen(false);
                  }}
                />
                <div
                  style={{
                    position: 'fixed',
                    left: emptyMenuPos.x,
                    top: emptyMenuPos.y,
                    zIndex: 1050,
                    background: 'var(--background-card)',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
                    borderRadius: 6,
                    overflow: 'hidden',
                    minWidth: 160,
                  }}
                  className="connection-tree-empty-menu"
                >
                  <Menu
                    items={menus.getEmptyAreaMenu().items}
                    onClick={(info) => {
                      const m = menus.getEmptyAreaMenu();
                      m.onClick?.(info);
                      setEmptyMenuOpen(false);
                    }}
                  />
                </div>
              </>
            )}
            <div
              ref={attachTreeContainer}
              style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            >
              <Tree
                ref={treeRef}
                showIcon={false} selectedKeys={selectedId ? [selectedId] : []} expandedKeys={expandedKeys}
                onExpand={(keys, info) => treeHandlers.handleExpand(keys, info)}
                onSelect={treeHandlers.handleSelect} treeData={treeData}
                draggable={isDraggable} onDrop={handleDrop}
                style={{ background: 'transparent', padding: '0 4px 8px', fontSize: 14, userSelect: 'none', height: '100%' }}
                className="connection-tree" blockNode virtual
                height={treeHeight > 0 ? treeHeight : undefined}
              />
            </div>
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
