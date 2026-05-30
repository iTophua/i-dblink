import React, { useState, useCallback, useMemo } from 'react';
import { Modal, Table, Button, Space, App, Tag, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined,
  ExportOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Connection, ConnectionGroup } from '../../stores/appStore';
import { DatabaseIcon } from '../DatabaseIcon';
import { api } from '../../api';

interface BatchManageDialogProps {
  open: boolean;
  connections: Connection[];
  groups: ConnectionGroup[];
  onClose: () => void;
  onSaveConnection: (data: Record<string, unknown>) => Promise<void>;
  onRefresh?: () => void;
}

export function BatchManageDialog({
  open,
  connections,
  groups,
  onClose,
  onSaveConnection,
  onRefresh,
}: BatchManageDialogProps) {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Connection) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DatabaseIcon type={record.db_type} size={14} />
          <span>{name}</span>
        </span>
      ),
    },
    {
      title: t('common.type'),
      dataIndex: 'db_type',
      key: 'db_type',
      width: 100,
      render: (type: string) => <Tag>{type.toUpperCase()}</Tag>,
    },
    {
      title: t('common.host'),
      dataIndex: 'host',
      key: 'host',
      width: 180,
      render: (host: string, record: Connection) => `${host}:${record.port}`,
    },
    {
      title: t('common.group'),
      dataIndex: 'group_id',
      key: 'group_id',
      width: 120,
      render: (groupId: string | null) => {
        const group = groups.find((g) => g.id === groupId);
        return group ? (
          <span>
            <span style={{ marginRight: 4 }}>{group.icon}</span>
            {group.name}
          </span>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>{t('common.ungrouped')}</span>
        );
      },
    },
  ];

  const handleBatchDelete = useCallback(() => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('common.batchManage.selectFirst'));
      return;
    }
    modal.confirm({
      title: t('common.batchManage.confirmDeleteTitle'),
      content: t('common.batchManage.confirmDeleteContent', {
        count: selectedRowKeys.length,
      }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      transitionName: '',
      maskTransitionName: '',
      onOk: async () => {
        try {
          setLoading(true);
          await api.batchDeleteConnections(selectedRowKeys as string[]);
          message.success(
            t('common.batchManage.deleteSuccess', { count: selectedRowKeys.length })
          );
          setSelectedRowKeys([]);
          onRefresh?.();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          message.error(t('common.batchManage.deleteFailed') + ': ' + msg);
        } finally {
          setLoading(false);
        }
      },
    });
  }, [selectedRowKeys, modal, message, t, onRefresh]);

  const handleBatchExport = useCallback(async () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('common.batchManage.selectFirst'));
      return;
    }
    try {
      setLoading(true);
      const jsonStr = await api.exportConnectionsByIds(selectedRowKeys as string[]);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `idblink-connections-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(t('common.batchManage.exportSuccess'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(t('common.batchManage.exportFailed') + ': ' + msg);
    } finally {
      setLoading(false);
    }
  }, [selectedRowKeys, message, t]);

  const handleBatchMove = useCallback(
    async (targetGroupId: string) => {
      if (selectedRowKeys.length === 0) {
        message.warning(t('common.batchManage.selectFirst'));
        return;
      }
      try {
        setLoading(true);
        const groupId = targetGroupId === 'default' ? null : targetGroupId;
        await Promise.all(
          selectedRowKeys.map((key) => {
            const conn = connections.find((c) => c.id === key);
            return conn ? onSaveConnection({ ...conn, group_id: groupId }) : Promise.resolve();
          })
        );
        const group = groups.find((g) => g.id === targetGroupId);
        message.success(
          t('common.batchManage.moveSuccess', {
            count: selectedRowKeys.length,
            name: group?.name || t('common.ungrouped'),
          })
        );
        setSelectedRowKeys([]);
        onRefresh?.();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(t('common.batchManage.moveFailed') + ': ' + msg);
      } finally {
        setLoading(false);
      }
    },
    [selectedRowKeys, connections, groups, onSaveConnection, message, t, onRefresh]
  );

  const moveMenuItems = useMemo<MenuProps['items']>(
    () => [
      ...groups.map((g) => ({
        key: g.id,
        label: (
          <span>
            {g.icon} {g.name}
          </span>
        ),
      })),
    ],
    [groups]
  );

  const handleMoveClick = useCallback(
    ({ key }: { key: string }) => {
      handleBatchMove(key);
    },
    [handleBatchMove]
  );

  return (
    <Modal
      open={open}
      title={
        <span>
          {t('common.batchManage.title')}
          {selectedRowKeys.length > 0 && (
            <Tag style={{ marginLeft: 8, background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>
              {t('common.batchManage.selectedCount', { count: selectedRowKeys.length })}
            </Tag>
          )}
        </span>
      }
      width={800}
      onCancel={onClose}
      transitionName=""
      maskTransitionName=""
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button
              size="small"
              type="link"
              onClick={() => setSelectedRowKeys(connections.map((c) => c.id))}
            >
              {t('common.batchManage.selectAll')}
            </Button>
            <Button
              size="small"
              type="link"
              onClick={() => setSelectedRowKeys([])}
            >
              {t('common.batchManage.deselectAll')}
            </Button>
          </Space>
          <Space>
            <Dropdown menu={{ items: moveMenuItems, onClick: handleMoveClick }}>
              <Button
                icon={<FolderOutlined />}
                disabled={selectedRowKeys.length === 0}
                loading={loading}
              >
                {t('common.batchManage.moveToGroup')}
              </Button>
            </Dropdown>
            <Button
              icon={<ExportOutlined />}
              disabled={selectedRowKeys.length === 0}
              loading={loading}
              onClick={handleBatchExport}
            >
              {t('common.batchManage.exportSelected')}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selectedRowKeys.length === 0}
              loading={loading}
              onClick={handleBatchDelete}
            >
              {t('common.batchManage.deleteSelected')}
            </Button>
            <Button onClick={onClose}>{t('common.close')}</Button>
          </Space>
        </div>
      }
    >
      <Table
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        columns={columns}
        dataSource={connections}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 400 }}
        loading={loading}
      />
    </Modal>
  );
}
