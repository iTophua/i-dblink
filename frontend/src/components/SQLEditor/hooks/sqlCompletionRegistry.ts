import type * as Monaco from 'monaco-editor';

type MonacoModule = Pick<typeof Monaco, 'editor' | 'languages'>;
type ProvideCompletionItems = Monaco.languages.CompletionItemProvider['provideCompletionItems'];

interface SharedRegistration {
  /** 编辑器实例 → 该编辑器（SQL 标签页）的补全计算 */
  providers: Map<object, ProvideCompletionItems>;
  disposable: { dispose(): void };
}

// 每个 Monaco 实例一份。Monaco 的主题、语言提供器都是实例级全局的
const registrations = new WeakMap<MonacoModule, SharedRegistration>();

/** 补全触发字符。'\n' 不能加：回车应无条件换行，不该弹出建议 / 模板 */
const TRIGGER_CHARACTERS = ['.', ' ', '(', '[', '{', ','];

/**
 * 为一个编辑器登记 SQL 补全，返回取消登记函数。
 *
 * Monaco 的补全提供器按「语言」注册、全局生效，同一种语言注册了几份就都跑一遍再合并结果。
 * 此前每个 SQL 标签页各注册一份：开 N 个标签页，候选重复 N 份、计算量也乘 N。
 * 这里每个 Monaco 实例只向 Monaco 注册一次，按「光标所在 model 属于哪个编辑器」
 * 分发给对应标签页的计算
 */
export function registerSqlCompletion(
  monaco: MonacoModule,
  editor: object,
  provideCompletionItems: ProvideCompletionItems
): () => void {
  let registration = registrations.get(monaco);
  if (!registration) {
    const providers = new Map<object, ProvideCompletionItems>();
    const disposable = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: TRIGGER_CHARACTERS,
      provideCompletionItems: (model, position, token, context) => {
        const owner = monaco.editor
          .getEditors()
          .find((candidate) => candidate.getModel() === model);
        const provide = owner ? providers.get(owner) : undefined;
        return provide ? provide(model, position, token, context) : { suggestions: [] };
      },
    });
    registration = { providers, disposable };
    registrations.set(monaco, registration);
  }

  const shared = registration;
  shared.providers.set(editor, provideCompletionItems);
  return () => {
    shared.providers.delete(editor);
    // 最后一个编辑器也卸载时注销全局注册，不留一个空转的提供器
    if (shared.providers.size === 0) {
      shared.disposable.dispose();
      registrations.delete(monaco);
    }
  };
}
