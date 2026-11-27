import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { useAppStore } from '../../stores/appStore';
import type { Connection, ConnectionGroup } from '../../stores/appStore';
import { api } from '../../api';
import { useGroups } from '../../hooks/useApi';
import {
  isUngroupedConnection,
  UNGROUPED_GROUP_ID,
} from '../../components/ConnectionTree/utils/groupUtils';

const connection = (id: string, group_id?: string): Connection => ({
  id,
  name: id,
  db_type: 'mysql',
  host: '127.0.0.1',
  port: 3306,
  username: 'root',
  status: 'disconnected',
  group_id,
  tables: {},
});

const group = (id: string): ConnectionGroup => ({
  id,
  name: id,
  icon: '📁',
  color: '#6d6d6d',
  parent_id: undefined,
});

const wrapper = ({ children }: { children: React.ReactNode }) => <AntdApp>{children}</AntdApp>;

describe('isUngroupedConnection', () => {
  // 连接树只把空值和 'default' 当未分组；其余值都会去找对应的真实分组
  it.each([
    ['undefined', undefined],
    ['空字符串', ''],
    ['旧数据的 default', UNGROUPED_GROUP_ID],
  ])('%s 算未分组', (_name, group_id) => {
    expect(isUngroupedConnection(connection('c', group_id))).toBe(true);
  });

  it('真实分组不算未分组', () => {
    expect(isUngroupedConnection(connection('c', 'prod'))).toBe(false);
  });
});

describe('useGroups().deleteGroup', () => {
  beforeEach(() => {
    useAppStore.getState().setConnections([connection('c1', 'prod'), connection('c2', 'dev')]);
    useAppStore.getState().setGroups([group(UNGROUPED_GROUP_ID), group('prod'), group('dev')]);
  });

  // 后端删除分组后组内连接变为未分组，但要等重新拉取才反映到本地；在那之前它们在树里不显示
  it('删除分组后，组内连接在本地立即变为未分组', async () => {
    const spy = vi.spyOn(api, 'deleteGroup').mockResolvedValue(undefined);
    const { result } = renderHook(() => useGroups(), { wrapper });

    await act(async () => {
      await result.current.deleteGroup('prod');
    });

    const { connections, groups } = useAppStore.getState();
    expect(connections.find((c) => c.id === 'c1')?.group_id).toBeUndefined();
    expect(connections.find((c) => c.id === 'c2')?.group_id).toBe('dev');
    expect(groups.map((g) => g.id)).toEqual([UNGROUPED_GROUP_ID, 'dev']);
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(false));
    spy.mockRestore();
  });

  it('删除失败时分组和连接都不动', async () => {
    const spy = vi.spyOn(api, 'deleteGroup').mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useGroups(), { wrapper });

    await act(async () => {
      await expect(result.current.deleteGroup('prod')).rejects.toThrow('boom');
    });

    const { connections, groups } = useAppStore.getState();
    expect(connections.find((c) => c.id === 'c1')?.group_id).toBe('prod');
    expect(groups.map((g) => g.id)).toEqual([UNGROUPED_GROUP_ID, 'prod', 'dev']);
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(false));
    spy.mockRestore();
  });
});
