import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App';
import './style.css';
import './styles/theme-enhancements.css';
import './i18n';

// 临时 workaround：抑制 antd 在 React 19 下的 element.ref 废弃警告
// Wails WebView polyfill
const _window = window as unknown as Record<string, unknown>;
if (typeof _window.requestIdleCallback !== 'function') {
  _window.requestIdleCallback = (
    callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void
  ): number => {
    const start = Date.now();
    return window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => Math.max(0, 50 - (Date.now() - start)) }), 1) as unknown as number;
  };
  _window.cancelIdleCallback = (id: number) => window.clearTimeout(id);
}
// 临时 workaround：抑制 antd 在 React 19 下的 element.ref 废弃警告
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Accessing element.ref was removed in React 19')
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};

// 全局禁用输入框拼音/拼写检查
function disableInputSpellcheck(root: HTMLElement | Document = document) {
  const selector = 'input:not([type="password"]), textarea, [contenteditable="true"]'
  root.querySelectorAll(selector).forEach((el) => {
    el.setAttribute('autocapitalize', 'off')
    el.setAttribute('autocomplete', 'off')
    el.setAttribute('autocorrect', 'off')
    el.setAttribute('spellcheck', 'false')
  })
}

const observer = new MutationObserver((mutations) => {
  mutations.forEach((m) => {
    m.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) {
        disableInputSpellcheck(node)
      }
    })
  })
})

// 初始 + 后续动态节点
disableInputSpellcheck()
observer.observe(document.body, { childList: true, subtree: true })

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);