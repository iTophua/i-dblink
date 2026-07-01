import React from 'react';
import { Modal, Spin, Descriptions, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { ConnectionGroup } from '../../../stores/appStore';
import { TableStructure } from '../../TableStructure';
import { DDLViewer } from '../../DDLViewer';

const { Text } = Typography;

interface PropertiesModalProps {
  propertiesOpen: boolean;
  propertiesType: 'connection' | 'table' | 'view' | 'procedure' | 'function' | 'trigger' | 'group';
  propertiesTarget: {
    connId: string;
    name: string;
    database?: string;
    data?: any;
  } | null;
  propertiesContent: string;
  propertiesLoading: boolean;
  groups: ConnectionGroup[];
  onClose: () => void;
}

export const PropertiesModal: React.FC<PropertiesModalProps> = ({
  propertiesOpen,
  propertiesType,
  propertiesTarget,
  propertiesContent,
  propertiesLoading,
  groups,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      open={propertiesOpen}
      title={
        propertiesType === 'connection'
          ? `${t('common.connectionProperties')}: ${propertiesTarget?.name}`
          : propertiesType === 'table'
            ? `${t('common.mainLayout.tableProperties')}: ${propertiesTarget?.name}`
            : propertiesType === 'view'
              ? `${t('common.viewProperties')}: ${propertiesTarget?.name}`
              : propertiesType === 'procedure'
                ? `${t('common.procedureProperties')}: ${propertiesTarget?.name}`
                : propertiesType === 'function'
                  ? `${t('common.functionProperties')}: ${propertiesTarget?.name}`
                  : propertiesType === 'trigger'
                    ? `${t('common.triggerProperties')}: ${propertiesTarget?.name}`
                    : `${t('common.groupProperties')}: ${propertiesTarget?.name}`
      }
      width={propertiesType === 'table' ? 900 : 700}
      onCancel={() => {
        onClose();
      }}
      footer={null}
      transitionName=""
      maskTransitionName=""
    >
      {propertiesLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : propertiesType === 'table' && propertiesTarget ? (
        <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <TableStructure
            connectionId={propertiesTarget.connId}
            tableName={propertiesTarget.name}
            database={propertiesTarget.database}
          />
        </div>
      ) : propertiesType === 'connection' && propertiesTarget?.data ? (
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label={t('common.name')}>{propertiesTarget.data.name}</Descriptions.Item>
          <Descriptions.Item label={t('common.type')}>{propertiesTarget.data.db_type}</Descriptions.Item>
          <Descriptions.Item label={t('common.host')}>{propertiesTarget.data.host}</Descriptions.Item>
          <Descriptions.Item label={t('common.port')}>{propertiesTarget.data.port}</Descriptions.Item>
          <Descriptions.Item label={t('common.username')}>{propertiesTarget.data.username}</Descriptions.Item>
          <Descriptions.Item label={t('common.database')}>{propertiesTarget.data.database || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('common.status')}>
            {propertiesTarget.data.status === 'connected' ? t('common.connected') : t('common.disconnected')}
          </Descriptions.Item>
          {propertiesTarget.data.group_id && (
            <Descriptions.Item label={t('common.group')}>
              {groups.find((g) => g.id === propertiesTarget.data.group_id)?.name || '-'}
            </Descriptions.Item>
          )}
        </Descriptions>
      ) : propertiesType === 'group' && propertiesTarget?.data ? (
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label={t('common.name')}>{propertiesTarget.data.name}</Descriptions.Item>
          <Descriptions.Item label={t('common.icon')}>{propertiesTarget.data.icon}</Descriptions.Item>
          <Descriptions.Item label={t('common.color')}>
            <span style={{ display: 'inline-block', width: 16, height: 16, background: propertiesTarget.data.color, borderRadius: 4, border: '1px solid var(--border-color)' }} />
            {' '}{propertiesTarget.data.color}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.connectionCount')}>
            {propertiesTarget.data.connCount}
          </Descriptions.Item>
        </Descriptions>
      ) : propertiesType === 'trigger' && propertiesTarget?.data ? (
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label={t('common.name')}>{propertiesTarget.data.name}</Descriptions.Item>
          <Descriptions.Item label={t('common.event')}>{propertiesTarget.data.event}</Descriptions.Item>
          <Descriptions.Item label={t('common.timing')}>{propertiesTarget.data.timing}</Descriptions.Item>
          <Descriptions.Item label={t('common.table')}>{propertiesTarget.data.table}</Descriptions.Item>
        </Descriptions>
      ) : (
        <div>
          <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label={t('common.name')}>
              {propertiesTarget?.name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('common.type')}>
              {propertiesType === 'view'
                ? t('common.view')
                : propertiesType === 'procedure'
                  ? t('common.procedure')
                  : propertiesType === 'function'
                    ? t('common.function')
                    : '-'}
            </Descriptions.Item>
            {propertiesTarget?.database && (
              <Descriptions.Item label={t('common.database')}>
                {propertiesTarget.database}
              </Descriptions.Item>
            )}
          </Descriptions>
          {propertiesContent ? (
            <div>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                {t('common.ddl')}
              </Text>
              <DDLViewer ddl={propertiesContent} maxHeight="60vh" />
            </div>
          ) : (
            <Text type="secondary">{t('common.noData')}</Text>
          )}
        </div>
      )}
    </Modal>
  );
};
