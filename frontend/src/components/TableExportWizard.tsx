import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  Steps,
  Button,
  Space,
  message,
  Radio,
  Alert,
  Checkbox,
  Divider,
  Tag,
  Input,
  Select,
  Progress,
  Spin,
} from 'antd';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { api } from '../api';
import { getDialect } from '../utils/sqlDialects';
import {
  exportToTXT,
  exportToXML,
  exportToMarkdown,
} from '../utils/exportUtils';
import type { ColumnInfo, DatabaseType } from '../types/api';

export type ExportFormat = 'sql' | 'csv' | 'excel' | 'json' | 'txt' | 'xml' | 'markdown';

interface TableFieldState {
  columns: ColumnInfo[];
  selectedFields: string[];
  loaded: boolean;
}

interface SqlExportOptions {
  includeDrop: boolean;
  includeCreate: boolean;
  includeData: boolean;
  insertSyntax: 'insert' | 'insertIgnore' | 'replace';
}

interface CsvExportOptions {
  delimiter: string;
  textQualifier: string;
  includeHeaders: boolean;
  encoding: string;
}

interface JsonExportOptions {
  prettyPrint: boolean;
  format: 'array' | 'object';
}

interface DataRange {
  mode: 'all' | 'limit' | 'where';
  limitCount: number;
  whereClause: string;
  orderBy: string;
}

interface TableExportWizardProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  tableName: string;
  database?: string;
  dbType?: DatabaseType;
}

const FORMAT_OPTIONS: { key: ExportFormat; label: string; ext: string }[] = [
  { key: 'sql', label: 'SQL', ext: '.sql' },
  { key: 'csv', label: 'CSV', ext: '.csv' },
  { key: 'excel', label: 'Excel', ext: '.xlsx' },
  { key: 'json', label: 'JSON', ext: '.json' },
  { key: 'txt', label: 'TXT', ext: '.txt' },
  { key: 'xml', label: 'XML', ext: '.xml' },
  { key: 'markdown', label: 'Markdown', ext: '.md' },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TableExportWizard({
  open,
  onClose,
  connectionId,
  tableName,
  database,
  dbType,
}: TableExportWizardProps) {
  const { t } = useTranslation();
  const dialect = getDialect(dbType);

  const [currentStep, setCurrentStep] = useState(0);
  const [format, setFormat] = useState<ExportFormat>('sql');
  const [selectedTables, setSelectedTables] = useState<string[]>(tableName ? [tableName] : []);
  const [tableList, setTableList] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableFields, setTableFields] = useState<Record<string, TableFieldState>>({});
  const [loadingFields, setLoadingFields] = useState(false);
  const [activeFieldTable, setActiveFieldTable] = useState<string>(tableName || '');
  const [dataRange, setDataRange] = useState<DataRange>({
    mode: 'all',
    limitCount: 10000,
    whereClause: '',
    orderBy: '',
  });
  const [sqlOptions, setSqlOptions] = useState<SqlExportOptions>({
    includeDrop: true,
    includeCreate: true,
    includeData: true,
    insertSyntax: 'insert',
  });
  const [csvOptions, setCsvOptions] = useState<CsvExportOptions>({
    delimiter: ',',
    textQualifier: '"',
    includeHeaders: true,
    encoding: 'UTF-8',
  });
  const [jsonOptions, setJsonOptions] = useState<JsonExportOptions>({
    prettyPrint: true,
    format: 'array',
  });
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportDone, setExportDone] = useState(false);
  const [exportStats, setExportStats] = useState({ tables: 0, rows: 0, size: '' });

  const tablesLoadedRef = useRef(false);

  useEffect(() => {
    if (!open || !connectionId || tablesLoadedRef.current) return;
    tablesLoadedRef.current = true;
    let cancelled = false;
    setLoadingTables(true);
    api.getTables(connectionId, database).then((tables) => {
      if (!cancelled) setTableList(tables.map((t) => t.table_name));
    }).catch(() => {
      if (!cancelled) setTableList([]);
    }).finally(() => {
      if (!cancelled) setLoadingTables(false);
    });
    return () => { cancelled = true; };
  }, [open, connectionId, database]);

  const loadTableFields = useCallback(async (tableNames: string[]) => {
    if (!connectionId) return;
    setLoadingFields(true);
    const newFields: Record<string, TableFieldState> = { ...tableFields };
    for (const name of tableNames) {
      if (newFields[name]?.loaded) continue;
      try {
        const cols = await api.getColumns(connectionId, name, database);
        newFields[name] = {
          columns: cols,
          selectedFields: cols.map((c) => c.column_name),
          loaded: true,
        };
      } catch {
        newFields[name] = { columns: [], selectedFields: [], loaded: true };
      }
    }
    setTableFields(newFields);
    setLoadingFields(false);
  }, [connectionId, database, tableFields]);

  const handleSelectedTablesChange = useCallback((tables: string[]) => {
    setSelectedTables(tables);
    const toLoad = tables.filter((t) => !tableFields[t]?.loaded);
    if (toLoad.length > 0) loadTableFields(toLoad);
    if (tables.length > 0 && !tables.includes(activeFieldTable)) {
      setActiveFieldTable(tables[0]);
    }
  }, [tableFields, activeFieldTable, loadTableFields]);

  const toggleField = useCallback((tableName: string, fieldName: string) => {
    setTableFields((prev) => {
      const state = prev[tableName];
      if (!state) return prev;
      const fields = state.selectedFields.includes(fieldName)
        ? state.selectedFields.filter((f) => f !== fieldName)
        : [...state.selectedFields, fieldName];
      return { ...prev, [tableName]: { ...state, selectedFields: fields } };
    });
  }, []);

  const toggleAllFields = useCallback((tableName: string, selected: boolean) => {
    setTableFields((prev) => {
      const state = prev[tableName];
      if (!state) return prev;
      return {
        ...prev,
        [tableName]: {
          ...state,
          selectedFields: selected ? state.columns.map((c) => c.column_name) : [],
        },
      };
    });
  }, []);

  const stepLabels = [
    t('common.importExport.selectTables'),
    t('common.importExport.selectFields'),
    t('common.importExport.formatOptions'),
    t('common.importExport.exportTitle'),
  ];

  const resetState = useCallback(() => {
    setCurrentStep(0);
    setFormat('sql');
    setSelectedTables(tableName ? [tableName] : []);
    setTableFields({});
    setActiveFieldTable('');
    setDataRange({ mode: 'all', limitCount: 10000, whereClause: '', orderBy: '' });
    setSqlOptions({ includeDrop: true, includeCreate: true, includeData: true, insertSyntax: 'insert' });
    setCsvOptions({ delimiter: ',', textQualifier: '"', includeHeaders: true, encoding: 'UTF-8' });
    setJsonOptions({ prettyPrint: true, format: 'array' });
    setExporting(false);
    setProgress(0);
    setExportDone(false);
    setExportStats({ tables: 0, rows: 0, size: '' });
    tablesLoadedRef.current = false;
  }, [tableName]);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const buildQuery = useCallback((tblName: string, fields: string[]): string => {
    const cols = fields.length > 0 ? fields.map((c) => dialect.escapeIdentifier(c)).join(', ') : '*';
    const tableRef = dialect.buildTableRef(tblName, database);
    let sql = `SELECT ${cols} FROM ${tableRef}`;
    if (dataRange.mode === 'where' && dataRange.whereClause.trim()) {
      sql += ` WHERE ${dataRange.whereClause.trim()}`;
    }
    if (dataRange.orderBy.trim()) {
      sql += ` ORDER BY ${dataRange.orderBy.trim()}`;
    }
    if (dataRange.mode === 'limit') {
      sql = dialect.buildPaginationQuery(sql, { offset: 0, limit: dataRange.limitCount });
    }
    return sql;
  }, [database, dataRange, dialect]);

  const handleExport = useCallback(async () => {
    if (selectedTables.length === 0) return;
    setExporting(true);
    setProgress(5);
    const tables = selectedTables;
    const fmtInfo = FORMAT_OPTIONS.find((f) => f.key === format)!;
    const totalTables = tables.length;
    let totalRows = 0;
    let totalSize = 0;

    try {
      if (format === 'sql') {
        let sqlContent = '';
        for (let ti = 0; ti < tables.length; ti++) {
          const tbl = tables[ti];
          const fields = tableFields[tbl]?.selectedFields || [];

          if (sqlOptions.includeDrop) {
            const tableRef = dialect.buildTableRef(tbl, database);
            sqlContent += dialect.buildDropTable(tableRef, true) + '\n\n';
          }
          if (sqlOptions.includeCreate) {
            const ddlStatements = await api.getTableDDL(connectionId, tbl, database);
            sqlContent += ddlStatements.join('\n\n') + '\n\n';
          }
          if (sqlOptions.includeData) {
            const tableRef = dialect.buildTableRef(tbl, database);
            const exportResult = await api.streamExportTable(connectionId, tbl, database, 1000);
            if (exportResult?.rows && exportResult.columns) {
              const cols = (exportResult.columns as string[]).map((c: string) => dialect.escapeIdentifier(c));
              let prefix = 'INSERT INTO';
              if (sqlOptions.insertSyntax === 'insertIgnore') prefix = 'INSERT IGNORE INTO';
              if (sqlOptions.insertSyntax === 'replace') prefix = 'REPLACE INTO';
              const filteredCols = fields.length > 0
                ? cols.filter((_: string, i: number) => fields.includes((exportResult.columns as string[])[i]))
                : cols;
              const filteredColStr = filteredCols.join(', ');
              for (const row of exportResult.rows) {
                const vals = (exportResult.columns as string[])
                  .filter((_: string, i: number) => fields.length === 0 || fields.includes((exportResult.columns as string[])[i]))
                  .map((col: string) => dialect.escapeValue((row as Record<string, unknown>)[col]));
                sqlContent += `${prefix} ${tableRef} (${filteredColStr}) VALUES (${vals.join(', ')});\n`;
              }
              totalRows += exportResult.rows.length;
            }
          }
          setProgress(Math.round(((ti + 1) / totalTables) * 90));
        }
        const blob = new Blob([sqlContent], { type: 'text/sql;charset=utf-8' });
        const filename = totalTables === 1 ? `${tables[0]}${fmtInfo.ext}` : `export_${totalTables}tables${fmtInfo.ext}`;
        downloadBlob(blob, filename);
        totalSize = blob.size;
      } else if (format === 'excel') {
        const wb = XLSX.utils.book_new();
        for (let ti = 0; ti < tables.length; ti++) {
          const tbl = tables[ti];
          const fields = tableFields[tbl]?.selectedFields || [];
          const sql = buildQuery(tbl, fields);
          const result = await api.executeQuery(connectionId, sql, database);
          if (result.error) throw new Error(result.error);
          const data = (result.rows || []).map((row) => {
            const obj: Record<string, unknown> = {};
            (result.columns as string[]).forEach((col, i) => {
              obj[col] = (row as unknown[])[i];
            });
            return obj;
          });
          const colDefs = fields.map((f) => ({ field: f, headerName: f }));
          const exportData = colDefs.length > 0
            ? data.map((row) => {
              const newRow: Record<string, unknown> = {};
              colDefs.forEach((col) => { newRow[col.headerName] = row[col.field] ?? ''; });
              return newRow;
            })
            : data;
          const ws = XLSX.utils.json_to_sheet(exportData);
          const sheetName = tbl.substring(0, 31);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
          totalRows += data.length;
          setProgress(Math.round(((ti + 1) / totalTables) * 90));
        }
        const filename = totalTables === 1 ? `${tables[0]}${fmtInfo.ext}` : `export_${totalTables}tables${fmtInfo.ext}`;
        XLSX.writeFile(wb, filename);
      } else {
        for (let ti = 0; ti < tables.length; ti++) {
          const tbl = tables[ti];
          const fields = tableFields[tbl]?.selectedFields || [];
          const sql = buildQuery(tbl, fields);
          const result = await api.executeQuery(connectionId, sql, database);
          if (result.error) throw new Error(result.error);
          const data = (result.rows || []).map((row) => {
            const obj: Record<string, unknown> = {};
            (result.columns as string[]).forEach((col, i) => {
              obj[col] = (row as unknown[])[i];
            });
            return obj;
          });
          const colDefs = fields.map((f) => ({ field: f, headerName: f }));
          const filename = `${tbl}${fmtInfo.ext}`;

          if (format === 'csv') {
            const exportData = colDefs.length > 0
              ? data.map((row) => {
                const newRow: Record<string, unknown> = {};
                colDefs.forEach((col) => { newRow[col.headerName] = row[col.field] ?? ''; });
                return newRow;
              })
              : data;
            const ws = XLSX.utils.json_to_sheet(exportData);
            const csv = XLSX.utils.sheet_to_csv(ws, { FS: csvOptions.delimiter });
            const bom = csvOptions.encoding === 'UTF-8' ? '\uFEFF' : '';
            const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
            downloadBlob(blob, filename);
            totalSize += blob.size;
          } else if (format === 'json') {
            const jsonStr = jsonOptions.prettyPrint ? JSON.stringify(data, null, 2) : JSON.stringify(data);
            const output = jsonOptions.format === 'object'
              ? JSON.stringify({ table: tbl, data, count: data.length }, null, jsonOptions.prettyPrint ? 2 : 0)
              : jsonStr;
            const blob = new Blob([output], { type: 'application/json;charset=utf-8;' });
            downloadBlob(blob, filename);
            totalSize += blob.size;
          } else if (format === 'txt') {
            exportToTXT(data, colDefs.length > 0 ? colDefs : undefined, { filename });
          } else if (format === 'xml') {
            exportToXML(data, colDefs.length > 0 ? colDefs : undefined, { filename });
          } else if (format === 'markdown') {
            exportToMarkdown(data, colDefs.length > 0 ? colDefs : undefined, { filename });
          }

          totalRows += data.length;
          setProgress(Math.round(((ti + 1) / totalTables) * 90));
        }
      }

      setProgress(100);
      setExportDone(true);
      setExportStats({
        tables: totalTables,
        rows: totalRows,
        size: totalSize > 0 ? `${(totalSize / 1024).toFixed(1)} KB` : '',
      });
      message.success(t('common.importExport.exportSuccess', { count: totalRows }));
    } catch (e: unknown) {
      message.error(`${t('common.importExport.exportFailed')}: ${e instanceof Error ? e.message : e}`);
    } finally {
      setExporting(false);
    }
  }, [
    selectedTables, format, sqlOptions, csvOptions, jsonOptions, tableFields,
    connectionId, database, dialect, buildQuery, t,
  ]);

  const renderTablesStep = () => (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{t('common.importExport.selectTables')}</div>
      <Select
        mode="multiple"
        showSearch
        value={selectedTables}
        onChange={handleSelectedTablesChange}
        placeholder={t('common.importExport.selectTablesPlaceholder')}
        style={{ width: '100%' }}
        loading={loadingTables}
        maxTagCount="responsive"
        filterOption={(input, option) =>
          (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
        }
      >
        {tableList.map((name) => (
          <Select.Option key={name} value={name}>{name}</Select.Option>
        ))}
      </Select>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="small" onClick={() => setSelectedTables(tableList.slice(0, 100))}>
          {t('common.importExport.selectAll')}
        </Button>
        <Button size="small" onClick={() => setSelectedTables([])}>
          {t('common.importExport.deselectAll')}
        </Button>
      </div>
      {selectedTables.length > 0 && (
        <Alert
          message={t('common.importExport.selectedTablesCount', { count: selectedTables.length })}
          type="info"
          showIcon
        />
      )}
      <Divider />
      <div style={{ fontWeight: 500, marginBottom: 8 }}>{t('common.importExport.exportFormat')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FORMAT_OPTIONS.map((f) => (
          <Button
            key={f.key}
            type={format === f.key ? 'primary' : 'default'}
            onClick={() => setFormat(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>
    </Space>
  );

  const renderFieldsStep = () => {
    if (selectedTables.length === 0) {
      return <Alert message={t('common.importExport.pleaseSelectTableFirst')} type="warning" showIcon style={{ marginTop: 16 }} />;
    }
    const currentTable = activeFieldTable || selectedTables[0];
    const currentFields = tableFields[currentTable];
    return (
      <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selectedTables.map((tbl) => (
            <Button
              key={tbl}
              size="small"
              type={currentTable === tbl ? 'primary' : 'default'}
              onClick={() => setActiveFieldTable(tbl)}
            >
              {tbl}
              {tableFields[tbl]?.selectedFields && (
                <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.7 }}>
                  ({tableFields[tbl].selectedFields.length}/{tableFields[tbl].columns.length})
                </span>
              )}
            </Button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Button size="small" onClick={() => toggleAllFields(currentTable, true)}>
            {t('common.importExport.selectAll')}
          </Button>
          <Button size="small" onClick={() => toggleAllFields(currentTable, false)}>
            {t('common.importExport.deselectAll')}
          </Button>
          <Button size="small" onClick={() => toggleAllFields(currentTable, !((currentFields?.selectedFields.length || 0) === (currentFields?.columns.length || 0)))}>
            {t('common.importExport.invertSelection')}
          </Button>
        </div>
        {loadingFields ? (
          <Spin />
        ) : (
          <div style={{ maxHeight: 250, overflow: 'auto' }}>
            {(currentFields?.columns || []).map((col) => (
              <div
                key={col.column_name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '3px 8px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <Checkbox
                  checked={currentFields?.selectedFields.includes(col.column_name) || false}
                  onChange={() => toggleField(currentTable, col.column_name)}
                />
                <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}>{col.column_name}</span>
                <Tag style={{ fontSize: 11 }}>{col.data_type}</Tag>
              </div>
            ))}
          </div>
        )}
        <Divider />
        <div style={{ fontWeight: 500, marginBottom: 8 }}>{t('common.importExport.dataRange')}</div>
        <Radio.Group
          value={dataRange.mode}
          onChange={(e) => setDataRange((prev) => ({ ...prev, mode: e.target.value }))}
        >
          <Space direction="vertical">
            <Radio value="all">{t('common.importExport.allData')}</Radio>
            <Radio value="limit">
              {t('common.importExport.firstNRows')}
              <Input
                type="number"
                min={1}
                value={dataRange.limitCount}
                onChange={(e) => setDataRange((prev) => ({ ...prev, limitCount: parseInt(e.target.value) || 1000 }))}
                style={{ width: 100, marginLeft: 8 }}
                disabled={dataRange.mode !== 'limit'}
              />
            </Radio>
            <Radio value="where">
              {t('common.importExport.customWhere')}
              <Input
                value={dataRange.whereClause}
                onChange={(e) => setDataRange((prev) => ({ ...prev, whereClause: e.target.value }))}
                placeholder="status = 1"
                style={{ width: 350, marginLeft: 8 }}
                disabled={dataRange.mode !== 'where'}
              />
            </Radio>
          </Space>
        </Radio.Group>
      </Space>
    );
  };

  const renderOptionsStep = () => (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
      {format === 'sql' && (
        <>
          <div style={{ fontWeight: 500 }}>{t('common.importExport.sqlOptions')}</div>
          <Checkbox
            checked={sqlOptions.includeDrop}
            onChange={(e) => setSqlOptions((o) => ({ ...o, includeDrop: e.target.checked }))}
          >
            DROP TABLE IF EXISTS
          </Checkbox>
          <Checkbox
            checked={sqlOptions.includeCreate}
            onChange={(e) => setSqlOptions((o) => ({ ...o, includeCreate: e.target.checked }))}
          >
            CREATE TABLE
          </Checkbox>
          <Checkbox
            checked={sqlOptions.includeData}
            onChange={(e) => setSqlOptions((o) => ({ ...o, includeData: e.target.checked }))}
          >
            {t('common.includeData')}
          </Checkbox>
          {sqlOptions.includeData && (
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                {t('common.importExport.insertSyntax')}
              </label>
              <Radio.Group
                value={sqlOptions.insertSyntax}
                onChange={(e) => setSqlOptions((o) => ({ ...o, insertSyntax: e.target.value }))}
              >
                <Space direction="vertical">
                  <Radio value="insert">INSERT INTO</Radio>
                  <Radio value="insertIgnore">INSERT IGNORE INTO</Radio>
                  <Radio value="replace">REPLACE INTO</Radio>
                </Space>
              </Radio.Group>
            </div>
          )}
        </>
      )}
      {format === 'csv' && (
        <>
          <div style={{ fontWeight: 500 }}>{t('common.importExport.csvOptions')}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>{t('common.delimiter')}</label>
              <Select
                value={csvOptions.delimiter}
                onChange={(v) => setCsvOptions((o) => ({ ...o, delimiter: v }))}
                style={{ width: 160 }}
                options={[
                  { value: ',', label: `${t('common.comma')} (,)` },
                  { value: ';', label: `${t('common.semicolon')} (;)` },
                  { value: '\t', label: 'Tab' },
                  { value: '|', label: 'Pipe (|)' },
                ]}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>{t('common.importExport.encoding')}</label>
              <Select
                value={csvOptions.encoding}
                onChange={(v) => setCsvOptions((o) => ({ ...o, encoding: v }))}
                style={{ width: 160 }}
                options={[
                  { value: 'UTF-8', label: 'UTF-8' },
                  { value: 'GBK', label: 'GBK' },
                ]}
              />
            </div>
          </div>
          <Checkbox
            checked={csvOptions.includeHeaders}
            onChange={(e) => setCsvOptions((o) => ({ ...o, includeHeaders: e.target.checked }))}
          >
            {t('common.includeHeaders')}
          </Checkbox>
        </>
      )}
      {format === 'json' && (
        <>
          <div style={{ fontWeight: 500 }}>{t('common.importExport.jsonOptions')}</div>
          <Checkbox
            checked={jsonOptions.prettyPrint}
            onChange={(e) => setJsonOptions((o) => ({ ...o, prettyPrint: e.target.checked }))}
          >
            {t('common.importExport.prettyPrint')}
          </Checkbox>
        </>
      )}
      {format === 'excel' && (
        <Alert
          message={t('common.importExport.multiSheetHint', { count: selectedTables.length })}
          type="info"
          showIcon
        />
      )}
      {(format === 'txt' || format === 'xml' || format === 'markdown') && (
        <Alert
          message={t('common.importExport.noExtraOptions', { format: format.toUpperCase() })}
          type="info"
          showIcon
        />
      )}
    </Space>
  );

  const renderExportStep = () => (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
      {!exportDone && (
        <Progress percent={exporting ? progress : 0} status={exporting ? 'active' : undefined} />
      )}
      {exportDone && (
        <Alert
          message={t('common.importExport.exportComplete')}
          type="success"
          showIcon
          description={
            <Space size="large">
              <Tag style={{ background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>{t('common.importExport.tables')}: {exportStats.tables}</Tag>
              <Tag color="green">{t('common.importExport.totalRows')}: {exportStats.rows}</Tag>
              {exportStats.size && (
                <Tag style={{ background: 'var(--color-info-alpha-15)', color: 'var(--color-info)', border: '1px solid var(--color-info-alpha-30)' }}>{t('common.importExport.fileSize')}: {exportStats.size}</Tag>
              )}
              <Tag>{t('common.importExport.exportFormat')}: {format.toUpperCase()}</Tag>
            </Space>
          }
        />
      )}
      {!exportDone && !exporting && (
        <Alert
          message={t('common.importExport.readyToExportMulti', {
            count: selectedTables.length,
            format: format.toUpperCase(),
          })}
          type="info"
          showIcon
        />
      )}
    </Space>
  );

  const stepContent: Record<number, React.ReactNode> = {
    0: renderTablesStep(),
    1: renderFieldsStep(),
    2: renderOptionsStep(),
    3: renderExportStep(),
  };

  const canGoNext = (): boolean => {
    if (currentStep === 0) return selectedTables.length > 0;
    return true;
  };

  return (
    <Modal
      title={t('common.importExport.exportTitle')}
      open={open}
      onCancel={handleClose}
      width={850}
      transitionName=""
      maskTransitionName=""
      footer={
        <Space>
          <Button onClick={handleClose}>
            {exportDone ? t('common.close') : t('common.cancel')}
          </Button>
          {currentStep > 0 && !exportDone && (
            <Button onClick={() => setCurrentStep((s) => s - 1)}>
              {t('common.previousStep')}
            </Button>
          )}
          {currentStep < 3 && (
            <Button
              type="primary"
              onClick={() => setCurrentStep((s) => s + 1)}
              disabled={!canGoNext()}
            >
              {t('common.nextStep')}
            </Button>
          )}
          {currentStep === 3 && !exportDone && (
            <Button type="primary" loading={exporting} onClick={handleExport} disabled={exporting}>
              {t('common.importExport.startExport')}
            </Button>
          )}
        </Space>
      }
    >
      <Steps current={currentStep} items={stepLabels.map((title) => ({ title }))} size="small" />
      {stepContent[currentStep]}
    </Modal>
  );
}

export default TableExportWizard;
