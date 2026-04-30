import { useState, useCallback } from 'react';
import { Modal, Tabs, Button, Space, Select, Input, message, Progress } from 'antd';
import { UploadOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { useAppStore } from '../../stores/appStore';

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

  // 根据数据库类型转义标识符
  const escapeId = (name: string): string => {
    switch (dbType) {
      case 'postgresql':
      case 'kingbase':
      case 'highgo':
      case 'vastbase':
      case 'oracle':
      case 'dameng':
        return `"${name.replace(/"/g, '""')}"`;
      case 'sqlserver':
        return `[${name.replace(/]/g, ']]')}]`;
      default:
        return `\`${name.replace(/`/g, '``')}\``;
    }
  };

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
        message.error(`导出失败：${result.error}`);
        setExportLoading(false);
        return;
      }

      const { columns, rows } = result;

      if (rows.length === 0) {
        message.warning('没有数据可导出');
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
      message.success(`导出成功：${rows.length} 条记录`);
    } catch (error: any) {
      message.error(`导出失败：${error.message || error}`);
    } finally {
      setExportLoading(false);
      setProgress(0);
    }
  }, [connectionId, tableName, database, exportOptions, dbType, escapeId]);

  // 导入数据
  const handleImport = useCallback(async () => {
    if (!importSql.trim()) {
      message.warning('请输入要导入的 SQL 语句');
      return;
    }

    setImportLoading(true);

    try {
      const result = await api.executeQuery(connectionId, importSql, database);

      if (result.error) {
        message.error(`导入失败：${result.error}`);
        return;
      }

      const affected = result.rows_affected || 0;
      message.success(`导入成功：影响 ${affected} 行`);
      setImportSql('');
    } catch (error: any) {
      message.error(`导入失败：${error.message || error}`);
    } finally {
      setImportLoading(false);
    }
  }, [connectionId, importSql, database]);

  const tabItems = [
    {
      key: 'export',
      label: (
        <span>
          <DownloadOutlined /> 导出
        </span>
      ),
      children: (
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>导出格式</label>
            <Select
              value={exportOptions.format}
              onChange={(v) => setExportOptions({ ...exportOptions, format: v })}
              style={{ width: 200 }}
              options={[
                { value: 'csv', label: 'CSV (逗号分隔)' },
                { value: 'json', label: 'JSON' },
                { value: 'sql', label: 'SQL INSERT 语句' },
              ]}
            />
          </div>

          {exportOptions.format === 'csv' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>分隔符</label>
                <Select
                  value={exportOptions.delimiter}
                  onChange={(v) => setExportOptions({ ...exportOptions, delimiter: v })}
                  style={{ width: 200 }}
                  options={[
                    { value: ',', label: '逗号 (,)' },
                    { value: ';', label: '分号 (;)' },
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
                  <span style={{ marginLeft: 8 }}>包含表头</span>
                </label>
              </div>
            </>
          )}

          <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12 }}>
            将从表 <strong>{tableName}</strong> 导出最多 10000 条记录
          </div>

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exportLoading}
          >
            导出数据
          </Button>

          {exportLoading && <Progress percent={progress} style={{ marginTop: 16 }} />}
        </div>
      ),
    },
    {
      key: 'import',
      label: (
        <span>
          <UploadOutlined /> 导入
        </span>
      ),
      children: (
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>导入格式</label>
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
              SQL 语句（支持 INSERT、UPDATE、DELETE）
            </label>
            <TextArea
              value={importSql}
              onChange={(e) => setImportSql(e.target.value)}
              placeholder="输入 SQL 语句，例如：&#10;INSERT INTO users (name, email) VALUES ('张三', 'zhang@example.com');"
              rows={8}
              style={{ fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12 }}>
            导入的 SQL 将直接执行，请确保语法正确
          </div>

          <Space>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={handleImport}
              loading={importLoading}
            >
              执行导入
            </Button>
            <Button onClick={() => setImportSql('')}>清空</Button>
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
          数据导入导出 - {tableName}
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
