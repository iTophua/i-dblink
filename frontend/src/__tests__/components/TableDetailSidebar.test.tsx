/**
 * TableDetailSidebar 回归测试：
 * 后端统计字段可能以数字字符串返回（data_length: '0' 曾导致 formatBytes 崩溃）。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntdApp } from 'antd';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) };
});

vi.mock('../../api', () => ({
  api: {
    getTableDDL: vi.fn().mockResolvedValue(['CREATE TABLE `t1` (`id` int);']),
  },
}));

const getTableInfo = vi.fn().mockResolvedValue({
  engine: 'InnoDB',
  row_count: '1,234',
  data_length: '0',
  index_length: '512',
  collation: 'utf8mb4_general_ci',
  create_time: '2026-01-01 00:00:00',
  update_time: '2026-01-02 00:00:00',
});
vi.mock('../../hooks/useApi', () => ({
  useDatabase: () => ({ getTableInfo }),
}));

import { TableDetailSidebar } from '../../components/TableDetailSidebar';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
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
});

describe('TableDetailSidebar', () => {
  it('数字字符串长度不会导致崩溃，信息页正常展示', async () => {
    render(
      <AntdApp>
        <TableDetailSidebar
          connectionId="c1"
          database="db1"
          tableName="t1"
          width={320}
          onWidthChange={() => {}}
        />
      </AntdApp>
    );

    expect(screen.getByText('t1')).toBeInTheDocument();
    await userEvent.click(screen.getByText('common.info'));

    // 字符串 "1,234" 归一化为带千分位的数字；'0' 显示 '-'
    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('512 B')).toBeInTheDocument();
  });
});
