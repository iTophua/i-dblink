import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App';
import { ResultPopup } from './components/ResultPopup';
import { ConnPicker } from './components/ConnPicker';
import './style.css';
import './styles/theme-enhancements.css';
import './styles/polish.css';
import './styles/pro-theme.css';
import './i18n';
import { installDiagnostics } from './utils/diagnostics';
import { installAIChatHistory } from './services/aiChatHistory';

// 临时 workaround：抑制 antd 在 React 19 下的 element.ref 废弃警告
// Wails WebView polyfill
const _window = window as unknown as Record<string, unknown>;
if (typeof _window.requestIdleCallback !== 'function') {
  _window.requestIdleCallback = (
    callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void
  ): number => {
    const start = Date.now();
    return window.setTimeout(
      () =>
        callback({
          didTimeout: false,
          timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
        }),
      1
    ) as unknown as number;
  };
  _window.cancelIdleCallback = (id: number) => window.clearTimeout(id);
}
// 诊断上报：未捕获错误 / 未处理 Promise / console.error 转发后端落盘（非 Wails 环境自动跳过）。
installDiagnostics();

// 临时 workaround：抑制 antd 在 React 19 下的 element.ref 废弃警告。
// 必须接在诊断上报之后：被这里拦下的调用不会再进入日志（反过来包的话过滤只对控制台生效，
// 警告照样落盘）
const consoleErrorWithDiagnostics = console.error;
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Accessing element.ref was removed in React 19')
  ) {
    return;
  }
  consoleErrorWithDiagnostics.apply(console, args);
};

// AI 对话历史：消息变更自动落盘（services/aiChatHistory.ts）
installAIChatHistory();

// 全局禁用输入框拼音/拼写检查
function disableInputSpellcheck(root: HTMLElement | Document = document) {
  const selector = 'input:not([type="password"]), textarea, [contenteditable="true"]';
  root.querySelectorAll(selector).forEach((el) => {
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('spellcheck', 'false');
  });
}

const observer = new MutationObserver((mutations) => {
  mutations.forEach((m) => {
    m.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) {
        disableInputSpellcheck(node);
      }
    });
  });
});

// 初始 + 后续动态节点
disableInputSpellcheck();
observer.observe(document.body, { childList: true, subtree: true });

// 多窗口路由：/#popup/<id> 结果弹窗、/#conn-picker 托盘快速连接面板
const hash = window.location.hash;
const isResultPopup = /^#popup\//.test(hash);
const isConnPicker = hash.startsWith('#conn-picker');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {isResultPopup ? <ResultPopup /> : isConnPicker ? <ConnPicker /> : <App />}
  </StrictMode>
);
