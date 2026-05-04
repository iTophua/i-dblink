import { useEffect, useState, useMemo, useRef, useCallback, memo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridApi } from 'ag-grid-community';
import {
  Spin,
  Empty,
  Button,
  Space,
  message,
  Modal,
  Form,
  Tag,
  Popconfirm,
  Select,
  Pagination,
  Tooltip,
  Dropdown,
  Input,
  Switch,
  Checkbox,
  Divider,
} from 'antd';
import { GlobalInput } from './GlobalInput';
import { SqlInput } from './SqlInput';
import { ColumnFilterHeader } from './DataTable/ColumnFilterHeader';
import {
  ReloadOutlined,
  DownloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SaveOutlined,
  UndoOutlined,
  StopOutlined,
  CopyOutlined,
  ColumnWidthOutlined,
  FilterOutlined,
  DownOutlined,
  UpOutlined,
  FileTextOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import { useDatabase } from '../hooks/useApi';
import { useThemeColors } from '../hooks/useThemeColors';
import { useAppStore } from '../stores/appStore';
import type { ColumnInfo } from '../types/api';
import { api } from '../api';
import {
  type FilterCondition,
  type RowData,
  buildWhereClause,
  buildQuery,
  buildCountQuery,
} from './DataTable/utils';
import {
  exportToExcel,
  exportToCSV as exportToCSVUtil,
  exportToJSON as exportToJSONUtil,
  exportToTXT,
  exportToXML,
  exportToMarkdown,
} from '../utils/exportUtils';
import { ImportWizard } from './DataTable/ImportWizard';
import { escapeSqlIdentifier, escapeSqlValue } from '../utils/sqlUtils';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import './DataTable.css';

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function rowsToCsv(columns: string[], rows: RowData[]): string {
  const escape = (val: unknown) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = columns.map(escape).join(',');
  const body = rows.map((row) => columns.map((c) => escape(row[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

function rowsToJson(columns: string[], rows: RowData[]): string {
  const objs = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col) => {
      obj[col] = row[col];
    });
    return obj;
  });
  return JSON.stringify(objs, null, 2);
}

interface DataTableProps {
  connectionId: string;
  tableName: string;
  database?: string;
  pageSize?: number;
  onDirtyChange?: (isDirty: boolean) => void; // 通知父组件 dirty 状态
}

export const DataTable = memo(function DataTable({
  connectionId,
  tableName,
  database,
  pageSize: propPageSize,
  onDirtyChange,
}: DataTableProps) {
  const dbType = useAppStore(
    (state) => state.connections.find((c) => c.id === connectionId)?.db_type
  );
  const [loading, setLoading] = useState(false);
  const [hasEverLoaded, setHasEverLoaded] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const primaryKey = useMemo(() => columns.find((col) => col.column_key === 'PRI'), [columns]);
  const [rowData, setRowData] = useState<RowData[]>([]);
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const gridApiRef = useRef<GridApi | null>(null);
  const [selectedRows, setSelectedRows] = useState<RowData[]>([]);
  const defaultPageSize = 1000;
  const [pageSize, setPageSize] = useState(propPageSize ?? defaultPageSize);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentSql, setCurrentSql] = useState('');
  const [pendingChanges, setPendingChanges] = useState<{
    inserts: RowData[];
    updates: RowData[];
    deletes: RowData[];
  }>({ inserts: [], updates: [], deletes: [] });
  const [sortModel, setSortModel] = useState<{ colId: string; sort: 'asc' | 'desc' }[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [quickFilter, setQuickFilter] = useState('');
  const [gridKey, setGridKey] = useState(0);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([
    { id: `filter-${Date.now()}`, field: '', operator: 'contains', value: '', logic: 'AND' },
  ]);
  const [whereClause, setWhereClause] = useState('');
  const [orderByClause, setOrderByClause] = useState('');
  const [textEditModal, setTextEditModal] = useState<{
    open: boolean;
    field: string;
    value: string;
    rowIndex: number;
  } | null>(null);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    rowData: RowData | null;
  }>({ visible: false, x: 0, y: 0, rowData: null });
  const [cellContextMenu, setCellContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    colId: string;
    value: any;
    rowNode: any;
  }>({ visible: false, x: 0, y: 0, colId: '', value: null, rowNode: null });
  const loadDataRef = useRef<(overrideWhere?: string, overrideOrderBy?: string) => void>(() => {});
  const overrideWhereRef = useRef<string | undefined>(undefined);
  const overrideOrderByRef = useRef<string | undefined>(undefined);
  const loadTriggerRef = useRef(0);
  const loadCountRef = useRef<(where?: string) => void>(() => {});
  const onDirtyChangeRef = useRef(onDirtyChange);
  const isInitialLoadRef = useRef(true);
  onDirtyChangeRef.current = onDirtyChange;

  // 当外部 pageSize 变化时，更新本地状态
  useEffect(() => {
    if (propPageSize !== undefined) {
      setPageSize(propPageSize);
    }
  }, [propPageSize]);

  // 通知父组件 dirty 状态变化
  useEffect(() => {
    onDirtyChangeRef.current?.(hasUnsavedChanges);
  }, [hasUnsavedChanges]);

  // 撤销最后一次单元格编辑
  const undoLastCellEdit = useCallback(() => {
    if (pendingChanges.updates.length === 0) {
      message.info('没有可撤销的单元格编辑');
      return;
    }

    const lastUpdate = pendingChanges.updates[pendingChanges.updates.length - 1];
    const rowId = lastUpdate.__row_id__;

    // 从 pendingChanges 中移除最后一条更新
    setPendingChanges((prev) => ({
      ...prev,
      updates: prev.updates.slice(0, -1),
    }));

    // 重新加载该行的原始数据
    const originalRow = rowData.find((r) => r.__row_id__ === rowId);
    if (originalRow) {
      gridApiRef.current?.applyTransaction({
        update: [originalRow],
      });
    }

    message.success('已撤销单元格编辑');
  }, [pendingChanges.updates, rowData]);

  // Delete 键标记删除选中行，Ctrl+Z 撤销单元格编辑
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z 撤销最后一次单元格编辑
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
          return;
        e.preventDefault();
        undoLastCellEdit();
        return;
      }

      if (e.key !== 'Delete') return;
      // 避免在输入框中触发
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return;
      const api = gridApiRef.current;
      if (!api) return;
      const selectedToDelete = api.getSelectedRows();
      if (selectedToDelete.length === 0) return;
      if (!primaryKey && selectedToDelete.some((row) => row.__status__ !== 'new')) {
        message.warning('该表没有主键，无法删除已有行');
        return;
      }
      e.preventDefault();
      setPendingChanges((prev) => ({
        ...prev,
        deletes: [...prev.deletes, ...selectedToDelete],
      }));
      setHasUnsavedChanges(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [primaryKey, undoLastCellEdit]);

  const tc = useThemeColors();
  const isDarkMode = tc.isDark;

  const { getColumns, executeQuery } = useDatabase();
  const loadingRef = useRef(false);



  const loadData = useCallback(
    async (overrideWhere?: string, overrideOrderBy?: string) => {
      if (!connectionId || !tableName || loadingRef.current) return;

      try {
        loadingRef.current = true;
        setLoading(true);

        const query = buildQuery(currentPage, pageSize, tableName, database, dbType, sortModel, whereClause, orderByClause, overrideWhere, overrideOrderBy);
        setCurrentSql(query);

        const [colResult, dataResult] = await Promise.all([
          getColumns(connectionId, tableName, database),
          executeQuery(connectionId, query, database),
        ]);

        if (dataResult.error) {
          message.error(`加载数据失败：${dataResult.error}`);
          setColumns([]);
          setRowData([]);
        } else {
          const rowIdPrefix = `row-${Date.now()}-`;
          let rowIdCounter = 0;
          const data = dataResult.rows.map((row) => {
            const rowData: RowData = {
              __row_id__: `${rowIdPrefix}${rowIdCounter++}`,
            };
            const originalData: Record<string, any> = {};
            for (let colIndex = 0; colIndex < dataResult.columns.length; colIndex++) {
              const col = dataResult.columns[colIndex];
              const value = row[colIndex];
              rowData[col] = value;
              originalData[col] = value;
            }
            rowData.__original_data__ = originalData;
            return rowData;
          });
          setColumns(colResult || []);
          setRowData(data);
          setHasUnsavedChanges(false);
          setPendingChanges({ inserts: [], updates: [], deletes: [] });
          setHasEverLoaded(true);
        }
      } catch (error: any) {
        console.error('Failed to load table data:', error);
        message.error(`加载数据失败：${error.message || error}`);
        setColumns([]);
        setRowData([]);
        setHasEverLoaded(true);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [connectionId, tableName, database, currentPage, pageSize, sortModel]
  );

  loadDataRef.current = loadData;

  // 性能优化：计算列宽的 useMemo
  const colWidths = useMemo(() => {
    if (rowData.length === 0 || columns.length === 0) return {};

    const widths: Record<string, number> = {};
    const sampleSize = Math.min(rowData.length, 50);

    // 只在必要时计算
    for (let i = 0; i < sampleSize; i++) {
      const row = rowData[i];
      for (const col of columns) {
        const value = row[col.column_name];
        const valueStr = value === null ? 'NULL' : String(value);
        const currentMax = widths[col.column_name] || 0;
        widths[col.column_name] = Math.max(currentMax, valueStr.length);
      }
    }

    return widths;
  }, [rowData, columns]);

  // 性能优化：计算列定义的 useMemo
  const columnDefs = useMemo(() => {
    const selectionColumn: ColDef = {
      headerName: '',
      width: 40,
      minWidth: 40,
      maxWidth: 40,
      sortable: false,
      filter: false,
      resizable: false,
      suppressSizeToFit: true,
      checkboxSelection: true,
      cellStyle: {
        display: 'flex',
        justifyContent: 'center',
        paddingLeft: 8,
      },
    };

    const statusColumn: ColDef = {
      field: '__status__',
      headerName: '',
      width: 40,
      minWidth: 40,
      maxWidth: 40,
      sortable: false,
      filter: false,
      resizable: false,
      suppressSizeToFit: true,
      cellRenderer: (params: any) => {
        const status = params.data?.__status__;
        if (status === 'new')
          return <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>+</span>;
        if (status === 'modified') return <span style={{ color: 'var(--color-primary)' }}>✎</span>;
        if (status === 'deleted')
          return (
            <span style={{ color: 'var(--color-error)', textDecoration: 'line-through' }}>✗</span>
          );
        return null;
      },
      cellStyle: {
        padding: '0 4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
    };

    const dataColumns = columns.map((col) => {
      if (hiddenColumns.has(col.column_name)) {
        return { field: col.column_name, hide: true } as ColDef;
      }

      const headerLength = col.column_name.length;
      const dataMaxLength = colWidths[col.column_name] || 0;
      const contentWidth = Math.max(headerLength, dataMaxLength);
      const autoWidth = Math.max(60, Math.min(300, contentWidth * 8 + 30));
      const nullableInfo = col.is_nullable === 'YES' ? ' | NULL' : ' | NOT NULL';
      const commentInfo = col.comment ? ` | ${col.comment}` : '';

      const dataType = (col.data_type || '').toUpperCase();
      const isBoolean = dataType === 'BOOLEAN' || dataType === 'BOOL' || dataType === 'TINYINT(1)';
      const isDate = dataType.includes('DATE') || dataType.includes('TIME');
      const isEnum = dataType.startsWith('ENUM') || dataType.startsWith('SET');

      let cellEditor: any = undefined;
      if (isBoolean) {
        cellEditor = 'agCheckboxCellEditor';
      } else if (isDate) {
        cellEditor = 'agDateStringCellEditor';
      } else if (isEnum) {
        const enumMatch = col.data_type.match(/'([^']+)'/g);
        const enumValues = enumMatch ? enumMatch.map((v: string) => v.slice(1, -1)) : [];
        cellEditor = { component: 'agSelectCellEditor', params: { values: enumValues } };
      }

      return {
        field: col.column_name,
        headerName: col.column_name,
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 60,
        maxWidth: 300,
        width: autoWidth,
        editable: true,
        cellEditor,
        headerTooltip: col.data_type + nullableInfo + commentInfo,
        headerComponent: 'columnFilterHeader',
        headerComponentParams: { rowData },
        cellClass: (params: any) => {
          if (params.value === null) return 'null-cell';
          if (
            params.data?.__status__ === 'modified' &&
            params.data?.__original_data__?.[col.column_name] !== params.value
          ) {
            return 'modified-cell';
          }
          return undefined;
        },
        cellRenderer: (params: any) => {
          if (params.value === null) {
            return <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>NULL</span>;
          }
          if (isBoolean) {
            return params.value ? '✓' : '✗';
          }
          return params.value;
        },
      } as ColDef;
    });

    return [selectionColumn, statusColumn, ...dataColumns];
  }, [columns, colWidths, hiddenColumns]);

  useEffect(() => {
    if (gridApiRef.current && columns.length > 0) {
      const api = gridApiRef.current;
      if (api && typeof (api as unknown as Record<string, unknown>).setColumnDefs === 'function') {
        (api as unknown as { setColumnDefs: (defs: typeof columnDefs) => void }).setColumnDefs(
          columnDefs
        );
      } else if (api) {
        (api as unknown as { setGridOption: (key: string, value: unknown) => void }).setGridOption(
          'columnDefs',
          columnDefs
        );
      }
    }
  }, [columnDefs, columns]);

  const loadCount = useCallback(
    async (overrideWhere?: string) => {
      try {
        const query = buildCountQuery(tableName, database, dbType, whereClause, overrideWhere);
        const result = await executeQuery(connectionId, query, database);
        if (!result.error && result.rows.length > 0) {
          setTotalCount(Number(result.rows[0][0]));
        }
      } catch (error) {
        console.error('Failed to load count:', error);
      }
    },
    [connectionId, tableName, database, executeQuery, dbType, whereClause]
  );

  loadCountRef.current = loadCount;

  useEffect(() => {
    setHasEverLoaded(false);
    setSortModel([]);
    isInitialLoadRef.current = true;
    loadDataRef.current();
    loadCountRef.current(whereClause);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, tableName, database]);

  useEffect(() => {
    if (hasEverLoaded && !isInitialLoadRef.current) {
      loadDataRef.current(overrideWhereRef.current, overrideOrderByRef.current);
      overrideWhereRef.current = undefined;
      overrideOrderByRef.current = undefined;
    } else if (hasEverLoaded && isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
    }
  }, [hasEverLoaded, currentPage, pageSize, sortModel]);

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 60,
      maxWidth: 300,
      width: 120,
      cellStyle: { padding: '0 6px', fontSize: 12 },
    }),
    []
  );

  const onCellDoubleClicked = useCallback(
    (event: any) => {
      const field = event.colDef.field;
      if (!field) return;
      const colInfo = columns.find((c) => c.column_name === field);
      if (!colInfo) return;
      const dataType = (colInfo.data_type || '').toUpperCase();
      const isTextBlob =
        dataType === 'TEXT' ||
        dataType === 'BLOB' ||
        dataType === 'LONGTEXT' ||
        dataType === 'MEDIUMTEXT' ||
        dataType === 'LONG_BLOB' ||
        dataType === 'MEDIUMBLOB' ||
        dataType.includes('TEXT') ||
        dataType.includes('BLOB') ||
        dataType === 'BYTEA' ||
        dataType === 'CLOB';
      if (!isTextBlob) return;
      const rowIndex = event.rowIndex;
      const value = event.value === null || event.value === undefined ? '' : String(event.value);
      setTextEditModal({ open: true, field, value, rowIndex });
    },
    [columns]
  );

  const onCellValueChanged = useCallback((event: any) => {
    if (event.newValue === event.oldValue) {
      return;
    }
    const updatedRow = { ...event.data };
    if (!updatedRow.__status__ || updatedRow.__status__ !== 'new') {
      updatedRow.__status__ = 'modified';
    }
    gridApiRef.current?.applyTransaction({ update: [updatedRow] });
    setHasUnsavedChanges(true);
    setPendingChanges((prev) => {
      const filteredUpdates = prev.updates.filter((r) => r.__row_id__ !== updatedRow.__row_id__);
      return {
        ...prev,
        updates: [...filteredUpdates, updatedRow],
      };
    });
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent, rowData: RowData) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      rowData,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleContextMenuAction = useCallback(
    async (action: string) => {
      closeContextMenu();
      const row = contextMenu.rowData;
      if (!row) return;

      const primaryKey = columns.find((col) => col.column_key === 'PRI');

      switch (action) {
        case 'copy-row':
          navigator.clipboard.writeText(JSON.stringify(row, null, 2));
          message.success('已复制行数据到剪贴板');
          break;
        case 'delete-row':
          if (!primaryKey) {
            message.warning('该表没有主键，无法删除单行');
            return;
          }
          Modal.confirm({
            title: '确认删除',
            content: `确定要删除选中的行吗？此操作不可撤销。`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => {
              setPendingChanges((prev) => ({
                ...prev,
                deletes: [...prev.deletes, row],
              }));
              setHasUnsavedChanges(true);
            },
          });
          break;
        case 'edit-row':
          setEditingRow(row);
          setEditModalOpen(true);
          break;
        case 'copy-select':
          const selectedRows = gridApiRef.current?.getSelectedRows() || [];
          if (selectedRows.length === 0) {
            message.warning('没有选中的行');
            return;
          }
          navigator.clipboard.writeText(JSON.stringify(selectedRows, null, 2));
          message.success(`已复制 ${selectedRows.length} 行到剪贴板`);
          break;
        case 'delete-select':
          if (!primaryKey) {
            message.warning('该表没有主键，无法批量删除');
            return;
          }
          const selectedToDelete = gridApiRef.current?.getSelectedRows() || [];
          if (selectedToDelete.length === 0) {
            message.warning('没有选中的行');
            return;
          }
          Modal.confirm({
            title: '确认删除',
            content: `确定要删除选中的 ${selectedToDelete.length} 行吗？此操作不可撤销。`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => {
              setPendingChanges((prev) => ({
                ...prev,
                deletes: [...prev.deletes, ...selectedToDelete],
              }));
              setHasUnsavedChanges(true);
            },
          });
          break;
      }
    },
    [contextMenu.rowData, columns, closeContextMenu]
  );

  const handleCommit = useCallback(async () => {
    if (!hasUnsavedChanges) {
      message.info('没有未保存的更改');
      return;
    }

    try {
      setLoading(true);
      let successCount = 0;
      let errorCount = 0;
      let errorMessage = '';

      // 执行删除
      for (const row of pendingChanges.deletes) {
        const primaryKey = columns.find((col) => col.column_key === 'PRI');
        if (!primaryKey) {
          errorMessage = '该表没有主键，无法删除';
          errorCount++;
          break;
        }

        const primaryKeyValue = row[primaryKey.column_name];
        const deleteSQL = `DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(primaryKey.column_name, dbType)} = ${escapeSqlValue(primaryKeyValue)}`;
        const result = await executeQuery(connectionId, deleteSQL);

        if (result.error) {
          errorCount++;
          errorMessage = result.error;
          break;
        } else {
          successCount++;
        }
      }

      // 执行插入
      if (!errorMessage) {
        for (const row of pendingChanges.inserts) {
          const columns_list = Object.keys(row).filter(
            (key) => !key.startsWith('__') && row[key] !== undefined
          );
          const values_list = columns_list.map((col) =>
            row[col] === null || row[col] === '' ? 'NULL' : escapeSqlValue(row[col])
          );

          if (columns_list.length === 0) continue;

          const insertSQL = `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${columns_list.map((col) => escapeSqlIdentifier(col, dbType)).join(', ')}) VALUES (${values_list.join(', ')})`;
          const result = await executeQuery(connectionId, insertSQL);

          if (result.error) {
            errorCount++;
            errorMessage = result.error;
            break;
          } else {
            successCount++;
          }
        }
      }

      // 执行更新
      if (!errorMessage) {
        for (const row of pendingChanges.updates) {
          const primaryKey = columns.find((col) => col.column_key === 'PRI');
          if (!primaryKey) {
            errorMessage = '该表没有主键，无法更新';
            errorCount++;
            break;
          }

          const originalData = row.__original_data__ || {};

          // 对比找出修改的字段
          const updates: string[] = [];
          for (const col of columns) {
            const colName = col.column_name;
            if (colName === primaryKey.column_name) continue;

            const newValue = row[colName];
            const oldValue = originalData[colName];

            if (newValue !== oldValue) {
              const valueStr =
                newValue === null || newValue === '' ? 'NULL' : escapeSqlValue(newValue);
              updates.push(`${escapeSqlIdentifier(colName, dbType)} = ${valueStr}`);
            }
          }

          if (updates.length === 0) continue; // 没有实际更改

          const primaryKeyValue = row[primaryKey.column_name];
          const setClause = updates
            .map((u) => {
              const eqIdx = u.indexOf(' = ');
              return eqIdx > 0
                ? `${escapeSqlIdentifier(u.substring(0, eqIdx), dbType)} = ${u.substring(eqIdx)}`
                : u;
            })
            .join(', ');
          const updateSQL = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${setClause} WHERE ${escapeSqlIdentifier(primaryKey.column_name, dbType)} = ${escapeSqlValue(primaryKeyValue)}`;
          const result = await executeQuery(connectionId, updateSQL);

          if (result.error) {
            errorCount++;
            errorMessage = result.error;
            break;
          } else {
            successCount++;
          }
        }
      }

      // 显示结果
      if (errorCount === 0) {
        message.success(`成功提交 ${successCount} 个更改`);
        setPendingChanges({ inserts: [], updates: [], deletes: [] });
        setHasUnsavedChanges(false);
        loadData();
        loadCount(whereClause);
      } else {
        message.error(`提交失败：${errorMessage}`);
      }
    } catch (error: any) {
      console.error('Commit error:', error);
      message.error(`提交失败：${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }, [
    hasUnsavedChanges,
    pendingChanges,
    columns,
    tableName,
    connectionId,
    executeQuery,
    loadData,
    loadCount,
    dbType,
  ]);

  const handleUndo = useCallback(async () => {
    Modal.confirm({
      title: '撤销修改',
      content: '确定要放弃所有未保存的修改吗？',
      onOk: () => {
        loadData();
        setHasUnsavedChanges(false);
      },
    });
  }, [loadData]);

  const handleAddRow = useCallback(() => {
    setAddModalOpen(true);
    addForm.resetFields();
  }, [addForm]);

  const handleEditRow = useCallback(() => {
    if (selectedRows.length === 0) {
      message.warning('请选择要编辑的行');
      return;
    }
    if (selectedRows.length > 1) {
      message.warning('一次只能编辑一行');
      return;
    }

    setEditingRow(selectedRows[0]);
    editForm.setFieldsValue(selectedRows[0]);
    setEditModalOpen(true);
  }, [selectedRows, editForm]);

  const handleDeleteRows = useCallback(async () => {
    if (selectedRows.length === 0) {
      message.warning('请选择要删除的行');
      return;
    }

    const primaryKey = columns.find((col) => col.column_key === 'PRI');
    if (!primaryKey && selectedRows.some((row) => row.__status__ !== 'new')) {
      message.warning('该表没有主键，无法删除');
      return;
    }

    try {
      setLoading(true);

      // 标记删除
      const newPendingDeletes: RowData[] = [];
      const newPendingInserts = pendingChanges.inserts.filter((insertRow) => {
        const isSelected = selectedRows.some(
          (selRow) => selRow.__row_id__ === insertRow.__row_id__
        );
        if (isSelected) {
          newPendingDeletes.push(insertRow);
          return false; // 从插入列表中移除
        }
        return true;
      });

      // 对于已存在的行，标记为删除
      for (const row of selectedRows) {
        if (row.__status__ !== 'new') {
          newPendingDeletes.push(row);

          // 更新 rowData 中的状态
          setRowData((prev) =>
            prev.map((r) =>
              r.__row_id__ === row.__row_id__ ? { ...r, __status__: 'deleted' as const } : r
            )
          );
        }
      }

      setPendingChanges((prev) => ({
        ...prev,
        inserts: newPendingInserts,
        deletes: [...prev.deletes, ...newPendingDeletes],
      }));

      setHasUnsavedChanges(true);
      message.success(`已标记删除 ${selectedRows.length} 行，点击"提交"按钮保存更改`);
    } catch (error: any) {
      console.error('Delete error:', error);
      message.error(`删除失败：${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }, [selectedRows, columns, pendingChanges.inserts]);

  const handleSaveNewRow = useCallback(async () => {
    try {
      const values = await addForm.validateFields();

      const columns_list = Object.keys(values).filter((key) => values[key] !== undefined);
      const values_list = columns_list.map((col) =>
        values[col] === null || values[col] === '' ? 'NULL' : escapeSqlValue(values[col])
      );

      const insertSQL = `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${columns_list.map((col) => escapeSqlIdentifier(col, dbType)).join(', ')}) VALUES (${values_list.join(', ')})`;

      const result = await executeQuery(connectionId, insertSQL);

      if (result.error) {
        message.error(`插入失败：${result.error}`);
      } else {
        message.success('插入成功');
        setAddModalOpen(false);
        loadData();
        loadCount(whereClause);
      }
    } catch (error: any) {
      console.error('Insert error:', error);
      message.error(`插入失败：${error.message || error}`);
    }
  }, [addForm, tableName, connectionId, executeQuery, loadData, loadCount, dbType]);

  const handleSaveEditRow = useCallback(async () => {
    try {
      const values = await editForm.validateFields();

      const primaryKey = columns.find((col) => col.column_key === 'PRI');
      if (!primaryKey) {
        message.warning('该表没有主键，无法更新');
        return;
      }

      const updates = Object.entries(values)
        .filter(([key, value]) => key !== '__row_id__' && value !== editingRow?.[key])
        .map(
          ([key, value]) =>
            `${escapeSqlIdentifier(key, dbType)} = ${value === null || value === '' ? 'NULL' : escapeSqlValue(value)}`
        )
        .join(', ');

      if (!updates) {
        message.info('没有修改任何数据');
        setEditModalOpen(false);
        return;
      }

      const primaryKeyValue = editingRow?.[primaryKey.column_name];
      const updateSQL = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${updates} WHERE ${escapeSqlIdentifier(primaryKey.column_name, dbType)} = ${escapeSqlValue(primaryKeyValue)}`;

      const result = await executeQuery(connectionId, updateSQL);

      if (result.error) {
        message.error(`更新失败：${result.error}`);
      } else {
        message.success('更新成功');
        setEditModalOpen(false);
        loadData();
      }
    } catch (error: any) {
      console.error('Update error:', error);
      message.error(`更新失败：${error.message || error}`);
    }
  }, [editForm, columns, editingRow, tableName, connectionId, executeQuery, loadData, dbType]);

  const exportToCSV = useCallback(() => {
    if (rowData.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    const escapeCsvField = (value: string): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const colNames = columns.map((col) => col.column_name);
    const header = colNames.map(escapeCsvField).join(',');
    const rows: string[] = [header];
    for (let i = 0; i < rowData.length; i++) {
      const row = rowData[i];
      const values: string[] = [];
      for (let j = 0; j < colNames.length; j++) {
        const value = row[colNames[j]];
        values.push(escapeCsvField(value === null || value === undefined ? '' : String(value)));
      }
      rows.push(values.join(','));
    }
    const csvData = rows.join('\n');

    const blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${tableName}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    message.success('导出成功');
  }, [rowData, columns, tableName]);

  const copySql = useCallback(() => {
    navigator.clipboard.writeText(currentSql);
    message.success('SQL 已复制');
  }, [currentSql]);

  const handleAutoSizeColumns = useCallback(() => {
    if (gridApiRef.current) {
      gridApiRef.current.sizeColumnsToFit();
      message.success('列宽已自动调整');
    }
  }, []);

  const toggleColumnVisibility = useCallback(
    (columnName: string) => {
      const isCurrentlyHidden = hiddenColumns.has(columnName);
      setHiddenColumns((prev) => {
        const newSet = new Set(prev);
        if (isCurrentlyHidden) {
          newSet.delete(columnName);
        } else {
          newSet.add(columnName);
        }
        return newSet;
      });
      setGridKey((k) => k + 1);
    },
    [hiddenColumns]
  );

  const showAllColumns = useCallback(() => {
    setHiddenColumns(new Set());
    setGridKey((k) => k + 1);
  }, []);

  const handleQuickFilter = useCallback((value: string) => {
    setQuickFilter(value);
    if (gridApiRef.current) {
      (
        gridApiRef.current as unknown as { setGridOption: (key: string, value: string) => void }
      ).setGridOption('quickFilterText', value);
    }
  }, []);

  const addFilterCondition = useCallback(() => {
    setFilterConditions((prev) => [
      ...prev,
      { id: `filter-${Date.now()}`, field: '', operator: 'contains', value: '', logic: 'AND' },
    ]);
  }, []);

  const removeFilterCondition = useCallback((id: string) => {
    setFilterConditions((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateFilterCondition = useCallback((id: string, updates: Partial<FilterCondition>) => {
    setFilterConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  const applyFilter = useCallback(() => {
    const where = buildWhereClause(filterConditions, dbType);
    setWhereClause(where);
    setCurrentPage(1);
    loadData(where, orderByClause);
    loadCount(where);
  }, [filterConditions, buildWhereClause, orderByClause]);

  const clearFilter = useCallback(() => {
    setFilterConditions([
      { id: `filter-${Date.now()}`, field: '', operator: 'contains', value: '', logic: 'AND' },
    ]);
    setWhereClause('');
    setOrderByClause('');
    setCurrentPage(1);
    loadData('', '');
    loadCount('');
  }, []);

  const toggleFilterPanel = useCallback(() => {
    setFilterPanelOpen((prev) => !prev);
  }, []);

  const onSelectionChanged = useCallback((event: any) => {
    const selected = event.api.getSelectedRows();
    setSelectedRows(selected);
  }, []);

  const onGridReady = useCallback((event: any) => {
    gridApiRef.current = event.api;
  }, []);

  // 单元格复制粘贴功能
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const api = gridApiRef.current;
      if (!api) return;

      const selectedRows = api.getSelectedRows();
      if (selectedRows.length > 0) {
        const text = selectedRows
          .map((row) =>
            columns
              .map((col) => {
                const value = row[col.column_name];
                return value === null || value === undefined ? 'NULL' : String(value);
              })
              .join('\t')
          )
          .join('\n');

        e.clipboardData?.setData('text/plain', text);
        e.preventDefault();
        message.success('已复制选中行');
      }
    };

    const handlePaste = async (e: ClipboardEvent) => {
      const api = gridApiRef.current;
      if (!api) return;

      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      const focusedCell = api.getFocusedCell();
      if (!focusedCell) return;

      try {
        const rows = text.split('\n').filter((r) => r.trim());
        const allColumnDefs = api.getColumnDefs() || [];
        const startColId = focusedCell.column.getColId();
        const startColIndex = allColumnDefs.findIndex((col: any) => col.colId === startColId);
        const startRowIndex = focusedCell.rowIndex;
        const updatedRows: RowData[] = [];

        for (let rowOffset = 0; rowOffset < rows.length; rowOffset++) {
          const values = rows[rowOffset].split('\t');
          const node = api.getDisplayedRowAtIndex(startRowIndex + rowOffset);

          if (!node) continue;

          const rowData = { ...node.data };

          for (let colOffset = 0; colOffset < values.length; colOffset++) {
            const currentColIndex = startColIndex + colOffset;
            const col = allColumnDefs[currentColIndex] as ColDef | undefined;
            if (!col) continue;

            const colName = col.field as string | undefined;
            if (!colName) continue;

            const value = values[colOffset].trim();
            rowData[colName] = value === 'NULL' ? null : value;

            if (rowData.__status__ !== 'new') {
              rowData.__status__ = 'modified';
            }
          }

          api.applyTransaction({ update: [rowData] });
          updatedRows.push(rowData);
        }

        setHasUnsavedChanges(true);
        setPendingChanges((prev) => {
          const filteredUpdates = prev.updates.filter(
            (r) => !updatedRows.some((ur) => ur.__row_id__ === r.__row_id__)
          );
          return {
            ...prev,
            updates: [...filteredUpdates, ...updatedRows],
          };
        });
        message.success('粘贴成功');
      } catch (error: any) {
        message.error(`粘贴失败：${error.message}`);
      }
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
    };
  }, [columns]);

  const handlePageChange = useCallback(
    (page: number, size?: number | string) => {
      if (size && size !== pageSize) {
        // 处理 "All" 选项
        const newPageSize = size === 'All' ? 1000000 : Number(size);
        setPageSize(newPageSize);
        setCurrentPage(1);
      } else {
        setCurrentPage(page);
      }
    },
    [pageSize]
  );

  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalCount);

  const toolbarStyle: React.CSSProperties = {
    padding: '1px 4px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--background-toolbar)',
    flexShrink: 0,
    minHeight: 22,
  };

  const statusBarStyle: React.CSSProperties = {
    borderTop: '1px solid var(--border-color)',
    background: hasUnsavedChanges
      ? 'var(--color-warning-bg, #fffbe6)'
      : 'var(--background-toolbar)',
    borderBottom: hasUnsavedChanges ? '2px solid var(--color-warning)' : undefined,
    padding: '1px 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    gap: 4,
    minHeight: 22,
    transition: 'background 0.3s ease',
  };

  const dividerStyle: React.CSSProperties = {
    width: 1,
    height: 14,
    background: 'var(--border-color)',
    margin: '0 4px',
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--background-card)',
      }}
    >
      {/* 顶部工具栏 */}
      <div style={toolbarStyle}>
        <Space
          size={2}
          split={
            <Divider
              type="vertical"
              style={{
                height: 14,
                margin: '0 4px',
                background: 'var(--border-color)',
              }}
            />
          }
        >
          <Button
            icon={<PlusOutlined />}
            onClick={handleAddRow}
            type="primary"
            size="small"
            style={{ height: 20, padding: '0 6px', fontSize: 11 }}
          >
            新增
          </Button>
          <Button
            icon={<EditOutlined />}
            onClick={handleEditRow}
            disabled={selectedRows.length !== 1}
            size="small"
            style={{ height: 20, padding: '0 6px', fontSize: 11 }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除选中的 ${selectedRows.length} 行吗？`}
            onConfirm={handleDeleteRows}
            okText="删除"
            cancelText="取消"
          >
            <Button
              icon={<DeleteOutlined />}
              disabled={selectedRows.length === 0}
              danger
              size="small"
              style={{ height: 20, padding: '0 6px', fontSize: 11 }}
            >
              删除
            </Button>
          </Popconfirm>

          <Button
            icon={<DownloadOutlined />}
            onClick={exportToCSV}
            disabled={rowData.length === 0}
            size="small"
            style={{ height: 20, padding: '0 6px', fontSize: 11 }}
          >
            导出
          </Button>

          <Button
            icon={filterPanelOpen ? <UpOutlined /> : <DownOutlined />}
            onClick={toggleFilterPanel}
            type={whereClause ? 'primary' : 'default'}
            size="small"
            style={{ height: 20, padding: '0 6px', fontSize: 11 }}
          >
            筛选
          </Button>

          <Dropdown
            trigger={['click']}
            menu={{
              title: '列可见性',
              items: [
                { key: 'showAll', label: '显示全部', onClick: showAllColumns },
                { type: 'divider' },
                ...columns.map((col) => ({
                  key: col.column_name,
                  label: (
                    <Checkbox
                      checked={!hiddenColumns.has(col.column_name)}
                      onChange={() => toggleColumnVisibility(col.column_name)}
                    >
                      {col.column_name}
                      {col.column_key === 'PRI' && (
                        <Tag color="blue" style={{ marginLeft: 4, fontSize: 9 }}>
                          PK
                        </Tag>
                      )}
                    </Checkbox>
                  ),
                })),
              ],
            }}
          >
            <Button
              icon={<FilterOutlined />}
              size="small"
              style={{ height: 20, padding: '0 6px', fontSize: 11 }}
            >
              显示列
            </Button>
          </Dropdown>

          <Tooltip title="自动调整列宽">
            <Button
              icon={<ColumnWidthOutlined />}
              onClick={handleAutoSizeColumns}
              size="small"
              style={{ height: 20, padding: '0 6px', fontSize: 11 }}
            />
          </Tooltip>

          <Input
            placeholder="快速搜索..."
            value={quickFilter}
            onChange={(e) => handleQuickFilter(e.target.value)}
            allowClear
            size="small"
            style={{ width: 100, height: 20, fontSize: 11 }}
          />
        </Space>

        <Space size={2}>
          <Tag color="blue" style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}>
            {tableName}
          </Tag>
          <Tag color="green" style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}>
            {totalCount.toLocaleString()} 行
          </Tag>
          {selectedRows.length > 0 && (
            <Tag color="orange" style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}>
              {selectedRows.length} 行
            </Tag>
          )}
          {hasUnsavedChanges && (
            <Tag
              color="warning"
              style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}
            >
              未保存
            </Tag>
          )}
        </Space>
      </div>

      {!filterPanelOpen && (
        <div
          style={{
            padding: '4px 12px',
            background: 'var(--background-toolbar)',
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            WHERE
          </span>
          <SqlInput
            columns={columns}
            value={whereClause}
            onChange={setWhereClause}
            onPressEnter={() => {
              setCurrentPage(1);
              loadData(whereClause, orderByClause);
              loadCount(whereClause);
              message.info(whereClause ? `WHERE: ${whereClause}` : '已清除筛选');
            }}
            style={{ flex: 1, height: 20 }}
          />
          <Divider
            type="vertical"
            style={{ height: 14, margin: 0, background: 'var(--border-color)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            ORDER BY
          </span>
          <SqlInput
            columns={columns}
            value={orderByClause}
            onChange={setOrderByClause}
            onPressEnter={() => {
              setCurrentPage(1);
              loadData(whereClause, orderByClause);
              loadCount(whereClause);
              message.info(orderByClause ? `ORDER BY: ${orderByClause}` : '已清除排序');
            }}
            style={{ flex: 1, height: 20 }}
          />
        </div>
      )}

      {filterPanelOpen && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--background-toolbar)',
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
              筛选条件
            </span>
            <div style={{ flex: 1 }} />
            <Button
              size="small"
              onClick={() => {
                const sql = buildWhereClause(filterConditions, dbType);
                Modal.info({
                  title: 'SQL 预览',
                  content: sql ? (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>WHERE {sql}</pre>
                  ) : (
                    '暂无筛选条件'
                  ),
                });
              }}
              style={{ fontSize: 11, height: 20 }}
            >
              预览 SQL
            </Button>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 200,
              overflowY: 'auto',
            }}
          >
            {filterConditions.map((cond, idx) => {
              const prevCond = idx > 0 ? filterConditions[idx - 1] : null;
              const showLogic = idx > 0 && !cond.isGroupStart && !prevCond?.isGroupStart;
              return (
                <div
                  key={cond.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    paddingLeft: (cond.level ?? 0) * 16,
                  }}
                >
                  {cond.isGroupStart && (
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 'bold',
                        color: 'var(--color-info)',
                        marginRight: 4,
                      }}
                    >
                      (
                    </span>
                  )}
                  {showLogic && (
                    <Select
                      value={cond.logic}
                      onChange={(val) => updateFilterCondition(cond.id, { logic: val })}
                      size="small"
                      style={{ width: 64, fontSize: 11 }}
                      options={[
                        { label: 'AND', value: 'AND' },
                        { label: 'OR', value: 'OR' },
                      ]}
                    />
                  )}
                  {!showLogic && !cond.isGroupStart && !cond.isGroupEnd && (
                    <span style={{ width: 64 }} />
                  )}
                  {!cond.isGroupStart && !cond.isGroupEnd && (
                    <>
                      <Select
                        placeholder="字段"
                        value={cond.field || undefined}
                        onChange={(val) => updateFilterCondition(cond.id, { field: val })}
                        size="small"
                        style={{ minWidth: 140, fontSize: 11 }}
                        showSearch
                        filterOption={(input, option) =>
                          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={columns.map((col) => ({
                          label: col.column_name,
                          value: col.column_name,
                        }))}
                      />
                      <Select
                        value={cond.operator}
                        onChange={(val) => updateFilterCondition(cond.id, { operator: val })}
                        size="small"
                        style={{ width: 88, fontSize: 11 }}
                        options={[
                          { label: '包含', value: 'contains' },
                          { label: '不包含', value: 'notContains' },
                          { label: '等于', value: 'equals' },
                          { label: '不等于', value: 'notEquals' },
                          { label: '开头是', value: 'startsWith' },
                          { label: '结尾是', value: 'endsWith' },
                          { label: '大于', value: 'greaterThan' },
                          { label: '小于', value: 'lessThan' },
                          { label: '大于等于', value: 'greaterOrEqual' },
                          { label: '小于等于', value: 'lessOrEqual' },
                          { label: '为空', value: 'isNull' },
                          { label: '不为空', value: 'isNotNull' },
                          { label: '在...中', value: 'in' },
                          { label: '不在...中', value: 'notIn' },
                        ]}
                      />
                      {!['isNull', 'isNotNull'].includes(cond.operator) && (
                        <Input
                          placeholder="值"
                          value={cond.value}
                          onChange={(e) =>
                            updateFilterCondition(cond.id, { value: e.target.value })
                          }
                          size="small"
                          style={{ flex: 1, fontSize: 11, height: 20, minWidth: 60 }}
                        />
                      )}
                      {['isNull', 'isNotNull'].includes(cond.operator) && (
                        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-tertiary)' }}>
                          —
                        </span>
                      )}
                    </>
                  )}
                  {cond.isGroupEnd && (
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 'bold',
                        color: 'var(--color-info)',
                        marginLeft: 4,
                      }}
                    >
                      )
                    </span>
                  )}
                  {!cond.isGroupEnd && (
                    <>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => {
                          const newConditions = [...filterConditions];
                          const insertIndex = idx + 1;
                          newConditions.splice(insertIndex, 0, {
                            id: `filter-${Date.now()}`,
                            field: '',
                            operator: 'contains',
                            value: '',
                            logic: 'AND',
                            level: cond.level ?? 0,
                          });
                          setFilterConditions(newConditions);
                        }}
                        style={{
                          fontSize: 10,
                          padding: '0 2px',
                          height: 16,
                          color: 'var(--color-primary)',
                        }}
                      >
                        +同级
                      </Button>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => {
                          const newConditions = [...filterConditions];
                          const insertIndex = idx + 1;
                          const currentLevel = (cond.level ?? 0) + 1;
                          newConditions.splice(
                            insertIndex,
                            0,
                            {
                              id: `filter-${Date.now()}-start`,
                              field: '',
                              operator: '',
                              value: '',
                              logic: 'AND',
                              isGroupStart: true,
                              level: cond.level ?? 0,
                            },
                            {
                              id: `filter-${Date.now()}-a`,
                              field: '',
                              operator: 'contains',
                              value: '',
                              logic: 'AND',
                              level: currentLevel,
                            },
                            {
                              id: `filter-${Date.now()}-b`,
                              field: '',
                              operator: 'contains',
                              value: '',
                              logic: 'AND',
                              level: currentLevel,
                            },
                            {
                              id: `filter-${Date.now()}-end`,
                              field: '',
                              operator: '',
                              value: '',
                              logic: 'AND',
                              isGroupEnd: true,
                              level: cond.level ?? 0,
                            }
                          );
                          setFilterConditions(newConditions);
                        }}
                        style={{
                          fontSize: 10,
                          padding: '0 2px',
                          height: 16,
                          color: 'var(--color-info)',
                        }}
                      >
                        +括号
                      </Button>
                    </>
                  )}
                  <Button
                    type="text"
                    danger
                    size="small"
                    onClick={() => removeFilterCondition(cond.id)}
                    style={{ height: 20, padding: '0 4px', fontSize: 11 }}
                    icon={<DeleteOutlined />}
                    disabled={filterConditions.length === 1}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Button size="small" onClick={clearFilter} style={{ fontSize: 11, height: 20 }}>
              清除
            </Button>
            <Button
              type="primary"
              size="small"
              onClick={applyFilter}
              style={{ fontSize: 11, height: 20 }}
            >
              应用
            </Button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: tc.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
              zIndex: 10,
            }}
          >
            <Spin size="large" description="加载中..." />
          </div>
        )}

        {!loading && rowData.length === 0 && hasEverLoaded ? (
          <Empty description="暂无数据" style={{ marginTop: '20%' }} />
        ) : columns.length > 0 ? (
          <div
            className={`ag-theme-compact ${isDarkMode ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'}`}
            style={{ height: '100%', width: '100%' }}
          >
            <AgGridReact
              key={gridKey}
              onGridReady={onGridReady}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              components={{ columnFilterHeader: ColumnFilterHeader }}
              getRowId={(params) => params.data.__row_id__}
              onCellValueChanged={onCellValueChanged}
              onCellDoubleClicked={onCellDoubleClicked}
              onSelectionChanged={onSelectionChanged}
              onSortChanged={(event) => {
                const api = event.api;
                const state = api.getColumnState();
                const sortState = state
                  .filter((col: any) => col.sort && col.sort !== 'none')
                  .map((col: any) => ({
                    colId: col.colId,
                    sort: col.sort as 'asc' | 'desc',
                  }));
                setSortModel(sortState);
                if (currentPage !== 1) {
                  setCurrentPage(1);
                }
              }}
              onCellContextMenu={(event) => {
                if (event.data && event.event) {
                  const mouseEvent = event.event as unknown as React.MouseEvent;
                  setCellContextMenu({
                    visible: true,
                    x: mouseEvent.clientX,
                    y: mouseEvent.clientY,
                    colId: event.column.getColId(),
                    value: event.value,
                    rowNode: event.node,
                  });
                }
              }}
              rowSelection="multiple"
              suppressRowClickSelection={true}
              suppressPaginationPanel={true}
              suppressCellFocus={true}
              animateRows={false}
              headerHeight={24}
              rowHeight={22}
              rowBuffer={10}
              domLayout="normal"
              suppressColumnVirtualisation={false}
              suppressRowVirtualisation={false}
              debounceVerticalScrollbar={true}
              suppressScrollOnNewData={true}
              suppressAnimationFrame={true}
              localeText={{
                pinLeft: '左侧固定',
                pinRight: '右侧固定',
                noPin: '取消固定',
                autoSize: '自动列宽',
                resetColumns: '重置列',
                expandAll: '展开全部',
                collapseAll: '折叠全部',
                copyWithHeaders: '复制带表头',
                copyWithGroupHeaders: '复制带分组表头',
                menu: '菜单',
                filter: '筛选',
                filters: '筛选器',
                columns: '列',
                values: '值',
                pinColumn: '固定列',
                autoSizeColumn: '自动列宽',
                resetColumn: '重置列',
                moveColumn: '移动列',
                sortAscending: '升序',
                sortDescending: '降序',
                sortUnsort: '取消排序',
                close: '关闭',
                loadingOoo: '加载中...',
                noRowsToShow: '暂无数据',
                enabled: '启用',
                disabled: '禁用',
                true: '是',
                false: '否',
                contains: '包含',
                notContains: '不包含',
                startsWith: '开始于',
                endsWith: '结束于',
                equals: '等于',
                notEqual: '不等于',
                lessThan: '小于',
                greaterThan: '大于',
                inRange: '范围内',
                lessThanOrEqual: '小于等于',
                greaterThanOrEqual: '大于等于',
                filterOoo: '筛选中...',
                applyFilter: '应用筛选',
                clearFilter: '清除筛选',
                blank: '空白',
                notBlank: '非空白',
                and: '且',
                or: '或',
                searchOoo: '搜索...',
                selectAll: '全选',
                selectAllFiltered: '全选筛选结果',
                addCurrentSelectionToFilter: '将当前选择添加到筛选',
                sum: '求和',
                min: '最小值',
                max: '最大值',
                count: '计数',
                avg: '平均值',
                page: '页',
                pageSize: '每页',
                total: '共',
                of: '条',
                nextPage: '下一页',
                prevPage: '上一页',
                firstPage: '首页',
                lastPage: '末页',
                to: '至',
                OOO: '可选',
                any: '任意',
                condition: '条件',
                conditions: '条件',
                operator: '运算符',
                all: '全部',
                group: '分组',
              }}
            />
          </div>
        ) : hasEverLoaded ? (
          <Empty
            description="无法获取表结构，请检查连接或刷新重试"
            style={{ marginTop: '20%' }}
          />
        ) : (
          <div
            style={{
              height: '100%',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--background-card)',
            }}
          >
            <Spin size="large" description="加载中..." />
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div style={statusBarStyle}>
        <Space size={2}>
          <Button
            icon={<SaveOutlined />}
            type={hasUnsavedChanges ? 'primary' : 'default'}
            onClick={handleCommit}
            disabled={!hasUnsavedChanges}
            size="small"
            style={{ height: 20, padding: '0 4px', fontSize: 11 }}
          >
            提交
          </Button>
          <Button
            icon={<UndoOutlined />}
            onClick={handleUndo}
            disabled={!hasUnsavedChanges}
            size="small"
            style={{ height: 20, padding: '0 4px', fontSize: 11 }}
          >
            撤销
          </Button>

          <div style={dividerStyle} />

          {hasUnsavedChanges && (
            <>
              {pendingChanges.inserts.length > 0 && (
                <Tag
                  color="success"
                  style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}
                >
                  插入 {pendingChanges.inserts.length}
                </Tag>
              )}
              {pendingChanges.updates.length > 0 && (
                <Tag
                  color="warning"
                  style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}
                >
                  更新 {pendingChanges.updates.length}
                </Tag>
              )}
              {pendingChanges.deletes.length > 0 && (
                <Tag
                  color="error"
                  style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}
                >
                  删除 {pendingChanges.deletes.length}
                </Tag>
              )}
              <div style={dividerStyle} />
            </>
          )}

          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadData()}
            loading={loading}
            size="small"
            style={{ height: 20, padding: '0 4px', fontSize: 11 }}
          >
            刷新
          </Button>
          <Button
            icon={<ImportOutlined />}
            onClick={() => setImportWizardOpen(true)}
            size="small"
            style={{ height: 20, padding: '0 4px', fontSize: 11 }}
          >
            导入
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'excel',
                  label: '导出 Excel (.xlsx)',
                  icon: <FileTextOutlined />,
                  onClick: () => {
                    try {
                      const exportCols = columns.map((c) => ({
                        field: c.column_name,
                        headerName: c.column_name,
                      }));
                      const cleanData = rowData.map((row) => {
                        const newRow: Record<string, any> = {};
                        columns.forEach((c) => {
                          const val = row[c.column_name];
                          newRow[c.column_name] = val === null ? '' : val;
                        });
                        return newRow;
                      });
                      exportToExcel(cleanData, exportCols, {
                        filename: `${tableName}_${Date.now()}.xlsx`,
                        sheetName: tableName,
                      });
                      message.success('已导出 Excel');
                    } catch (e: any) {
                      message.error(`导出失败：${e.message}`);
                    }
                  },
                },
                {
                  key: 'csv',
                  label: '导出 CSV',
                  icon: <FileTextOutlined />,
                  onClick: () => {
                    try {
                      const exportCols = columns.map((c) => ({
                        field: c.column_name,
                        headerName: c.column_name,
                      }));
                      const cleanData = rowData.map((row) => {
                        const newRow: Record<string, any> = {};
                        columns.forEach((c) => {
                          const val = row[c.column_name];
                          newRow[c.column_name] = val === null ? '' : val;
                        });
                        return newRow;
                      });
                      exportToCSVUtil(cleanData, exportCols, {
                        filename: `${tableName}_${Date.now()}.csv`,
                      });
                      message.success('已导出 CSV');
                    } catch (e: any) {
                      message.error(`导出失败：${e.message}`);
                    }
                  },
                },
                {
                  key: 'json',
                  label: '导出 JSON',
                  icon: <FileTextOutlined />,
                  onClick: () => {
                    try {
                      const cleanData = rowData.map((row) => {
                        const newRow: Record<string, any> = {};
                        columns.forEach((c) => {
                          const val = row[c.column_name];
                          newRow[c.column_name] = val === null ? '' : val;
                        });
                        return newRow;
                      });
                      exportToJSONUtil(cleanData, {
                        filename: `${tableName}_${Date.now()}.json`,
                      });
                      message.success('已导出 JSON');
                    } catch (e: any) {
                      message.error(`导出失败：${e.message}`);
                    }
                  },
                },
                { type: 'divider' as const },
                {
                  key: 'txt',
                  label: '导出 TXT',
                  icon: <FileTextOutlined />,
                  onClick: () => {
                    try {
                      const exportCols = columns.map((c) => ({
                        field: c.column_name,
                        headerName: c.column_name,
                      }));
                      const cleanData = rowData.map((row) => {
                        const newRow: Record<string, any> = {};
                        columns.forEach((c) => {
                          const val = row[c.column_name];
                          newRow[c.column_name] = val === null ? '' : val;
                        });
                        return newRow;
                      });
                      exportToTXT(cleanData, exportCols, {
                        filename: `${tableName}_${Date.now()}.txt`,
                      });
                      message.success('已导出 TXT');
                    } catch (e: any) {
                      message.error(`导出失败：${e.message}`);
                    }
                  },
                },
                {
                  key: 'xml',
                  label: '导出 XML',
                  icon: <FileTextOutlined />,
                  onClick: () => {
                    try {
                      const exportCols = columns.map((c) => ({
                        field: c.column_name,
                        headerName: c.column_name,
                      }));
                      const cleanData = rowData.map((row) => {
                        const newRow: Record<string, any> = {};
                        columns.forEach((c) => {
                          const val = row[c.column_name];
                          newRow[c.column_name] = val === null ? '' : val;
                        });
                        return newRow;
                      });
                      exportToXML(cleanData, exportCols, {
                        filename: `${tableName}_${Date.now()}.xml`,
                      });
                      message.success('已导出 XML');
                    } catch (e: any) {
                      message.error(`导出失败：${e.message}`);
                    }
                  },
                },
                {
                  key: 'markdown',
                  label: '导出 Markdown',
                  icon: <FileTextOutlined />,
                  onClick: () => {
                    try {
                      const exportCols = columns.map((c) => ({
                        field: c.column_name,
                        headerName: c.column_name,
                      }));
                      const cleanData = rowData.map((row) => {
                        const newRow: Record<string, any> = {};
                        columns.forEach((c) => {
                          const val = row[c.column_name];
                          newRow[c.column_name] = val === null ? '' : val;
                        });
                        return newRow;
                      });
                      exportToMarkdown(cleanData, exportCols, {
                        filename: `${tableName}_${Date.now()}.md`,
                      });
                      message.success('已导出 Markdown');
                    } catch (e: any) {
                      message.error(`导出失败：${e.message}`);
                    }
                  },
                },
              ],
            }}
          >
            <Button
              icon={<DownloadOutlined />}
              size="small"
              style={{ height: 20, padding: '0 4px', fontSize: 11 }}
            >
              导出
            </Button>
          </Dropdown>
        </Space>

        {/* SQL 预览 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 0,
            maxWidth: 700,
            marginLeft: 8,
          }}
        >
          <code
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 11,
              color: 'var(--text-secondary)',
              fontFamily: "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace",
              padding: '2px 6px',
              background: 'var(--background-toolbar)',
              borderRadius: 3,
              border: '1px solid var(--border-color)',
            }}
          >
            {currentSql}
          </code>
          <Tooltip title="复制 SQL">
            <Button
              icon={<CopyOutlined />}
              type="text"
              onClick={copySql}
              size="small"
              style={{ height: 20, padding: '0 4px', fontSize: 11 }}
            >
              复制
            </Button>
          </Tooltip>
        </div>

        {/* 分页控制 */}
        <Space size={4} style={{ flexShrink: 0 }}>
          <Select
            value={pageSize}
            onChange={(val) => handlePageChange(1, val)}
            size="small"
            style={{ width: 80, fontSize: 11 }}
            options={[
              { label: '10', value: 10 },
              { label: '50', value: 50 },
              { label: '100', value: 100 },
              { label: '500', value: 500 },
              { label: '1000', value: 1000 },
              { label: '全部', value: 'All' },
            ]}
          />
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap',
            }}
          >
            {startRow}-{endRow}
          </span>
          <Pagination
            size="small"
            current={currentPage}
            pageSize={pageSize}
            total={totalCount}
            onChange={(page) => handlePageChange(page)}
            simple
          />
        </Space>
      </div>

      <Modal
        title="新增行"
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={handleSaveNewRow}
        width={600}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        transitionName=""
        maskTransitionName=""
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          {columns.map((col) => (
            <Form.Item
              key={col.column_name}
              label={
                <span>
                  {col.column_name}
                  {col.is_nullable !== 'YES' && (
                    <span style={{ color: 'var(--color-error)' }}> *</span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                    {col.data_type}
                  </span>
                </span>
              }
              name={col.column_name}
              rules={[
                { required: col.is_nullable !== 'YES', message: `请输入 ${col.column_name}` },
              ]}
            >
              <GlobalInput placeholder={col.comment || col.data_type} />
            </Form.Item>
          ))}
        </Form>
      </Modal>

      <Modal
        title="编辑行"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSaveEditRow}
        width={600}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        transitionName=""
        maskTransitionName=""
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          {columns.map((col) => (
            <Form.Item
              key={col.column_name}
              label={
                <span>
                  {col.column_name}
                  {col.column_key === 'PRI' && (
                    <Tag color="blue" style={{ marginLeft: 8 }}>
                      主键
                    </Tag>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                    {col.data_type}
                  </span>
                </span>
              }
              name={col.column_name}
            >
              <GlobalInput
                placeholder={col.comment || col.data_type}
                disabled={col.column_key === 'PRI'}
              />
            </Form.Item>
          ))}
        </Form>
      </Modal>

      <Modal
        title={`编辑 ${textEditModal?.field || ''}`}
        open={!!textEditModal?.open}
        onCancel={() => setTextEditModal(null)}
        onOk={() => {
          if (!textEditModal || !gridApiRef.current) return;
          const { field, rowIndex } = textEditModal;
          const newValue = textEditModal.value;
          const rowNode = gridApiRef.current.getDisplayedRowAtIndex(rowIndex);
          if (rowNode) {
            const updatedRow = { ...rowNode.data, [field]: newValue };
            if (!updatedRow.__status__ || updatedRow.__status__ !== 'new') {
              updatedRow.__status__ = 'modified';
            }
            gridApiRef.current.applyTransaction({ update: [updatedRow] });
            setHasUnsavedChanges(true);
            setPendingChanges((prev) => {
              const filteredUpdates = prev.updates.filter(
                (r) => r.__row_id__ !== updatedRow.__row_id__
              );
              return { ...prev, updates: [...filteredUpdates, updatedRow] };
            });
          }
          setTextEditModal(null);
        }}
        width={600}
      >
        <Input.TextArea
          rows={12}
          value={textEditModal?.value || ''}
          onChange={(e) =>
            setTextEditModal((prev) => (prev ? { ...prev, value: e.target.value } : null))
          }
          placeholder="输入内容..."
        />
      </Modal>

      <ImportWizard
        open={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        tableName={tableName || ''}
        columns={columns}
        onImport={async (data, mode, mapping) => {
          // 根据映射转换数据
          const mappedData = data.map((row) => {
            const newRow: Record<string, any> = {};
            Object.entries(mapping).forEach(([sourceField, targetField]) => {
              if (targetField && row[sourceField] !== undefined) {
                newRow[targetField] = row[sourceField];
              }
            });
            return newRow;
          });

          const pkCol = columns.find((c) => c.column_key === 'PRI');
          
          try {
            const result = await api.batchImport({
              connectionId,
              database,
              tableName: tableName || '',
              mode,
              primaryKey: pkCol?.column_name,
              rows: mappedData,
            });
            
            if (result.failed_count > 0) {
              message.warning(`导入完成: 成功 ${result.success_count} 条, 失败 ${result.failed_count} 条`);
            } else {
              message.success(`成功导入 ${result.success_count} 条数据`);
            }
            
            // 刷新数据
            loadData();
          } catch (err: any) {
            message.error(`导入失败: ${err.message || err}`);
          }
        }}
      />

      <Dropdown
        open={contextMenu.visible}
        onOpenChange={(visible) => {
          if (!visible) closeContextMenu();
        }}
        menu={{
          items: [
            {
              key: 'copy-row',
              label: '复制行',
              icon: <CopyOutlined />,
              onClick: () => handleContextMenuAction('copy-row'),
            },
            {
              key: 'edit-row',
              label: '编辑行',
              icon: <EditOutlined />,
              onClick: () => handleContextMenuAction('edit-row'),
            },
            { type: 'divider' },
            {
              key: 'delete-row',
              label: '删除行',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => handleContextMenuAction('delete-row'),
            },
            { type: 'divider' },
            {
              key: 'copy-select',
              label: '复制选中行',
              icon: <CopyOutlined />,
              onClick: () => handleContextMenuAction('copy-select'),
            },
            {
              key: 'delete-select',
              label: '删除选中行',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => handleContextMenuAction('delete-select'),
            },
          ],
        }}
      >
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      </Dropdown>

      {/* 单元格右键菜单 */}
      <Dropdown
        open={cellContextMenu.visible}
        onOpenChange={(visible) => {
          if (!visible) setCellContextMenu((prev) => ({ ...prev, visible: false }));
        }}
        menu={{
          items: [
            {
              key: 'copy-cell-value',
              label: '复制单元格值',
              icon: <CopyOutlined />,
              onClick: () => {
                navigator.clipboard.writeText(String(cellContextMenu.value ?? 'NULL'));
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
                message.success('已复制单元格值');
              },
            },
            {
              key: 'copy-insert',
              label: '复制为 INSERT',
              onClick: () => {
                if (!tableName || !columns.length) {
                  message.warning('无法确定表结构');
                  setCellContextMenu((prev) => ({ ...prev, visible: false }));
                  return;
                }
                const row = cellContextMenu.rowNode.data;
                const values = columns.map((_, i) => row[String(i)] ?? null);
                const colStr = columns.map((c) => escapeSqlIdentifier(c.column_name, dbType)).join(', ');
                const valStr = values.map(escapeSqlValue).join(', ');
                const sql = `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${colStr}) VALUES (${valStr});`;
                navigator.clipboard.writeText(sql);
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
                message.success('已复制 INSERT 语句');
              },
            },
            {
              key: 'copy-update',
              label: '复制为 UPDATE',
              disabled: !primaryKey,
              onClick: () => {
                if (!tableName || !primaryKey || !columns.length) {
                  message.warning('无法生成 UPDATE 语句');
                  setCellContextMenu((prev) => ({ ...prev, visible: false }));
                  return;
                }
                const row = cellContextMenu.rowNode.data;
                const pkIdx = columns.findIndex((c) => c.column_name === primaryKey.column_name);
                if (pkIdx < 0) {
                  message.warning('未找到主键列');
                  setCellContextMenu((prev) => ({ ...prev, visible: false }));
                  return;
                }
                const values = columns.map((_, i) => row[String(i)] ?? null);
                const setters = columns
                  .map((c, i) => `${escapeSqlIdentifier(c.column_name, dbType)} = ${escapeSqlValue(values[i])}`)
                  .filter((_, i) => i !== pkIdx)
                  .join(', ');
                const sql = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${setters} WHERE ${escapeSqlIdentifier(primaryKey.column_name, dbType)} = ${escapeSqlValue(values[pkIdx])};`;
                navigator.clipboard.writeText(sql);
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
                message.success('已复制 UPDATE 语句');
              },
            },
            { type: 'divider' },
            {
              key: 'set-null',
              label: '设为 NULL',
              disabled: !primaryKey,
              onClick: () => {
                if (!primaryKey) {
                  message.warning('需要主键才能修改数据');
                  setCellContextMenu((prev) => ({ ...prev, visible: false }));
                  return;
                }
                const rowNode = cellContextMenu.rowNode;
                const colId = cellContextMenu.colId;
                if (!rowNode || !colId) {
                  setCellContextMenu((prev) => ({ ...prev, visible: false }));
                  return;
                }
                const updatedRow = { ...rowNode.data };
                updatedRow[colId] = null;
                if (!updatedRow.__status__ || updatedRow.__status__ !== 'new') {
                  updatedRow.__status__ = 'modified';
                }
                gridApiRef.current?.applyTransaction({ update: [updatedRow] });
                setHasUnsavedChanges(true);
                setPendingChanges((prev) => {
                  const filteredUpdates = prev.updates.filter(
                    (r) => r.__row_id__ !== updatedRow.__row_id__
                  );
                  return {
                    ...prev,
                    updates: [...filteredUpdates, updatedRow],
                  };
                });
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
                message.success(`已将 ${colId} 设为 NULL`);
              },
            },
            { type: 'divider' },
            {
              key: 'filter-column',
              label: `按此列筛选 (${cellContextMenu.colId})`,
              onClick: () => {
                const colName = cellContextMenu.colId;
                const filterValue = String(cellContextMenu.value ?? '');
                const newFilter = `${colName} = '${filterValue.replace(/'/g, "''")}'`;
                setWhereClause(newFilter);
                setCurrentPage(1);
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
                message.success(`已添加筛选条件: ${colName} = ${filterValue}`);
              },
            },
            {
              key: 'sort-asc',
              label: `按此列升序 (${cellContextMenu.colId} ↑)`,
              onClick: () => {
                const colName = cellContextMenu.colId;
                setSortModel([{ colId: colName, sort: 'asc' }]);
                setCurrentPage(1);
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
              },
            },
            {
              key: 'sort-desc',
              label: `按此列降序 (${cellContextMenu.colId} ↓)`,
              onClick: () => {
                const colName = cellContextMenu.colId;
                setSortModel([{ colId: colName, sort: 'desc' }]);
                setCurrentPage(1);
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
              },
            },
          ],
        }}
      >
        <div
          style={{
            position: 'fixed',
            left: cellContextMenu.x,
            top: cellContextMenu.y,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      </Dropdown>
    </div>
  );
});
