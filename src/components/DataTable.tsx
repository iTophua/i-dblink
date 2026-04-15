import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellRendererParams, GridApi } from 'ag-grid-community';
import { Spin, Empty, Button, Space, message, Modal, Form, Input, theme, Tag, Popconfirm, Select, Pagination } from 'antd';
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
} from '@ant-design/icons';
import { useDatabase } from '../hooks/useApi';
import type { ColumnInfo } from '../types/api';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface RowData {
  [key: string]: any;
  __row_id__?: string;
  __status__?: 'new' | 'modified' | 'deleted';
  __original_data__?: Record<string, any>;  // 保存原始数据用于对比
}

interface DataTableProps {
  connectionId: string;
  tableName: string;
  database?: string;
  pageSize?: number;
  onDirtyChange?: (isDirty: boolean) => void;  // 通知父组件 dirty 状态
}

export function DataTable({ connectionId, tableName, database, pageSize: propPageSize, onDirtyChange }: DataTableProps) {
  const [loading, setLoading] = useState(false);
  const [rowData, setRowData] = useState<RowData[]>([]);
  const [columnDefs, setColumnDefs] = useState<ColDef[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
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

  // 当外部 pageSize 变化时，更新本地状态
  useEffect(() => {
    if (propPageSize !== undefined) {
      setPageSize(propPageSize);
    }
  }, [propPageSize]);

  // 通知父组件 dirty 状态变化
  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';

  const { getColumns, executeQuery } = useDatabase();
  const loadingRef = useRef(false);

  // 稳定的 cellRenderer 函数 - 返回纯文本，使用 CSS 样式化 NULL 值
  const cellRenderer = useCallback((params: ICellRendererParams) => {
    if (params.value === null || params.value === undefined) {
      return 'NULL';
    }
    return String(params.value);
  }, []);

  const buildQuery = useCallback((page: number, size: number, sort?: { colId: string; sort: 'asc' | 'desc' }[]) => {
    const offset = (page - 1) * size;
    const tableRef = database ? `\`${database}\`.\`${tableName}\`` : `\`${tableName}\``;
    let query = `SELECT * FROM ${tableRef}`;
    
    if (sort && sort.length > 0) {
      const orderClauses = sort.map(s => `\`${s.colId}\` ${s.sort.toUpperCase()}`).join(', ');
      query += ` ORDER BY ${orderClauses}`;
    }
    
    query += ` LIMIT ${size} OFFSET ${offset}`;
    return query;
  }, [tableName, database]);

  const loadData = useCallback(async () => {
    if (!connectionId || !tableName || loadingRef.current) return;

    try {
      loadingRef.current = true;
      setLoading(true);

      // 并行执行列信息获取和数据查询
      const query = buildQuery(currentPage, pageSize, sortModel);
      setCurrentSql(query);

      const [colResult, dataResult] = await Promise.all([
        getColumns(connectionId, tableName, database),
        executeQuery(connectionId, query, database),
      ]);

      setColumns(colResult);

      const colDefs: ColDef[] = colResult.map((col: any) => ({
        field: col.column_name,
        headerName: col.column_name,
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 50,
        maxWidth: 250,
        width: 100,
        editable: true,
        headerTooltip: `${col.data_type}${col.is_nullable ? ' | NULL' : ' | NOT NULL'}${col.comment ? ` | ${col.comment}` : ''}`,
        cellRenderer,
        cellClassRules: {
          'null-cell': (params: any) => params.value === null || params.value === undefined,
        },
      }));
      setColumnDefs(colDefs);

      if (dataResult.error) {
        message.error(`加载数据失败：${dataResult.error}`);
        setRowData([]);
      } else {
        const data = dataResult.rows.map((row, index) => {
          const rowData: RowData = {
            __row_id__: `row-${index}`,
            __original_data__: {},
          };
          dataResult.columns.forEach((col, colIndex) => {
            rowData[col] = row[colIndex];
            if (rowData.__original_data__) {
              rowData.__original_data__[col] = row[colIndex];
            }
          });
          return rowData;
        });
        setRowData(data);
        setHasUnsavedChanges(false);
        setPendingChanges({ inserts: [], updates: [], deletes: [] });
      }
    } catch (error: any) {
      console.error('Failed to load table data:', error);
      message.error(`加载数据失败：${error.message || error}`);
      setRowData([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [connectionId, tableName, database, currentPage, pageSize, sortModel]);

  const loadCount = useCallback(async () => {
    try {
      const tableRef = database ? `\`${database}\`.\`${tableName}\`` : `\`${tableName}\``;
      const result = await executeQuery(connectionId, `SELECT COUNT(*) AS cnt FROM ${tableRef}`, database);
      if (!result.error && result.rows.length > 0) {
        setTotalCount(Number(result.rows[0][0]));
      }
    } catch {
    }
  }, [connectionId, tableName, database, executeQuery]);

  useEffect(() => {
    // 切换表/数据库时清除排序状态
    setSortModel([]);
    loadData();
    loadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, tableName, database]);

  useEffect(() => {
    loadData();
    loadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 60,
    maxWidth: 300,
    width: 120,
    cellStyle: { padding: '0 6px' },
  }), []);

  const onCellValueChanged = useCallback((event: any) => {
    if (event.newValue !== event.oldValue) {
      const updatedRow = { ...event.data };

      // 标记为修改状态
      if (!updatedRow.__status__ || updatedRow.__status__ !== 'new') {
        updatedRow.__status__ = 'modified';
      }

      // 使用 AG Grid 的 applyTransaction 进行增量更新
      gridApiRef.current?.applyTransaction({ update: [updatedRow] });

      setHasUnsavedChanges(true);

      // 添加到待更新列表
      setPendingChanges(prev => {
        const updates = prev.updates.filter(r => r.__row_id__ !== updatedRow.__row_id__);
        return {
          ...prev,
          updates: [...updates, updatedRow],
        };
      });
    }
  }, []);

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
        const primaryKey = columns.find(col => col.column_key === 'PRI');
        if (!primaryKey) {
          errorMessage = '该表没有主键，无法删除';
          errorCount++;
          continue;
        }

        const primaryKeyValue = row[primaryKey.column_name];
        const deleteSQL = `DELETE FROM \`${tableName}\` WHERE \`${primaryKey.column_name}\` = '${primaryKeyValue}'`;
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
          const columns_list = Object.keys(row).filter(key => 
            !key.startsWith('__') && row[key] !== undefined
          );
          const values_list = columns_list.map(col =>
            row[col] === null || row[col] === '' ? 'NULL' : `'${String(row[col]).replace(/'/g, "''")}'`
          );

          if (columns_list.length === 0) continue;

          const insertSQL = `INSERT INTO \`${tableName}\` (${columns_list.join(', ')}) VALUES (${values_list.join(', ')})`;
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
          const primaryKey = columns.find(col => col.column_key === 'PRI');
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
            if (colName === primaryKey.column_name) continue;  // 跳过主键
            
            const newValue = row[colName];
            const oldValue = originalData[colName];
            
            if (newValue !== oldValue) {
              const valueStr = newValue === null || newValue === '' ? 'NULL' : `'${String(newValue).replace(/'/g, "''")}'`;
              updates.push(`\`${colName}\` = ${valueStr}`);
            }
          }

          if (updates.length === 0) continue;  // 没有实际更改

          const primaryKeyValue = row[primaryKey.column_name];
          const updateSQL = `UPDATE \`${tableName}\` SET ${updates.join(', ')} WHERE \`${primaryKey.column_name}\` = '${primaryKeyValue}'`;
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
        loadCount();
      } else {
        message.error(`提交失败：${errorMessage}`);
      }
    } catch (error: any) {
      console.error('Commit error:', error);
      message.error(`提交失败：${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }, [hasUnsavedChanges, pendingChanges, columns, tableName, connectionId, executeQuery, loadData, loadCount]);

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

    const primaryKey = columns.find(col => col.column_key === 'PRI');
    if (!primaryKey && selectedRows.some(row => row.__status__ !== 'new')) {
      message.warning('该表没有主键，无法删除');
      return;
    }

    try {
      setLoading(true);

      // 标记删除
      const newPendingDeletes: RowData[] = [];
      const newPendingInserts = pendingChanges.inserts.filter(insertRow => {
        const isSelected = selectedRows.some(selRow => selRow.__row_id__ === insertRow.__row_id__);
        if (isSelected) {
          newPendingDeletes.push(insertRow);
          return false;  // 从插入列表中移除
        }
        return true;
      });

      // 对于已存在的行，标记为删除
      for (const row of selectedRows) {
        if (row.__status__ !== 'new') {
          newPendingDeletes.push(row);
          
          // 更新 rowData 中的状态
          setRowData(prev => 
            prev.map(r => 
              r.__row_id__ === row.__row_id__ 
                ? { ...r, __status__: 'deleted' as const }
                : r
            )
          );
        }
      }

      setPendingChanges(prev => ({
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

      const columns_list = Object.keys(values).filter(key => values[key] !== undefined);
      const values_list = columns_list.map(col =>
        values[col] === null || values[col] === '' ? 'NULL' : `'${values[col]}'`
      );

      const insertSQL = `INSERT INTO \`${tableName}\` (${columns_list.join(', ')}) VALUES (${values_list.join(', ')})`;

      const result = await executeQuery(connectionId, insertSQL);

      if (result.error) {
        message.error(`插入失败：${result.error}`);
      } else {
        message.success('插入成功');
        setAddModalOpen(false);
        loadData();
        loadCount();
      }
    } catch (error: any) {
      console.error('Insert error:', error);
      message.error(`插入失败：${error.message || error}`);
    }
  }, [addForm, tableName, connectionId, executeQuery, loadData, loadCount]);

  const handleSaveEditRow = useCallback(async () => {
    try {
      const values = await editForm.validateFields();

      const primaryKey = columns.find(col => col.column_key === 'PRI');
      if (!primaryKey) {
        message.warning('该表没有主键，无法更新');
        return;
      }

      const updates = Object.entries(values)
        .filter(([key, value]) => key !== '__row_id__' && value !== editingRow?.[key])
        .map(([key, value]) => `\`${key}\` = ${value === null || value === '' ? 'NULL' : `'${value}'`}`)
        .join(', ');

      if (!updates) {
        message.info('没有修改任何数据');
        setEditModalOpen(false);
        return;
      }

      const primaryKeyValue = editingRow?.[primaryKey.column_name];
      const updateSQL = `UPDATE \`${tableName}\` SET ${updates} WHERE \`${primaryKey.column_name}\` = '${primaryKeyValue}'`;

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
  }, [editForm, columns, editingRow, tableName, connectionId, executeQuery, loadData]);

  const exportToCSV = useCallback(() => {
    if (rowData.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    const csvData = [
      columns.map(col => col.column_name).join(','),
      ...rowData.map(row =>
        columns.map(col => {
          const value = row[col.column_name];
          return value === null || value === undefined ? '' : String(value);
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
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
      
      const selectedRanges = api.getCellRanges();
      if (!selectedRanges || selectedRanges.length === 0) {
        // 如果没有选中范围，尝试获取选中的行
        const selectedRows = api.getSelectedRows();
        if (selectedRows.length > 0) {
          const text = selectedRows.map(row => 
            columns.map(col => {
              const value = row[col.column_name];
              return value === null || value === undefined ? 'NULL' : String(value);
            }).join('\t')
          ).join('\n');
          
          e.clipboardData?.setData('text/plain', text);
          e.preventDefault();
          message.success('已复制选中行');
        }
        return;
      }
      
      // 复制单元格范围
      const cells: string[][] = [];
      for (const range of selectedRanges) {
        const rangeAny = range as any;
        const startRow = rangeAny.startRowIndex;
        const endRow = rangeAny.endRowIndex;
        
        for (let rowIdx = startRow; rowIdx <= endRow; rowIdx++) {
          const node = api.getDisplayedRowAtIndex(rowIdx);
          if (!node) continue;
          
          const rowData = node.data;
          const rowValues: string[] = [];
          
          for (const col of range.columns) {
            const value = rowData[col.getColId()];
            rowValues.push(value === null || value === undefined ? 'NULL' : String(value));
          }
          
          cells.push(rowValues);
        }
      }
      
      const text = cells.map(row => row.join('\t')).join('\n');
      e.clipboardData?.setData('text/plain', text);
      e.preventDefault();
      message.success('已复制选中单元格');
    };
    
    const handlePaste = async (e: ClipboardEvent) => {
      const api = gridApiRef.current;
      if (!api) return;
      
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      
      const focusedCell = api.getFocusedCell();
      if (!focusedCell) return;
      
      try {
        const rows = text.split('\n').filter(r => r.trim());
        const startCol = focusedCell.column.getColId();
        const startRowIndex = focusedCell.rowIndex;
        
        // 解析粘贴数据
        for (let rowOffset = 0; rowOffset < rows.length; rowOffset++) {
          const values = rows[rowOffset].split('\t');
          const node = api.getDisplayedRowAtIndex(startRowIndex + rowOffset);
          
          if (!node) continue;
          
          const rowData = { ...node.data };
          
          for (let colOffset = 0; colOffset < values.length; colOffset++) {
            const col = api.getColumnDef(startCol);
            if (!col) continue;
            
            const colName = col.field;
            if (!colName) continue;
            
            const value = values[colOffset].trim();
            rowData[colName] = value === 'NULL' ? null : value;
            
            // 标记为修改
            if (rowData.__status__ !== 'new') {
              rowData.__status__ = 'modified';
            }
          }
          
          // 更新行数据
          api.applyTransaction({ update: [rowData] });
        }
        
        setHasUnsavedChanges(true);
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

  const handlePageChange = useCallback((page: number, size?: number) => {
    if (size && size !== pageSize) {
      setPageSize(size);
      setCurrentPage(1);
    } else {
      setCurrentPage(page);
    }
  }, [pageSize]);

  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalCount);

  const toolbarStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: isDarkMode ? '#1a1a1a' : '#fafafa',
    flexShrink: 0,
  };

  const statusBarStyle: React.CSSProperties = {
    borderTop: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
    background: isDarkMode ? '#1a1a1a' : '#fafafa',
    padding: '6px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    gap: 12,
  };

  const dividerStyle: React.CSSProperties = {
    width: 1,
    height: 16,
    background: isDarkMode ? '#434343' : '#d9d9d9',
    margin: '0 4px',
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: isDarkMode ? '#141414' : '#fff'
    }}>
      {/* 顶部工具栏 */}
      <div style={toolbarStyle}>
        <Space size="small">
          <Space size="middle">
            <Button icon={<PlusOutlined />} onClick={handleAddRow} type="primary" size="small">
              新增
            </Button>
            <Button 
              icon={<EditOutlined />} 
              onClick={handleEditRow} 
              disabled={selectedRows.length !== 1} 
              size="small"
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
              >
                删除
              </Button>
            </Popconfirm>
          </Space>

          <div style={dividerStyle} />

          <Space size="middle">
            <Button 
              icon={<DownloadOutlined />} 
              onClick={exportToCSV} 
              disabled={rowData.length === 0} 
              size="small"
            >
              导出
            </Button>
          </Space>
        </Space>

        <Space size="middle">
          {hasUnsavedChanges && (
            <Tag color="warning" style={{ margin: 0 }}>
              未保存
            </Tag>
          )}
          <Tag color="blue" style={{ margin: 0 }}>{tableName}</Tag>
          <Tag color="green" style={{ margin: 0 }}>
            共 {totalCount.toLocaleString()} 行
          </Tag>
          {selectedRows.length > 0 && (
            <Tag color="orange" style={{ margin: 0 }}>
              已选 {selectedRows.length} 行
            </Tag>
          )}
        </Space>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
            zIndex: 10,
          }}>
            <Spin size="large" description="加载中..." />
          </div>
        )}

        {!loading && rowData.length === 0 ? (
          <Empty description="暂无数据" style={{ marginTop: '20%' }} />
        ) : (
          <div
            className={`ag-theme-compact ${isDarkMode ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'}`}
            style={{ height: '100%', width: '100%' }}
          >
            <AgGridReact
              onGridReady={onGridReady}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              onCellValueChanged={onCellValueChanged}
              onSelectionChanged={onSelectionChanged}
              onSortChanged={(event) => {
                const columnApi = event.columnApi;
                const state = columnApi.getColumnState();
                const sortState = state
                  .filter((col: any) => col.sort && col.sort !== 'none')
                  .map((col: any) => ({
                    colId: col.colId,
                    sort: col.sort as 'asc' | 'desc',
                  }));
                setSortModel(sortState);
                // 排序时重置到第一页
                if (currentPage !== 1) {
                  setCurrentPage(1);
                }
              }}
              rowSelection="multiple"
              suppressRowClickSelection={true}
              suppressPaginationPanel={true}
              enableRangeSelection={true}
              animateRows={false}
              headerHeight={24}
              rowHeight={22}
              rowBuffer={8}
              enableBrowserTooltips={false}
            />
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div style={statusBarStyle}>
        <Space size="small">
          <Space size="small">
            <Button
              icon={<SaveOutlined />}
              size="small"
              type={hasUnsavedChanges ? 'primary' : 'default'}
              onClick={handleCommit}
              disabled={!hasUnsavedChanges}
            >
              提交
            </Button>
            <Button
              icon={<UndoOutlined />}
              size="small"
              onClick={handleUndo}
              disabled={!hasUnsavedChanges}
            >
              撤回
            </Button>
          </Space>

          <div style={dividerStyle} />

          <Space size="small">
            <Button 
              icon={<ReloadOutlined />} 
              size="small" 
              onClick={loadData} 
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </Space>

        {/* SQL 预览 */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          maxWidth: 600,
        }}>
          <code style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 11,
            color: isDarkMode ? '#8c8c8c' : '#595959',
            fontFamily: "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace",
            padding: '2px 8px',
            background: isDarkMode ? '#0f0f0f' : '#f5f5f5',
            borderRadius: 3,
            border: `1px solid ${isDarkMode ? '#303030' : '#d9d9d9'}`,
          }}>
            {currentSql}
          </code>
          <Button 
            icon={<CopyOutlined />} 
            size="small" 
            type="text" 
            onClick={copySql}
            style={{ flexShrink: 0 }}
          />
        </div>

        {/* 分页控制 */}
        <Space size="small" style={{ flexShrink: 0 }}>
          <Select
            value={pageSize}
            onChange={(val) => handlePageChange(1, val)}
            size="small"
            style={{ width: 90 }}
            options={[
              { label: '10 行', value: 10 },
              { label: '50 行', value: 50 },
              { label: '100 行', value: 100 },
              { label: '500 行', value: 500 },
              { label: '1000 行', value: 1000 },
              { label: '5000 行', value: 5000 },
            ]}
          />
          <span style={{ 
            fontSize: 12, 
            color: isDarkMode ? '#8c8c8c' : '#595959',
            whiteSpace: 'nowrap',
          }}>
            {startRow}-{endRow} / {totalCount.toLocaleString()}
          </span>
          <Pagination
            size="small"
            current={currentPage}
            pageSize={pageSize}
            total={totalCount}
            showSizeChanger={false}
            onChange={handlePageChange}
            simple
            style={{ marginLeft: 4 }}
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
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          {columns.map(col => (
            <Form.Item
              key={col.column_name}
              label={
                <span>
                  {col.column_name}
                  {!col.is_nullable && <span style={{ color: '#ff4d4f' }}> *</span>}
                  <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                    {col.data_type}
                  </span>
                </span>
              }
              name={col.column_name}
              rules={[{ required: !col.is_nullable, message: `请输入 ${col.column_name}` }]}
            >
              <Input placeholder={col.comment || col.data_type} />
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
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          {columns.map(col => (
            <Form.Item
              key={col.column_name}
              label={
                <span>
                  {col.column_name}
                  {col.column_key === 'PRI' && <Tag color="blue" style={{ marginLeft: 8 }}>主键</Tag>}
                  <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                    {col.data_type}
                  </span>
                </span>
              }
              name={col.column_name}
            >
              <Input
                placeholder={col.comment || col.data_type}
                disabled={col.column_key === 'PRI'}
              />
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </div>
  );
}
