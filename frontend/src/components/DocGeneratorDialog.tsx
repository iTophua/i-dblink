import { useState, useCallback } from 'react';
import { Modal, Steps, Checkbox, Button, message, Spin, Space } from 'antd';
import { DownloadOutlined, FileTextOutlined, EyeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api';

interface DocGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  database: string;
}

interface DocOptions {
  include_views: boolean;
  include_procedures: boolean;
  include_functions: boolean;
  include_triggers: boolean;
  include_indexes: boolean;
  include_foreign_keys: boolean;
  include_row_counts: boolean;
  include_ddl: boolean;
}

const defaultOptions: DocOptions = {
  include_views: true,
  include_procedures: true,
  include_functions: true,
  include_triggers: true,
  include_indexes: true,
  include_foreign_keys: true,
  include_row_counts: true,
  include_ddl: false,
};

export function DocGeneratorDialog({ open, onClose, connectionId, database }: DocGeneratorDialogProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [options, setOptions] = useState<DocOptions>(defaultOptions);
  const [loading, setLoading] = useState(false);
  const [docContent, setDocContent] = useState('');

  const handleClose = useCallback(() => {
    setCurrentStep(0);
    setDocContent('');
    setOptions(defaultOptions);
    onClose();
  }, [onClose]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const content = await api.generateDatabaseDoc(connectionId, database, options);
      setDocContent(content);
      setCurrentStep(1);
    } catch {
      message.error(t('common.docGenerator.generateFailed'));
    } finally {
      setLoading(false);
    }
  }, [connectionId, database, options, t]);

  const handleExport = useCallback(() => {
    const blob = new Blob([docContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${database}_documentation.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    message.success(t('common.docGenerator.exportSuccess'));
  }, [docContent, database, t]);

  const updateOption = useCallback((key: keyof DocOptions, value: boolean) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const optionItems: { key: keyof DocOptions; label: string }[] = [
    { key: 'include_views', label: t('common.docGenerator.includeViews') },
    { key: 'include_procedures', label: t('common.docGenerator.includeProcedures') },
    { key: 'include_functions', label: t('common.docGenerator.includeFunctions') },
    { key: 'include_triggers', label: t('common.docGenerator.includeTriggers') },
    { key: 'include_indexes', label: t('common.docGenerator.includeIndexes') },
    { key: 'include_foreign_keys', label: t('common.docGenerator.includeForeignKeys') },
    { key: 'include_row_counts', label: t('common.docGenerator.includeRowCounts') },
    { key: 'include_ddl', label: t('common.docGenerator.includeDDL') },
  ];

  const stepItems = [
    { title: t('common.docGenerator.selectContent'), icon: <FileTextOutlined /> },
    { title: t('common.docGenerator.previewExport'), icon: <EyeOutlined /> },
  ];

  return (
    <Modal
      title={t('common.docGenerator.title')}
      open={open}
      onCancel={handleClose}
      width={900}
      destroyOnClose
      transitionName=""
      maskTransitionName=""
      footer={
        currentStep === 0 ? (
          <Space>
            <Button onClick={handleClose}>{t('common.cancel')}</Button>
            <Button type="primary" loading={loading} onClick={handleGenerate}>
              {t('common.docGenerator.generate')}
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={() => setCurrentStep(0)}>{t('common.back')}</Button>
            <Button onClick={handleClose}>{t('common.close')}</Button>
            <Button type="primary" icon={<DownloadOutlined />} onClick={handleExport}>
              {t('common.docGenerator.exportMarkdown')}
            </Button>
          </Space>
        )
      }
    >
      <Steps current={currentStep} items={stepItems} style={{ marginBottom: 24 }} />

      {currentStep === 0 && (
        <div>
          <p style={{ marginBottom: 16, color: 'var(--ant-color-text-secondary)' }}>
            {t('common.docGenerator.selectContentDesc', { database })}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px 16px',
              padding: '16px',
              background: 'var(--ant-color-fill-tertiary)',
              borderRadius: '8px',
            }}
          >
            {optionItems.map((item) => (
              <Checkbox
                key={item.key}
                checked={options[item.key]}
                onChange={(e) => updateOption(item.key, e.target.checked)}
              >
                {item.label}
              </Checkbox>
            ))}
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Spin size="large" tip={t('common.docGenerator.generating')} />
            </div>
          ) : (
            <pre
              style={{
                maxHeight: '500px',
                overflow: 'auto',
                padding: '16px',
                background: 'var(--ant-color-fill-tertiary)',
                borderRadius: '8px',
                fontSize: '12px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {docContent}
            </pre>
          )}
        </div>
      )}
    </Modal>
  );
}
