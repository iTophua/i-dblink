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
          throw new Error('不支持的文件格式，请上传 CSV、Excel 或 JSON 文件');
        }

        if (parsed.rows.length === 0) {
          throw new Error('文件中没有数据');
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
        message.success(`成功解析 ${parsed.rows.length} 行数据`);
      } catch (e: any) {
        setParseError(e.message || '解析文件失败');
        message.error(e.message || '解析文件失败');
      }
      return false; // 阻止 Upload 自动上传
    },
    [columns]
  );

  const handleImport = useCallback(async () => {
    if (!parsedFile) return;
    const rowsToImport = parsedFile.rows.filter((_, i) => selectedRows.has(i));
    if (rowsToImport.length === 0) {
      message.warning('请选择至少一行数据导入');
      return;
    }

    setImporting(true);
    try {
      await onImport(rowsToImport, importMode, fieldMapping);
      message.success(`成功导入 ${rowsToImport.length} 行数据`);
      onClose();
      setCurrentStep(0);
      setParsedFile(null);
    } catch (e: any) {
      message.error(`导入失败：${e.message || e}`);
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
            placeholder="映射到..."
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
      title: '选择文件',
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
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">支持 CSV、Excel (.xlsx/.xls)、JSON 格式</p>
          </Upload.Dragger>
        </Space>
      ),
    },
    {
      title: '字段映射',
      content: (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <Alert
            message={`已自动映射 ${mappedCount} / ${parsedFile?.headers.length || 0} 个字段`}
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
                仅显示前 5 行预览，共 {parsedFile.rows.length} 行
              </div>
            )}
          </div>
          <Divider />
          <div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>导入模式</div>
            <Radio.Group value={importMode} onChange={(e) => setImportMode(e.target.value)}>
              <Space direction="vertical">
                <Radio value="append">
                  追加模式
                  <Tag style={{ marginLeft: 8, fontSize: 11 }}>INSERT</Tag>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                    将数据作为新行追加到表中
                  </div>
                </Radio>
                <Radio value="replace">
                  替换模式
                  <Tag style={{ marginLeft: 8, fontSize: 11 }}>TRUNCATE + INSERT</Tag>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                    清空表后插入新数据
                  </div>
                </Radio>
                {pkColumn && (
                  <Radio value="update">
                    更新模式
                    <Tag style={{ marginLeft: 8, fontSize: 11 }}>
                      INSERT ... ON DUPLICATE KEY UPDATE
                    </Tag>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                      按主键 {pkColumn.column_name} 匹配，存在则更新，不存在则插入
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
      title: '确认导入',
      content: (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <Alert
            message={`准备导入 ${selectedRows.size} / ${parsedFile?.rows.length || 0} 行数据到表 ${tableName}`}
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
                仅显示前 10 行，共 {selectedRows.size} 行将被导入
              </div>
            )}
          </div>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={`导入数据到 ${tableName}`}
      open={open}
      onCancel={onClose}
      width={900}
      footer={
        <Space>
          {currentStep > 0 && (
            <Button onClick={() => setCurrentStep(currentStep - 1)}>上一步</Button>
          )}
          {currentStep < steps.length - 1 && (
            <Button
              type="primary"
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!parsedFile}
            >
              下一步
            </Button>
          )}
          {currentStep === steps.length - 1 && (
            <Button type="primary" loading={importing} onClick={handleImport}>
              开始导入
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
    throw new Error('CSV 文件至少需要包含表头和一行数据');
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
    throw new Error('Excel 文件至少需要包含表头和一行数据');
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
    throw new Error('JSON 格式错误');
  }

  if (!Array.isArray(data)) {
    throw new Error('JSON 文件必须是一个对象数组');
  }

  if (data.length === 0) {
    throw new Error('JSON 数组为空');
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
