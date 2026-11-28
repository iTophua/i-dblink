/**
 * 复制表：改写的 DDL 不能动列名，数据复制的每一步都要看结果，失败时说明目标表的状态。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

const message = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
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

import { mockExecuteDDL, mockExecuteQuery, mockGetTableDDL } from '../setupTests';
import { CopyTableDialog } from '../../components/CopyTableDialog';

/** api.executeQuery 转成绑定调用时的固定尾部：没有 signal、没有事务会话 */
const BINDING_TAIL = [null, ''];

const MYSQL_DDL =
  'CREATE TABLE `order` (\n' +
  '  `id` int NOT NULL,\n' +
  "  `order_no` varchar(32) NOT NULL COMMENT 'order number',\n" +
  '  PRIMARY KEY (`id`),\n' +
  '  CONSTRAINT `order_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)\n' +
  ') ENGINE=InnoDB';

async function openDialog(props: Partial<React.ComponentProps<typeof CopyTableDialog>> = {}) {
  const onSuccess = vi.fn();
  render(
    <CopyTableDialog
      open
      sourceTable="order"
      sourceDatabase="db1"
      connectionId="c1"
      dbType="mysql"
      databases={['db1', 'db2']}
      onCancel={vi.fn()}
      onSuccess={onSuccess}
      {...props}
    />
  );
  // 弹窗打开后表单要一个微任务才就绪
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return { onSuccess };
}

/** 选「结构和数据」后点「复制」 */
async function copyWithData() {
  await act(async () => {
    fireEvent.click(screen.getByText('common.structureAndData'));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /common\.copy$/ }));
  });
  await waitFor(() =>
    expect(message.success.mock.calls.length + message.error.mock.calls.length).toBeGreaterThan(0)
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockGetTableDDL.mockReset().mockResolvedValue([MYSQL_DDL]);
  mockExecuteDDL.mockReset().mockResolvedValue(undefined);
  mockExecuteQuery.mockReset().mockResolvedValue({ columns: [], rows: [], rows_affected: 1 });
});

describe('CopyTableDialog', () => {
  it('只复制结构：DDL 只改表名和约束名，列名原样保留', async () => {
    const { onSuccess } = await openDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /common\.copy$/ }));
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(mockExecuteDDL).toHaveBeenCalledTimes(1);
    const ddl = mockExecuteDDL.mock.calls[0][1] as string;
    expect(ddl).toContain('CREATE TABLE `order_copy` (');
    // 以前是整段子串替换：列 order_no 会变成 order_copy_no，注释里的 order 也被改掉
    expect(ddl).toContain("`order_no` varchar(32) NOT NULL COMMENT 'order number'");
    expect(ddl).toContain(
      'CONSTRAINT `order_copy_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)'
    );
    expect(mockExecuteDDL.mock.calls[0]).toEqual(['c1', ddl, 'db1', '']);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  // executeQuery 不抛错、把报错放在结果里：以前这一步没人看，数据一行没复制也提示成功
  it('同库复制数据失败：不报成功，说明结构已复制而数据没有', async () => {
    const { onSuccess } = await openDialog();
    mockExecuteQuery.mockResolvedValue({ columns: [], rows: [], error: 'The table is full' });

    await copyWithData();

    expect(mockExecuteQuery).toHaveBeenCalledWith(
      'c1',
      'INSERT INTO `order_copy` SELECT * FROM `order`',
      'db1',
      ...BINDING_TAIL
    );
    expect(message.error).toHaveBeenCalledWith(
      'common.copyTable.copyFailed: common.copyTable.dataCopyFailed: The table is full'
    );
    expect(message.success).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('同库复制数据成功', async () => {
    const { onSuccess } = await openDialog();
    mockExecuteQuery.mockResolvedValue({ columns: [], rows: [], rows_affected: 42 });

    await copyWithData();

    expect(message.success).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalled();
  });

  it('MySQL 跨库复制：交给服务器 INSERT … SELECT，带库名', async () => {
    await openDialog();
    await pickDatabase('db2');

    await copyWithData();

    expect(mockExecuteQuery).toHaveBeenCalledWith(
      'c1',
      'INSERT INTO `db2`.`order_copy` SELECT * FROM `db1`.`order`',
      'db2',
      ...BINDING_TAIL
    );
    expect(message.success).toHaveBeenCalledTimes(1);
  });

  it('跨库逐行复制：第 2 行失败时停下，说明已复制多少行', async () => {
    await openDialog({ dbType: 'postgresql' });
    await pickDatabase('db2');
    mockExecuteQuery.mockResolvedValueOnce({
      columns: ['id', 'order_no'],
      rows: [
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ],
    });
    mockExecuteQuery.mockResolvedValueOnce({ columns: [], rows: [], rows_affected: 1 });
    mockExecuteQuery.mockResolvedValueOnce({ columns: [], rows: [], error: 'duplicate key' });

    await copyWithData();

    expect(mockExecuteQuery).toHaveBeenNthCalledWith(
      1,
      'c1',
      'SELECT * FROM "order"',
      'db1',
      ...BINDING_TAIL
    );
    expect(mockExecuteQuery).toHaveBeenNthCalledWith(
      2,
      'c1',
      'INSERT INTO "order_copy" ("id", "order_no") VALUES (1, \'a\')',
      'db2',
      ...BINDING_TAIL
    );
    expect(mockExecuteQuery).toHaveBeenCalledTimes(3);
    expect(message.error).toHaveBeenCalledWith(
      'common.copyTable.copyFailed: common.copyTable.dataCopyFailed: common.copyTable.rowsCopied duplicate key'
    );
  });

  // 二进制列取回来只剩占位文本 [BLOB: n bytes]，照着写过去等于把数据改坏
  it('跨库逐行复制遇到二进制列：一行都不写', async () => {
    await openDialog({ dbType: 'postgresql' });
    await pickDatabase('db2');
    mockExecuteQuery.mockResolvedValueOnce({
      columns: ['id', 'avatar'],
      rows: [
        [1, '[BLOB: 16 bytes]'],
        [2, null],
      ],
    });

    await copyWithData();

    expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
    expect(message.error).toHaveBeenCalledWith(
      'common.copyTable.copyFailed: common.copyTable.dataCopyFailed: common.copyTable.binaryCrossDatabase'
    );
  });
});

/** 在目标库下拉里选一项（antd 6：展开要点 input[role="combobox"]） */
async function pickDatabase(optionText: string) {
  const combobox = document.querySelector('.ant-modal input[role="combobox"]');
  expect(combobox).toBeTruthy();
  await act(async () => {
    fireEvent.mouseDown(combobox!);
  });
  const options = await screen.findAllByText(
    (content) => typeof content === 'string' && content.includes(optionText),
    {
      selector:
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
    }
  );
  await act(async () => {
    fireEvent.click(options[options.length - 1]);
  });
}
