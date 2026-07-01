import { useCallback } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Connection, ConnectionGroup } from '../../../stores/appStore';
import { api } from '../../../api';
import { getErrorMessage } from '../../../utils/getErrorMessage';

export function useConnectionActions(
  connections: Connection[],
  groups: ConnectionGroup[],
  onSaveConnection: (data: any) => Promise<void>,
  onRefreshConnections?: () => void
) {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const handleCopyConnection = useCallback(
    async (conn: Connection) => {
      try {
        const copyData = {
          id: null,
          name: `${conn.name} (${t('common.copySuffix')})`,
          db_type: conn.db_type,
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: '',
          database: conn.database,
          group_id: conn.group_id,
        };
        await onSaveConnection(copyData);
        message.success(t('common.connectionConfigCopied'));
      } catch (error: unknown) {
        message.error(t('common.copyConnectionFailed') + ': ' + getErrorMessage(error));
      }
    },
    [onSaveConnection]
  );

  const handleMoveConnection = useCallback(
    async (connectionId: string, targetGroupId: string) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;
      try {
        await onSaveConnection({
          ...conn,
          id: conn.id,
          group_id: targetGroupId === 'default' ? null : targetGroupId,
        });
        const group = groups.find((g) => g.id === targetGroupId);
        message.success(t('common.movedToGroup', { name: group?.name || t('common.ungrouped') }));
      } catch (error: unknown) {
        message.error(t('common.moveFailed') + ': ' + getErrorMessage(error));
      }
    },
    [connections, groups, onSaveConnection]
  );

  const handleReorderConnection = useCallback(
    async (draggedId: string, targetId: string) => {
      const draggedConn = connections.find((c) => c.id === draggedId);
      const targetConn = connections.find((c) => c.id === targetId);
      if (!draggedConn || !targetConn) return;

      const sameGroupConns = connections.filter(
        (c) => (c.group_id || null) === (draggedConn.group_id || null)
      );
      const draggedIdx = sameGroupConns.findIndex((c) => c.id === draggedId);
      const targetIdx = sameGroupConns.findIndex((c) => c.id === targetId);
      if (draggedIdx === -1 || targetIdx === -1) return;

      const reordered = [...sameGroupConns];
      reordered.splice(draggedIdx, 1);
      reordered.splice(targetIdx, 0, draggedConn);

      const orders: Record<string, number> = {};
      reordered.forEach((c, i) => {
        orders[c.id] = i;
      });

      try {
        await api.reorderConnections(orders);
        onRefreshConnections?.();
        message.success(t('common.connectionReordered'));
      } catch (error: unknown) {
        message.error(t('common.reorderFailed') + ': ' + getErrorMessage(error));
      }
    },
    [connections, onRefreshConnections]
  );

  return {
    handleCopyConnection,
    handleMoveConnection,
    handleReorderConnection,
  };
}
