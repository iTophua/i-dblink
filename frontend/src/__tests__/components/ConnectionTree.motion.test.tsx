/**
 * 连接树的展开 / 收起，两件事：
 *
 * 1. 不走动画。虚拟滚动下 antd 的树是这样做收起动画的：在节点下方插入一个「动画行」装着正在
 *    消失的子项，动画结束后再移除。这一行从起步到结束依赖浏览器的下一帧回调（兜底期限要走到
 *    「进行中」之后才启动），渲染一旦停顿它就留在原地；动画期间再点展开 / 收起，树组件还会把
 *    点击直接忽略。
 * 2. 节点的 key 不重复。名字是会重复的：PG 的过程 / 函数有重载（TimescaleDB 的 cagg_migrate_*
 *    一串），同名触发器可以建在多张表上。key 撞车时 antd 按 key 认节点、React 按 key 复用列表项，
 *    收起后先出现的重名行没人回收，一直留在树上（2026-11 用户在 PG 连接的「存储过程」上遇到：
 *    收起后下面留着三行过程项）。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { MockInstance } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }) };
});

import { EnhancedConnectionTree } from '../../components/ConnectionTree/EnhancedConnectionTree';
import type { SequenceInfo } from '../../types/api';

type TreeProps = React.ComponentProps<typeof EnhancedConnectionTree>;
type DatabaseEntry = TreeProps['connectionDatabases'][string][number];

const PROCEDURES = Array.from(
  { length: 42 },
  (_, i) => `cagg_migrate_${String(i).padStart(3, '0')}`
);
const procedureRows = () => screen.queryAllByText(/^cagg_migrate_\d{3}$/);
const motionRows = () => document.querySelectorAll('.ant-tree-treenode-motion').length;
/** 树上的全部行（开头那行量缩进宽度的是隐藏的，不算） */
const treeRows = () => document.querySelectorAll('.ant-tree-treenode:not([aria-hidden])').length;

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

const noop = () => {};
const baseEntry: DatabaseEntry = {
  database: 'postgres',
  tables: [{ table_name: 'users', table_type: 'BASE TABLE', schema: 'public' }],
  loaded: true,
  procedures: PROCEDURES,
  functions: [],
  routinesLoaded: true,
};

/** 展开状态由外面控制（和 MainLayout 里一样），才能验证「点一下立刻生效」 */
function Harness({ entry = baseEntry }: { entry?: DatabaseEntry } = {}) {
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
      onSelect={noop}
      onTableSelect={noop}
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
      onDatabaseExpand={noop}
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

/** antd 发现 key 重复时打的告警；有它就说明这一行的 key 和别的节点撞了 */
const sameKeyWarnings = (spy: MockInstance<typeof console.error>) =>
  spy.mock.calls.filter((call) => String(call[0]).includes("Same 'key' exist in the Tree")).length;

beforeEach(() => {
  cleanup();
});

describe('连接树的展开 / 收起不走动画', () => {
  it('展开后子项直接作为普通行出现，不经过动画行', () => {
    render(<Harness />);
    expect(procedureRows()).toHaveLength(0);

    act(() => {
      fireEvent.click(folderSwitcher('common.procedures'));
    });

    expect(isOpen('common.procedures')).toBe(true);
    expect(procedureRows()).toHaveLength(PROCEDURES.length);
    expect(motionRows()).toBe(0);
  });

  // 有动画时第二次点击会被忽略：节点还是展开的，子项留在树上
  it('展开后紧接着收起：两次点击都生效，树上不剩任何子项', () => {
    render(<Harness />);
    // 两次点击之间只隔一次渲染，不等任何时间或动画
    act(() => {
      fireEvent.click(folderSwitcher('common.procedures'));
    });
    expect(isOpen('common.procedures')).toBe(true);
    act(() => {
      fireEvent.click(folderSwitcher('common.procedures'));
    });

    expect(isOpen('common.procedures')).toBe(false);
    expect(procedureRows()).toHaveLength(0);
    expect(motionRows()).toBe(0);
  });
});

describe('连接树里重名的节点', () => {
  // 过程 / 函数的重载、建在多张表上的同名触发器：名字一样，是不同的行
  const overloaded = [
    'cagg_migrate_create_plan',
    'cagg_migrate_create_plan',
    'cagg_migrate_create_plan',
    'cagg_migrate_execute_copy_chunk',
    'cagg_migrate_execute_copy_chunk',
    'cagg_migrate_execute_finalize',
  ];
  // PG：建在多张表上的同名触发器
  const sameNamedTriggers = [
    { name: 'set_updated_at', event: 'UPDATE', timing: 'BEFORE', table: 'app.orders' },
    { name: 'set_updated_at', event: 'UPDATE', timing: 'BEFORE', table: 'app.customers' },
    {
      name: 'ts_insert_blocker',
      event: 'INSERT',
      timing: 'BEFORE',
      table: '_timescaledb_internal._hyper_1_2_chunk',
    },
    {
      name: 'ts_insert_blocker',
      event: 'INSERT',
      timing: 'BEFORE',
      table: '_timescaledb_internal._hyper_1_3_chunk',
    },
    { name: 'ts_insert_blocker', event: 'INSERT', timing: 'BEFORE', table: 'public.metrics' },
  ];
  const sequence = (name: string): SequenceInfo => ({
    sequence_name: name,
    data_type: 'bigint',
    start_value: '1',
    minimum_value: '1',
    maximum_value: '9223372036854775807',
    increment: '1',
    cycle_option: 'NO',
  });

  it.each([
    ['common.procedures', { procedures: overloaded }, 'cagg_migrate_create_plan', 3],
    ['common.functions', { functions: overloaded }, 'cagg_migrate_execute_copy_chunk', 2],
    ['common.triggers', { triggers: sameNamedTriggers }, 'ts_insert_blocker', 3],
    [
      'common.sequences',
      { sequences: [sequence('orders_id_seq'), sequence('orders_id_seq')] },
      'orders_id_seq',
      2,
    ],
  ])('%s：每一行都在，收起后一行不剩', (folder, entry, name, copies) => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness entry={{ ...baseEntry, ...entry }} />);
    const rowsBefore = treeRows();

    act(() => {
      fireEvent.click(folderSwitcher(folder));
    });
    expect(isOpen(folder)).toBe(true);
    // 不靠丢掉重名的行来避开：它们各自是一条
    expect(screen.getAllByText(name)).toHaveLength(copies);
    expect(sameKeyWarnings(errSpy)).toBe(0);

    act(() => {
      fireEvent.click(folderSwitcher(folder));
    });

    expect(isOpen(folder)).toBe(false);
    expect(screen.queryAllByText(name)).toHaveLength(0);
    expect(treeRows()).toBe(rowsBefore);
    expect(sameKeyWarnings(errSpy)).toBe(0);
    errSpy.mockRestore();
  });

  // 应用里的树是虚拟滚动的：容器量到高度后只渲染窗口里的行，收起时窗口跟着变短。
  // jsdom 量不到高度，用一个报固定高度的 ResizeObserver 让它进入这种模式
  it('虚拟滚动下：窗口里的重名行都渲染，收起后一行不剩', async () => {
    const Original = window.ResizeObserver;
    window.ResizeObserver = class {
      callback?: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        const entry = { target, contentRect: { height: 200 } } as unknown as ResizeObserverEntry;
        queueMicrotask(() => this.callback?.([entry], this as unknown as ResizeObserver));
      }
      unobserve() {}
      disconnect() {}
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(<Harness entry={{ ...baseEntry, procedures: overloaded }} />);
      await act(async () => {});
      const rowsBefore = treeRows();

      act(() => {
        fireEvent.click(folderSwitcher('common.procedures'));
      });

      // 一共 7 + 6 行，窗口放得下前 9 行：确实是按窗口渲染的
      expect(treeRows()).toBe(9);
      expect(screen.getAllByText('cagg_migrate_create_plan')).toHaveLength(3);

      act(() => {
        fireEvent.click(folderSwitcher('common.procedures'));
      });

      expect(screen.queryAllByText(/^cagg_migrate_/)).toHaveLength(0);
      expect(treeRows()).toBe(rowsBefore);
      expect(sameKeyWarnings(errSpy)).toBe(0);
    } finally {
      window.ResizeObserver = Original;
      errSpy.mockRestore();
    }
  });
});
