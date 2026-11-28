import { Window } from '@wailsio/runtime';

// 主题里的窗口底色都是 #RRGGBB（后端存的也是这个格式）
const HEX_COLOR = /^#([0-9a-f]{6})$/i;

/**
 * 把主题的窗口底色写给当前这个原生窗口。
 *
 * webview 是透明的，前端没画到的地方露出来的是原生底色（窗口刚创建、拉伸窗口时都有这样
 * 的一瞬）。每个窗口是独立的原生窗口，所以主窗口、托盘面板、结果弹窗各自调各自的。
 */
export function applyWindowBackground(background: string): void {
  const match = HEX_COLOR.exec(background);
  if (!match) return;
  const value = parseInt(match[1], 16);
  const r = value >> 16;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  Window.SetBackgroundColour(r, g, b, 255).catch(() => {});
}
