import { describe, it, expect, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import { registerSqlCompletion } from '../../components/SQLEditor/hooks/sqlCompletionRegistry';

type MonacoModule = Parameters<typeof registerSqlCompletion>[0];
type Provide = Monaco.languages.CompletionItemProvider['provideCompletionItems'];
interface Registered {
  language: string;
  provider: { triggerCharacters?: string[]; provideCompletionItems: Provide };
  dispose: ReturnType<typeof vi.fn>;
}

// 测试里的假提供器只返回带 label 的条目，不必满足完整的 CompletionItem 类型
const fakeProvide = (result: unknown): Provide & ReturnType<typeof vi.fn> =>
  vi.fn(() => result) as unknown as Provide & ReturnType<typeof vi.fn>;

const callProvide = (
  provider: Registered['provider'],
  model: unknown
): { suggestions: Array<{ label: string }> } =>
  provider.provideCompletionItems(model as never, position as never, {} as never, {} as never) as {
    suggestions: Array<{ label: string }>;
  };

const position = { lineNumber: 1, column: 8 };

function createFakeMonaco() {
  const editors: Array<{ getModel: () => unknown }> = [];
  const registrations: Registered[] = [];
  const monaco = {
    editor: { getEditors: () => editors },
    languages: {
      registerCompletionItemProvider: vi.fn(
        (language: string, provider: Registered['provider']) => {
          const dispose = vi.fn();
          registrations.push({ language, provider, dispose });
          return { dispose };
        }
      ),
    },
  };
  const addEditor = (model: unknown) => {
    const editor = { getModel: () => model };
    editors.push(editor);
    return editor;
  };
  return {
    monaco: monaco as unknown as MonacoModule,
    registerMock: monaco.languages.registerCompletionItemProvider,
    registrations,
    addEditor,
  };
}

describe('registerSqlCompletion', () => {
  // Monaco 会把同一语言注册的所有提供器都跑一遍：开 N 个 SQL 标签页，候选曾重复 N 份
  it('多个编辑器只向 Monaco 注册一次', () => {
    const { monaco, registerMock, addEditor } = createFakeMonaco();
    const unregister = [1, 2, 3].map((id) =>
      registerSqlCompletion(monaco, addEditor({ id }), fakeProvide({ suggestions: [] }))
    );

    expect(registerMock).toHaveBeenCalledTimes(1);
    unregister.forEach((fn) => fn());
  });

  it('按光标所在 model 找到对应编辑器，只调用它的补全计算', () => {
    const { monaco, registrations, addEditor } = createFakeMonaco();
    const modelA = { id: 'a' };
    const modelB = { id: 'b' };
    const provideA = fakeProvide({ suggestions: [{ label: 'from-a' }] });
    const provideB = fakeProvide({ suggestions: [{ label: 'from-b' }] });
    registerSqlCompletion(monaco, addEditor(modelA), provideA);
    registerSqlCompletion(monaco, addEditor(modelB), provideB);

    expect(callProvide(registrations[0].provider, modelA)).toEqual({
      suggestions: [{ label: 'from-a' }],
    });
    expect(provideA).toHaveBeenCalledTimes(1);
    expect(provideB).not.toHaveBeenCalled();

    expect(callProvide(registrations[0].provider, modelB)).toEqual({
      suggestions: [{ label: 'from-b' }],
    });
    expect(provideA).toHaveBeenCalledTimes(1);
    expect(provideB).toHaveBeenCalledTimes(1);
  });

  it('不属于任何已登记编辑器的 model 返回空列表', () => {
    const { monaco, registrations, addEditor } = createFakeMonaco();
    const provide = fakeProvide({ suggestions: [{ label: 'x' }] });
    registerSqlCompletion(monaco, addEditor({ id: 'a' }), provide);

    expect(callProvide(registrations[0].provider, { id: 'orphan' })).toEqual({ suggestions: [] });
    expect(provide).not.toHaveBeenCalled();
  });

  it('取消登记后该编辑器不再参与；最后一个注销时全局注册随之释放', () => {
    const { monaco, registrations, addEditor } = createFakeMonaco();
    const modelA = { id: 'a' };
    const modelB = { id: 'b' };
    const provideA = fakeProvide({ suggestions: [] });
    const provideB = fakeProvide({ suggestions: [] });
    const unregisterA = registerSqlCompletion(monaco, addEditor(modelA), provideA);
    const unregisterB = registerSqlCompletion(monaco, addEditor(modelB), provideB);
    const { provider, dispose } = registrations[0];

    unregisterA();
    callProvide(provider, modelA);
    expect(provideA).not.toHaveBeenCalled();
    callProvide(provider, modelB);
    expect(provideB).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();

    unregisterB();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('全部注销后可以重新登记（新开标签页）', () => {
    const { monaco, registerMock, registrations, addEditor } = createFakeMonaco();
    const unregisterA = registerSqlCompletion(
      monaco,
      addEditor({ id: 'a' }),
      fakeProvide({ suggestions: [] })
    );
    unregisterA();

    const modelB = { id: 'b' };
    registerSqlCompletion(
      monaco,
      addEditor(modelB),
      fakeProvide({ suggestions: [{ label: 'again' }] })
    );

    expect(registerMock).toHaveBeenCalledTimes(2);
    expect(callProvide(registrations[1].provider, modelB)).toEqual({
      suggestions: [{ label: 'again' }],
    });
  });

  it('重复登记同一个编辑器只保留最后一次的计算', () => {
    const { monaco, registrations, addEditor } = createFakeMonaco();
    const modelA = { id: 'a' };
    const editor = addEditor(modelA);
    const first = fakeProvide({ suggestions: [] });
    const second = fakeProvide({ suggestions: [{ label: 'second' }] });
    registerSqlCompletion(monaco, editor, first);
    const unregister = registerSqlCompletion(monaco, editor, second);

    callProvide(registrations[0].provider, modelA);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unregister();
  });

  // 回车应无条件换行，不能因为触发补全而弹建议
  it('触发字符不含换行，且保留原有的标点触发', () => {
    const { monaco, registrations, addEditor } = createFakeMonaco();
    const unregister = registerSqlCompletion(
      monaco,
      addEditor({ id: 'a' }),
      fakeProvide({ suggestions: [] })
    );

    expect(registrations[0].language).toBe('sql');
    expect(registrations[0].provider.triggerCharacters).toEqual(['.', ' ', '(', '[', '{', ',']);
    unregister();
  });
});
