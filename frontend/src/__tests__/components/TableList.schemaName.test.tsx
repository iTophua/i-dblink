/**
 * 对象页的表列表：PG 系 / SQL Server 的表对外用「schema.表」，打开、选中、工具栏操作
 * 传出去的都是它。此前只传表名，数据页按 search_path 找同名表，打开（和改）的可能是
 * 别的 schema 里的表。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const message = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
const getTables = vi.fn();

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error 测试环境补齐浏览器 API
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }) };
});

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return { ...actual, App: { ...actual.App, useApp: () => ({ message }) } };
});

vi.mock('../../hooks/useApi', () => ({
  useDatabase: () => ({ getTables }),
}));

import { TableList } from '../../components/TableList';
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

// 同名的表出现在两个 schema 里：不带 schema 分不清是哪一张
const seedTables = (tables: Array<{ table_name: string; schema?: string }>) =>
  useAppStore.setState({
    tableDataCache: {
      'c1::appdb': {
        tables: tables.map((t) => ({
          table_name: t.table_name,
          table_type: 'BASE TABLE',
          schema: t.schema,
        })),
        loaded: true,
        loading: false,
      },
    },
  });

type Callbacks = Pick<
  React.ComponentProps<typeof TableList>,
  | 'onTableOpen'
  | 'onTableSelect'
  | 'onTableCopy'
  | 'onTableTruncate'
  | 'onTableDelete'
  | 'onTableDump'
>;

const renderList = (overrides: Partial<React.ComponentProps<typeof TableList>> = {}) => {
  const callbacks: Callbacks = {
    onTableOpen: vi.fn(),
    onTableSelect: vi.fn(),
    onTableCopy: vi.fn(),
    onTableTruncate: vi.fn(),
    onTableDelete: vi.fn(),
    onTableDump: vi.fn(),
  };
  const view = render(
    <TableList connectionId="c1" database="appdb" schema="app" {...callbacks} {...overrides} />
  );
  return { ...view, callbacks };
};

const toolbarFirstButton = () =>
  document.querySelector('.tablelist-toolbar button') as HTMLButtonElement;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  getTables.mockResolvedValue([]);
});

describe('TableList 的表名', () => {
  it('PG：双击、单击选中、工具栏操作都用 schema.表', async () => {
    useAppStore.setState({ connections: [connect('postgresql')] });
    seedTables([
      { table_name: 'users', schema: 'public' },
      { table_name: 'users', schema: 'app' },
      { table_name: 'orders', schema: 'app' },
    ]);
    const { callbacks } = renderList();

    const orders = await screen.findByText('orders');
    // 双击 = 250ms 内连点两次
    fireEvent.click(orders);
    fireEvent.click(orders);
    expect(callbacks.onTableOpen).toHaveBeenCalledWith('app.orders', 'appdb');

    // 单击：稍后回调里通知选中，传出去的同样是 schema.表（外面拿它显示表结构页）
    const users = screen.getByText('users');
    fireEvent.click(users);
    await waitFor(() => expect(callbacks.onTableSelect).toHaveBeenCalledWith('app.users', 'appdb'));

    // 工具栏第一个按钮是「打开表」：作用于当前选中的表
    await waitFor(() => expect(toolbarFirstButton().disabled).toBe(false));
    fireEvent.click(toolbarFirstButton());
    expect(callbacks.onTableOpen).toHaveBeenLastCalledWith('app.users', 'appdb');
  });

  it('MySQL：只用表名', async () => {
    useAppStore.setState({ connections: [connect('mysql')] });
    seedTables([{ table_name: 'users' }]);
    const { callbacks } = renderList({ schema: undefined });

    const users = await screen.findByText('users');
    fireEvent.click(users);
    fireEvent.click(users);
    expect(callbacks.onTableOpen).toHaveBeenCalledWith('users', 'appdb');
  });
});
