/**
 * 网格内联编辑器：画布上的双击编辑在 jsdom 里驱动不了，这里直接渲染编辑器组件，
 * 用真实的 input 事件验证「没动过 = 取消」。此前 NULL 格子点进去再点走会被上报成「改成了空串」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { GridCellKind, type GridCell, type Theme } from '@glideapps/glide-data-grid';
import { InlineCellEditor } from '../../components/DataTable/GlideDataTable';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) };
});

beforeEach(() => {
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
});

const textCell = (data: string): GridCell =>
  ({
    kind: GridCellKind.Text,
    data,
    displayData: data === '' ? 'NULL' : data,
    allowOverlay: true,
  }) as GridCell;

async function openEditor(value: GridCell, initialValue?: string) {
  const onFinishedEditing = vi.fn();
  const utils = render(
    <InlineCellEditor
      value={value}
      initialValue={initialValue}
      onChange={vi.fn()}
      onFinishedEditing={onFinishedEditing}
      isHighlighted={false}
      target={{ x: 0, y: 0, width: 120, height: 24 }}
      forceEditMode={false}
      theme={{} as Theme}
    />
  );
  const input = utils.getByRole('textbox');
  // 编辑器挂载后的下一拍才聚焦；真实卸载的判定依赖「已经聚焦过」
  await waitFor(() => expect(input).toHaveFocus());
  return { ...utils, input, onFinishedEditing };
}

const cancelled = (onFinishedEditing: ReturnType<typeof vi.fn>) => {
  expect(onFinishedEditing).toHaveBeenCalledTimes(1);
  // 不带参数 = 取消
  expect(onFinishedEditing.mock.calls[0]).toEqual([]);
};

describe('InlineCellEditor', () => {
  it('NULL 格子：点进去什么都没输就失焦 → 取消，不上报空串', async () => {
    const { input, onFinishedEditing } = await openEditor(textCell(''));
    fireEvent.blur(input);
    cancelled(onFinishedEditing);
  });

  it('有值的格子：什么都没输就回车 → 取消', async () => {
    const { input, onFinishedEditing } = await openEditor(textCell('abc'));
    fireEvent.keyDown(input, { key: 'Enter' });
    cancelled(onFinishedEditing);
  });

  it('有值的格子：什么都没输就失焦 → 取消', async () => {
    const { input, onFinishedEditing } = await openEditor(textCell('abc'));
    fireEvent.blur(input);
    cancelled(onFinishedEditing);
  });

  it('输了内容再回车 → 上报输入的值', async () => {
    const { input, onFinishedEditing } = await openEditor(textCell(''));
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onFinishedEditing).toHaveBeenCalledTimes(1);
    expect(onFinishedEditing.mock.calls[0][0]).toMatchObject({
      kind: GridCellKind.Text,
      data: 'hello',
    });
  });

  it('NULL 格子里输入后又清空 → 上报空串（用户确实要把它改成空串）', async () => {
    const { input, onFinishedEditing } = await openEditor(textCell(''));
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onFinishedEditing.mock.calls[0][0]).toMatchObject({ data: '' });
  });

  it('数值格清空 → 上报 NULL（数值列写不了空串）', async () => {
    const { input, onFinishedEditing } = await openEditor({
      kind: GridCellKind.Number,
      data: 5,
      displayData: '5',
      allowOverlay: true,
    } as GridCell);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onFinishedEditing.mock.calls[0][0]).toMatchObject({ data: 'NULL' });
  });

  it('直接键入开启编辑（Glide 把首键作为 initialValue）：这个键就是输入', async () => {
    const { input, onFinishedEditing } = await openEditor(textCell(''), '7');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onFinishedEditing.mock.calls[0][0]).toMatchObject({ data: '7' });
  });

  it('Esc 一律取消', async () => {
    const { input, onFinishedEditing } = await openEditor(textCell('abc'));
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    cancelled(onFinishedEditing);
  });

  it('输了内容后编辑器被卸载 → 兜底提交；没输过就被卸载 → 什么都不报', async () => {
    const typed = await openEditor(textCell(''));
    fireEvent.change(typed.input, { target: { value: 'typed' } });
    typed.unmount();
    expect(typed.onFinishedEditing.mock.calls[0][0]).toMatchObject({ data: 'typed' });

    const untouched = await openEditor(textCell(''));
    untouched.unmount();
    cancelled(untouched.onFinishedEditing);
  });
});
