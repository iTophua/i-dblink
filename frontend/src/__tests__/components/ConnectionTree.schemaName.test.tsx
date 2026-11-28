/**
 * 从连接树打开表时要带上 schema（PG 系、SQL Server）。
 *
 * 此前双击表、右键菜单、单击选中都只传表名：PG 上数据页按 search_path 找同名表，
 * 打开（和改）的可能是别的 schema 里的表；右键删表落到 search_path 上，IF EXISTS 什么都不删
 * 却提示成功。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import type { MenuProps } from 'antd';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }) };
});

import { TableNode } from '../../components/ConnectionTree/components/TableNode';
import { ViewNode } from '../../components/ConnectionTree/components/ViewNode';
import { useTreeHandlers } from '../../components/ConnectionTree/hooks/useTreeHandlers';
import type { Connection } from '../../stores/appStore';

const node = (overrides: Partial<React.ComponentProps<typeof TableNode>> = {}) => ({
  connId: 'c1',
  database: 'appdb',
  table: { table_name: 'users', table_type: 'BASE TABLE', schema: 'app' },
  schema: 'app',
  dbType: 'postgresql',
  selectedTableId: null,
  onTableClick: vi.fn(),
  onTableOpen: vi.fn(),
  onContextMenu: vi.fn((): MenuProps => ({ items: [] })),
  onNewQuery: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  cleanup();
});

describe('TableNode 的表名', () => {
  it('PG：双击打开、单击、右键菜单都用 schema.表', () => {
    const props = node();
    render(<TableNode {...props} />);

    fireEvent.doubleClick(screen.getByTestId('table-node-users'));
    expect(props.onTableOpen).toHaveBeenCalledWith('app.users', 'appdb');

    fireEvent.click(screen.getByTestId('table-node-users'));
    expect(props.onTableClick).toHaveBeenCalledWith('app.users', 'appdb', 'app');

    expect(props.onContextMenu).toHaveBeenCalledWith('c1', 'app.users', 'appdb');
  });

  // MySQL 的库是单独一个参数；Oracle 的 owner 不拼进表名，带了会被当成名字本身加引号
  it('不认 schema 的库、或没有 schema：只用表名', () => {
    for (const [dbType, schema] of [
      ['mysql', 'app'],
      ['oracle', 'HR'],
      ['postgresql', undefined],
    ] as const) {
      const props = node({ dbType, schema });
      const { unmount } = render(<TableNode {...props} />);
      fireEvent.doubleClick(screen.getByTestId('table-node-users'));
      expect(props.onTableOpen, `${dbType}/${schema}`).toHaveBeenCalledWith('users', 'appdb');
      unmount();
    }
  });

  it('SQL Server：schema.表', () => {
    const props = node({ dbType: 'sqlserver', schema: 'sales' });
    render(<TableNode {...props} />);
    fireEvent.doubleClick(screen.getByTestId('table-node-users'));
    expect(props.onTableOpen).toHaveBeenCalledWith('sales.users', 'appdb');
  });

  // 单击选中后外面存的是 schema.表：树的选中高亮要认它，也要认不带 schema 的旧值
  it('选中高亮：带 schema 和不带 schema 的名字都认', () => {
    const selectedStyle = 'var(--row-selected-bg)';
    for (const selectedTableId of ['app.users', 'users']) {
      const props = node({ selectedTableId });
      const { unmount } = render(<TableNode {...props} />);
      expect(screen.getByTestId('table-node-users').style.background, selectedTableId).toBe(
        selectedStyle
      );
      unmount();
    }
    render(<TableNode {...node({ selectedTableId: 'public.users' })} />);
    expect(screen.getByTestId('table-node-users').style.background).toBe('transparent');
  });
});

describe('ViewNode 的视图名', () => {
  it('PG：双击用 schema.视图', () => {
    const onViewOpen = vi.fn();
    render(
      <ViewNode
        connId="c1"
        database="appdb"
        view={{ table_name: 'v_recent', table_type: 'VIEW', schema: 'app' }}
        schema="app"
        dbType="postgresql"
        selectedTableId={null}
        onViewOpen={onViewOpen}
        onTableOpen={vi.fn()}
        onTableClick={vi.fn()}
        onContextMenu={vi.fn((): MenuProps => ({ items: [] }))}
        onNewQuery={vi.fn()}
      />
    );
    fireEvent.doubleClick(screen.getByTestId('view-node-v_recent'));
    expect(onViewOpen).toHaveBeenCalledWith('app.v_recent', 'appdb');
  });
});

describe('useTreeHandlers', () => {
  const connection = (dbType: string) =>
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

  const setup = (dbType: string) => {
    const callbacks = {
      onExpandKeys: vi.fn(),
      onConnect: vi.fn(),
      onExpand: vi.fn(),
      onDatabaseExpand: vi.fn(),
      onTableExpand: vi.fn(),
      onTableOpen: vi.fn(),
      onViewOpen: vi.fn(),
      onSelect: vi.fn(),
      onTableSelect: vi.fn(),
      onObjectTypeSelect: vi.fn(),
    };
    const refs = {
      expandedKeysRef: { current: [] as string[] },
      connectionDatabasesRef: { current: {} as Record<string, unknown[]> },
    };
    const { result } = renderHook(() => useTreeHandlers([connection(dbType)], callbacks, refs));
    return { ...result.current, callbacks };
  };

  // 节点 key 里带着 schema（schema 模式：表::连接::库::schema::表）
  it('双击节点：PG 把 key 里的 schema 拼进表名', () => {
    const { handleDoubleClick, callbacks } = setup('postgresql');

    act(() => {
      handleDoubleClick('table::c1::appdb::app::users');
    });
    expect(callbacks.onTableOpen).toHaveBeenCalledWith('app.users', 'appdb');

    act(() => {
      handleDoubleClick('view::c1::appdb::app::v_recent');
    });
    expect(callbacks.onViewOpen).toHaveBeenCalledWith('app.v_recent', 'appdb');

    // 扁平模式的 key 没有 schema：只有表名
    act(() => {
      handleDoubleClick('table::c1::appdb::orders');
    });
    expect(callbacks.onTableOpen).toHaveBeenLastCalledWith('orders', 'appdb');
  });

  it('双击节点：MySQL 不拼 schema', () => {
    const { handleDoubleClick, callbacks } = setup('mysql');
    act(() => {
      handleDoubleClick('table::c1::appdb::app::users');
    });
    expect(callbacks.onTableOpen).toHaveBeenCalledWith('users', 'appdb');
  });

  // 选中（单击）后外面拿它当表结构页的表名：必须是明确的那张表
  it('选中节点：传出去的也是 schema.表', () => {
    const { handleSelect, callbacks } = setup('postgresql');
    act(() => {
      handleSelect(['table::c1::appdb::app::users']);
    });
    expect(callbacks.onTableSelect).toHaveBeenCalledWith('app.users', 'appdb');
    expect(callbacks.onObjectTypeSelect).toHaveBeenCalledWith('table', 'appdb', 'app');

    act(() => {
      handleSelect(['view::c1::appdb::app::v_recent']);
    });
    expect(callbacks.onTableSelect).toHaveBeenLastCalledWith('app.v_recent', 'appdb');
  });
});
