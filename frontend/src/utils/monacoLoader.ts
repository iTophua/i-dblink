import type * as Monaco from 'monaco-editor';

type MonacoModule = typeof Monaco;

let pending: Promise<MonacoModule> | null = null;

/**
 * 本地打包的 Monaco：首次用到编辑器时才加载，不进首屏包。
 *
 * @monaco-editor/react 默认在运行时从 cdn.jsdelivr.net 拉 loader.js——断网或 CDN 不通时
 * SQL 编辑器只会一直停在加载中。这里改为动态 import 随应用打包的 monaco-editor，
 * 加载完交给它的 loader（见 ./monacoLocal），之后 <Editor> 直接用这个实例。
 */
export function loadMonaco(): Promise<MonacoModule> {
  if (!pending) {
    pending = import('./monacoLocal')
      .then((mod) => mod.monaco)
      .catch((err: unknown) => {
        // 加载失败不缓存结果：下次调用（比如用户点重试）会再试一次
        pending = null;
        throw err;
      });
  }
  return pending;
}
