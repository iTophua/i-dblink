/**
 * 全局搜索打开表：PG 系、SQL Server 用「schema.表」，其余库只用表名。
 * 不带 schema 时数据页按 search_path 找同名表，打开（和改）的可能是别的 schema 里的表
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }) };
});

import { GlobalSearch } from '../../components/GlobalSearch';
import { useAppStore } from '../../stores/appStore';
import type { Connection } from '../../stores/appStore';

const connect = (dbType: string) =>
  ({
    id: 'c1',
    name: 'c1',
    db_type: dbType,
    host: 'h',
    port: 1,
    username: 'u',
    status: 'connected',
    ssh_enabled: false,
    ssl_enabled: false,
    ssl_skip_verify: false,
  }) as unknown as Connection;

const connectionDatabases = {
  c1: [
    {
      database: 'appdb',
      tables: [
        { table_name: 'users', table_type: 'BASE TABLE', schema: 'app' },
        { table_name: 'v_recent', table_type: 'VIEW', schema: 'app' },
      ],
    },
  ],
};

const renderSearch = () => {
  const onSelectTable = vi.fn();
  render(
    <GlobalSearch
      open
      onClose={vi.fn()}
      onSelectTable={onSelectTable}
      connectionDatabases={connectionDatabases}
    />
  );
  return { onSelectTable };
};

beforeEach(() => {
  cleanup();
  useAppStore.setState({ connections: [] });
});

describe('GlobalSearch 打开表', () => {
  it('PG：回车和点击都传 schema.表', async () => {
    useAppStore.setState({ connections: [connect('postgresql')] });
    const { onSelectTable } = renderSearch();

    const input = await screen.findByPlaceholderText('common.searchTableOrView');
    fireEvent.change(input, { target: { value: 'users' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectTable).toHaveBeenLastCalledWith('c1', 'appdb', 'app.users');

    fireEvent.change(input, { target: { value: 'v_recent' } });
    // 列表里显示的仍是表名本身，带 schema 的名字只在打开时用
    fireEvent.click(screen.getByText('v_recent'));
    expect(screen.queryByText('app.v_recent')).toBeNull();
    expect(onSelectTable).toHaveBeenLastCalledWith('c1', 'appdb', 'app.v_recent');
  });

  it('MySQL：只传表名', async () => {
    useAppStore.setState({ connections: [connect('mysql')] });
    const { onSelectTable } = renderSearch();

    const input = await screen.findByPlaceholderText('common.searchTableOrView');
    fireEvent.change(input, { target: { value: 'users' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectTable).toHaveBeenCalledWith('c1', 'appdb', 'users');
  });
});
