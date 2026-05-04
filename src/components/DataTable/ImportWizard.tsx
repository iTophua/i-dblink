/**
 * 导入向导组件
 * 支持从 CSV/Excel/JSON 文件导入数据到数据库表
 */
import React, { useState, useMemo, useCallback } from 'react';
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
} from 'antd';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { UploadOutlined, FileExcelOutlined, FileTextOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import type { ColumnInfo } from '../../types/api';

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
  tableName: string;
  columns: ColumnInfo[];
  onImport: (
    data: Record<string, any>[],
    mode: ImportMode,
    mapping: Record<string, string>
  ) => Promise<void>;
}

type ImportMode = 'append' | 'replace' | 'update';

interface ParsedFile {
  headers: string[];
  rows: Record<string, any>[];
  fileType: 'csv' | 'excel' | 'json';
  sheetName?: string;
}

export function ImportWizard({ open, onClose, tableName, columns, onImport }: ImportWizardProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const pkColumn = useMemo(() => columns.find((c) => c.column_key === 'PRI'), [columns]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      setParseError(null);
      try {
        const extension = file.name.split('.').pop()?.toLowerCase();
        let parsed: ParsedFile;

        if (extension === 'csv') {
          const text = await file.text();
          parsed = parseCSV(text);
        } else if (extension === 'xlsx' || extension === 'xls') {
          parsed = await parseExcel(file);
        } else if (extension === 'json') {
          const text = await file.text();
          parsed = parseJSON(text);
        } else {
          throw new Error(t('common.unsupportedFileType'));
        }

        if (parsed.rows.length === 0) {
          throw new Error(t('common.noDataInFile'));
        }

        setParsedFile(parsed);
        // 自动映射同名字段
        const autoMapping: Record<string, string> = {};
        parsed.headers.forEach((header) => {
          const match = columns.find((c) => c.column_name.toLowerCase() === header.toLowerCase());
          if (match) {
            autoMapping[header] = match.column_name;
          }
        });
        setFieldMapping(autoMapping);
        setSelectedRows(new Set(parsed.rows.map((_, i) => i)));
        setCurrentStep(1);
        message.success(`${t('common.parsedSuccessfully')} ${parsed.rows.length} ${t('common.rows')}`);
      } catch (e: any) {
        setParseError(e.message || t('common.fileParseFailed'));
        message.error(e.message || t('common.fileParseFailed'));
      }
      return false; // 阻止 Upload 自动上传
    },
    [columns]
  );

  const handleImport = useCallback(async () => {
    if (!parsedFile) return;
    const rowsToImport = parsedFile.rows.filter((_, i) => selectedRows.has(i));
    if (rowsToImport.length === 0) {
      message.warning(t('common.pleaseSelectAtLeastOneRow'));
      return;
    }

    setImporting(true);
    try {
      await onImport(rowsToImport, importMode, fieldMapping);
      message.success(`${t('common.importedSuccessfully')} ${rowsToImport.length} ${t('common.rows')}`);
      onClose();
      setCurrentStep(0);
      setParsedFile(null);
    } catch (e: any) {
      message.error(`${t('common.importFailed')}: ${e.message || e}`);
    } finally {
      setImporting(false);
    }
  }, [parsedFile, selectedRows, importMode, fieldMapping, onImport, onClose]);

  const previewColumns = useMemo(() => {
    if (!parsedFile) return [];
    return parsedFile.headers.map((h) => ({
      title: (
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          <span>{h}</span>
          <Select
            size="small"
            style={{ width: '100%' }}
            placeholder={t('common.mapTo')}
            value={fieldMapping[h] || undefined}
            onChange={(value) => setFieldMapping((prev) => ({ ...prev, [h]: value }))}
            allowClear
            options={columns.map((c) => ({
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
  }, [parsedFile, fieldMapping, columns]);

  const mappedCount = useMemo(
    () => Object.values(fieldMapping).filter(Boolean).length,
    [fieldMapping]
  );

  const steps = [
    {
      title: t('common.selectFile'),
      content: (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          {parseError && (
            <Alert
              message={parseError}
              type="error"
              showIcon
              closable
              onClose={() => setParseError(null)}
            />
          )}
          <Upload.Dragger
            accept=".csv,.xlsx,.xls,.json"
            beforeUpload={handleFileUpload}
            showUploadList={false}
            multiple={false}
          >
            <p className="ant-upload-drag_icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">{t('common.clickOrDragFileHere')}</p>
            <p className="ant-upload-hint">{t('common.supportsCsvExcelJson')}</p>
          </Upload.Dragger>
        </Space>
      ),
    },
    {
      title: t('common.fieldMapping'),
      content: (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <Alert
            message={t('common.autoMappedFields', { count: mappedCount, total: parsedFile?.headers.length || 0 })}
            type={mappedCount > 0 ? 'info' : 'warning'}
            showIcon
          />
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            <Table
              dataSource={parsedFile?.rows.slice(0, 5) || []}
              columns={previewColumns}
              size="small"
              pagination={false}
              bordered
              rowKey={(_, index) => String(index)}
              scroll={{ x: 'max-content' }}
            />
            {parsedFile && parsedFile.rows.length > 5 && (
              <div style={{ textAlign: 'center', padding: 8, color: 'var(--text-tertiary)' }}>
                {t('common.onlyShowingFirst5Rows', { total: parsedFile.rows.length })}
              </div>
            )}
          </div>
          <Divider />
          <div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>{t('common.importMode')}</div>
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
                    <Tag style={{ marginLeft: 8, fontSize: 11 }}>
                      INSERT ... ON DUPLICATE KEY UPDATE
                    </Tag>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                      {t('common.matchByPrimaryKey', { pkColumn: pkColumn.column_name })}
                    </div>
                  </Radio>
                )}
              </Space>
            </Radio.Group>
          </div>
        </Space>
      ),
    },
    {
      title: t('common.confirmImport'),
      content: (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <Alert
            message={t('common.preparingToImportRows', { count: selectedRows.size, total: parsedFile?.rows.length || 0, tableName })}
            type="info"
            showIcon
          />
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            <Table
              dataSource={parsedFile?.rows.filter((_, i) => selectedRows.has(i)).slice(0, 10) || []}
              columns={previewColumns}
              size="small"
              pagination={false}
              bordered
              rowKey={(_, index) => String(index)}
              scroll={{ x: 'max-content' }}
            />
            {parsedFile && selectedRows.size > 10 && (
              <div style={{ textAlign: 'center', padding: 8, color: 'var(--text-tertiary)' }}>
                {t('common.onlyShowingFirst10Rows', { count: selectedRows.size })}
              </div>
            )}
          </div>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={t('common.importDataIntoTable', { tableName })}
      open={open}
      onCancel={onClose}
      width={900}
      footer={
        <Space>
          {currentStep > 0 && (
            <Button onClick={() => setCurrentStep(currentStep - 1)}>{t('common.previousStep')}</Button>
          )}
          {currentStep < steps.length - 1 && (
            <Button
              type="primary"
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!parsedFile}
            >
              {t('common.nextStep')}
            </Button>
          )}
          {currentStep === steps.length - 1 && (
            <Button type="primary" loading={importing} onClick={handleImport}>
              {t('common.startImport')}
            </Button>
          )}
        </Space>
      }
    >
      <Steps current={currentStep} items={steps.map((s) => ({ title: s.title }))} />
      {steps[currentStep].content}
    </Modal>
  );
}

// ============== 文件解析工具 ==============

function parseCSV(text: string): ParsedFile {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error(i18n.t('common.csvFileNeedsHeaderAndData'));
  }

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, any> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? '';
    });
    rows.push(row);
  }

  return { headers, rows, fileType: 'csv' };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function parseExcel(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  if (jsonData.length < 2) {
    throw new Error(i18n.t('common.excelFileNeedsHeaderAndData'));
  }

  const headers = jsonData[0].map(String);
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < jsonData.length; i++) {
    const row: Record<string, any> = {};
    headers.forEach((h, j) => {
      row[h] = jsonData[i][j] ?? '';
    });
    rows.push(row);
  }

  return { headers, rows, fileType: 'excel', sheetName };
}

function parseJSON(text: string): ParsedFile {
  let data: any[];
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(i18n.t('common.jsonFormatError'));
  }

  if (!Array.isArray(data)) {
    throw new Error(i18n.t('common.jsonFileMustBeArray'));
  }

  if (data.length === 0) {
    throw new Error(i18n.t('common.jsonArrayIsEmpty'));
  }

  const headers = Object.keys(data[0]);
  const rows: Record<string, any>[] = data.map((item) => {
    const row: Record<string, any> = {};
    headers.forEach((h) => {
      row[h] = item[h] ?? '';
    });
    return row;
  });

  return { headers, rows, fileType: 'json' };
}

export default ImportWizard;
