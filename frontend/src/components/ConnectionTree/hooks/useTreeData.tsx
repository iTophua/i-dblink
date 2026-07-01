import React, { useMemo, useEffect } from 'react';
import { Spin, Dropdown, Badge, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  DatabaseOutlined,
  TableOutlined,
  EyeOutlined,
  FolderOutlined,
  CodeOutlined,
  FunctionOutlined,
  ThunderboltOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import type { Connection, ConnectionGroup } from '../../../stores/appStore';
import type { TableInfo } from '../../../types/api';
import { GlobalInput } from '../../GlobalInput';
import { DatabaseIcon } from '../../DatabaseIcon';
import { isBaseTable, isView } from '../utils/tableTypeHelpers';
import { TableNode } from '../components/TableNode';
import { ViewNode } from '../components/ViewNode';
import type { ChangeEvent, MouseEvent } from 'react';

function getConnIcon(dbType: string, connected = true) {
  return <DatabaseIcon type={dbType} size={16} grayscale={!connected} />;
}

interface MenuGetters {
  getConnectionMenu: (conn: Connection) => MenuProps;
  getGroupMenu: (group: ConnectionGroup) => MenuProps;
  getDatabaseMenu: (connId: string, dbName: string) => MenuProps;
  getSchemaMenu: (connId: string, database: string, schemaName: string) => MenuProps;
  getTableMenu: (connId: string, tableName: string, database?: string) => MenuProps;
  getViewMenu: (connId: string, viewName: string, database?: string) => MenuProps;
  getProcedureMenu: (connId: string, procedureName: string, database?: string) => MenuProps;
  getFunctionMenu: (connId: string, functionName: string, database?: string) => MenuProps;
  getTriggerMenu: (connId: string, trigger: import('../../../types/api').TriggerInfo, database?: string) => MenuProps;
}

interface HandlerCallbacks {
  handleTableClick: (tableName: string, database?: string, schema?: string) => void;
  handleDoubleClick: (key: string) => void;
  handleRenameCommit: (groupId: string) => void;
  onTableOpen: (tableName: string, database?: string) => void;
  onViewOpen?: (viewName: string, database?: string) => void;
  onNewQuery: (connectionId: string) => void;
  onOpenRoutine?: (
    connectionId: string,
    database: string,
    name: string,
    type: 'procedure' | 'function'
  ) => void;
  onOpenTrigger?: (connectionId: string, database: string, name: string) => void;
}

interface TreeDataProps {
  groups: ConnectionGroup[];
  groupedConnections: Record<string, Connection[]>;
  connections: Connection[];
  connectionDatabases: Record<string, any[]>;
  expandedKeys: string[];
  searchText: string;
  selectedTableId: string | null;
  renamingKey: string | null;
  renameValue: string;
  setRenameValue: (value: string) => void;
  menus: MenuGetters;
  handlers: HandlerCallbacks;
}

export function useTreeData({
  groups,
  groupedConnections,
  connections,
  connectionDatabases,
  expandedKeys,
  searchText,
  selectedTableId,
  renamingKey,
  renameValue,
  setRenameValue,
  menus,
  handlers,
}: TreeDataProps) {
  const { t } = useTranslation();

  const treeData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const treeNodes: any[] = [];

    const matchTables = (tables: TableInfo[]) =>
      !q || tables.some((t) => t.table_name.toLowerCase().includes(q));
    const matchViews = (tables: TableInfo[]) =>
      !q ||
      tables
        .filter((t) => isView(t.table_type))
        .some((v) => v.table_name.toLowerCase().includes(q));

    const buildFolderChildren = (
      cId: string,
      database: string,
      folderKey: string,
      isLoading: boolean,
      isLoaded: boolean,
      items: TableInfo[],
      allItems: TableInfo[],
      isFolderExpanded: boolean,
      type: 'table' | 'view'
    ): any[] => {
      const emptyKey = `no-${type}s::${folderKey}`;
      if (!isLoaded) {
        return [{
          key: `init-${type}s::${folderKey}`,
          title: (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
              {type === 'table' ? t('common.clickToLoadTables') : t('common.clickToLoadViews')}
            </span>
          ),
          isLeaf: true,
          selectable: false,
        }];
      }
      if (allItems.length === 0) {
        return [{
          key: emptyKey,
          title: (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
              {type === 'table' ? t('common.noTables') : t('common.noViews')}
            </span>
          ),
          isLeaf: true,
          selectable: false,
        }];
      }
      if (isFolderExpanded) {
        const folderParts = folderKey.split('::');
        const folderSchema = folderParts.length >= 3 ? folderParts[2] : undefined;
        return items.map((item) => ({
          key: `${type}::${folderKey}::${item.table_name}`,
          isLeaf: true,
          title:
            type === 'table' ? (
              <TableNode
                connId={cId}
                database={database}
                table={item}
                schema={item.schema || folderSchema}
                selectedTableId={selectedTableId}
                onTableClick={handlers.handleTableClick}
                onTableOpen={handlers.onTableOpen}
                onContextMenu={menus.getTableMenu}
                onNewQuery={handlers.onNewQuery}
              />
            ) : (
              <ViewNode
                connId={cId}
                database={database}
                view={item}
                schema={item.schema || folderSchema}
                selectedTableId={selectedTableId}
                onTableClick={handlers.handleTableClick}
                onTableOpen={handlers.onTableOpen}
                onViewOpen={handlers.onViewOpen}
                onContextMenu={menus.getViewMenu}
                onNewQuery={handlers.onNewQuery}
              />
            ),
        }));
      }
      return [];
    };

    const buildTableNodes = (
      connId: string,
      db: {
        database: string;
        tables: TableInfo[];
        loaded: boolean;
        loadFailed?: boolean;
        procedures?: string[];
        functions?: string[];
        triggers?: import('../../../types/api').TriggerInfo[];
        sequences?: import('../../../types/api').SequenceInfo[];
        routinesLoaded?: boolean;
      },
      allTableItems: TableInfo[] | undefined,
      allViewItems: TableInfo[] | undefined,
      isDbExpanded: boolean
    ) => {
      const tableItems = allTableItems || [];
      const viewItems = allViewItems || [];
      const isLoading = !db.loaded && allTableItems === undefined;

      const hasSchema =
        !isLoading &&
        (tableItems.length > 0 || viewItems.length > 0) &&
        [...tableItems, ...viewItems].some((t) => t.schema != null && t.schema !== '');

      const sq = searchText.trim().toLowerCase();

      // ── Build procedures / functions / triggers nodes ──
      const proceduresNode = (() => {
        const folderKey = `procedures::${connId}::${db.database}`;
        return {
          key: folderKey,
          title: db.routinesLoaded ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              <CodeOutlined style={{ color: 'var(--color-primary)', fontSize: 12 }} />
              <span>{t('common.procedures', { count: db.procedures?.length || 0 })}</span>
            </span>
          ) : isDbExpanded ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}>
              <Spin size="small" />
              <span>{t('common.proceduresLoading')}</span>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              <CodeOutlined style={{ color: 'var(--color-primary)', fontSize: 12 }} />
              <span>{t('common.databaseProperties.procedures')}</span>
            </span>
          ),
          isLeaf: false,
          children: !db.routinesLoaded
            ? [
                {
                  key: `init-procedures::${connId}::${db.database}`,
                  title: (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                      {t('common.clickToLoadProcedures')}
                    </span>
                  ),
                  isLeaf: true,
                  selectable: false,
                },
              ]
            : db.procedures && db.procedures.length > 0
              ? expandedKeys.includes(folderKey)
                ? db.procedures.map((proc) => ({
                    key: `proc::${connId}::${db.database}::${proc}`,
                    isLeaf: true,
                    title: (
                      <Dropdown menu={menus.getProcedureMenu(connId, proc, db.database)} trigger={['contextMenu']}>
                        <span
                          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                          onClick={() => handlers.onOpenRoutine?.(connId, db.database, proc, 'procedure')}
                        >
                          <CodeOutlined style={{ color: 'var(--color-primary)', fontSize: 12 }} />
                          <span style={{ fontSize: 13 }}>{proc}</span>
                        </span>
                      </Dropdown>
                    ),
                  }))
                : []
              : [
                  {
                    key: `no-procedures::${connId}::${db.database}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.noProcedures')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ],
        };
      })();

      const functionsNode = (() => {
        const folderKey = `functions::${connId}::${db.database}`;
        return {
          key: folderKey,
          title: db.routinesLoaded ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              <FunctionOutlined style={{ color: 'var(--color-info)', fontSize: 12 }} />
              <span>{t('common.functions', { count: db.functions?.length || 0 })}</span>
            </span>
          ) : isDbExpanded ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}>
              <Spin size="small" />
              <span>{t('common.functionsLoading')}</span>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              <FunctionOutlined style={{ color: 'var(--color-info)', fontSize: 12 }} />
              <span>{t('common.databaseProperties.functions')}</span>
            </span>
          ),
          isLeaf: false,
          children: !db.routinesLoaded
            ? [
                {
                  key: `init-functions::${connId}::${db.database}`,
                  title: (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                      {t('common.clickToLoadFunctions')}
                    </span>
                  ),
                  isLeaf: true,
                  selectable: false,
                },
              ]
            : db.functions && db.functions.length > 0
              ? expandedKeys.includes(folderKey)
                ? db.functions.map((func) => ({
                    key: `func::${connId}::${db.database}::${func}`,
                    isLeaf: true,
                    title: (
                      <Dropdown menu={menus.getFunctionMenu(connId, func, db.database)} trigger={['contextMenu']}>
                        <span
                          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                          onClick={() => handlers.onOpenRoutine?.(connId, db.database, func, 'function')}
                        >
                          <FunctionOutlined style={{ color: 'var(--color-info)', fontSize: 13 }} />
                          <span style={{ fontSize: 13 }}>{func}</span>
                        </span>
                      </Dropdown>
                    ),
                  }))
                : []
              : [
                  {
                    key: `no-functions::${connId}::${db.database}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.noFunctions')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ],
        };
      })();

      const triggersNode = (() => {
        const folderKey = `triggers::${connId}::${db.database}`;
        return {
          key: folderKey,
          title: db.routinesLoaded ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              <ThunderboltOutlined style={{ color: 'var(--color-error)', fontSize: 12 }} />
              <span>{t('common.triggers', { count: db.triggers?.length || 0 })}</span>
            </span>
          ) : isDbExpanded ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}>
              <Spin size="small" />
              <span>{t('common.triggersLoading')}</span>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              <ThunderboltOutlined style={{ color: 'var(--color-error)', fontSize: 12 }} />
              <span>{t('common.databaseProperties.triggers')}</span>
            </span>
          ),
          isLeaf: false,
          children: !db.routinesLoaded
            ? [
                {
                  key: `init-triggers::${connId}::${db.database}`,
                  title: (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                      {t('common.clickToLoadTriggers')}
                    </span>
                  ),
                  isLeaf: true,
                  selectable: false,
                },
              ]
            : db.triggers && db.triggers.length > 0
              ? expandedKeys.includes(folderKey)
                ? db.triggers.map((trigger) => ({
                    key: `trigger::${connId}::${db.database}::${trigger.name}`,
                    isLeaf: true,
                    title: (
                      <Dropdown menu={menus.getTriggerMenu(connId, trigger, db.database)} trigger={['contextMenu']}>
                        <span
                          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                          onClick={() => handlers.onOpenTrigger?.(connId, db.database, trigger.name)}
                        >
                          <ThunderboltOutlined style={{ color: 'var(--color-error)', fontSize: 12 }} />
                          <span style={{ fontSize: 13 }}>{trigger.name}</span>
                        </span>
                      </Dropdown>
                    ),
                  }))
                : []
              : [
                  {
                    key: `no-triggers::${connId}::${db.database}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.noTriggers')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ],
        };
      })();

      const sequencesNode = (() => {
        const folderKey = `sequences::${connId}::${db.database}`;
        return {
          key: folderKey,
          title: db.routinesLoaded ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              <SortAscendingOutlined style={{ color: 'var(--color-warning)', fontSize: 12 }} />
              <span>{t('common.sequences', { count: db.sequences?.length || 0 })}</span>
            </span>
          ) : isDbExpanded ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}>
              <Spin size="small" />
              <span>{t('common.sequencesLoading')}</span>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              <SortAscendingOutlined style={{ color: 'var(--color-warning)', fontSize: 12 }} />
              <span>{t('common.sequences', { count: 0 })}</span>
            </span>
          ),
          isLeaf: false,
          children: !db.routinesLoaded
            ? [
                {
                  key: `init-sequences::${connId}::${db.database}`,
                  title: (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                      {t('common.clickToLoadSequences')}
                    </span>
                  ),
                  isLeaf: true,
                  selectable: false,
                },
              ]
            : db.sequences && db.sequences.length > 0
              ? expandedKeys.includes(folderKey)
                ? db.sequences.map((seq) => ({
                    key: `seq::${connId}::${db.database}::${seq.sequence_name}`,
                    isLeaf: true,
                    title: (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <SortAscendingOutlined style={{ color: 'var(--color-warning)', fontSize: 12 }} />
                        <span style={{ fontSize: 13 }}>{seq.sequence_name}</span>
                      </span>
                    ),
                  }))
                : []
              : [
                  {
                    key: `no-sequences::${connId}::${db.database}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.noSequences')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ],
        };
      })();

      // ── Unified database title node ──
      const dbNodeTitle = (
        <div
          style={{ width: '100%' }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handlers.handleDoubleClick(`db::${connId}::${db.database}`);
          }}
          data-testid={`database-node-${db.database}`}
        >
          <Dropdown menu={menus.getDatabaseMenu(connId, db.database)} trigger={['contextMenu']}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              {(() => {
                const isSystemDb = [
                  'mysql', 'information_schema', 'performance_schema', 'sys',
                  'template0', 'template1',
                  'master', 'tempdb', 'model', 'msdb',
                ].includes(db.database.toLowerCase());
                return (
                  <>
                    <DatabaseOutlined
                      style={{
                        color: isSystemDb ? 'var(--text-disabled)' : 'var(--color-primary)',
                        fontSize: 12,
                      }}
                    />
                    <span
                      style={{
                        color: isSystemDb
                          ? 'var(--text-disabled)'
                          : db.loaded
                            ? 'var(--color-success)'
                            : undefined,
                        fontWeight: db.loaded ? 600 : undefined,
                        userSelect: 'none',
                      }}
                    >
                      {db.database}
                    </span>
                  </>
                );
              })()}
            </div>
          </Dropdown>
        </div>
      );

      // ── Schema mode ──
      if (hasSchema) {
        type SchemaGroup = { tables: TableInfo[]; views: TableInfo[] };
        const schemaMap = new Map<string, SchemaGroup>();
        for (const t of tableItems) {
          const s = t.schema || 'public';
          if (!schemaMap.has(s)) schemaMap.set(s, { tables: [], views: [] });
          schemaMap.get(s)!.tables.push(t);
        }
        for (const v of viewItems) {
          const s = v.schema || 'public';
          if (!schemaMap.has(s)) schemaMap.set(s, { tables: [], views: [] });
          schemaMap.get(s)!.views.push(v);
        }

        const schemaNodes: any[] = [];
        for (const [schemaName, items] of schemaMap) {
          const prefix = `${connId}::${db.database}::${schemaName}`;
          const tfk = `tables::${prefix}`;
          const vfk = `views::${prefix}`;
          const isTblExp = expandedKeys.includes(tfk);
          const isVwExp = expandedKeys.includes(vfk);

          const filteredTables = sq ? items.tables.filter((t) => t.table_name.toLowerCase().includes(sq)) : items.tables;
          const filteredViews = sq ? items.views.filter((v) => v.table_name.toLowerCase().includes(sq)) : items.views;

          const tablesNode = {
            key: tfk,
            title: (
              <div
                style={{ width: '100%' }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handlers.handleDoubleClick(tfk);
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TableOutlined style={{ color: 'var(--color-primary)', fontSize: 13 }} />
                  <span>{t('common.tables', { count: items.tables.length })}</span>
                </span>
              </div>
            ),
            isLeaf: false,
            children: db.loaded
              ? buildFolderChildren(connId, db.database, prefix, isLoading, true, filteredTables, items.tables, isTblExp, 'table')
              : [
                  {
                    key: `init-tables::${prefix}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.clickToLoadTables')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ],
          };

          const viewsNode = {
            key: vfk,
            title: (
              <div
                style={{ width: '100%' }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handlers.handleDoubleClick(vfk);
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
                  <EyeOutlined style={{ color: 'var(--color-primary)', fontSize: 13 }} />
                  <span>{t('common.views', { count: items.views.length })}</span>
                </span>
              </div>
            ),
            isLeaf: false,
            children: db.loaded
              ? buildFolderChildren(connId, db.database, prefix, isLoading, true, filteredViews, items.views, isVwExp, 'view')
              : [
                  {
                    key: `init-views::${prefix}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.clickToLoadViews')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ],
          };

          schemaNodes.push({
            key: `schema::${prefix}`,
            title: (
              <div
                style={{ width: '100%' }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handlers.handleDoubleClick(`schema::${prefix}`);
                }}
              >
                <Dropdown menu={menus.getSchemaMenu(connId, db.database, schemaName)} trigger={['contextMenu']}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
                    <FolderOutlined style={{ color: 'var(--color-primary)', fontSize: 12 }} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{schemaName}</span>
                  </span>
                </Dropdown>
              </div>
            ),
            isLeaf: false,
            children: sq
              ? [
                  ...(filteredTables.length ? [tablesNode] : []),
                  ...(filteredViews.length ? [viewsNode] : []),
                ]
              : [tablesNode, viewsNode],
          });
        }

        const dbChildren = [...schemaNodes, proceduresNode, functionsNode, triggersNode, sequencesNode];

        return {
          key: `db::${connId}::${db.database}`,
          title: dbNodeTitle,
          children: db.loaded || isDbExpanded ? dbChildren : undefined,
        };
      }

      // ── Non-schema mode (original logic) ──
      const tablesFolderKey = `tables::${connId}::${db.database}`;
      const viewsFolderKey = `views::${connId}::${db.database}`;
      const isTablesFolderExpanded = expandedKeys.includes(tablesFolderKey);
      const isViewsFolderExpanded = expandedKeys.includes(viewsFolderKey);

      const filteredTables = sq
        ? tableItems.filter((t) => t.table_name.toLowerCase().includes(sq))
        : tableItems;
      const filteredViews = sq
        ? viewItems.filter((v) => v.table_name.toLowerCase().includes(sq))
        : viewItems;

      const tablesNode = {
        key: tablesFolderKey,
        title: (
          <div
            style={{ width: '100%' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handlers.handleDoubleClick(tablesFolderKey);
            }}
          >
            {isLoading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}>
                <Spin size="small" />
                <span>{t('common.tablesLoading')}</span>
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <TableOutlined style={{ color: 'var(--color-primary)', fontSize: 13 }} />
                <span>{t('common.tables', { count: tableItems.length })}</span>
              </span>
            )}
          </div>
        ),
        isLeaf: false,
        children: !db.loaded
          ? [
              {
                key: `init-tables::${connId}::${db.database}`,
                title: (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {t('common.clickToLoadTables')}
                  </span>
                ),
                isLeaf: true,
                selectable: false,
              },
            ]
          : isTablesFolderExpanded && tableItems.length > 0
            ? filteredTables.map((table) => ({
                key: `table::${connId}::${db.database}::${table.table_name}`,
                isLeaf: true,
                title: (
                  <TableNode
                    connId={connId}
                    database={db.database}
                    table={table}
                    selectedTableId={selectedTableId}
                    onTableClick={handlers.handleTableClick}
                    onTableOpen={handlers.onTableOpen}
                    onContextMenu={menus.getTableMenu}
                    onNewQuery={handlers.onNewQuery}
                  />
                ),
              }))
            : tableItems.length > 0
              ? []
              : [
                  {
                    key: `no-tables::${connId}::${db.database}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.noTables')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ],
      };

      const viewsNode = {
        key: viewsFolderKey,
        title: (
          <div
            style={{ width: '100%' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handlers.handleDoubleClick(viewsFolderKey);
            }}
          >
            {isLoading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)', userSelect: 'none' }}>
                <Spin size="small" />
                <span>{t('common.viewsLoading')}</span>
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
                <EyeOutlined style={{ color: 'var(--color-primary)', fontSize: 13 }} />
                <span>{t('common.views', { count: viewItems.length })}</span>
              </span>
            )}
          </div>
        ),
        isLeaf: false,
        children: !db.loaded
          ? [
              {
                key: `init-views::${connId}::${db.database}`,
                title: (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {t('common.clickToLoadViews')}
                  </span>
                ),
                isLeaf: true,
                selectable: false,
              },
            ]
          : isViewsFolderExpanded && viewItems.length > 0
            ? filteredViews.map((view) => ({
                key: `view::${connId}::${db.database}::${view.table_name}`,
                isLeaf: true,
                title: (
                  <ViewNode
                    connId={connId}
                    database={db.database}
                    view={view}
                    selectedTableId={selectedTableId}
                    onTableClick={handlers.handleTableClick}
                    onTableOpen={handlers.onTableOpen}
                    onViewOpen={handlers.onViewOpen}
                    onContextMenu={menus.getViewMenu}
                    onNewQuery={handlers.onNewQuery}
                  />
                ),
              }))
            : viewItems.length > 0
              ? []
              : [
                  {
                    key: `no-views::${connId}::${db.database}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.noViews')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ],
      };

      const dbChildren = sq
        ? [
            ...(filteredTables.length ? [tablesNode] : []),
            ...(filteredViews.length ? [viewsNode] : []),
            proceduresNode,
            functionsNode,
            triggersNode,
            sequencesNode,
          ]
        : [tablesNode, viewsNode, proceduresNode, functionsNode, triggersNode, sequencesNode];

      return {
        key: `db::${connId}::${db.database}`,
        title: dbNodeTitle,
        children: db.loaded || isDbExpanded ? dbChildren : undefined,
      };
    };

    const buildConnNode = (conn: Connection) => {
      const dbList = connectionDatabases[conn.id] || [];
      const connNameMatch = !q || conn.name.toLowerCase().includes(q);
      const isExpanded = expandedKeys.includes(conn.id);

      const dbNodes: any[] = [];
      for (const db of dbList) {
        const dbMatch = !q || db.database.toLowerCase().includes(q);
        const isDbExpanded = expandedKeys.some((k) =>
          k.startsWith(`db::${conn.id}::${db.database}`)
        );
        const tableItems = db.loaded
          ? db.tables.filter((t: TableInfo) => isBaseTable(t.table_type))
          : isDbExpanded
            ? undefined
            : [];
        const viewItems = db.loaded
          ? db.tables.filter((t: TableInfo) => isView(t.table_type))
          : isDbExpanded
            ? undefined
            : [];

        const tablesMatch = matchTables(tableItems || []);
        const viewsMatch = matchViews(db.tables || []);

        if (q && !dbMatch && !tablesMatch && !viewsMatch && !isDbExpanded) continue;

        const dbNode = buildTableNodes(conn.id, db, tableItems, viewItems, isDbExpanded);
        if (dbNode) dbNodes.push(dbNode);
      }

      if (q && !connNameMatch && dbNodes.length === 0 && !isExpanded) return null;

      const connTitle = (
        <div
          style={{ width: '100%' }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handlers.handleDoubleClick(conn.id);
          }}
          data-testid={`connection-item-${conn.id}`}
        >
          <Dropdown menu={menus.getConnectionMenu(conn)} trigger={['contextMenu']}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
              {getConnIcon(conn.db_type, conn.status === 'connected')}
              <span
                style={{
                  color: conn.status === 'connected' ? 'var(--color-primary)' : undefined,
                  fontWeight: conn.status === 'connected' ? 700 : undefined,
                  userSelect: 'none',
                }}
              >
                {conn.name}
                {conn.color && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: conn.color,
                      display: 'inline-block',
                      marginLeft: 4,
                      border: '1px solid rgba(255,255,255,0.2)',
                    }}
                  />
                )}
                  {conn.status === 'connected' ? (
                    <Tooltip title={t('common.mainLayout.connected')}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                           background: 'var(--color-primary)',
                           display: 'inline-block',
                           marginLeft: 6,
                           boxShadow: `0 0 4px var(--color-primary-alpha-30)`,
                        }}
                      />
                    </Tooltip>
                  ) : null}
                {conn.status === 'loading' && (
                  <Tooltip title={t('common.mainLayout.connecting')}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--color-warning)',
                        animation: 'pulse 1s infinite',
                      }}
                    />
                  </Tooltip>
                )}
              </span>
              {conn.database && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                  ({conn.database})
                </span>
              )}
            </div>
          </Dropdown>
        </div>
      );

      return {
        key: conn.id,
        title: connTitle,
        isLeaf: conn.status !== 'connected',
        children:
          conn.status === 'connected'
            ? dbNodes.length > 0
              ? dbNodes
              : [
                  {
                    key: `loading::${conn.id}`,
                    title: (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('common.noDatabases')}
                      </span>
                    ),
                    isLeaf: true,
                    selectable: false,
                  },
                ]
            : undefined,
      };
    };

    const realGroups = groups.filter((g) => g.id !== 'default');
    for (const group of realGroups) {
      const groupConnNodes = (groupedConnections[group.id] || [])
        .map((conn) => buildConnNode(conn))
        .filter((n) => n !== null && n !== undefined);

      if (groupConnNodes.length === 0 && q) continue;

      const groupKey = `group-${group.id}`;
      const isRenaming = renamingKey === groupKey;

      let groupTitle: React.ReactNode;
      if (isRenaming) {
        groupTitle = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
            <GlobalInput
              size="small"
              value={renameValue}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
              onPressEnter={() => handlers.handleRenameCommit(group.id)}
              onBlur={() => handlers.handleRenameCommit(group.id)}
              autoFocus
              style={{ width: 100, height: 22, padding: '0 4px' }}
              onClick={(e: MouseEvent) => e.stopPropagation()}
            />
          </div>
        );
      } else {
        groupTitle = (
          <div
            style={{ width: '100%' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handlers.handleDoubleClick(groupKey);
            }}
          >
            <Dropdown menu={menus.getGroupMenu(group)} trigger={['contextMenu']}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingRight: 4,
                  userSelect: 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 14 }}>{group.icon}</span>
                  <span style={{ fontWeight: 500, color: group.color }}>{group.name}</span>
                </span>
                <Badge
                  count={groupConnNodes.length}
                  style={{ backgroundColor: group.color, boxShadow: 'none' }}
                />
              </div>
            </Dropdown>
          </div>
        );
      }

      treeNodes.push({
        key: groupKey,
        title: groupTitle,
        isLeaf: false,
        children: groupConnNodes,
      });
    }

    const ungroupedConnNodes = (groupedConnections['ungrouped'] || [])
      .map((conn) => buildConnNode(conn))
      .filter((n) => n !== null && n !== undefined);

    if (ungroupedConnNodes.length > 0 || !q) {
      for (const node of ungroupedConnNodes) {
        treeNodes.push(node);
      }
    }

    return treeNodes;
  }, [
    groups,
    groupedConnections,
    connections,
    searchText,
    connectionDatabases,
    expandedKeys,
    selectedTableId,
    renamingKey,
    renameValue,
    handlers,
    menus,
    setRenameValue,
  ]);

  return { treeData };
}
