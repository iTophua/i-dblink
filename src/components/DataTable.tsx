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
}

interface DataTableProps {
  connectionId: string;
  tableName: string;
}

export function DataTable({ connectionId, tableName }: DataTableProps) {
  const [loading, setLoading] = useState(false);
  const [rowData, setRowData] = useState<RowData[]>([]);
  const [columnDefs, setColumnDefs] = useState<ColDef[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [formData] = Form.useForm();
  const gridApiRef = useRef<GridApi | null>(null);
  const [selectedRows, setSelectedRows] = useState<RowData[]>([]);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentSql, setCurrentSql] = useState('');

  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';

  const { getColumns, executeQuery } = useDatabase();

  const buildQuery = useCallback((page: number, size: number) => {
    const offset = (page - 1) * size;
    return `SELECT * FROM \`${tableName}\` LIMIT ${size} OFFSET ${offset}`;
  }, [tableName]);

  const loadCount = useCallback(async () => {
    try {
      const result = await executeQuery(connectionId, `SELECT COUNT(*) AS cnt FROM \`${tableName}\``);
      if (!result.error && result.rows.length > 0) {
        setTotalCount(Number(result.rows[0][0]));
      }
    } catch {
    }
  }, [connectionId, tableName, executeQuery]);

  const loadData = useCallback(async () => {
    if (!connectionId || !tableName) return;

    try {
      setLoading(true);

      const cols = await getColumns(connectionId, tableName);
      setColumns(cols);

      const colDefs: ColDef[] = cols.map((col) => ({
        field: col.column_name,
        headerName: col.column_name,
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 120,
        editable: true,
        headerTooltip: `${col.data_type}${col.is_nullable ? ' | NULL' : ' | NOT NULL'}${col.comment ? ` | ${col.comment}` : ''}`,
        cellRenderer: (params: ICellRendererParams) => {
          if (params.value === null || params.value === undefined) {
            return '<span style="color: #999; font-style: italic;">NULL</span>';
          }
          return String(params.value);
        },
      }));

      setColumnDefs(colDefs);

      const query = buildQuery(currentPage, pageSize);
      setCurrentSql(query);

      const result = await executeQuery(connectionId, query);

      if (result.error) {
        message.error(`加载数据失败：${result.error}`);
        setRowData([]);
      } else {
        const data = result.rows.map((row, index) => {
          const rowData: RowData = { __row_id__: `row-${index}` };
          result.columns.forEach((col, colIndex) => {
            rowData[col] = row[colIndex];
          });
          return rowData;
        });
        setRowData(data);
        setHasUnsavedChanges(false);
      }
    } catch (error: any) {
      console.error('Failed to load table data:', error);
      message.error(`加载数据失败：${error.message || error}`);
      setRowData([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId, tableName, currentPage, pageSize, getColumns, executeQuery, buildQuery]);

  useEffect(() => {
    loadData();
    loadCount();
  }, [loadData, loadCount]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 100,
  }), []);

  const onCellValueChanged = useCallback((event: any) => {
    if (event.newValue !== event.oldValue) {
      setHasUnsavedChanges(true);
    }
  }, []);

  const handleCommit = useCallback(async () => {
    message.info('内联编辑已自动提交');
    setHasUnsavedChanges(false);
  }, []);

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
    formData.resetFields();
  }, [formData]);

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
    formData.setFieldsValue(selectedRows[0]);
    setEditModalOpen(true);
  }, [selectedRows, formData]);

  const handleDeleteRows = useCallback(async () => {
    if (selectedRows.length === 0) {
      message.warning('请选择要删除的行');
      return;
    }

    const primaryKey = columns.find(col => col.column_key === 'PRI');
    if (!primaryKey) {
      message.warning('该表没有主键，无法删除');
      return;
    }

    try {
      setLoading(true);

      const deletePromises = selectedRows.map(row => {
        const primaryKeyValue = row[primaryKey.column_name];
        const deleteSQL = `DELETE FROM \`${tableName}\` WHERE \`${primaryKey.column_name}\` = '${primaryKeyValue}'`;
        return executeQuery(connectionId, deleteSQL);
      });

      const results = await Promise.all(deletePromises);
      const failedDeletes = results.filter(r => r.error);

      if (failedDeletes.length > 0) {
        message.error(`删除失败：${failedDeletes[0].error}`);
      } else {
        message.success(`成功删除 ${selectedRows.length} 行`);
        loadData();
        loadCount();
      }
    } catch (error: any) {
      console.error('Delete error:', error);
      message.error(`删除失败：${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }, [selectedRows, columns, tableName, connectionId, executeQuery, loadData, loadCount]);

  const handleSaveNewRow = useCallback(async () => {
    try {
      const values = await formData.validateFields();

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
  }, [formData, tableName, connectionId, executeQuery, loadData, loadCount]);

  const handleSaveEditRow = useCallback(async () => {
    try {
      const values = await formData.validateFields();

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
  }, [formData, columns, editingRow, tableName, connectionId, executeQuery, loadData]);

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

  const handlePageChange = (page: number, size?: number) => {
    if (size && size !== pageSize) {
      setPageSize(size);
      setCurrentPage(1);
    } else {
      setCurrentPage(page);
    }
  };

  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalCount);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: isDarkMode ? '#1f1f1f' : '#fff'
    }}>
      <div style={{
        padding: '8px 16px',
        borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: isDarkMode ? '#141414' : '#fafafa',
        flexShrink: 0,
      }}>
        <Space size="small">
          <Button icon={<PlusOutlined />} onClick={handleAddRow} type="primary" size="small">新增</Button>
          <Button icon={<EditOutlined />} onClick={handleEditRow} disabled={selectedRows.length !== 1} size="small">编辑</Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除选中的 ${selectedRows.length} 行吗？`}
            onConfirm={handleDeleteRows}
            okText="删除"
            cancelText="取消"
          >
            <Button icon={<DeleteOutlined />} disabled={selectedRows.length === 0} danger size="small">
              删除 {selectedRows.length > 0 && `(${selectedRows.length})`}
            </Button>
          </Popconfirm>

          <div style={{ width: 1, height: 20, background: isDarkMode ? '#434343' : '#d9d9d9', margin: '0 4px' }} />

          <Button icon={<DownloadOutlined />} onClick={exportToCSV} disabled={rowData.length === 0} size="small">导出</Button>
        </Space>

        <Space>
          <Tag color="blue">{tableName}</Tag>
          <Tag color="green">{totalCount.toLocaleString()} 行</Tag>
          {selectedRows.length > 0 && <Tag color="orange">已选 {selectedRows.length} 行</Tag>}
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
            <Spin size="large" tip="加载中..." />
          </div>
        )}

        {!loading && rowData.length === 0 ? (
          <Empty description="暂无数据" style={{ marginTop: '20%' }} />
        ) : (
          <div
            className={isDarkMode ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'}
            style={{ height: '100%', width: '100%' }}
          >
            <AgGridReact
              onGridReady={onGridReady}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              onCellValueChanged={onCellValueChanged}
              onSelectionChanged={onSelectionChanged}
              rowSelection="multiple"
              suppressRowClickSelection={true}
              suppressPaginationPanel={true}
              enableRangeSelection={true}
              animateRows={true}
              headerHeight={36}
              rowHeight={30}
            />
          </div>
        )}
      </div>

      <div style={{
        borderTop: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        background: isDarkMode ? '#141414' : '#fafafa',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 12,
      }}>
        <Space size="small">
          <Button icon={<PlusOutlined />} size="small" onClick={handleAddRow}>
            新增行
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除选中的 ${selectedRows.length} 行吗？`}
            onConfirm={handleDeleteRows}
            okText="删除"
            cancelText="取消"
          >
            <Button icon={<DeleteOutlined />} size="small" danger disabled={selectedRows.length === 0}>
              删除行
            </Button>
          </Popconfirm>

          <div style={{ width: 1, height: 16, background: isDarkMode ? '#434343' : '#d9d9d9' }} />

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
          <Button icon={<ReloadOutlined />} size="small" onClick={loadData} loading={loading}>
            刷新
          </Button>
          <Button icon={<StopOutlined />} size="small" disabled={!loading}>
            停止
          </Button>
        </Space>

        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        }}>
          <code style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 12,
            color: isDarkMode ? '#bfbfbf' : '#595959',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            padding: '2px 8px',
            background: isDarkMode ? '#1f1f1f' : '#fff',
            borderRadius: 4,
            border: `1px solid ${isDarkMode ? '#434343' : '#d9d9d9'}`,
          }}>
            {currentSql}
          </code>
          <Button icon={<CopyOutlined />} size="small" type="text" onClick={copySql} />
        </div>

        <Space size="small" style={{ flexShrink: 0 }}>
          <Select
            value={pageSize}
            onChange={(val) => handlePageChange(1, val)}
            size="small"
            style={{ width: 70 }}
            options={[
              { label: '10 行', value: 10 },
              { label: '50 行', value: 50 },
              { label: '100 行', value: 100 },
              { label: '500 行', value: 500 },
            ]}
          />
          <span style={{ fontSize: 12, color: isDarkMode ? '#bfbfbf' : '#595959' }}>
            第 {startRow}-{endRow} 行，共 {totalCount.toLocaleString()} 行
          </span>
          <Pagination
            size="small"
            current={currentPage}
            pageSize={pageSize}
            total={totalCount}
            showSizeChanger={false}
            onChange={handlePageChange}
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
      >
        <Form form={formData} layout="vertical" style={{ marginTop: 16 }}>
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
      >
        <Form form={formData} layout="vertical" style={{ marginTop: 16 }}>
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
