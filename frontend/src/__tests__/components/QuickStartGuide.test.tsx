import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

import { QuickStartGuide } from '../../components/LoadingStates';

const baseProps = {
  connectionCount: 0,
  recentDatabases: [],
  onCreateConnection: vi.fn(),
  onImportConnection: vi.fn(),
  onShowShortcuts: vi.fn(),
};

describe('QuickStartGuide 工作台首页', () => {
  it('无连接时显示新手指引，不再提示从左侧选择', () => {
    render(<QuickStartGuide {...baseProps} />);
    expect(screen.getByText('common.welcome.noConnectionHint')).toBeInTheDocument();
    expect(screen.queryByText('common.pleaseSelectConnection')).not.toBeInTheDocument();
  });

  it('已有连接时提示从左侧选择或新建查询', () => {
    render(<QuickStartGuide {...baseProps} connectionCount={2} />);
    expect(screen.getByText('common.welcome.selectConnectionHint')).toBeInTheDocument();
  });

  it('无最近记录时回退到快捷键卡', () => {
    render(<QuickStartGuide {...baseProps} />);
    expect(screen.getAllByText('common.shortcutsTitle').length).toBeGreaterThan(0);
    expect(screen.queryByText('common.recentDatabases')).not.toBeInTheDocument();
  });

  it('有最近记录时展示库名/连接名，点击回调携带连接与库', () => {
    const onOpenRecentDatabase = vi.fn();
    render(
      <QuickStartGuide
        {...baseProps}
        connectionCount={1}
        onOpenRecentDatabase={onOpenRecentDatabase}
        recentDatabases={[
          {
            connectionId: 'conn-1',
            database: 'demo_db',
            connectionName: '本地测试',
            dbType: 'mysql',
            connected: true,
            lastUsed: Date.now(),
          },
        ]}
      />
    );

    expect(screen.getByText('common.recentDatabases')).toBeInTheDocument();
    expect(screen.getByText('demo_db')).toBeInTheDocument();
    expect(screen.getByText('本地测试')).toBeInTheDocument();

    fireEvent.click(screen.getByText('demo_db'));
    expect(onOpenRecentDatabase).toHaveBeenCalledWith('conn-1', 'demo_db');
  });

  it('打开 SQL 文件按钮触发回调', () => {
    const onOpenSqlFile = vi.fn();
    render(<QuickStartGuide {...baseProps} onOpenSqlFile={onOpenSqlFile} />);
    fireEvent.click(screen.getByText('common.openSqlFile'));
    expect(onOpenSqlFile).toHaveBeenCalledTimes(1);
  });
});
