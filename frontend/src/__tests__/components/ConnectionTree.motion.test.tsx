/**
 * 连接树的展开 / 收起不走动画。
 *
 * 虚拟滚动下 antd 的树是这样做收起动画的：在节点下方插入一个「动画行」装着正在消失的子项，
 * 动画结束后再移除。这一行从起步到结束依赖浏览器的下一帧回调（兜底期限要走到「进行中」之后
 * 才启动），渲染一停顿它就留在原地——节点已经收起，下面却还挂着子项；动画进行期间再点
 * 展开 / 收起，树组件还会把点击直接忽略。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'zh-CN', t } }) };
});

import { EnhancedConnectionTree } from '../../components/ConnectionTree/EnhancedConnectionTree';

type TreeProps = React.ComponentProps<typeof EnhancedConnectionTree>;

const PROCEDURES = Array.from(
  { length: 42 },
  (_, i) => `cagg_migrate_${String(i).padStart(3, '0')}`
);
const procedureRows = () => screen.queryAllByText(/^cagg_migrate_\d{3}$/);
const motionRows = () => document.querySelectorAll('.ant-tree-treenode-motion').length;

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
const connectionDatabases: TreeProps['connectionDatabases'] = {
  c1: [
    {
      database: 'postgres',
      tables: [{ table_name: 'users', table_type: 'BASE TABLE', schema: 'public' }],
      loaded: true,
      procedures: PROCEDURES,
      functions: [],
      routinesLoaded: true,
    },
  ],
};

/** 展开状态由外面控制（和 MainLayout 里一样），才能验证「点一下立刻生效」 */
function Harness() {
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
      connectionDatabases={connectionDatabases}
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

const proceduresSwitcher = () => {
  const row = screen.getByText('common.procedures').closest('.ant-tree-treenode');
  if (!row) throw new Error('存储过程 节点不在树里');
  return row.querySelector('.ant-tree-switcher') as HTMLElement;
};

const isOpen = () => proceduresSwitcher().className.includes('ant-tree-switcher_open');

beforeEach(() => {
  cleanup();
});

describe('连接树的展开 / 收起', () => {
  it('展开后子项直接作为普通行出现，不经过动画行', () => {
    render(<Harness />);
    expect(procedureRows()).toHaveLength(0);

    act(() => {
      fireEvent.click(proceduresSwitcher());
    });

    expect(isOpen()).toBe(true);
    expect(procedureRows()).toHaveLength(PROCEDURES.length);
    expect(motionRows()).toBe(0);
  });

  // 有动画时第二次点击会被忽略：节点还是展开的，子项留在树上
  it('展开后紧接着收起：两次点击都生效，树上不剩任何子项', () => {
    render(<Harness />);
    // 两次点击之间只隔一次渲染，不等任何时间或动画
    act(() => {
      fireEvent.click(proceduresSwitcher());
    });
    expect(isOpen()).toBe(true);
    act(() => {
      fireEvent.click(proceduresSwitcher());
    });

    expect(isOpen()).toBe(false);
    expect(procedureRows()).toHaveLength(0);
    expect(motionRows()).toBe(0);
  });
});
