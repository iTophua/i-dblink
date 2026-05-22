import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App';
import './style.css';
import './styles/theme-enhancements.css';
import './i18n';

// 临时 workaround：抑制 antd 在 React 19 下的 element.ref 废弃警告
// Wails WebView polyfill：Monaco Editor 在 schema 完成时使用 requestIdleCallback
if (typeof (window as any).requestIdleCallback !== 'function') {
  (window as any).requestIdleCallback = (
    callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void
  ): number => {
    const start = Date.now();
    return window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => Math.max(0, 50 - (Date.now() - start)) }), 1) as unknown as number;
  };
  (window as any).cancelIdleCallback = (id: number) => window.clearTimeout(id);
}
// 临时 workaround：抑制 antd 在 React 19 下的 element.ref 废弃警告
// 等待 antd 官方完全适配 React 19 后移除
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Accessing element.ref was removed in React 19')
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);