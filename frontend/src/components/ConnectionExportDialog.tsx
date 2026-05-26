import { useState, useCallback } from 'react';
import { Modal, Button, Upload, message, Radio, Alert } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

export function ConnectionExportDialog({ open, onClose, onImported }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'export' | 'import'>('export');
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = useCallback(async () => {
    try {
      const jsonStr = await api.exportConnections();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `idblink_connections_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(t('connectionExportDialog.exportSuccess'));
    } catch (err) {
      message.error(
        `${t('connectionExportDialog.exportFailed')}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [t]);

  const handleImport = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        const text = await file.text();
        const result = await api.importConnections(text, importOverwrite);
        const conns = result?.imported_conns ?? 0;
        const groups = result?.imported_groups ?? 0;
        message.success(t('connectionExportDialog.importSuccess', { conns, groups }));
        onImported?.();
        onClose();
      } catch (err) {
        message.error(
          `${t('connectionExportDialog.importFailed')}: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        setImporting(false);
      }
      return false;
    },
    [importOverwrite, onImported, onClose, t]
  );

  return (
    <Modal
      title={t('connectionExportDialog.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
      destroyOnClose
    >
      <Radio.Group
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        style={{ marginBottom: 16 }}
      >
        <Radio.Button value="export">{t('connectionExportDialog.exportTab')}</Radio.Button>
        <Radio.Button value="import">{t('connectionExportDialog.importTab')}</Radio.Button>
      </Radio.Group>

      {mode === 'export' ? (
        <div>
          <Alert
            message={t('connectionExportDialog.exportHint')}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleExport} block>
            {t('connectionExportDialog.exportButton')}
          </Button>
        </div>
      ) : (
        <div>
          <Alert
            message={t('connectionExportDialog.importHint')}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <div style={{ marginBottom: 12 }}>
            <Radio.Group
              value={importOverwrite}
              onChange={(e) => setImportOverwrite(e.target.value)}
            >
              <Radio value={false}>{t('connectionExportDialog.skipExisting')}</Radio>
              <Radio value={true}>{t('connectionExportDialog.overwriteExisting')}</Radio>
            </Radio.Group>
          </div>
          <Upload
            accept=".json"
            showUploadList={false}
            beforeUpload={() => false}
            onChange={({ file }) => {
              if (file.originFileObj) handleImport(file.originFileObj);
            }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={importing} block>
              {t('connectionExportDialog.selectFile')}
            </Button>
          </Upload>
        </div>
      )}
    </Modal>
  );
}
