// 只带编辑器本体（全部编辑功能）和 SQL 基础语言，不用包的默认入口 editor.main：
// 默认入口还会打进 TypeScript / CSS / HTML / JSON 四个语言服务，光它们的 worker 就近 9 MB，
// 而应用里的编辑器全是 SQL
import 'monaco-editor/esm/vs/editor/edcore.main.js';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js';
import * as monacoApi from 'monaco-editor/esm/vs/editor/editor.api.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

// editor.api 的导出比包入口少了用不到的语言服务（css / html / json / typescript / lsp）；
// 应用里用到的 editor / languages 都在
const monaco = monacoApi as unknown as typeof import('monaco-editor');

// Monaco 把按词补全、折叠范围、链接检测等放到后台线程算。worker 入口随应用一起打包
// （Vite 把 ?worker 单独产出一个文件），不指定的话它会去找 CDN 构建下的相对路径
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// 之后 @monaco-editor/react 的 <Editor> 都用这个实例，不再访问 CDN
loader.config({ monaco });

export { monaco };
