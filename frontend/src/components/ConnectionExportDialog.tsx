import { useState, useCallback, useMemo, useRef } from 'react';
import { Modal, Button, message, Radio, Alert, Segmented, Checkbox, Input } from 'antd';
import { DownloadOutlined, UploadOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useAppStore } from '../stores/appStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

export function ConnectionExportDialog({ open, onClose, onImported }: Props) {
  const { t } = useTranslation();
  const connections = useAppStore((s) => s.connections);
  const [mode, setMode] = useState<'export' | 'import' | 'navicat'>('export');
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const ncxInputRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

  const filteredConnections = useMemo(() => {
    if (!searchText.trim()) return connections;
    const lower = searchText.toLowerCase();
    return connections.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.host.toLowerCase().includes(lower) ||
        c.db_type.toLowerCase().includes(lower)
    );
  }, [connections, searchText]);

  const allFilteredIds = useMemo(
    () => new Set(filteredConnections.map((c) => c.id)),
    [filteredConnections]
  );

  const isAllSelected =
    filteredConnections.length > 0 && filteredConnections.every((c) => selectedIds.has(c.id));
  const isIndeterminate =
    filteredConnections.some((c) => selectedIds.has(c.id)) && !isAllSelected;

  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredConnections.map((c) => c.id)));
    }
  }, [isAllSelected, filteredConnections]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (selectedIds.size === 0) {
      message.warning(t('common.connectionExportDialog.selectAtLeastOne'));
      return;
    }
    setExporting(true);
    try {
      const ids = Array.from(selectedIds);
      const jsonStr =
        ids.length === connections.length
          ? await api.exportConnections()
          : await api.exportConnectionsByIds(ids);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `idblink_connections_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(t('common.connectionExportDialog.exportSuccess'));
    } catch (err) {
      message.error(
        `${t('common.connectionExportDialog.exportFailed')}: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setExporting(false);
    }
  }, [selectedIds, connections.length, t]);

  const handleImport = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        const text = await readFile(file);
        const result = await api.importConnections(text, importOverwrite);
        const conns = result?.imported_conns ?? 0;
        const groups = result?.imported_groups ?? 0;
        message.success(t('common.connectionExportDialog.importSuccess', { conns, groups }));
        onImported?.();
        onClose();
      } catch (err) {
        message.error(
          `${t('common.connectionExportDialog.importFailed')}: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        setImporting(false);
      }
    },
    [importOverwrite, onImported, onClose, t]
  );

  const handleNavicatImport = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        const text = await readFile(file);
        const result = await api.importNavicatConnections(text, importOverwrite);
        const count = typeof result === 'number' ? result : 0;
        message.success(t('common.connectionExportDialog.navicatImportSuccess', { count }));
        onImported?.();
        onClose();
      } catch (err) {
        message.error(
          `${t('common.connectionExportDialog.navicatImportFailed')}: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        setImporting(false);
      }
    },
    [importOverwrite, onImported, onClose, t]
  );

  const renderOverwriteOptions = () => (
    <div style={{ marginBottom: 12 }}>
      <Radio.Group
        value={importOverwrite}
        onChange={(e) => setImportOverwrite(e.target.value)}
      >
        <Radio value={false}>{t('common.connectionExportDialog.skipExisting')}</Radio>
        <Radio value={true}>{t('common.connectionExportDialog.overwriteExisting')}</Radio>
      </Radio.Group>
    </div>
  );

  const dbTypeLabel: Record<string, string> = {
    mysql: 'MySQL',
    postgresql: 'PostgreSQL',
    sqlserver: 'SQL Server',
    sqlite: 'SQLite',
    oracle: 'Oracle',
    redis: 'Redis',
    mongodb: 'MongoDB',
    mariadb: 'MariaDB',
  };

  return (
    <Modal
      title={t('common.connectionExportDialog.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnClose
    >
      <Segmented
        value={mode}
        onChange={(v) => setMode(v as 'export' | 'import' | 'navicat')}
        options={[
          { label: t('common.connectionExportDialog.exportTab'), value: 'export' },
          { label: t('common.connectionExportDialog.importTab'), value: 'import' },
          { label: 'Navicat', value: 'navicat' },
        ]}
        block
        style={{ marginBottom: 16 }}
      />

      {mode === 'export' && (
        <div>
          <Alert
            message={t('common.connectionExportDialog.exportHint')}
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
          />

          {connections.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0',
                color: 'var(--text-secondary)',
              }}
            >
              {t('common.connectionExportDialog.noConnections')}
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isIndeterminate}
                  onChange={toggleAll}
                >
                  {t('common.connectionExportDialog.selectAll')} ({selectedIds.size}/{connections.length})
                </Checkbox>
              </div>

              <Input
                prefix={<SearchOutlined />}
                placeholder={t('common.connectionExportDialog.searchPlaceholder')}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
                size="small"
                style={{ marginBottom: 8 }}
              />

              <div
                style={{
                  maxHeight: 240,
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  padding: '4px 0',
                  marginBottom: 12,
                }}
              >
                {filteredConnections.map((conn) => (
                  <div
                    key={conn.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px 12px',
                      cursor: 'pointer',
                      gap: 8,
                    }}
                    onClick={() => toggleOne(conn.id)}
                  >
                    <Checkbox checked={selectedIds.has(conn.id)} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conn.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>
                      {dbTypeLabel[conn.db_type] || conn.db_type}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {conn.host}:{conn.port}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exporting}
            disabled={selectedIds.size === 0}
            block
          >
            {t('common.connectionExportDialog.exportButton')}
          </Button>
        </div>
      )}

      {mode === 'import' && (
        <div>
          <Alert
            message={t('common.connectionExportDialog.importHint')}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          {renderOverwriteOptions()}
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = '';
            }}
          />
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={importing}
            block
            onClick={() => jsonInputRef.current?.click()}
          >
            {t('common.connectionExportDialog.selectFile')}
          </Button>
        </div>
      )}

      {mode === 'navicat' && (
        <div>
          <Alert
            message={t('common.connectionExportDialog.navicatHint')}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          {renderOverwriteOptions()}
          <input
            ref={ncxInputRef}
            type="file"
            accept=".ncx,.NCX"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleNavicatImport(f);
              e.target.value = '';
            }}
          />
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={importing}
            block
            onClick={() => ncxInputRef.current?.click()}
          >
            {t('common.connectionExportDialog.navicatSelectFile')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
