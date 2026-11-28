/**
 * 树上的「存储过程 / 函数 / 触发器 / 序列」四个目录：
 *
 * 1. 双击标题和点箭头一样展开 / 收起。此前只有箭头能展开：标题上没挂双击，
 *    `handleDoubleClick` 里也没有这四个类型（表、视图目录都有）。
 * 2. 选中目录或其中的项时，对象页切到对应的列表（和选中表目录列出表一样）。
 *    此前 `handleSelect` 没有这几个类型，点了对对象页没有任何影响。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { useState } from 'react';
import { render, renderHook, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }) };
});

import { EnhancedConnectionTree } from '../../components/ConnectionTree/EnhancedConnectionTree';
import { useTreeHandlers } from '../../components/ConnectionTree/hooks/useTreeHandlers';
import type { Connection } from '../../stores/appStore';
import type { SequenceInfo } from '../../types/api';

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

beforeEach(() => {
  cleanup();
});

describe('useTreeHandlers：例程目录', () => {
  const connection = {
    id: 'c1',
    name: 'pg',
    db_type: 'postgresql',
    host: 'h',
    port: 5432,
    username: 'u',
    status: 'connected',
    ssh_enabled: false,
    ssl_enabled: false,
    ssl_skip_verify: false,
  } as unknown as Connection;

  /** 例程已经加载好的库 */
  const loaded = {
    c1: [{ database: 'postgres', loaded: true, routinesLoaded: true }],
  };

  const setup = (databases: Record<string, unknown[]> = loaded) => {
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
      connectionDatabasesRef: { current: databases },
    };
    const { result } = renderHook(() => useTreeHandlers([connection], callbacks, refs));
    return { ...result.current, callbacks, refs };
  };

  const folders: [string, string][] = [
    ['procedures', 'procedures::c1::postgres'],
    ['functions', 'functions::c1::postgres'],
    ['triggers', 'triggers::c1::postgres'],
    ['sequences', 'sequences::c1::postgres'],
  ];

  it.each(folders)('双击「%s」的标题：切换展开', async (_name, key) => {
    const { handleDoubleClick, callbacks, refs } = setup();

    await act(async () => {
      await handleDoubleClick(key);
    });
    expect(callbacks.onExpandKeys).toHaveBeenLastCalledWith([key]);
    expect(callbacks.onDatabaseExpand).not.toHaveBeenCalled();

    refs.expandedKeysRef.current = [key];
    await act(async () => {
      await handleDoubleClick(key);
    });
    expect(callbacks.onExpandKeys).toHaveBeenLastCalledWith([]);
  });

  it('双击标题：列表还没加载时先触发加载', async () => {
    const { handleDoubleClick, callbacks } = setup({
      c1: [{ database: 'postgres', loaded: true, routinesLoaded: false }],
    });

    await act(async () => {
      await handleDoubleClick('procedures::c1::postgres');
    });

    expect(callbacks.onDatabaseExpand).toHaveBeenCalledWith('c1', 'postgres');
    expect(callbacks.onExpandKeys).toHaveBeenCalledWith(['procedures::c1::postgres']);
  });

  it('点箭头展开：没加载时同样触发加载（双击和点箭头走同一段）', async () => {
    const { handleExpand, callbacks } = setup({
      c1: [{ database: 'postgres', loaded: true, routinesLoaded: false }],
    });

    await act(async () => {
      await handleExpand(['procedures::c1::postgres'], {
        node: { key: 'procedures::c1::postgres' },
        expanded: true,
      });
    });

    expect(callbacks.onDatabaseExpand).toHaveBeenCalledWith('c1', 'postgres');
  });

  it('加载失败的库：照样展开，但不再反复触发加载', async () => {
    const { handleDoubleClick, handleExpand, callbacks } = setup({
      c1: [{ database: 'postgres', loaded: true, loadFailed: true }],
    });
    const key = 'procedures::c1::postgres';

    await act(async () => {
      await handleDoubleClick(key);
    });
    await act(async () => {
      await handleExpand([key], { node: { key }, expanded: true });
    });

    expect(callbacks.onDatabaseExpand).not.toHaveBeenCalled();
    expect(callbacks.onExpandKeys).toHaveBeenCalledWith([key]);
  });

  it.each([
    ['procedures::c1::postgres', 'procedure'],
    ['proc::c1::postgres::sp_a', 'procedure'],
    ['functions::c1::postgres', 'function'],
    ['func::c1::postgres::fn_a', 'function'],
    ['triggers::c1::postgres', 'trigger'],
    ['trigger::c1::postgres::trg_a', 'trigger'],
    ['sequences::c1::postgres', 'sequence'],
    ['seq::c1::postgres::public.orders_id_seq', 'sequence'],
  ])('选中 %s：对象页切到 %s', (key, kind) => {
    const { handleSelect, callbacks } = setup();

    act(() => {
      handleSelect([key]);
    });

    expect(callbacks.onSelect).toHaveBeenCalledWith('c1');
    // 不再选中某张表：对象页从表结构回到列表
    expect(callbacks.onTableSelect).toHaveBeenCalledWith(null, 'postgres');
    expect(callbacks.onObjectTypeSelect).toHaveBeenCalledWith(kind, 'postgres');
  });
});

describe('树上的例程目录', () => {
  type TreeProps = React.ComponentProps<typeof EnhancedConnectionTree>;
  type DatabaseEntry = TreeProps['connectionDatabases'][string][number];

  const sequence = (name: string): SequenceInfo => ({
    sequence_name: name,
    data_type: 'bigint',
    start_value: '1',
    minimum_value: '1',
    maximum_value: '9223372036854775807',
    increment: '1',
    cycle_option: 'NO',
  });
  const entry: DatabaseEntry = {
    database: 'postgres',
    tables: [{ table_name: 'users', table_type: 'BASE TABLE', schema: 'public' }],
    loaded: true,
    procedures: ['sp_a', 'sp_b'],
    functions: ['fn_a'],
    triggers: [{ name: 'trg_a', event: 'INSERT', timing: 'BEFORE', table: 'app.orders' }],
    sequences: [sequence('public.orders_id_seq')],
    routinesLoaded: true,
  };

  const makeCallbacks = () => ({
    onSelect: vi.fn(),
    onTableSelect: vi.fn(),
    onObjectTypeSelect: vi.fn(),
    onDatabaseExpand: vi.fn(),
  });
  const noop = () => {};

  function Harness({ cbs }: { cbs: ReturnType<typeof makeCallbacks> }) {
    const [expandedKeys, setExpandedKeys] = useState<string[]>(['c1', 'db::c1::postgres']);
    return (
      <EnhancedConnectionTree
        connections={
          [
            {
              id: 'c1',
              name: 'pg',
              db_type: 'postgresql',
              host: 'h',
              port: 5432,
              username: 'u',
              database: 'postgres',
              status: 'connected',
              ssh_enabled: false,
              ssl_enabled: false,
              ssl_skip_verify: false,
              tables: {},
            },
          ] as unknown as TreeProps['connections']
        }
        groups={[]}
        selectedId="c1"
        selectedTableId={null}
        onSelect={cbs.onSelect}
        onTableSelect={cbs.onTableSelect}
        onObjectTypeSelect={cbs.onObjectTypeSelect}
        onTableOpen={noop}
        onExpand={noop}
        collapsed={false}
        searchText=""
        expandedKeys={expandedKeys}
        onExpandKeys={setExpandedKeys}
        connectionDatabases={{ c1: [entry] }}
        isLoading={false}
        onConnect={noop}
        onDisconnect={noop}
        onEditConnection={noop}
        onDeleteConnection={noop}
        onNewQuery={noop}
        onDatabaseExpand={cbs.onDatabaseExpand}
        onTableExpand={noop}
        onSaveConnection={async () => {}}
        onSaveGroup={async () => {}}
        onDeleteGroup={noop}
      />
    );
  }

  const folderSwitcher = (label: string) => {
    const row = screen.getByText(label).closest('.ant-tree-treenode');
    if (!row) throw new Error(`${label} 节点不在树里`);
    return row.querySelector('.ant-tree-switcher') as HTMLElement;
  };

  const isOpen = (label: string) =>
    folderSwitcher(label).className.includes('ant-tree-switcher_open');

  it.each([
    ['common.procedures', 'sp_a'],
    ['common.functions', 'fn_a'],
    ['common.triggers', 'trg_a'],
    ['common.sequences', 'public.orders_id_seq'],
  ])('双击「%s」的标题：展开；再双击：收起', (label, itemName) => {
    render(<Harness cbs={makeCallbacks()} />);
    expect(screen.queryByText(itemName)).toBeNull();

    act(() => {
      fireEvent.doubleClick(screen.getByText(label));
    });
    expect(isOpen(label)).toBe(true);
    expect(screen.getByText(itemName)).toBeInTheDocument();

    act(() => {
      fireEvent.doubleClick(screen.getByText(label));
    });
    expect(isOpen(label)).toBe(false);
    expect(screen.queryByText(itemName)).toBeNull();
  });

  it('单击目录标题：通知对象页切到这一类', () => {
    const cbs = makeCallbacks();
    render(<Harness cbs={cbs} />);

    act(() => {
      fireEvent.click(screen.getByText('common.procedures'));
    });

    expect(cbs.onObjectTypeSelect).toHaveBeenCalledWith('procedure', 'postgres');
    expect(cbs.onTableSelect).toHaveBeenCalledWith(null, 'postgres');
    expect(cbs.onSelect).toHaveBeenCalledWith('c1');
  });

  it('单击目录里的项：对象页也切到这一类', () => {
    const cbs = makeCallbacks();
    render(<Harness cbs={cbs} />);
    act(() => {
      fireEvent.click(folderSwitcher('common.triggers'));
    });
    expect(screen.getByText('trg_a')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText('trg_a'));
    });

    expect(cbs.onObjectTypeSelect).toHaveBeenCalledWith('trigger', 'postgres');
    expect(cbs.onTableSelect).toHaveBeenCalledWith(null, 'postgres');
  });
});
