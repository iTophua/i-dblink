import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Modal,
  Steps,
  Upload,
  Table,
  Select,
  Button,
  Space,
  message,
  Radio,
  Alert,
  Checkbox,
  Divider,
  Tag,
  Input,
  Progress,
} from 'antd';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { UploadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { api } from '../api';
import type { ColumnInfo, DatabaseType } from '../types/api';

export type ImportFileType = 'csv' | 'excel' | 'json' | 'xml' | 'sql';
type ImportMode = 'append' | 'replace' | 'update' | 'upsert';

interface ParsedData {
  headers: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[];
  fileType: ImportFileType;
  sheetName?: string;
  totalRows?: number;
}

interface SqlParseResult {
  statements: string[];
  stats: { creates: number; inserts: number; updates: number; deletes: number; others: number };
}

interface FormatOptions {
  delimiter: string;
  textQualifier: string;
  encoding: string;
  firstRowIsHeader: boolean;
  skipRows: number;
  sheetName: string;
  dateFormat: string;
}

interface ImportProgress {
  total: number;
  success: number;
  failed: number;
  errors: string[];
  done: boolean;
}

interface TableImportWizardProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  tableName: string;
  database?: string;
  dbType?: DatabaseType;
  columns: ColumnInfo[];
  onSuccess?: () => void;
}

const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
  delimiter: ',',
  textQualifier: '"',
  encoding: 'UTF-8',
  firstRowIsHeader: true,
  skipRows: 0,
  sheetName: '',
  dateFormat: 'YYYY-MM-DD',
};

const BATCH_SIZE = 500;

function parseSqlStatements(sql: string): SqlParseResult {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === '-' && next === '-' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      i += 2;
      while (i < sql.length - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === "'" && !inDoubleQuote && !inBacktick) {
      if (inSingleQuote && next === "'") {
        current += "''";
        i += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
    } else if (ch === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
    }

    if (ch === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  const stats = { creates: 0, inserts: 0, updates: 0, deletes: 0, others: 0 };
  for (const s of statements) {
    const upper = s.trimStart().toUpperCase();
    if (upper.startsWith('CREATE')) stats.creates++;
    else if (upper.startsWith('INSERT')) stats.inserts++;
    else if (upper.startsWith('UPDATE')) stats.updates++;
    else if (upper.startsWith('DELETE')) stats.deletes++;
    else stats.others++;
  }

  return { statements, stats };
}

function parseCSV(text: string, options: FormatOptions): ParsedData {
  const lines = text.trim().split(/\r?\n/);
  const skipCount = options.skipRows || 0;
  const dataLines = lines.slice(skipCount);
  if (dataLines.length < (options.firstRowIsHeader ? 2 : 1)) {
    throw new Error(i18n.t('common.csvFileNeedsHeaderAndData'));
  }

  const delimiter = options.delimiter || ',';
  const qualifier = options.textQualifier || '"';

  let headers: string[];
  let startIdx: number;
  if (options.firstRowIsHeader) {
    headers = parseCsvLineWithDelimiter(dataLines[0], delimiter, qualifier);
    startIdx = 1;
  } else {
    const firstLine = parseCsvLineWithDelimiter(dataLines[0], delimiter, qualifier);
    headers = firstLine.map((_, i) => `Column_${i + 1}`);
    startIdx = 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];
  for (let i = startIdx; i < dataLines.length; i++) {
    if (!dataLines[i].trim()) continue;
    const values = parseCsvLineWithDelimiter(dataLines[i], delimiter, qualifier);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? '';
    });
    rows.push(row);
  }

  return { headers, rows, fileType: 'csv' };
}

function parseCsvLineWithDelimiter(line: string, delimiter: string, qualifier: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === qualifier) {
      if (inQuotes && line[i + 1] === qualifier) {
        current += qualifier;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function parseExcel(file: File, options: FormatOptions): Promise<ParsedData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = options.sheetName || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(i18n.t('common.sheetNotFound', { sheetName }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  const skipCount = options.skipRows || 0;
  const dataLines = jsonData.slice(skipCount);
  if (dataLines.length < (options.firstRowIsHeader ? 2 : 1)) {
    throw new Error(i18n.t('common.excelFileNeedsHeaderAndData'));
  }

  let headers: string[];
  let startIdx: number;
  if (options.firstRowIsHeader) {
    headers = dataLines[0].map(String);
    startIdx = 1;
  } else {
    headers = dataLines[0].map((_: unknown, i: number) => `Column_${i + 1}`);
    startIdx = 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];
  for (let i = startIdx; i < dataLines.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};
    headers.forEach((h, j) => {
      row[h] = dataLines[i][j] ?? '';
    });
    rows.push(row);
  }

  return { headers, rows, fileType: 'excel', sheetName };
}

function parseJSON(text: string): ParsedData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[];
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(i18n.t('common.jsonFormatError'));
  }
  if (!Array.isArray(data)) throw new Error(i18n.t('common.jsonFileMustBeArray'));
  if (data.length === 0) throw new Error(i18n.t('common.jsonArrayIsEmpty'));

  const headers = Object.keys(data[0]);
  const rows = data.map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};
    headers.forEach((h) => {
      row[h] = item[h] ?? '';
    });
    return row;
  });
  return { headers, rows, fileType: 'json' };
}

function parseXML(text: string): ParsedData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) throw new Error('XML parse error: ' + errorNode.textContent);

  const rowElements = doc.querySelectorAll('row');
  if (rowElements.length === 0) {
    const root = doc.documentElement;
    const childNodes = Array.from(root.children);
    if (childNodes.length > 0 && childNodes[0].children.length > 0) {
      return parseXMLRows(Array.from(root.children) as HTMLElement[]);
    }
    if (childNodes.length > 0) {
      return parseXMLRows(childNodes as HTMLElement[]);
    }
    throw new Error(i18n.t('common.noDataInFile'));
  }
  return parseXMLRows(Array.from(rowElements) as HTMLElement[]);
}

function parseXMLRows(elements: HTMLElement[]): ParsedData {
  const headerSet = new Set<string>();
  for (const el of elements) {
    for (const child of Array.from(el.children)) {
      headerSet.add(child.tagName);
    }
  }
  const headers = Array.from(headerSet);
  if (headers.length === 0) throw new Error(i18n.t('common.noDataInFile'));

  const rows = elements.map((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};
    headers.forEach((h) => {
      const child = el.querySelector(h);
      row[h] = child?.textContent ?? '';
    });
    return row;
  });
  return { headers, rows, fileType: 'xml' };
}

export function TableImportWizard({
  open,
  onClose,
  connectionId,
  tableName,
  database,
  columns,
  onSuccess,
}: TableImportWizardProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [fileType, setFileType] = useState<ImportFileType>('csv');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [sqlParseResult, setSqlParseResult] = useState<SqlParseResult | null>(null);
  const [sqlContent, setSqlContent] = useState('');
  const [formatOptions, setFormatOptions] = useState<FormatOptions>(DEFAULT_FORMAT_OPTIONS);
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [targetTableName, setTargetTableName] = useState(tableName);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress>({
    total: 0,
    success: 0,
    failed: 0,
    errors: [],
    done: false,
  });
  const [sqlExecMode, setSqlExecMode] = useState<'continue' | 'stop' | 'transaction'>('stop');
  const cancelledRef = useRef(false);
  const [tableList, setTableList] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [dynamicColumns, setDynamicColumns] = useState<ColumnInfo[]>(columns);

  useEffect(() => {
    setTargetTableName(tableName);
  }, [tableName]);

  useEffect(() => {
    setDynamicColumns(columns);
  }, [columns]);

  useEffect(() => {
    if (!open || !connectionId) return;
    setLoadingTables(true);
    api.getTables(connectionId, database).then((tables) => {
      setTableList(tables.map((t) => t.table_name));
    }).catch(() => {
      setTableList([]);
    }).finally(() => {
      setLoadingTables(false);
    });
  }, [open, connectionId, database]);

  const handleSelectTargetTable = useCallback(
    (name: string) => {
      setTargetTableName(name);
      if (name && connectionId) {
        api.getColumns(connectionId, name, database).then((cols) => {
          setDynamicColumns(cols);
        }).catch(() => {
          setDynamicColumns([]);
        });
      } else {
        setDynamicColumns([]);
      }
    },
    [connectionId, database]
  );

  const isSqlMode = fileType === 'sql';
  const pkColumn = useMemo(
    () => dynamicColumns.find((c) => c.column_key === 'PRI'),
    [dynamicColumns]
  );

  const totalSteps = isSqlMode ? 3 : 6;
  const stepLabels = isSqlMode
    ? [t('common.selectFile'), t('common.importExport.sqlPreview'), t('common.importExport.importTitle')]
    : [
        t('common.selectFile'),
        t('common.importExport.formatSettings'),
        t('common.importExport.targetTable'),
        t('common.importExport.fieldMapping'),
        t('common.importExport.importMode'),
        t('common.startImport'),
      ];

  const resetState = useCallback(() => {
    setCurrentStep(0);
    setSelectedFile(null);
    setParsedData(null);
    setSqlParseResult(null);
    setSqlContent('');
    setParseError(null);
    setFieldMapping({});
    setSelectedRows(new Set());
    setImporting(false);
    setProgress({ total: 0, success: 0, failed: 0, errors: [], done: false });
    setFormatOptions(DEFAULT_FORMAT_OPTIONS);
    setFileType('csv');
    setDynamicColumns(columns);
  }, [columns]);

  const handleClose = useCallback(() => {
    cancelledRef.current = true;
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      setParseError(null);
      setSelectedFile(file);
      try {
        const extension = file.name.split('.').pop()?.toLowerCase();

        if (isSqlMode || extension === 'sql') {
          const text = await file.text();
          setSqlContent(text);
          const result = parseSqlStatements(text);
          setSqlParseResult(result);
          setCurrentStep(1);
          return false;
        }

        let parsed: ParsedData;
        if (extension === 'csv' || extension === 'txt') {
          const text = await file.text();
          const fileParsed = parseCSV(text, formatOptions);
          parsed = { ...fileParsed, totalRows: fileParsed.rows.length };
        } else if (extension === 'xlsx' || extension === 'xls') {
          const fileParsed = await parseExcel(file, formatOptions);
          parsed = { ...fileParsed, totalRows: fileParsed.rows.length };
        } else if (extension === 'json') {
          const text = await file.text();
          const fileParsed = parseJSON(text);
          parsed = { ...fileParsed, totalRows: fileParsed.rows.length };
        } else if (extension === 'xml') {
          const text = await file.text();
          const fileParsed = parseXML(text);
          parsed = { ...fileParsed, totalRows: fileParsed.rows.length };
        } else {
          throw new Error(t('common.unsupportedFileType'));
        }

        if (parsed.rows.length === 0) throw new Error(t('common.noDataInFile'));

        setParsedData(parsed);
        const autoMapping: Record<string, string> = {};
        parsed.headers.forEach((header) => {
          const match = dynamicColumns.find(
            (c) => c.column_name.toLowerCase() === header.toLowerCase()
          );
          if (match) autoMapping[header] = match.column_name;
        });
        setFieldMapping(autoMapping);
        setSelectedRows(new Set(parsed.rows.map((_, i) => i)));
        setCurrentStep(1);
        message.success(`${t('common.parsedSuccessfully')} ${parsed.rows.length} ${t('common.rows')}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t('common.fileParseFailed');
        setParseError(msg);
        message.error(msg);
      }
      return false;
    },
    [dynamicColumns, formatOptions, isSqlMode, t]
  );

  const handleSqlImport = useCallback(async () => {
    if (!sqlParseResult) return;
    cancelledRef.current = false;
    setImporting(true);
    const stmts = sqlParseResult.statements;
    setProgress({ total: stmts.length, success: 0, failed: 0, errors: [], done: false });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    if (sqlExecMode === 'transaction') {
      try {
        await api.beginTransaction(connectionId);
        for (let i = 0; i < stmts.length; i++) {
          if (cancelledRef.current) break;
          try {
            await api.executeDDL(connectionId, stmts[i], database);
            success++;
          } catch (e: unknown) {
            failed++;
            errors.push(`[${i + 1}] ${e instanceof Error ? e.message : String(e)}`);
            throw e;
          }
          if (i % 20 === 0) {
            setProgress((p) => ({ ...p, success, failed, errors }));
          }
        }
        await api.commitTransaction(connectionId);
      } catch {
        await api.rollbackTransaction(connectionId).catch(() => {});
      }
    } else {
      for (let i = 0; i < stmts.length; i++) {
        if (cancelledRef.current) break;
        try {
          await api.executeDDL(connectionId, stmts[i], database);
          success++;
        } catch (e: unknown) {
          failed++;
          errors.push(`[${i + 1}] ${stmts[i].substring(0, 80)}... → ${e instanceof Error ? e.message : String(e)}`);
          if (sqlExecMode === 'stop') {
            break;
          }
        }
        if (i % 20 === 0 || i === stmts.length - 1) {
          setProgress((p) => ({ ...p, success, failed, errors: [...errors] }));
        }
      }
    }

    setProgress((p) => ({ ...p, success, failed, errors, done: true }));
    setImporting(false);
    if (onSuccess) onSuccess();
  }, [sqlParseResult, sqlExecMode, connectionId, database, onSuccess]);

  const handleDataImport = useCallback(async () => {
    if (!parsedData) return;
    cancelledRef.current = false;
    setImporting(true);

    const rowsToImport = parsedData.rows.filter((_, i) => selectedRows.has(i));
    if (rowsToImport.length === 0) {
      message.warning(t('common.pleaseSelectAtLeastOneRow'));
      setImporting(false);
      return;
    }

    const total = rowsToImport.length;
    setProgress({ total, success: 0, failed: 0, errors: [], done: false });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < total; i += BATCH_SIZE) {
      if (cancelledRef.current) break;
      const batch = rowsToImport.slice(i, i + BATCH_SIZE);
      const mappedBatch = batch.map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: Record<string, any> = {};
        for (const [srcKey, targetCol] of Object.entries(fieldMapping)) {
          if (targetCol) mapped[targetCol] = row[srcKey];
        }
        return mapped;
      });

      try {
        const result = await api.batchImport({
          connectionId,
          database,
          tableName: targetTableName,
          mode: importMode,
          primaryKey: pkColumn?.column_name,
          rows: mappedBatch,
        });
        success += result.success_count || mappedBatch.length;
        failed += result.failed_count || 0;
        if (result.last_error) errors.push(result.last_error);
      } catch (e: unknown) {
        failed += mappedBatch.length;
        errors.push(e instanceof Error ? e.message : String(e));
      }

      setProgress((p) => ({
        ...p,
        success,
        failed,
        errors: [...errors],
      }));
    }

    setProgress((p) => ({ ...p, success, failed, errors, done: true }));
    setImporting(false);
    if (onSuccess) onSuccess();
  }, [parsedData, selectedRows, fieldMapping, connectionId, database, tableName, importMode, pkColumn, onSuccess]);

  const mappedCount = useMemo(
    () => Object.values(fieldMapping).filter(Boolean).length,
    [fieldMapping]
  );

  const unmappedCount = useMemo(
    () => (parsedData?.headers.length || 0) - mappedCount,
    [parsedData, mappedCount]
  );

  const validationWarnings = useMemo(() => {
    if (!parsedData) return [];
    const warnings: string[] = [];
    const notNullColumns = dynamicColumns.filter((c) => c.is_nullable === 'NO');
    for (const col of notNullColumns) {
      const mapped = Object.entries(fieldMapping).find(([, v]) => v === col.column_name);
      if (!mapped) {
        warnings.push(t('common.importExport.requiredFieldNotMapped', { column: col.column_name }));
      }
    }
    return warnings;
  }, [parsedData, fieldMapping, dynamicColumns, t]);

  const mappingColumns = useMemo(() => {
    if (!parsedData) return [];
    return parsedData.headers.map((h) => ({
      title: (
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          <span style={{ fontSize: 12 }}>{h}</span>
          <Select
            size="small"
            style={{ width: '100%', minWidth: 120 }}
            placeholder={t('common.importExport.mapTo')}
            value={fieldMapping[h] || undefined}
            onChange={(value) => setFieldMapping((prev) => ({ ...prev, [h]: value }))}
            allowClear
            options={dynamicColumns.map((c) => ({
              value: c.column_name,
              label: `${c.column_name} (${c.data_type})`,
            }))}
          />
        </Space>
      ),
      dataIndex: h,
      key: h,
      width: 160,
      ellipsis: true,
    }));
  }, [parsedData, fieldMapping, dynamicColumns, t]);

  const previewMappedColumns = useMemo(() => {
    if (!parsedData) return [];
    return parsedData.headers
      .filter((h) => fieldMapping[h])
      .map((h) => ({
        title: fieldMapping[h],
        dataIndex: h,
        key: h,
        width: 140,
        ellipsis: true,
      }));
  }, [parsedData, fieldMapping]);

  const renderFileSelectStep = () => (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
      <div>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>{t('common.importExport.fileType')}</div>
        <Radio.Group value={fileType} onChange={(e) => setFileType(e.target.value)}>
          <Space wrap>
            <Radio value="csv">CSV / TXT</Radio>
            <Radio value="excel">Excel (.xlsx/.xls)</Radio>
            <Radio value="json">JSON</Radio>
            <Radio value="xml">XML</Radio>
            <Radio value="sql">SQL Script</Radio>
          </Space>
        </Radio.Group>
      </div>
      {parseError && (
        <Alert message={parseError} type="error" showIcon closable onClose={() => setParseError(null)} />
      )}
      <Upload.Dragger
        accept={
          fileType === 'csv' ? '.csv,.txt' :
          fileType === 'excel' ? '.xlsx,.xls' :
          fileType === 'json' ? '.json' :
          fileType === 'xml' ? '.xml' :
          '.sql'
        }
        beforeUpload={handleFileUpload}
        showUploadList={false}
        multiple={false}
      >
        <p className="ant-upload-drag-icon">
          <UploadOutlined />
        </p>
        <p className="ant-upload-text">{t('common.clickOrDragFileHere')}</p>
        <p className="ant-upload-hint">
          {fileType === 'csv' && t('common.supportsCsvExcelJson')}
          {fileType === 'excel' && '.xlsx, .xls'}
          {fileType === 'json' && '.json'}
          {fileType === 'xml' && '.xml'}
          {fileType === 'sql' && '.sql'}
        </p>
      </Upload.Dragger>
    </Space>
  );

  const renderFormatStep = () => (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
      {fileType === 'csv' && (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                {t('common.delimiter')}
              </label>
              <Select
                value={formatOptions.delimiter}
                onChange={(v) => setFormatOptions((o) => ({ ...o, delimiter: v }))}
                style={{ width: 160 }}
                options={[
                  { value: ',', label: t('common.comma') + ' (,)' },
                  { value: ';', label: t('common.semicolon') + ' (;)' },
                  { value: '\t', label: 'Tab' },
                  { value: '|', label: 'Pipe (|)' },
                ]}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                {t('common.importExport.textQualifier')}
              </label>
              <Select
                value={formatOptions.textQualifier}
                onChange={(v) => setFormatOptions((o) => ({ ...o, textQualifier: v }))}
                style={{ width: 160 }}
                options={[
                  { value: '"', label: t('common.importExport.doubleQuote') + ' (")' },
                  { value: "'", label: t('common.importExport.singleQuote') + " (')" },
                  { value: '', label: t('common.none') },
                ]}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                {t('common.importExport.encoding')}
              </label>
              <Select
                value={formatOptions.encoding}
                onChange={(v) => setFormatOptions((o) => ({ ...o, encoding: v }))}
                style={{ width: 160 }}
                options={[
                  { value: 'UTF-8', label: 'UTF-8' },
                  { value: 'GBK', label: 'GBK' },
                  { value: 'GB2312', label: 'GB2312' },
                  { value: 'ISO-8859-1', label: 'ISO-8859-1' },
                ]}
              />
            </div>
          </div>
          <Space>
            <Checkbox
              checked={formatOptions.firstRowIsHeader}
              onChange={(e) => setFormatOptions((o) => ({ ...o, firstRowIsHeader: e.target.checked }))}
            >
              {t('common.importExport.firstRowIsHeader')}
            </Checkbox>
          </Space>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
              {t('common.importExport.skipRows')}
            </label>
            <Input
              type="number"
              min={0}
              value={formatOptions.skipRows}
              onChange={(e) => setFormatOptions((o) => ({ ...o, skipRows: parseInt(e.target.value) || 0 }))}
              style={{ width: 160 }}
            />
          </div>
        </>
      )}
      {fileType === 'excel' && (
        <>
          <Checkbox
            checked={formatOptions.firstRowIsHeader}
            onChange={(e) => setFormatOptions((o) => ({ ...o, firstRowIsHeader: e.target.checked }))}
          >
            {t('common.importExport.firstRowIsHeader')}
          </Checkbox>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
              {t('common.importExport.skipRows')}
            </label>
            <Input
              type="number"
              min={0}
              value={formatOptions.skipRows}
              onChange={(e) => setFormatOptions((o) => ({ ...o, skipRows: parseInt(e.target.value) || 0 }))}
              style={{ width: 160 }}
            />
          </div>
        </>
      )}
      {fileType === 'json' && (
        <Alert message={t('common.importExport.jsonHint')} type="info" showIcon />
      )}
      {fileType === 'xml' && (
        <Alert message={t('common.importExport.xmlHint')} type="info" showIcon />
      )}
      {selectedFile && (
        <Button
          type="primary"
          onClick={() => handleFileUpload(selectedFile)}
        >
          {t('common.importExport.applyAndReparse')}
        </Button>
      )}
    </Space>
  );

  const renderTargetTableStep = () => (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
      <div style={{ fontWeight: 500, marginBottom: 4 }}>
        {t('common.importExport.targetTableName')}
      </div>
      <Select
        showSearch
        value={targetTableName || undefined}
        onChange={(value) => {
          setTargetTableName(value);
          if (value && connectionId) {
            api.getColumns(connectionId, value, database).then((cols) => {
              setDynamicColumns(cols);
            }).catch(() => {
              setDynamicColumns([]);
            });
          } else {
            setDynamicColumns([]);
          }
        }}
        placeholder={t('common.importExport.selectOrInputTable')}
        style={{ width: 350 }}
        loading={loadingTables}
        filterOption={(input, option) =>
          (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
        }
        dropdownRender={(menu) => (
          <>
            {menu}
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ padding: '0 8px' }}>
              <Input
                placeholder={t('common.importExport.orCreateNewTable')}
                value={targetTableName && !tableList.includes(targetTableName) ? targetTableName : ''}
                onChange={(e) => setTargetTableName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.stopPropagation();
                }}
              />
            </div>
          </>
        )}
      >
        {tableList.map((name) => (
          <Select.Option key={name} value={name}>{name}</Select.Option>
        ))}
      </Select>
      {targetTableName && dynamicColumns.length > 0 && (
        <Alert
          message={t('common.importExport.tableHasColumns', {
            tableName: targetTableName,
            count: dynamicColumns.length,
          })}
          type="info"
          showIcon
        />
      )}
    </Space>
  );

  const renderMappingStep = () => (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
      <Alert
        message={t('common.autoMappedFields', {
          count: mappedCount,
          total: parsedData?.headers.length || 0,
        })}
        type={mappedCount > 0 ? 'info' : 'warning'}
        showIcon
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          size="small"
          onClick={() => {
            const autoMapping: Record<string, string> = {};
            parsedData?.headers.forEach((header) => {
              const match = dynamicColumns.find(
                (c) => c.column_name.toLowerCase() === header.toLowerCase()
              );
              if (match) autoMapping[header] = match.column_name;
            });
            setFieldMapping(autoMapping);
          }}
        >
          {t('common.importExport.reAutoMap')}
        </Button>
        <Button size="small" onClick={() => setFieldMapping({})}>
          {t('common.importExport.clearAll')}
        </Button>
      </div>
      <div style={{ maxHeight: 350, overflow: 'auto' }}>
        <Table
          dataSource={parsedData?.rows.slice(0, 5) || []}
          columns={mappingColumns}
          size="small"
          pagination={false}
          bordered
          rowKey={(_, index) => String(index)}
          scroll={{ x: 'max-content' }}
        />
      </div>
    </Space>
  );

  const renderModeStep = () => (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <Tag style={{ fontSize: 13, padding: '2px 10px', background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>
          {t('common.importExport.totalRows')}: {parsedData?.rows.length || 0}
        </Tag>
        <Tag color="green" style={{ fontSize: 13, padding: '2px 10px' }}>
          {t('common.importExport.mappedColumns')}: {mappedCount}
        </Tag>
        <Tag color="orange" style={{ fontSize: 13, padding: '2px 10px' }}>
          {t('common.importExport.unmappedColumns')}: {unmappedCount}
        </Tag>
      </div>
      {validationWarnings.length > 0 && (
        <Alert
          message={t('common.importExport.validationWarnings')}
          description={
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {validationWarnings.slice(0, 5).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          }
          type="warning"
          showIcon
        />
      )}
      <Divider />
      <div>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>{t('common.importExport.importMode')}</div>
        <Radio.Group value={importMode} onChange={(e) => setImportMode(e.target.value)}>
          <Space direction="vertical">
            <Radio value="append">
              {t('common.appendMode')}
              <Tag style={{ marginLeft: 8, fontSize: 11 }}>INSERT</Tag>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                {t('common.appendDataAsNewRows')}
              </div>
            </Radio>
            <Radio value="replace">
              {t('common.replaceMode')}
              <Tag style={{ marginLeft: 8, fontSize: 11 }}>TRUNCATE + INSERT</Tag>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                {t('common.clearTableAndInsertNewData')}
              </div>
            </Radio>
            {pkColumn && (
              <Radio value="update">
                {t('common.updateMode')}
                <Tag style={{ marginLeft: 8, fontSize: 11 }}>UPDATE by PK</Tag>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                  {t('common.matchByPrimaryKey', { pkColumn: pkColumn.column_name })}
                </div>
              </Radio>
            )}
            {pkColumn && (
              <Radio value="upsert">
                {t('common.importExport.upsertMode')}
                <Tag style={{ marginLeft: 8, fontSize: 11 }}>INSERT ... ON DUPLICATE KEY UPDATE</Tag>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                  {t('common.importExport.upsertDesc')}
                </div>
              </Radio>
            )}
          </Space>
        </Radio.Group>
      </div>
      <div style={{ maxHeight: 200, overflow: 'auto' }}>
        <Table
          dataSource={parsedData?.rows.slice(0, 5) || []}
          columns={previewMappedColumns}
          size="small"
          pagination={false}
          bordered
          rowKey={(_, index) => String(index)}
          scroll={{ x: 'max-content' }}
        />
      </div>
    </Space>
  );

  const renderProgressStep = () => {
    const prog = progress;
    const percent = prog.total > 0 ? Math.round(((prog.success + prog.failed) / prog.total) * 100) : 0;
    return (
      <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
        {!prog.done && (
          <Progress percent={importing ? percent : 0} status={importing ? 'active' : undefined} />
        )}
        {prog.done && (
          <Alert
            message={t('common.importExport.importComplete')}
            type={prog.failed === 0 ? 'success' : 'warning'}
            showIcon
            description={
              <Space size="large">
                <Tag style={{ background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>{t('common.importExport.total')}: {prog.total}</Tag>
                <Tag color="green">{t('common.importExport.successCount')}: {prog.success}</Tag>
                <Tag color="red">{t('common.importExport.failedCount')}: {prog.failed}</Tag>
              </Space>
            }
          />
        )}
        {prog.errors.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{t('common.importExport.errorLog')}</div>
            <div
              style={{
                maxHeight: 200,
                overflow: 'auto',
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: 8,
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            >
              {prog.errors.slice(0, 50).map((err, i) => (
                <div key={i} style={{ color: 'var(--color-error)', marginBottom: 2 }}>
                  {err}
                </div>
              ))}
              {prog.errors.length > 50 && (
                <div style={{ color: 'var(--text-tertiary)' }}>
                  {t('common.importExport.moreWarnings', { count: prog.errors.length - 50 })}
                </div>
              )}
            </div>
          </div>
        )}
      </Space>
    );
  };

  const renderSqlPreviewStep = () => (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
      {selectedFile && (
        <Alert
          message={`${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`}
          type="info"
          showIcon
        />
      )}
      {sqlParseResult && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tag style={{ background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>{t('common.importExport.totalStatements')}: {sqlParseResult.statements.length}</Tag>
          {sqlParseResult.stats.creates > 0 && (
            <Tag style={{ background: 'var(--color-info-alpha-15)', color: 'var(--color-info)', border: '1px solid var(--color-info-alpha-30)' }}>CREATE × {sqlParseResult.stats.creates}</Tag>
          )}
          {sqlParseResult.stats.inserts > 0 && (
            <Tag color="green">INSERT × {sqlParseResult.stats.inserts}</Tag>
          )}
          {sqlParseResult.stats.updates > 0 && (
            <Tag color="orange">UPDATE × {sqlParseResult.stats.updates}</Tag>
          )}
          {sqlParseResult.stats.deletes > 0 && (
            <Tag color="red">DELETE × {sqlParseResult.stats.deletes}</Tag>
          )}
          {sqlParseResult.stats.others > 0 && (
            <Tag>{t('common.importExport.otherStatements')}: {sqlParseResult.stats.others}</Tag>
          )}
        </div>
      )}
      <div>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>{t('common.importExport.execMode')}</div>
        <Radio.Group value={sqlExecMode} onChange={(e) => setSqlExecMode(e.target.value)}>
          <Space direction="vertical">
            <Radio value="stop">{t('common.importExport.execStopOnError')}</Radio>
            <Radio value="continue">{t('common.importExport.execContinueOnError')}</Radio>
            <Radio value="transaction">{t('common.importExport.execAsTransaction')}</Radio>
          </Space>
        </Radio.Group>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 500, marginBottom: 4 }}>{t('common.importExport.sqlPreview')}</div>
        <Input.TextArea
          value={sqlContent.substring(0, 5000)}
          readOnly
          rows={10}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        {sqlContent.length > 5000 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>
            {t('common.importExport.previewTruncated')}
          </div>
        )}
      </div>
    </Space>
  );

  const stepContent: Record<number, React.ReactNode> = isSqlMode
    ? {
        0: renderFileSelectStep(),
        1: renderSqlPreviewStep(),
        2: renderProgressStep(),
      }
    : {
        0: renderFileSelectStep(),
        1: renderFormatStep(),
        2: renderTargetTableStep(),
        3: renderMappingStep(),
        4: renderModeStep(),
        5: renderProgressStep(),
      };

  const canGoNext = (): boolean => {
    if (isSqlMode) {
      if (currentStep === 0) return !!sqlParseResult;
      return true;
    }
    if (currentStep === 0) return !!parsedData;
    if (currentStep === 2) return !!targetTableName.trim();
    if (currentStep === 3) return mappedCount > 0;
    return true;
  };

  const displayTitle = tableName || targetTableName || '';

  return (
    <Modal
      title={t('common.importExport.importTitle') + (displayTitle ? ' - ' + displayTitle : '')}
      open={open}
      onCancel={handleClose}
      width={900}
      transitionName=""
      maskTransitionName=""
      footer={
        <Space>
          <Button onClick={handleClose}>
            {progress.done ? t('common.close') : t('common.cancel')}
          </Button>
          {currentStep > 0 && !progress.done && !importing && (
            <Button onClick={() => setCurrentStep((s) => s - 1)}>
              {t('common.previousStep')}
            </Button>
          )}
          {currentStep < totalSteps - 1 && (
            <Button
              type="primary"
              onClick={() => setCurrentStep((s) => s + 1)}
              disabled={!canGoNext()}
            >
              {t('common.nextStep')}
            </Button>
          )}
          {currentStep === totalSteps - 1 && !progress.done && (
            <Button
              type="primary"
              loading={importing}
              onClick={isSqlMode ? handleSqlImport : handleDataImport}
              disabled={importing}
            >
              {t('common.startImport')}
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

export default TableImportWizard;
