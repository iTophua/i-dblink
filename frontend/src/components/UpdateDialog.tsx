import { useState, useCallback, useEffect } from 'react';
import { Modal, Button, Tag, Spin, Typography, Space, Divider } from 'antd';
import { CheckCircleOutlined, LinkOutlined, LoadingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api';

const { Text, Paragraph } = Typography;

interface UpdateDialogProps {
  open: boolean;
  onClose: () => void;
}

interface UpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_notes: string;
  download_url: string;
  published_at: string;
}

export function UpdateDialog({ open, onClose }: UpdateDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState('');

  const checkForUpdate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.checkForUpdate();
      setUpdateInfo(result as unknown as UpdateInfo);
    } catch {
      setError(t('common.updateDialog.checkFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) {
      setUpdateInfo(null);
      setError('');
      checkForUpdate();
    }
  }, [open, checkForUpdate]);

  const handleDownload = useCallback(() => {
    if (updateInfo?.download_url) {
      window.open(updateInfo.download_url, '_blank');
    }
  }, [updateInfo]);

  return (
    <Modal
      title={t('common.updateDialog.title')}
      open={open}
      onCancel={onClose}
      width={520}
      destroyOnClose
      transitionName=""
      maskTransitionName=""
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.close')}</Button>
          {updateInfo?.has_update && (
            <Button type="primary" icon={<LinkOutlined />} onClick={handleDownload}>
              {t('common.updateDialog.download')}
            </Button>
          )}
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
          <p style={{ marginTop: 12 }}>{t('common.updateDialog.checking')}</p>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Text type="danger">{error}</Text>
          <div style={{ marginTop: 16 }}>
            <Button onClick={checkForUpdate}>{t('common.updateDialog.retry')}</Button>
          </div>
        </div>
      ) : updateInfo ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div>
              <Text strong>{t('common.updateDialog.currentVersion')}:</Text>{' '}
              <Tag>{updateInfo.current_version}</Tag>
            </div>
            <div style={{ fontSize: 18, color: 'var(--ant-color-text-tertiary)' }}>→</div>
            <div>
              <Text strong>{t('common.updateDialog.latestVersion')}:</Text>{' '}
              <Tag color={updateInfo.has_update ? 'green' : 'default'}>
                {updateInfo.latest_version}
              </Tag>
            </div>
          </div>

          {updateInfo.has_update ? (
            <div>
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--ant-color-success-bg)',
                  borderRadius: '6px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CheckCircleOutlined style={{ color: 'var(--ant-color-success)' }} />
                <Text>{t('common.updateDialog.newVersionAvailable')}</Text>
              </div>

              {updateInfo.published_at && (
                <Text
                  type="secondary"
                  style={{ display: 'block', marginBottom: 8, fontSize: 12 }}
                >
                  {t('common.updateDialog.publishedAt')}:{' '}
                  {new Date(updateInfo.published_at).toLocaleDateString()}
                </Text>
              )}

              {updateInfo.release_notes && (
                <>
                  <Divider style={{ margin: '12px 0' }} />
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    {t('common.updateDialog.releaseNotes')}:
                  </Text>
                  <Paragraph
                    style={{
                      maxHeight: 200,
                      overflow: 'auto',
                      padding: '12px',
                      background: 'var(--ant-color-fill-tertiary)',
                      borderRadius: '6px',
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {updateInfo.release_notes}
                  </Paragraph>
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '20px',
                background: 'var(--ant-color-fill-tertiary)',
                borderRadius: '8px',
              }}
            >
              <CheckCircleOutlined
                style={{ fontSize: 32, color: 'var(--ant-color-success)', marginBottom: 8 }}
              />
              <div>
                <Text>{t('common.updateDialog.alreadyLatest')}</Text>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
