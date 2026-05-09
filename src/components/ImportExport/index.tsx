import { useState, useCallback } from 'react';
import { Modal, Tabs, Button, Space, Select, Input, message, Progress } from 'antd';
import { UploadOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { useAppStore } from '../../stores/appStore';
import { escapeSqlIdentifier } from '../../utils/sqlUtils';

const { TextArea } = Input;

interface ImportExportModalProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  tableName: string;
  database?: string;
}

interface ExportOptions {
  format: 'csv' | 'json' | 'sql';
  includeHeaders: boolean;
  delimiter?: string;
}

interface ImportOptions {
  format: 'csv' | 'json';
  delimiter?: string;
  skipHeader?: boolean;
}

export function ImportExportModal({
  open,
  onClose,
  connectionId,
  tableName,
  database,
}: ImportExportModalProps) {
  const { t } = useTranslation();
  const dbType = useAppStore(
    (state) => state.connections.find((c) => c.id === connectionId)?.db_type
  );
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'csv',
    includeHeaders: true,
    delimiter: ',',
  });

  const [importOptions, setImportOptions] = useState<ImportOptions>({
    format: 'csv',
    delimiter: ',',
    skipHeader: true,
  });

  const [importSql, setImportSql] = useState('');

  const escapeId = (name: string): string => escapeSqlIdentifier(name, dbType);

  // 导出数据
  const handleExport = useCallback(async () => {
    setExportLoading(true);
    setProgress(0);

    try {
      // 获取表数据（带 LIMIT，防止内存溢出）
      const tableRef = database
        ? `${escapeId(database)}.${escapeId(tableName)}`
        : escapeId(tableName);
      const result = await api.executeQuery(
        connectionId,
        `SELECT * FROM ${tableRef} LIMIT 10000`,
        database
      );

      if (result.error) {
        message.error(`${t('common.importExport.exportFailed')}: ${result.error}`);
        setExportLoading(false);
        return;
      }

      const { columns, rows } = result;

      if (rows.length === 0) {
        message.warning(t('common.noDataToExport'));
        setExportLoading(false);
        return;
      }

      setProgress(30);

      let content = '';
      let filename = '';

      if (exportOptions.format === 'csv') {
        // CSV 导出
        const delimiter = exportOptions.delimiter || ',';
        const lines: string[] = [];

        // 添加表头
        if (exportOptions.includeHeaders) {
          lines.push(columns.map((c) => `"${c}"`).join(delimiter));
        }

        // 添加数据行
        for (const row of rows) {
          const values = row.map((v) => {
            if (v === null || v === undefined) return '';
            const str = String(v);
            // CSV 转义：双引号、换行符、逗号
            if (str.includes('"') || str.includes('\n') || str.includes(delimiter)) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          });
          lines.push(values.join(delimiter));
        }

        content = lines.join('\n');
        filename = `${tableName}_${Date.now()}.csv`;
      } else if (exportOptions.format === 'json') {
        // JSON 导出
        const data = rows.map((row) => {
          const obj: Record<string, any> = {};
          columns.forEach((col, i) => {
            obj[col] = row[i];
          });
          return obj;
        });
        content = JSON.stringify(data, null, 2);
        filename = `${tableName}_${Date.now()}.json`;
      } else if (exportOptions.format === 'sql') {
        // SQL 导出
        const lines: string[] = [];
        for (const row of rows) {
          const values = row.map((v) => {
            if (v === null || v === undefined) return 'NULL';
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          lines.push(
            `INSERT INTO ${escapeId(tableName)} (${columns.map((c) => escapeId(c)).join(', ')}) VALUES (${values.join(', ')});`
          );
        }
        content = lines.join('\n');
        filename = `${tableName}_${Date.now()}.sql`;
      }

      setProgress(70);

      // 下载文件
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);
      message.success(
        `${t('common.importExport.exportSuccess')}: ${rows.length} ${t('common.records')}`
      );
    } catch (error: any) {
      message.error(`${t('common.importExport.exportFailed')}: ${error.message || error}`);
    } finally {
      setExportLoading(false);
      setProgress(0);
    }
  }, [connectionId, tableName, database, exportOptions, dbType, escapeId]);

  // 导入数据
  const handleImport = useCallback(async () => {
    if (!importSql.trim()) {
      message.warning(t('common.pleaseEnterSqlForImport'));
      return;
    }

    setImportLoading(true);

    try {
      const result = await api.executeQuery(connectionId, importSql, database);

      if (result.error) {
        message.error(`${t('common.importExport.importFailed')}: ${result.error}`);
        return;
      }

      const affected = result.rows_affected || 0;
      message.success(
        `${t('common.importExport.importSuccess')}: ${affected} ${t('common.rowsAffected')}`
      );
      setImportSql('');
    } catch (error: any) {
      message.error(`${t('common.importExport.importFailed')}: ${error.message || error}`);
    } finally {
      setImportLoading(false);
    }
  }, [connectionId, importSql, database]);

  const tabItems = [
    {
      key: 'export',
      label: (
        <span>
          <DownloadOutlined /> {t('common.export')}
        </span>
      ),
      children: (
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              {t('common.importExport.exportFormat')}
            </label>
            <Select
              value={exportOptions.format}
              onChange={(v) => setExportOptions({ ...exportOptions, format: v })}
              style={{ width: 200 }}
              options={[
                { value: 'csv', label: t('common.csvCommaSeparated') },
                { value: 'json', label: 'JSON' },
                { value: 'sql', label: t('common.sqlInsertStatements') },
              ]}
            />
          </div>

          {exportOptions.format === 'csv' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                  {t('common.delimiter')}
                </label>
                <Select
                  value={exportOptions.delimiter}
                  onChange={(v) => setExportOptions({ ...exportOptions, delimiter: v })}
                  style={{ width: 200 }}
                  options={[
                    { value: ',', label: t('common.comma') },
                    { value: ';', label: t('common.semicolon') },
                    { value: '\t', label: 'Tab' },
                  ]}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={exportOptions.includeHeaders}
                    onChange={(e) =>
                      setExportOptions({ ...exportOptions, includeHeaders: e.target.checked })
                    }
                  />
                  <span style={{ marginLeft: 8 }}>{t('common.includeHeaders')}</span>
                </label>
              </div>
            </>
          )}

          <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12 }}>
            {t('common.willExportMaxRecords', { tableName, count: 10000 })}
          </div>

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exportLoading}
          >
            {t('common.dataGrid.exportData')}
          </Button>

          {exportLoading && <Progress percent={progress} style={{ marginTop: 16 }} />}
        </div>
      ),
    },
    {
      key: 'import',
      label: (
        <span>
          <UploadOutlined /> {t('common.import')}
        </span>
      ),
      children: (
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              {t('common.importFormat')}
            </label>
            <Select
              value={importOptions.format}
              onChange={(v) => setImportOptions({ ...importOptions, format: v })}
              style={{ width: 200 }}
              options={[
                { value: 'csv', label: 'CSV' },
                { value: 'json', label: 'JSON' },
              ]}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              {t('common.sqlStatements')}
            </label>
            <TextArea
              value={importSql}
              onChange={(e) => setImportSql(e.target.value)}
              placeholder={t('common.importSqlPlaceholder')}
              rows={8}
              style={{ fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12 }}>
            {t('common.importSqlDescription')}
          </div>

          <Space>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={handleImport}
              loading={importLoading}
            >
              {t('common.executeImport')}
            </Button>
            <Button onClick={() => setImportSql('')}>{t('common.logPanel.clear')}</Button>
          </Space>
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={
        <span>
          <FileTextOutlined style={{ marginRight: 8 }} />
          {t('common.dataImportExport')} - {tableName}
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Tabs items={tabItems} defaultActiveKey="export" />
    </Modal>
  );
}

export default ImportExportModal;
