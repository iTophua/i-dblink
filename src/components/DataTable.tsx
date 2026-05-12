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
  Tag,
  Select,
  Pagination,
  Tooltip,
  Dropdown,
  Input,
  Checkbox,
  Divider,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { SqlInput } from './SqlInput';
import { ColumnFilterHeader } from './DataTable/ColumnFilterHeader';
import {
  ReloadOutlined,
  DownloadOutlined,
  PlusOutlined,
  DeleteOutlined,
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
  const { t } = useTranslation();
  const dbType = useAppStore(
    (state) => state.connections.find((c) => c.id === connectionId)?.db_type
  );
  const [loading, setLoading] = useState(false);
  const [hasEverLoaded, setHasEverLoaded] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const primaryKey = useMemo(() => columns.find((col) => col.column_key === 'PRI'), [columns]);
  const [rowData, setRowData] = useState<RowData[]>([]);
  const gridApiRef = useRef<GridApi | null>(null);
  const [selectedRows, setSelectedRows] = useState<RowData[]>([]);
  const defaultPageSize = 1000;
  const [pageSize, setPageSize] = useState(propPageSize ?? defaultPageSize);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentSql, setCurrentSql] = useState('');
  const [lastDmlSql, setLastDmlSql] = useState('');
  const [sortModel, setSortModel] = useState<{ colId: string; sort: 'asc' | 'desc' }[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [quickFilter, setQuickFilter] = useState('');
  const [gridKey, setGridKey] = useState(0);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [columnEditMode, setColumnEditMode] = useState<{
    column: string;
    value: string;
    originalValues: Map<string, any>;
  } | null>(null);
  const columnEditInputRef = useRef<HTMLInputElement>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const userColumnWidthsRef = useRef<Map<string, number>>(new Map());
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([
    { id: `filter-${Date.now()}`, field: '', operator: 'contains', value: '', logic: 'AND' },
  ]);
  const [whereClause, setWhereClause] = useState('');
  const [orderByClause, setOrderByClause] = useState('');
  const [textEditModal, setTextEditModal] = useState<{
    open: boolean;
    field: string;
    value: string;
    rowId: string;
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
  
  // 拖拽多选状态
  const [dragSelectRange, setDragSelectRange] = useState<{
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
    active: boolean;
  } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartCellRef = useRef<{ rowIndex: number; colIndex: number; isStatusColumn?: boolean } | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const [cellSelectionRange, setCellSelectionRange] = useState<{
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
  } | null>(null);
  const [rangeEditMode, setRangeEditMode] = useState<{
    column: string;
    startRow: number;
    endRow: number;
    value: string;
    originalValues: Map<string, any>;
  } | null>(null);
  const rangeEditInputRef = useRef<HTMLInputElement>(null);
  const rangeEditModeRef = useRef(rangeEditMode);
  useEffect(() => { rangeEditModeRef.current = rangeEditMode; }, [rangeEditMode]);
  const cellSelectionRangeRef = useRef(cellSelectionRange);
  useEffect(() => { cellSelectionRangeRef.current = cellSelectionRange; }, [cellSelectionRange]);
  const dragSelectRangeRef = useRef(dragSelectRange);
  useEffect(() => { dragSelectRangeRef.current = dragSelectRange; }, [dragSelectRange]);
  const selectedColumnRef = useRef(selectedColumn);
  useEffect(() => { selectedColumnRef.current = selectedColumn; }, [selectedColumn]);
  const columnEditModeRef = useRef(columnEditMode);
  useEffect(() => { columnEditModeRef.current = columnEditMode; }, [columnEditMode]);

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

        const query = buildQuery(
          currentPage,
          pageSize,
          tableName,
          database,
          dbType,
          sortModel,
          whereClause,
          orderByClause,
          overrideWhere,
          overrideOrderBy
        );
        setCurrentSql(query);

        const [colResult, dataResult] = await Promise.all([
          getColumns(connectionId, tableName, database),
          executeQuery(connectionId, query, database || ''),
        ]);

        if (dataResult.error) {
          message.error(`${t('common.failedToLoadData')}: ${dataResult.error}`);
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
          setHasEverLoaded(true);
        }
      } catch (error: any) {
        console.error('Failed to load table data:', error);
        message.error(`${t('common.failedToLoadData')}: ${error.message || error}`);
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

  // === 列批量编辑功能 ===
  const startColumnEdit = useCallback((column: string, initialValue: string = '') => {
    const api = gridApiRef.current;
    if (!api) return;
    
    // 保存所有行的原始值
    const originalValues = new Map<string, any>();
    api.forEachNode((node: any) => {
      if (node.data) {
        originalValues.set(node.data.__row_id__, node.data[column]);
      }
    });
    
    setColumnEditMode({ column, value: initialValue, originalValues });
    
    // 如果有初始值，立即更新所有行
    if (initialValue !== '') {
      const updates: RowData[] = [];
      api.forEachNode((node: any) => {
        if (node.data) {
          const updatedRow = { ...node.data, [column]: initialValue || null };
          updates.push(updatedRow);
        }
      });
      if (updates.length > 0) {
        api.applyTransaction({ update: updates });
      }
    }
    
    // 聚焦到输入框
    setTimeout(() => {
      columnEditInputRef.current?.focus();
    }, 0);
  }, []);

  const updateColumnEditValue = useCallback((newValue: string) => {
    // 使用函数式更新获取最新的 columnEditMode
    setColumnEditMode((prev) => {
      if (!prev) return null;
      
      // 实时更新所有行的该列值
      const api = gridApiRef.current;
      if (api) {
        const updates: RowData[] = [];
        api.forEachNode((node: any) => {
          if (node.data) {
            const updatedRow = { ...node.data, [prev.column]: newValue || null };
            updates.push(updatedRow);
          }
        });
        
        if (updates.length > 0) {
          api.applyTransaction({ update: updates });
        }
      }
      
      return { ...prev, value: newValue };
    });
  }, []);

  const commitColumnEdit = useCallback(async () => {
    if (!columnEditMode || !tableName) return;
    
    const { column, value, originalValues } = columnEditMode;
    const api = gridApiRef.current;
    if (!api) return;
    
    const pkCol = columns.find((col) => col.column_key === 'PRI');
    if (!pkCol) {
      message.warning(t('common.tableHasNoPrimaryKeyCannotUpdate'));
      setColumnEditMode(null);
      return;
    }
    
    try {
      setLoading(true);
      let successCount = 0;
      let errorMessage = '';
      const valueStr = value === '' || value === null ? 'NULL' : escapeSqlValue(value);
      
      // 逐行提交
      const rowsToUpdate: { rowId: string; pkValue: any }[] = [];
      api.forEachNode((node: any) => {
        if (node.data && node.data.__status__ !== 'new') {
          const originalValue = originalValues.get(node.data.__row_id__);
          if (originalValue !== value) {
            rowsToUpdate.push({
              rowId: node.data.__row_id__,
              pkValue: node.data[pkCol.column_name],
            });
          }
        }
      });
      
      for (const { pkValue } of rowsToUpdate) {
        const updateSQL = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${escapeSqlIdentifier(column, dbType)} = ${valueStr} WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(pkValue)}`;
        setLastDmlSql(updateSQL);
        
        const result = await executeQuery(connectionId, updateSQL, database || '');
        if (result.error) {
          errorMessage = result.error;
          break;
        }
        successCount++;
      }
      
      if (errorMessage) {
        message.error(`${t('common.dataGrid.updateFailed')}: ${errorMessage}`);
        // 回滚所有变更
        const reverts: RowData[] = [];
        api.forEachNode((node: any) => {
          if (node.data) {
            const originalValue = originalValues.get(node.data.__row_id__);
            reverts.push({ ...node.data, [column]: originalValue });
          }
        });
        api.applyTransaction({ update: reverts });
      } else {
        message.success(`${t('common.dataGrid.updateSuccess')} ${successCount} ${t('common.rows')}`);
        // 更新 original_data
        const updates: RowData[] = [];
        api.forEachNode((node: any) => {
          if (node.data) {
            const updatedRow = { 
              ...node.data, 
              __original_data__: { ...(node.data.__original_data__ || {}), [column]: value || null },
              __status__: node.data.__status__ === 'new' ? 'new' : undefined,
            };
            updates.push(updatedRow);
          }
        });
        api.applyTransaction({ update: updates });
      }
    } catch (error: any) {
      message.error(`${t('common.dataGrid.updateFailed')}: ${error.message}`);
    } finally {
      setLoading(false);
      setColumnEditMode(null);
    }
  }, [columnEditMode, columns, tableName, dbType, connectionId, database, executeQuery]);

  const cancelColumnEdit = useCallback(() => {
    if (!columnEditMode) return;

    const { column, originalValues } = columnEditMode;
    const api = gridApiRef.current;
    if (!api) return;

    const reverts: RowData[] = [];
    api.forEachNode((node: any) => {
      if (node.data) {
        const originalValue = originalValues.get(node.data.__row_id__);
        reverts.push({ ...node.data, [column]: originalValue });
      }
    });

    api.applyTransaction({ update: reverts });
    setColumnEditMode(null);
  }, [columnEditMode]);

  const startRangeEdit = useCallback((range: { startRow: number; endRow: number; startCol: number; endCol: number }, initialValue: string = '') => {
    const api = gridApiRef.current;
    if (!api) return;
    if (range.startCol !== range.endCol) return;

    const allColumns = api.getColumnDefs();
    if (!allColumns) return;
    const visibleCols = allColumns.filter((c: any) => !c.hide && c.field !== '__status__');
    const colDef = visibleCols[range.startCol] as ColDef | undefined;
    if (!colDef) return;
    const column = colDef.field as string;
    if (!column) return;

    const minRow = Math.min(range.startRow, range.endRow);
    const maxRow = Math.max(range.startRow, range.endRow);

    const originalValues = new Map<string, any>();
    for (let i = minRow; i <= maxRow; i++) {
      const node = api.getDisplayedRowAtIndex(i);
      if (node?.data) {
        originalValues.set(node.data.__row_id__, node.data[column]);
      }
    }

    setRangeEditMode({ column, startRow: minRow, endRow: maxRow, value: initialValue, originalValues });

    if (initialValue !== '') {
      const updates: RowData[] = [];
      for (let i = minRow; i <= maxRow; i++) {
        const node = api.getDisplayedRowAtIndex(i);
        if (node?.data) {
          updates.push({ ...node.data, [column]: initialValue || null });
        }
      }
      if (updates.length > 0) {
        api.applyTransaction({ update: updates });
      }
    }

    setTimeout(() => {
      rangeEditInputRef.current?.focus();
    }, 0);
  }, []);

  const updateRangeEditValue = useCallback((newValue: string) => {
    setRangeEditMode((prev) => {
      if (!prev) return null;

      const api = gridApiRef.current;
      if (api) {
        const updates: RowData[] = [];
        for (let i = prev.startRow; i <= prev.endRow; i++) {
          const node = api.getDisplayedRowAtIndex(i);
          if (node?.data) {
            updates.push({ ...node.data, [prev.column]: newValue || null });
          }
        }
        if (updates.length > 0) {
          api.applyTransaction({ update: updates });
        }
      }

      return { ...prev, value: newValue };
    });
  }, []);

  const commitRangeEdit = useCallback(async () => {
    const current = rangeEditModeRef.current;
    if (!current || !tableName) return;

    const { column, value, originalValues, startRow, endRow } = current;
    const api = gridApiRef.current;
    if (!api) return;

    const pkCol = columns.find((col) => col.column_key === 'PRI');
    if (!pkCol) {
      message.warning(t('common.tableHasNoPrimaryKeyCannotUpdate'));
      setRangeEditMode(null);
      return;
    }

    try {
      setLoading(true);
      let successCount = 0;
      let errorMessage = '';
      const valueStr = value === '' || value === null ? 'NULL' : escapeSqlValue(value);

      const rowsToUpdate: { rowId: string; pkValue: any }[] = [];
      for (let i = startRow; i <= endRow; i++) {
        const node = api.getDisplayedRowAtIndex(i);
        if (!node?.data || node.data.__status__ === 'new') continue;
        const originalValue = originalValues.get(node.data.__row_id__);
        if (originalValue !== value) {
          rowsToUpdate.push({
            rowId: node.data.__row_id__,
            pkValue: node.data[pkCol.column_name],
          });
        }
      }

      for (const { pkValue } of rowsToUpdate) {
        const updateSQL = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${escapeSqlIdentifier(column, dbType)} = ${valueStr} WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(pkValue)}`;
        setLastDmlSql(updateSQL);

        const result = await executeQuery(connectionId, updateSQL, database || '');
        if (result.error) {
          errorMessage = result.error;
          break;
        }
        successCount++;
      }

      if (errorMessage) {
        message.error(`${t('common.dataGrid.updateFailed')}: ${errorMessage}`);
        const reverts: RowData[] = [];
        for (let i = startRow; i <= endRow; i++) {
          const node = api.getDisplayedRowAtIndex(i);
          if (node?.data) {
            const originalValue = originalValues.get(node.data.__row_id__);
            reverts.push({ ...node.data, [column]: originalValue });
          }
        }
        api.applyTransaction({ update: reverts });
      } else {
        message.success(`${t('common.dataGrid.updateSuccess')} ${successCount} ${t('common.rows')}`);
        const updates: RowData[] = [];
        for (let i = startRow; i <= endRow; i++) {
          const node = api.getDisplayedRowAtIndex(i);
          if (node?.data) {
            const updatedRow = {
              ...node.data,
              __original_data__: { ...(node.data.__original_data__ || {}), [column]: value || null },
              __status__: node.data.__status__ === 'new' ? 'new' : undefined,
            };
            updates.push(updatedRow);
          }
        }
        api.applyTransaction({ update: updates });
      }
    } catch (error: any) {
      message.error(`${t('common.dataGrid.updateFailed')}: ${error.message}`);
    } finally {
      setLoading(false);
      setRangeEditMode(null);
    }
  }, [columns, tableName, dbType, connectionId, database, executeQuery]);

  const cancelRangeEdit = useCallback(() => {
    const current = rangeEditModeRef.current;
    if (!current) return;

    const { column, originalValues, startRow, endRow } = current;
    const api = gridApiRef.current;
    if (!api) return;

    const reverts: RowData[] = [];
    for (let i = startRow; i <= endRow; i++) {
      const node = api.getDisplayedRowAtIndex(i);
      if (node?.data) {
        const originalValue = originalValues.get(node.data.__row_id__);
        reverts.push({ ...node.data, [column]: originalValue });
      }
    }

    api.applyTransaction({ update: reverts });
    setRangeEditMode(null);
  }, []);

  // 性能优化：计算列定义的 useMemo
  const columnDefs = useMemo(() => {
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
      // +40px 为排序图标(14) + 筛选图标(14) + 间距(8) 预留空间
      const autoWidth = Math.max(80, Math.min(300, contentWidth * 8 + 30 + 40));
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
        minWidth: 80,
        maxWidth: 300,
        width: userColumnWidthsRef.current.get(col.column_name) ?? autoWidth,
        editable: true,
        cellEditor,
        headerTooltip: col.data_type + nullableInfo + commentInfo,
        headerComponent: 'columnFilterHeader',
        headerComponentParams: {
          rowData,
          isSelected: selectedColumn === col.column_name,
          onColumnSelect: (field: string) => {
            // 如果正在列编辑，先提交当前编辑
            if (columnEditMode) {
              commitColumnEdit();
            }
            setSelectedColumn(field);
          },
        },
        cellClass: (params: any) => {
          const classes: string[] = [];
          if (params.value === null) classes.push('null-cell');
          if (
            params.data?.__status__ === 'modified' &&
            params.data?.__original_data__?.[col.column_name] !== params.value
          ) {
            classes.push('modified-cell');
          }
          if (selectedColumn === col.column_name) {
            classes.push('column-selected');
          }
          const inRange = (range: { startRow: number; endRow: number; startCol: number; endCol: number }) => {
            const rowIndex = params.rowIndex;
            const allColumns = params.api.getColumnDefs();
            const visibleCols = allColumns.filter((c: any) => !c.hide && c.field !== '__status__');
            const colIndex = visibleCols.findIndex((c: any) => c.field === col.column_name);
            if (colIndex < 0 || rowIndex < 0) return false;
            const minRow = Math.min(range.startRow, range.endRow);
            const maxRow = Math.max(range.startRow, range.endRow);
            const minCol = Math.min(range.startCol, range.endCol);
            const maxCol = Math.max(range.startCol, range.endCol);
            return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
          };
          const inRangeEdge = (range: { startRow: number; endRow: number; startCol: number; endCol: number }) => {
            const rowIndex = params.rowIndex;
            const allColumns = params.api.getColumnDefs();
            const visibleCols = allColumns.filter((c: any) => !c.hide && c.field !== '__status__');
            const colIndex = visibleCols.findIndex((c: any) => c.field === col.column_name);
            if (colIndex < 0 || rowIndex < 0) return null;
            const minRow = Math.min(range.startRow, range.endRow);
            const maxRow = Math.max(range.startRow, range.endRow);
            const minCol = Math.min(range.startCol, range.endCol);
            const maxCol = Math.max(range.startCol, range.endCol);
            if (!(rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol)) return null;
            const edges: string[] = [];
            if (rowIndex === minRow) edges.push('drag-selected-range-top');
            if (rowIndex === maxRow) edges.push('drag-selected-range-bottom');
            if (colIndex === minCol) edges.push('drag-selected-range-left');
            if (colIndex === maxCol) edges.push('drag-selected-range-right');
            return edges;
          };
          const curDragRange = dragSelectRangeRef.current;
          if (curDragRange?.active && inRange(curDragRange)) {
            classes.push('drag-selected');
            const edges = inRangeEdge(curDragRange);
            if (edges) classes.push(...edges);
          }
          const curCellRange = cellSelectionRangeRef.current;
          if (curCellRange && inRange(curCellRange)) {
            classes.push('drag-selected');
            const edges = inRangeEdge(curCellRange);
            if (edges) classes.push(...edges);
          }
          return classes.length > 0 ? classes.join(' ') : undefined;
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

    return [statusColumn, ...dataColumns];
  }, [columns, colWidths, hiddenColumns, selectedColumn, columnEditMode, commitColumnEdit, dragSelectRange, cellSelectionRange]);

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
        const result = await executeQuery(connectionId, query, database || '');
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
    const gridContainer = gridContainerRef.current;
    if (!gridContainer) return;

    const resolveCell = (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return { cell: null as HTMLElement | null, row: null as HTMLElement | null };
      const cell = (el as HTMLElement).closest('.ag-cell') as HTMLElement | null;
      const row = cell ? cell.closest('.ag-row') as HTMLElement | null : null;
      return { cell, row };
    };

    const getVisibleCols = () => {
      const api = gridApiRef.current;
      if (!api) return [] as any[];
      const allColumns = api.getColumnDefs();
      if (!allColumns) return [] as any[];
      return allColumns.filter((c: any) => !c.hide && c.field !== '__status__');
    };

    type StartInfo = {
      rowIndex: number;
      colIndex: number;
      isStatusColumn: boolean;
      startX: number;
      startY: number;
    };

    let startInfo: StartInfo | null = null;
    const DRAG_THRESHOLD = 5;
    let lastDragRange: typeof dragSelectRange = null;
    let moveHandler: ((e: PointerEvent) => void) | null = null;
    let upHandler: ((e: PointerEvent) => void) | null = null;
    let cancelHandler: ((e: PointerEvent) => void) | null = null;

    const cleanupDragListeners = () => {
      if (moveHandler) document.removeEventListener('pointermove', moveHandler);
      if (upHandler) document.removeEventListener('pointerup', upHandler);
      if (cancelHandler) document.removeEventListener('pointercancel', cancelHandler);
      moveHandler = null;
      upHandler = null;
      cancelHandler = null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (columnEditModeRef.current || rangeEditModeRef.current) return;

      const target = e.target as HTMLElement;
      if (target.closest('.ag-header-cell')) return;
      if (target.closest('input, textarea, select, button, .ag-popup, .ag-panel')) return;

      const { cell, row } = resolveCell(e.clientX, e.clientY);
      if (!row) return;

      const rowIndex = parseInt(row.getAttribute('row-index') || '-1', 10);
      if (rowIndex < 0) return;

      const visibleCols = getVisibleCols();
      let colIndex = -1;
      let isStatusColumn = false;
      if (cell) {
        const colId = cell.getAttribute('col-id');
        isStatusColumn = colId === '__status__';
        if (!isStatusColumn) {
          colIndex = visibleCols.findIndex((c: any) => c.field === colId || c.colId === colId);
        }
      }

      startInfo = { rowIndex, colIndex, isStatusColumn, startX: e.clientX, startY: e.clientY };
      lastDragRange = null;
      isDraggingRef.current = false;
      dragStartCellRef.current = { rowIndex, colIndex, isStatusColumn };

      setCellSelectionRange(null);
      cellSelectionRangeRef.current = null;
      dragSelectRangeRef.current = null;
      setDragSelectRange(null);

      const api = gridApiRef.current;
      if (api) {
        api.deselectAll();
        const node = api.getDisplayedRowAtIndex(rowIndex);
        if (node) node.setSelected(true);
      }

      const handleMove = (me: PointerEvent) => {
        if (!startInfo) return;
        const dx = Math.abs(me.clientX - startInfo.startX);
        const dy = Math.abs(me.clientY - startInfo.startY);

        if (!isDraggingRef.current) {
          if (dx <= DRAG_THRESHOLD && dy <= DRAG_THRESHOLD) return;
          isDraggingRef.current = true;
        }

        me.preventDefault();

        const api = gridApiRef.current;
        if (!api) return;

        const visCols = getVisibleCols();
        const maxColIndex = Math.max(0, visCols.length - 1);
        const maxRowIndex = Math.max(0, api.getDisplayedRowCount() - 1);

        const { cell: curCell, row: curRow } = resolveCell(me.clientX, me.clientY);

        let curRowIndex = curRow ? parseInt(curRow.getAttribute('row-index') || '-1', 10) : -1;
        let curColIndex = -1;
        if (curCell) {
          const colId = curCell.getAttribute('col-id');
          if (colId !== '__status__') {
            curColIndex = visCols.findIndex((c: any) => c.field === colId || c.colId === colId);
          }
        }

        if (curRowIndex < 0) {
          curRowIndex = lastDragRange?.endRow ?? startInfo.rowIndex;
          const rect = gridContainer.getBoundingClientRect();
          if (me.clientY < rect.top) curRowIndex = 0;
          else if (me.clientY > rect.bottom) curRowIndex = maxRowIndex;
        }
        curRowIndex = Math.max(0, Math.min(maxRowIndex, curRowIndex));

        if (curColIndex < 0) {
          curColIndex = lastDragRange?.endCol ?? Math.max(0, startInfo.colIndex);
        }
        curColIndex = Math.max(0, Math.min(maxColIndex, curColIndex));

        const isRowSelect = startInfo.isStatusColumn || startInfo.colIndex === -1;
        const endRow = curRowIndex;
        const endCol = isRowSelect ? maxColIndex : curColIndex;
        const startCol = isRowSelect ? 0 : Math.max(0, startInfo.colIndex);

        lastDragRange = {
          startRow: startInfo.rowIndex,
          endRow,
          startCol,
          endCol,
          active: true,
        };
        dragSelectRangeRef.current = lastDragRange;
        setDragSelectRange(lastDragRange);
        cellSelectionRangeRef.current = null;
        setCellSelectionRange(null);

        const minRow = Math.min(startInfo.rowIndex, endRow);
        const maxRow = Math.max(startInfo.rowIndex, endRow);
        api.deselectAll();
        for (let i = minRow; i <= maxRow; i++) {
          const node = api.getDisplayedRowAtIndex(i);
          if (node) node.setSelected(true);
        }
        api.redrawRows();
      };

      const handleUp = () => {
        cleanupDragListeners();
        if (!startInfo) return;

        if (isDraggingRef.current && lastDragRange?.active) {
          const range = {
            startRow: lastDragRange.startRow,
            endRow: lastDragRange.endRow,
            startCol: lastDragRange.startCol,
            endCol: lastDragRange.endCol,
          };
          cellSelectionRangeRef.current = range;
          setCellSelectionRange(range);

          const minRow = Math.min(range.startRow, range.endRow);
          const maxRow = Math.max(range.startRow, range.endRow);
          const api = gridApiRef.current;
          if (api) {
            api.deselectAll();
            for (let i = minRow; i <= maxRow; i++) {
              const node = api.getDisplayedRowAtIndex(i);
              if (node) node.setSelected(true);
            }
            api.redrawRows();
          }
        }

        isDraggingRef.current = false;
        dragStartCellRef.current = null;
        startInfo = null;
        dragSelectRangeRef.current = null;
        setDragSelectRange(null);
        lastDragRange = null;
      };

      const handleCancel = () => {
        cleanupDragListeners();
        isDraggingRef.current = false;
        dragStartCellRef.current = null;
        startInfo = null;
        lastDragRange = null;
        dragSelectRangeRef.current = null;
        setDragSelectRange(null);
      };

      moveHandler = handleMove;
      upHandler = handleUp;
      cancelHandler = handleCancel;

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleCancel);
    };

    gridContainer.addEventListener('pointerdown', handlePointerDown);

    return () => {
      gridContainer.removeEventListener('pointerdown', handlePointerDown);
      cleanupDragListeners();
    };
  }, [hasEverLoaded]);

  // Delete 键立即删除选中行
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // 范围批量编辑模式：处理输入
      if (rangeEditMode) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelRangeEdit();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          commitRangeEdit();
          return;
        }
        if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          commitRangeEdit();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          updateRangeEditValue(rangeEditMode.value.slice(0, -1));
          return;
        }
        if (e.key === 'Delete') {
          e.preventDefault();
          updateRangeEditValue('');
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          updateRangeEditValue(rangeEditMode.value + e.key);
          return;
        }
        return;
      }

      // 列批量编辑模式：处理输入
      if (columnEditMode) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelColumnEdit();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          commitColumnEdit();
          return;
        }
        if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          commitColumnEdit();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          updateColumnEditValue(columnEditMode.value.slice(0, -1));
          return;
        }
        if (e.key === 'Delete') {
          e.preventDefault();
          updateColumnEditValue('');
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          updateColumnEditValue(columnEditMode.value + e.key);
          return;
        }
        return;
      }

      // 有矩形选区：按任意字符键进入范围编辑
      if (cellSelectionRange && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
          return;
        e.preventDefault();
        startRangeEdit(cellSelectionRange, e.key);
        return;
      }

      // 选中列但未进入编辑模式：按任意字符键进入列编辑
      if (selectedColumn && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
          return;
        e.preventDefault();
        startColumnEdit(selectedColumn, e.key);
        return;
      }

      // 非列编辑模式：Delete 删除选中行
      if (e.key !== 'Delete') return;

      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return;
      const api = gridApiRef.current;
      if (!api) return;
      const selectedToDelete = api.getSelectedRows();
      if (selectedToDelete.length === 0) return;

      const pkCol = columns.find((col) => col.column_key === 'PRI');
      if (!pkCol && selectedToDelete.some((row) => row.__status__ !== 'new')) {
        message.warning(t('common.tableHasNoPrimaryKeyCannotDeleteExistingRows'));
        return;
      }
      e.preventDefault();

      try {
        setLoading(true);
        let successCount = 0;
        let errorMessage = '';

        for (const row of selectedToDelete) {
          if (row.__status__ === 'new') {
            pendingNewRowsRef.current.delete(row.__row_id__ || '');
            setRowData((prev) => prev.filter((r) => r.__row_id__ !== row.__row_id__));
            successCount++;
            continue;
          }

          const pkValue = row[pkCol!.column_name];
          const deleteSQL = `DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(pkCol!.column_name, dbType)} = ${escapeSqlValue(pkValue)}`;
          setLastDmlSql(deleteSQL);
          const result = await executeQuery(connectionId, deleteSQL, database || '');

          if (result.error) {
            errorMessage = result.error;
            break;
          }
          successCount++;
        }

        if (errorMessage) {
          message.error(`${t('common.dataGrid.deleteFailed')}: ${errorMessage}`);
        } else {
          message.success(`${t('common.dataGrid.deleteSuccess')} ${successCount} ${t('common.rows')}`);
          loadData();
          loadCount(whereClause);
        }
      } catch (error: any) {
        message.error(`${t('common.dataGrid.deleteFailed')}: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [columns, tableName, dbType, connectionId, database, executeQuery, loadData, loadCount, whereClause, columnEditMode, cancelColumnEdit, commitColumnEdit, updateColumnEditValue, selectedColumn, startColumnEdit, cancelRangeEdit, commitRangeEdit, updateRangeEditValue, cellSelectionRange, startRangeEdit]);

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
      const value = event.value === null || event.value === undefined ? '' : String(event.value);
      setTextEditModal({ open: true, field, value, rowId: event.data.__row_id__ || '' });
    },
    [columns]
  );

  const pendingNewRowsRef = useRef<Set<string>>(new Set());

  const onCellValueChanged = useCallback(async (event: any) => {
    if (event.newValue === event.oldValue) return;
    
    const field = event.colDef.field;
    if (!field || field.startsWith('__')) return;
    
    const updatedRow = { ...event.data };
    
    // 新行：只更新本地状态，暂存待插入
    if (updatedRow.__status__ === 'new') {
      gridApiRef.current?.applyTransaction({ update: [updatedRow] });
      pendingNewRowsRef.current.add(updatedRow.__row_id__);
      return;
    }
    
    // 现有行：立即执行 UPDATE
    const pkCol = columns.find((col) => col.column_key === 'PRI');
    if (!pkCol) {
      message.warning(t('common.tableHasNoPrimaryKeyCannotUpdate'));
      return;
    }
    
    const pkValue = updatedRow[pkCol.column_name];
    const valueStr = event.newValue === null || event.newValue === '' 
      ? 'NULL' 
      : escapeSqlValue(event.newValue);
    const updateSQL = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${escapeSqlIdentifier(field, dbType)} = ${valueStr} WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(pkValue)}`;
    setLastDmlSql(updateSQL);
    
    try {
      const result = await executeQuery(connectionId, updateSQL, database || '');
      if (result.error) {
        message.error(`${t('common.dataGrid.updateFailed')}: ${result.error}`);
        // 回滚单元格
        const revertedRow = { ...event.data, [field]: event.oldValue };
        gridApiRef.current?.applyTransaction({ update: [revertedRow] });
        return;
      }
      
      // 成功：更新 original_data
      const newOriginalData = { ...(updatedRow.__original_data__ || {}), [field]: event.newValue };
      updatedRow.__original_data__ = newOriginalData;
      
      // 检查是否还有其他字段被修改
      const hasOtherModifications = columns.some((col) => {
        const colName = col.column_name;
        if (colName === pkCol.column_name) return false;
        return updatedRow[colName] !== newOriginalData[colName];
      });
      
      if (!hasOtherModifications) {
        updatedRow.__status__ = undefined;
      } else {
        updatedRow.__status__ = 'modified';
      }
      
      gridApiRef.current?.applyTransaction({ update: [updatedRow] });
      
      message.success(`${t('common.dataGrid.updateSuccess')} 1 ${t('common.rows')}`);
    } catch (error: any) {
      message.error(`${t('common.dataGrid.updateFailed')}: ${error.message}`);
      const revertedRow = { ...event.data, [field]: event.oldValue };
      gridApiRef.current?.applyTransaction({ update: [revertedRow] });
    }
  }, [columns, tableName, dbType, connectionId, database, executeQuery]);

  // === 列批量编辑功能 ===
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
          message.success(t('common.rowDataCopiedToClipboard'));
          break;
        case 'delete-row':
          {
            const pkCol = columns.find((col) => col.column_key === 'PRI');
            if (!pkCol && row.__status__ !== 'new') {
              message.warning(t('common.tableHasNoPrimaryKeyCannotDeleteSingleRow'));
              return;
            }
            Modal.confirm({
              title: t('common.confirmDelete'),
              content: t('common.confirmDeleteSelectedRow'),
              okText: t('common.delete'),
              okType: 'danger',
              cancelText: t('common.cancel'),
              onOk: async () => {
                try {
                  if (row.__status__ === 'new') {
                    pendingNewRowsRef.current.delete(row.__row_id__ || '');
                    setRowData((prev) => prev.filter((r) => r.__row_id__ !== row.__row_id__));
                    message.success(`${t('common.dataGrid.deleteSuccess')} 1 ${t('common.rows')}`);
                    return;
                  }

                  const pkValue = row[pkCol!.column_name];
                  const deleteSQL = `DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(pkCol!.column_name, dbType)} = ${escapeSqlValue(pkValue)}`;
                  setLastDmlSql(deleteSQL);
                  const result = await executeQuery(connectionId, deleteSQL, database || '');

                  if (result.error) {
                    message.error(`${t('common.dataGrid.deleteFailed')}: ${result.error}`);
                  } else {
                    message.success(`${t('common.dataGrid.deleteSuccess')} 1 ${t('common.rows')}`);
                    loadData();
                    loadCount(whereClause);
                  }
                } catch (error: any) {
                  message.error(`${t('common.dataGrid.deleteFailed')}: ${error.message}`);
                }
              },
            });
          }
          break;

        case 'copy-select':
          const selectedRows = gridApiRef.current?.getSelectedRows() || [];
          if (selectedRows.length === 0) {
            message.warning(t('common.noRowsSelected'));
            return;
          }
          navigator.clipboard.writeText(JSON.stringify(selectedRows, null, 2));
          message.success(
            `${t('common.copyTable.copied')} ${selectedRows.length} ${t('common.rowsToClipboard')}`
          );
          break;
        case 'delete-select':
          {
            const selectedToDelete = gridApiRef.current?.getSelectedRows() || [];
            if (selectedToDelete.length === 0) {
              message.warning(t('common.noRowsSelected'));
              return;
            }
            Modal.confirm({
              title: t('common.confirmDelete'),
              content: t('common.confirmDeleteSelectedRows', { count: selectedToDelete.length }),
              okText: t('common.delete'),
              okType: 'danger',
              cancelText: t('common.cancel'),
              onOk: async () => {
                try {
                  setLoading(true);
                  let successCount = 0;
                  let errorMessage = '';

                  for (const row of selectedToDelete) {
                    if (row.__status__ === 'new') {
                      pendingNewRowsRef.current.delete(row.__row_id__ || '');
                      setRowData((prev) => prev.filter((r) => r.__row_id__ !== row.__row_id__));
                      successCount++;
                      continue;
                    }

                    const pkCol = columns.find((col) => col.column_key === 'PRI');
                    if (!pkCol) {
                      errorMessage = t('common.tableHasNoPrimaryKeyCannotDelete');
                      break;
                    }

                    const pkValue = row[pkCol.column_name];
                    const deleteSQL = `DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(pkValue)}`;
                    setLastDmlSql(deleteSQL);
                    const result = await executeQuery(connectionId, deleteSQL, database || '');

                    if (result.error) {
                      errorMessage = result.error;
                      break;
                    }
                    successCount++;
                  }

                  if (errorMessage) {
                    message.error(`${t('common.dataGrid.deleteFailed')}: ${errorMessage}`);
                  } else {
                    message.success(`${t('common.dataGrid.deleteSuccess')} ${successCount} ${t('common.rows')}`);
                    loadData();
                    loadCount(whereClause);
                  }
                } catch (error: any) {
                  message.error(`${t('common.dataGrid.deleteFailed')}: ${error.message}`);
                } finally {
                  setLoading(false);
                }
              },
            });
          }
          break;
      }
    },
    [contextMenu.rowData, columns, closeContextMenu]
  );

  const handleAddRow = useCallback(() => {
    const newRowId = `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newRow: RowData = {
      __row_id__: newRowId,
      __status__: 'new',
      __original_data__: {},
    };
    columns.forEach((col) => {
      newRow[col.column_name] = null;
    });

    setRowData((prev) => [...prev, newRow]);
    pendingNewRowsRef.current.add(newRowId);

    // 滚动到新行
    setTimeout(() => {
      gridApiRef.current?.ensureIndexVisible(rowData.length, 'bottom');
    }, 50);
  }, [columns, rowData.length]);

  const handleDeleteRows = useCallback(async () => {
    if (selectedRows.length === 0) {
      message.warning(t('common.pleaseSelectRowsToDelete'));
      return;
    }

    const pkCol = columns.find((col) => col.column_key === 'PRI');
    if (!pkCol && selectedRows.some((row) => row.__status__ !== 'new')) {
      message.warning(t('common.tableHasNoPrimaryKeyCannotDelete'));
      return;
    }

    try {
      setLoading(true);
      let successCount = 0;
      let errorMessage = '';

      for (const row of selectedRows) {
        if (row.__status__ === 'new') {
          // 新行直接从本地移除
          pendingNewRowsRef.current.delete(row.__row_id__ || '');
          setRowData((prev) => prev.filter((r) => r.__row_id__ !== row.__row_id__));
          successCount++;
          continue;
        }

        const pkValue = row[pkCol!.column_name];
        const deleteSQL = `DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(pkCol!.column_name, dbType)} = ${escapeSqlValue(pkValue)}`;
        setLastDmlSql(deleteSQL);
        const result = await executeQuery(connectionId, deleteSQL, database || '');

        if (result.error) {
          errorMessage = result.error;
          break;
        }

        successCount++;
      }

      if (errorMessage) {
        message.error(`${t('common.dataGrid.deleteFailed')}: ${errorMessage}`);
      } else {
        message.success(`${t('common.dataGrid.deleteSuccess')} ${successCount} ${t('common.rows')}`);
        loadData();
        loadCount(whereClause);
      }
    } catch (error: any) {
      console.error('Delete error:', error);
      message.error(`${t('common.dataGrid.deleteFailed')}: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }, [selectedRows, columns, tableName, dbType, connectionId, database, executeQuery, loadData, loadCount, whereClause]);

  const exportToCSV = useCallback(() => {
    if (rowData.length === 0) {
      message.warning(t('common.noDataToExport'));
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

    message.success(t('common.importExport.exportSuccess'));
  }, [rowData, columns, tableName]);

  const displayedSql = lastDmlSql || currentSql;
  
  const copySql = useCallback(() => {
    navigator.clipboard.writeText(displayedSql);
    message.success(t('common.sqlCopied'));
  }, [displayedSql]);

  const handleAutoSizeColumns = useCallback(() => {
    if (gridApiRef.current) {
      gridApiRef.current.sizeColumnsToFit();
      message.success(t('common.columnWidthsAutoAdjusted'));
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

  // 记录用户手动调整的列宽
  const onColumnResized = useCallback((event: any) => {
    if (event.finished && event.column) {
      const colId = event.column.getColId();
      const newWidth = event.column.getActualWidth();
      if (colId && newWidth) {
        userColumnWidthsRef.current.set(colId, newWidth);
      }
    }
  }, []);

  // 提交待插入的新行
  const commitPendingNewRows = useCallback(async () => {
    if (pendingNewRowsRef.current.size === 0) return;

    const rowsToInsert: RowData[] = [];

    for (const rowId of Array.from(pendingNewRowsRef.current)) {
      const node = gridApiRef.current?.getRowNode(rowId);
      if (!node) {
        pendingNewRowsRef.current.delete(rowId);
        continue;
      }

      const row = node.data;

      // 检查行是否有非空值
      const hasValues = columns.some((col) => {
        const val = row[col.column_name];
        return val !== null && val !== undefined && val !== '';
      });

      if (!hasValues) {
        // 移除空的新行
        gridApiRef.current?.applyTransaction({ remove: [row] });
        pendingNewRowsRef.current.delete(rowId);
        continue;
      }

      rowsToInsert.push(row);
    }

    if (rowsToInsert.length === 0) return;

    // 插入新行
    for (const row of rowsToInsert) {
      try {
        const columns_list = Object.keys(row).filter(
          (key) => !key.startsWith('__') && row[key] !== undefined
        );
        const values_list = columns_list.map((col) =>
          row[col] === null || row[col] === '' ? 'NULL' : escapeSqlValue(row[col])
        );

        if (columns_list.length === 0) continue;

        const insertSQL = `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${columns_list.map((col) => escapeSqlIdentifier(col, dbType)).join(', ')}) VALUES (${values_list.join(', ')})`;
        setLastDmlSql(insertSQL);
        const result = await executeQuery(connectionId, insertSQL, database || '');

        if (result.error) {
          message.error(`${t('common.dataGrid.insertFailed')}: ${result.error}`);
          // 保留新行，让用户修正
        } else {
          pendingNewRowsRef.current.delete(row.__row_id__ || '');
          message.success(`${t('common.dataGrid.insertSuccess')} 1 ${t('common.rows')}`);
        }
      } catch (error: any) {
        message.error(`${t('common.dataGrid.insertFailed')}: ${error.message}`);
      }
    }

    // 如果有成功插入的，刷新数据
    if (rowsToInsert.some((r) => !pendingNewRowsRef.current.has(r.__row_id__ || ''))) {
      loadData();
      loadCount(whereClause);
    }
  }, [columns, tableName, dbType, connectionId, database, executeQuery, loadData, loadCount, whereClause]);

  // 当焦点离开新行时，尝试自动插入
  const onCellFocused = useCallback(async (event: any) => {
    if (pendingNewRowsRef.current.size === 0) return;

    const focusedRowId = event.rowIndex != null
      ? gridApiRef.current?.getDisplayedRowAtIndex(event.rowIndex)?.data?.__row_id__
      : null;

    // 只有焦点真正离开了新行才提交
    const hasLeftNewRow = Array.from(pendingNewRowsRef.current).some(
      (rowId) => rowId !== focusedRowId
    );

    if (hasLeftNewRow) {
      await commitPendingNewRows();
    }
  }, [commitPendingNewRows]);

  // 单元格复制粘贴功能
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const api = gridApiRef.current;
      if (!api) return;

      // 如果有列被选中，复制整列数据
      if (selectedColumn) {
        const allRows: string[] = [];
        api.forEachNode((node: any) => {
          const value = node.data?.[selectedColumn];
          allRows.push(value === null || value === undefined ? 'NULL' : String(value));
        });

        const text = allRows.join('\n');
        e.clipboardData?.setData('text/plain', text);
        e.preventDefault();
        message.success(`${t('common.copyTable.copied')} ${allRows.length} ${t('common.rowsFromColumn')} ${selectedColumn}`);
        return;
      }

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
        message.success(t('common.selectedRowsCopied'));
      }
    };

    const handlePaste = async (e: ClipboardEvent) => {
      if (columnEditModeRef.current || rangeEditModeRef.current || cellSelectionRangeRef.current || selectedColumnRef.current) return;
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

        message.success(t('common.pasteSuccess'));
      } catch (error: any) {
        message.error(`${t('common.pasteFailed')}: ${error.message}`);
      }
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
    };
  }, [columns, selectedColumn]);

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
    background: 'var(--background-toolbar)',
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
      data-testid="data-table"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        // 如果正在列编辑或范围编辑，先提交
        if ((columnEditMode || rangeEditMode) && !target.closest('.ag-header-cell')) {
          if (columnEditMode) {
            commitColumnEdit();
          } else {
            commitRangeEdit();
          }
          return;
        }
        // 点击空白区域（非列头、非单元格）时强制停止编辑、取消选择并提交新行
        if (!target.closest('.ag-header-cell') && !target.closest('.ag-cell')) {
          gridApiRef.current?.stopEditing();
          setSelectedColumn(null);
          cellSelectionRangeRef.current = null;
          dragSelectRangeRef.current = null;
          setCellSelectionRange(null);
          setDragSelectRange(null);
          gridApiRef.current?.deselectAll();
          gridApiRef.current?.refreshCells({ force: true });
          commitPendingNewRows();
        } else if (!target.closest('.ag-header-cell')) {
          // 点击单元格但非列头，只取消列选中
          setSelectedColumn(null);
        }
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
            data-testid="datatable-add-row"
          >
            {t('common.addRowLabel')}
          </Button>
          <Button
            icon={<DeleteOutlined />}
            onClick={handleDeleteRows}
            disabled={selectedRows.length === 0}
            danger
            size="small"
            style={{ height: 20, padding: '0 6px', fontSize: 11 }}
            data-testid="datatable-delete-row"
          >
            {t('common.delete')}
          </Button>

          <Button
            icon={<DownloadOutlined />}
            onClick={exportToCSV}
            disabled={rowData.length === 0}
            size="small"
            style={{ height: 20, padding: '0 6px', fontSize: 11 }}
            data-testid="datatable-export"
          >
            {t('common.export')}
          </Button>

          <Button
            icon={filterPanelOpen ? <UpOutlined /> : <DownOutlined />}
            onClick={toggleFilterPanel}
            type={whereClause ? 'primary' : 'default'}
            size="small"
            style={{ height: 20, padding: '0 6px', fontSize: 11 }}
          >
            {t('common.dataGrid.filter')}
          </Button>

          <Dropdown
            trigger={['click']}
            menu={{
              title: t('common.columnVisibility'),
              items: [
                { key: 'showAll', label: t('common.erDiagram.showAll'), onClick: showAllColumns },
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
              {t('common.columnVisibility')}
            </Button>
          </Dropdown>

          <Tooltip title={t('common.autoSize')}>
            <Button
              icon={<ColumnWidthOutlined />}
              onClick={handleAutoSizeColumns}
              size="small"
              style={{ height: 20, padding: '0 6px', fontSize: 11 }}
            />
          </Tooltip>

          <Input
            placeholder={t('common.quickSearch')}
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
            {totalCount.toLocaleString()} {t('common.rows')}
          </Tag>
          {selectedRows.length > 0 && (
            <Tag color="orange" style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}>
              {selectedRows.length} {t('common.rows')}
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
              message.info(whereClause ? `WHERE: ${whereClause}` : t('common.filterCleared'));
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
              message.info(orderByClause ? `ORDER BY: ${orderByClause}` : t('common.sortCleared'));
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
              {t('common.dataGrid.filterConditions')}
            </span>
            <div style={{ flex: 1 }} />
            <Button
              size="small"
              onClick={() => {
                const sql = buildWhereClause(filterConditions, dbType);
                Modal.info({
                  title: t('common.importExport.sqlPreview'),
                  content: sql ? (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>WHERE {sql}</pre>
                  ) : (
                    t('common.noFilterConditions')
                  ),
                });
              }}
              style={{ fontSize: 11, height: 20 }}
            >
              {t('common.previewSql')}
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
                        placeholder={t('common.fieldPlaceholder')}
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
                          { label: t('common.contains'), value: 'contains' },
                          { label: t('common.notContains'), value: 'notContains' },
                          { label: t('common.equals'), value: 'equals' },
                          { label: t('common.notEquals'), value: 'notEquals' },
                          { label: t('common.startsWith'), value: 'startsWith' },
                          { label: t('common.endsWith'), value: 'endsWith' },
                          { label: t('common.greaterThan'), value: 'greaterThan' },
                          { label: t('common.lessThan'), value: 'lessThan' },
                          { label: t('common.greaterOrEqual'), value: 'greaterOrEqual' },
                          { label: t('common.lessOrEqual'), value: 'lessOrEqual' },
                          { label: t('common.isNull'), value: 'isNull' },
                          { label: t('common.isNotNull'), value: 'isNotNull' },
                          { label: t('common.in'), value: 'in' },
                          { label: t('common.notIn'), value: 'notIn' },
                        ]}
                      />
                      {!['isNull', 'isNotNull'].includes(cond.operator) && (
                        <Input
                          placeholder={t('common.valuePlaceholder')}
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
                        +{t('common.addSibling')}
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
                        +{t('common.addBracket')}
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
              {t('common.clearLabel')}
            </Button>
            <Button
              type="primary"
              size="small"
              onClick={applyFilter}
              style={{ fontSize: 11, height: 20 }}
            >
              {t('common.applyLabel')}
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
            <Spin size="large" description={t('common.erDiagram.loading')} />
          </div>
        )}

        {!loading && rowData.length === 0 && hasEverLoaded ? (
          <Empty description={t('common.noData')} style={{ marginTop: '20%' }} />
        ) : columns.length > 0 ? (
          <div
            ref={gridContainerRef}
            className={`ag-theme-compact ${isDarkMode ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'}`}
            style={{ height: '100%', width: '100%', position: 'relative', userSelect: 'none' }}
            onPaste={(e) => {
              if (rangeEditMode) {
                e.preventDefault();
                e.stopPropagation();
                const pastedText = e.clipboardData.getData('text');
                updateRangeEditValue(pastedText);
              } else if (columnEditMode) {
                e.preventDefault();
                e.stopPropagation();
                const pastedText = e.clipboardData.getData('text');
                updateColumnEditValue(pastedText);
              } else if (cellSelectionRange) {
                e.preventDefault();
                e.stopPropagation();
                const pastedText = e.clipboardData.getData('text');
                startRangeEdit(cellSelectionRange);
                setTimeout(() => {
                  updateRangeEditValue(pastedText);
                }, 0);
              } else if (selectedColumn) {
                e.preventDefault();
                e.stopPropagation();
                const pastedText = e.clipboardData.getData('text');
                startColumnEdit(selectedColumn);
                setTimeout(() => {
                  updateColumnEditValue(pastedText);
                }, 0);
              }
            }}
          >
            <AgGridReact
              key={gridKey}
              onGridReady={onGridReady}
              onColumnResized={onColumnResized}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              components={{ columnFilterHeader: ColumnFilterHeader }}
              getRowId={(params) => params.data.__row_id__}
              onCellValueChanged={onCellValueChanged}
              onCellDoubleClicked={onCellDoubleClicked}
              onCellFocused={onCellFocused}
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
              stopEditingWhenCellsLoseFocus={true}
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
                pinLeft: t('common.pinLeft'),
                pinRight: t('common.pinRight'),
                noPin: t('common.noPin'),
                autoSize: t('common.autoSize'),
                resetColumns: t('common.resetColumns'),
                expandAll: t('common.mainLayout.expandAll'),
                collapseAll: t('common.mainLayout.collapseAll'),
                copyWithHeaders: t('common.copyWithHeaders'),
                copyWithGroupHeaders: t('common.copyWithGroupHeaders'),
                menu: t('common.menu'),
                filter: t('common.dataGrid.filter'),
                filters: t('common.filters'),
                columns: t('common.tableStructure.columns'),
                values: t('common.values'),
                pinColumn: t('common.pinColumn'),
                autoSizeColumn: t('common.autoSizeColumn'),
                resetColumn: t('common.resetColumn'),
                moveColumn: t('common.moveColumn'),
                sortAscending: t('common.sortAscending'),
                sortDescending: t('common.sortDescending'),
                sortUnsort: t('common.sortUnsort'),
                close: t('common.close'),
                loadingOoo: t('common.loadingOoo'),
                noRowsToShow: t('common.noRowsToShow'),
                enabled: t('common.enabled'),
                disabled: t('common.disabled'),
                true: t('common.true'),
                false: t('common.false'),
                contains: t('common.contains'),
                notContains: t('common.notContains'),
                startsWith: t('common.startsWith'),
                endsWith: t('common.endsWith'),
                equals: t('common.equals'),
                notEqual: t('common.notEqual'),
                lessThan: t('common.lessThan'),
                greaterThan: t('common.greaterThan'),
                inRange: t('common.inRange'),
                lessThanOrEqual: t('common.lessThanOrEqual'),
                greaterThanOrEqual: t('common.greaterThanOrEqual'),
                filterOoo: t('common.filterOoo'),
                applyFilter: t('common.applyFilter'),
                clearFilter: t('common.dataGrid.clearFilter'),
                blank: t('common.blank'),
                notBlank: t('common.notBlank'),
                and: t('common.and'),
                or: t('common.or'),
                searchOoo: t('common.searchOoo'),
                selectAll: t('common.selectAll'),
                selectAllFiltered: t('common.selectAllFiltered'),
                addCurrentSelectionToFilter: t('common.addCurrentSelectionToFilter'),
                sum: t('common.dataGrid.sum'),
                min: t('common.dataGrid.min'),
                max: t('common.dataGrid.max'),
                count: t('common.count'),
                avg: t('common.dataGrid.avg'),
                page: t('common.page'),
                pageSize: t('common.pageSize'),
                total: t('common.total'),
                of: t('common.of'),
                nextPage: t('common.nextPage'),
                prevPage: t('common.prevPage'),
                firstPage: t('common.firstPage'),
                lastPage: t('common.lastPage'),
                to: t('common.to'),
                OOO: t('common.OOO'),
                any: t('common.any'),
                condition: t('common.condition'),
                conditions: t('common.conditions'),
                operator: t('common.operator'),
                all: t('common.all'),
                group: t('common.group'),
              }}
            />
            {/* 列/范围批量编辑透明输入框 */}
            {(columnEditMode || rangeEditMode) && (
              <input
                ref={columnEditMode ? columnEditInputRef : rangeEditInputRef}
                value={columnEditMode ? columnEditMode.value : rangeEditMode!.value}
                onChange={(e) => {
                  if (columnEditMode) {
                    updateColumnEditValue(e.target.value);
                  } else {
                    updateRangeEditValue(e.target.value);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => {
                    if (columnEditMode) {
                      commitColumnEdit();
                    } else if (rangeEditMode) {
                      commitRangeEdit();
                    }
                  }, 200);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (columnEditMode) {
                      commitColumnEdit();
                    } else {
                      commitRangeEdit();
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (columnEditMode) {
                      cancelColumnEdit();
                    } else {
                      cancelRangeEdit();
                    }
                  }
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'text',
                  zIndex: 5,
                }}
                autoFocus
              />
            )}
          </div>
        ) : hasEverLoaded ? (
          <Empty description={t('common.noTableStructure')} style={{ marginTop: '20%' }} />
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
            <Spin size="large" description={t('common.erDiagram.loading')} />
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div style={statusBarStyle}>
        <Space size={2}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadData()}
            loading={loading}
            size="small"
            style={{ height: 20, padding: '0 4px', fontSize: 11 }}
            data-testid="datatable-refresh"
          >
            {t('common.refreshLabel')}
          </Button>
          <Button
            icon={<ImportOutlined />}
            onClick={() => setImportWizardOpen(true)}
            size="small"
            style={{ height: 20, padding: '0 4px', fontSize: 11 }}
          >
            {t('common.import')}
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'excel',
                  label: t('common.dataGrid.exportExcelLabel'),
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
                      message.success(t('common.exportedExcel'));
                    } catch (e: any) {
                      message.error(`${t('common.importExport.exportFailed')}: ${e.message}`);
                    }
                  },
                },
                {
                  key: 'csv',
                  label: t('common.exportCsv'),
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
                      message.success(t('common.exportedCsv'));
                    } catch (e: any) {
                      message.error(`${t('common.importExport.exportFailed')}: ${e.message}`);
                    }
                  },
                },
                {
                  key: 'json',
                  label: t('common.exportJson'),
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
                      message.success(t('common.exportedJson'));
                    } catch (e: any) {
                      message.error(`${t('common.importExport.exportFailed')}: ${e.message}`);
                    }
                  },
                },
                { type: 'divider' as const },
                {
                  key: 'txt',
                  label: t('common.exportTxt'),
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
                      message.success(t('common.exportedTxt'));
                    } catch (e: any) {
                      message.error(`${t('common.importExport.exportFailed')}: ${e.message}`);
                    }
                  },
                },
                {
                  key: 'xml',
                  label: t('common.exportXml'),
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
                      message.success(t('common.exportedXml'));
                    } catch (e: any) {
                      message.error(`${t('common.importExport.exportFailed')}: ${e.message}`);
                    }
                  },
                },
                {
                  key: 'markdown',
                  label: t('common.exportMarkdown'),
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
                      message.success(t('common.exportedMarkdown'));
                    } catch (e: any) {
                      message.error(`${t('common.importExport.exportFailed')}: ${e.message}`);
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
              {t('common.export')}
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
          {lastDmlSql && (
            <Tag
              color="blue"
              style={{ margin: 0, fontSize: 10, lineHeight: '14px', height: 16 }}
            >
              DML
            </Tag>
          )}
          <code
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 11,
              color: lastDmlSql ? 'var(--color-primary)' : 'var(--text-secondary)',
              fontFamily: "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace",
              padding: '2px 6px',
              background: 'var(--background-toolbar)',
              borderRadius: 3,
              border: '1px solid var(--border-color)',
            }}
          >
            {displayedSql}
          </code>
          <Tooltip title={t('common.copySql')}>
            <Button
              icon={<CopyOutlined />}
              type="text"
              onClick={copySql}
              size="small"
              style={{ height: 20, padding: '0 4px', fontSize: 11 }}
            >
              {t('common.copy')}
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
              { label: t('common.allRows'), value: 'All' },
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
        title={`${t('common.editField')} ${textEditModal?.field || ''}`}
        open={!!textEditModal?.open}
        onCancel={() => setTextEditModal(null)}
        transitionName=""
        maskTransitionName=""
        onOk={() => {
          if (!textEditModal || !gridApiRef.current) return;
          const { field, rowId } = textEditModal;
          const newValue = textEditModal.value;
          let targetRow: any = null;
          gridApiRef.current.forEachNode((node: any) => {
            if (node.__row_id__ === rowId) {
              targetRow = node.data;
            }
          });
          if (targetRow) {
            const updatedRow = { ...targetRow, [field]: newValue };
            
            // 新行：只更新本地状态
            if (updatedRow.__status__ === 'new') {
              gridApiRef.current.applyTransaction({ update: [updatedRow] });
              pendingNewRowsRef.current.add(updatedRow.__row_id__);
              setTextEditModal(null);
              return;
            }
            
            // 现有行：立即执行 UPDATE
            const pkCol = columns.find((col) => col.column_key === 'PRI');
            if (!pkCol) {
              message.warning(t('common.tableHasNoPrimaryKeyCannotUpdate'));
              setTextEditModal(null);
              return;
            }
            
            const pkValue = updatedRow[pkCol.column_name];
            const valueStr = newValue === null || newValue === ''
              ? 'NULL'
              : escapeSqlValue(newValue);
            const updateSQL = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${escapeSqlIdentifier(field, dbType)} = ${valueStr} WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(pkValue)}`;
            setLastDmlSql(updateSQL);
            
            executeQuery(connectionId, updateSQL, database || '')
              .then((result) => {
                if (result.error) {
                  message.error(`${t('common.dataGrid.updateFailed')}: ${result.error}`);
                  // 回滚
                  const revertedRow = { ...targetRow };
                  gridApiRef.current?.applyTransaction({ update: [revertedRow] });
                } else {
                  // 成功：更新 original_data
                  updatedRow.__original_data__ = { ...(updatedRow.__original_data__ || {}), [field]: newValue };
                  updatedRow.__status__ = undefined;
                  gridApiRef.current?.applyTransaction({ update: [updatedRow] });
                }
              })
              .catch((error: any) => {
                message.error(`${t('common.dataGrid.updateFailed')}: ${error.message}`);
                const revertedRow = { ...targetRow };
                gridApiRef.current?.applyTransaction({ update: [revertedRow] });
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
          placeholder={t('common.enterContent')}
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
              message.warning(
                `${t('common.importCompleted')}: ${t('common.success')} ${result.success_count} ${t('common.rows')}, ${t('common.failed')} ${result.failed_count} ${t('common.rows')}`
              );
            } else {
              message.success(
                `${t('common.importedSuccessfully')} ${result.success_count} ${t('common.dataRows')}`
              );
            }

            // 刷新数据
            loadData();
          } catch (err: any) {
            message.error(`${t('common.importExport.importFailed')}: ${err.message || err}`);
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
              label: t('common.dataGrid.copyRow'),
              icon: <CopyOutlined />,
              onClick: () => handleContextMenuAction('copy-row'),
            },
            {
              key: 'delete-row',
              label: t('common.dataGrid.deleteRow'),
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => handleContextMenuAction('delete-row'),
            },
            { type: 'divider' },
            {
              key: 'copy-select',
              label: t('common.copySelectedRows'),
              icon: <CopyOutlined />,
              onClick: () => handleContextMenuAction('copy-select'),
            },
            {
              key: 'delete-select',
              label: t('common.deleteSelectedRows'),
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
              label: t('common.dataGrid.copyCellValue'),
              icon: <CopyOutlined />,
              onClick: () => {
                navigator.clipboard.writeText(String(cellContextMenu.value ?? 'NULL'));
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
                message.success(t('common.cellValueCopied'));
              },
            },
            {
              key: 'copy-insert',
              label: t('common.dataGrid.copyAsInsert'),
              onClick: () => {
                if (!tableName || !columns.length) {
                  message.warning(t('common.cannotDetermineTableStructure'));
                  setCellContextMenu((prev) => ({ ...prev, visible: false }));
                  return;
                }
                const row = cellContextMenu.rowNode.data;
                const values = columns.map((c) => row[c.column_name] ?? null);
                const colStr = columns
                  .map((c) => escapeSqlIdentifier(c.column_name, dbType))
                  .join(', ');
                const valStr = values.map(escapeSqlValue).join(', ');
                const sql = `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${colStr}) VALUES (${valStr});`;
                navigator.clipboard.writeText(sql);
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
                message.success(t('common.insertStatementCopied'));
              },
            },
            {
              key: 'copy-update',
              label: t('common.dataGrid.copyAsUpdate'),
              disabled: !primaryKey,
              onClick: () => {
                if (!tableName || !primaryKey || !columns.length) {
                  message.warning(t('common.cannotGenerateUpdateStatement'));
                  setCellContextMenu((prev) => ({ ...prev, visible: false }));
                  return;
                }
                const row = cellContextMenu.rowNode.data;
                const pkIdx = columns.findIndex((c) => c.column_name === primaryKey.column_name);
                if (pkIdx < 0) {
                  message.warning(t('common.primaryKeyColumnNotFound'));
                  setCellContextMenu((prev) => ({ ...prev, visible: false }));
                  return;
                }
                const values = columns.map((c) => row[c.column_name] ?? null);
                const setters = columns
                  .map(
                    (c, i) =>
                      `${escapeSqlIdentifier(c.column_name, dbType)} = ${escapeSqlValue(values[i])}`
                  )
                  .filter((_, i) => i !== pkIdx)
                  .join(', ');
                const sql = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${setters} WHERE ${escapeSqlIdentifier(primaryKey.column_name, dbType)} = ${escapeSqlValue(values[pkIdx])};`;
                navigator.clipboard.writeText(sql);
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
                message.success(t('common.updateStatementCopied'));
              },
            },
            { type: 'divider' },
            {
              key: 'set-null',
              label: t('common.setNull'),
              disabled: !primaryKey,
              onClick: () => {
                if (!primaryKey) {
                  message.warning(t('common.primaryKeyRequiredToModifyData'));
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
                
                // 新行：只更新本地状态
                if (updatedRow.__status__ === 'new') {
                  updatedRow[colId] = null;
                  gridApiRef.current?.applyTransaction({ update: [updatedRow] });
                  setCellContextMenu((prev) => ({ ...prev, visible: false }));
                  message.success(`${t('common.set')} ${colId} ${t('common.toNull')}`);
                  return;
                }
                
                // 现有行：立即执行 UPDATE
                const pkCol = columns.find((c) => c.column_key === 'PRI');
                if (!pkCol) {
                  message.warning(t('common.tableHasNoPrimaryKeyCannotUpdate'));
                  setCellContextMenu((prev) => ({ ...prev, visible: false }));
                  return;
                }
                
                const pkValue = updatedRow[pkCol.column_name];
                const updateSQL = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${escapeSqlIdentifier(colId, dbType)} = NULL WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(pkValue)}`;
                setLastDmlSql(updateSQL);
                
                executeQuery(connectionId, updateSQL, database || '')
                  .then((result) => {
                    if (result.error) {
                      message.error(`${t('common.dataGrid.updateFailed')}: ${result.error}`);
                    } else {
                      updatedRow[colId] = null;
                      updatedRow.__original_data__ = { ...(updatedRow.__original_data__ || {}), [colId]: null };
                      updatedRow.__status__ = undefined;
                      gridApiRef.current?.applyTransaction({ update: [updatedRow] });
                      message.success(`${t('common.set')} ${colId} ${t('common.toNull')}`);
                    }
                  })
                  .catch((error: any) => {
                    message.error(`${t('common.dataGrid.updateFailed')}: ${error.message}`);
                  });
                
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
              },
            },
            { type: 'divider' },
            {
              key: 'filter-column',
              label: `${t('common.filterByThisColumn')} (${cellContextMenu.colId})`,
              onClick: () => {
                const colName = cellContextMenu.colId;
                const filterValue = String(cellContextMenu.value ?? '');
                const newFilter = `${colName} = '${filterValue.replace(/'/g, "''")}'`;
                setWhereClause(newFilter);
                setCurrentPage(1);
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
                message.success(`${t('common.filterConditionAdded')}: ${colName} = ${filterValue}`);
              },
            },
            {
              key: 'sort-asc',
              label: `${t('common.sortAscending')} (${cellContextMenu.colId} ↑)`,
              onClick: () => {
                const colName = cellContextMenu.colId;
                setSortModel([{ colId: colName, sort: 'asc' }]);
                setCurrentPage(1);
                setCellContextMenu((prev) => ({ ...prev, visible: false }));
              },
            },
            {
              key: 'sort-desc',
              label: `${t('common.sortDescending')} (${cellContextMenu.colId} ↓)`,
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
