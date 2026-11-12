import { getThemeConfig, type ThemeConfig, type ThemeMode, type ThemePreset } from './theme';

export interface AppliedTheme {
  config: ThemeConfig;
  /** 'system' 已解析为实际明暗，供原生窗口等消费方使用 */
  effectiveMode: 'light' | 'dark';
}

/**
 * 把主题令牌写到 documentElement（CSS 变量 + data-theme/preset 标记）。
 *
 * 主窗口和托盘快速连接面板是两个独立的 React 根，必须共用同一套注入逻辑，
 * 否则面板会拿不到 --background/--border/--text-* 等变量（此前只有 :root 的
 * 静态 fallback，深色下文字与背景全部错色）。
 */
export function applyThemeVars(
  mode: ThemeMode,
  preset: ThemePreset,
  options?: { transition?: boolean }
): AppliedTheme {
  const config = getThemeConfig(mode, preset);
  const effectiveMode: 'light' | 'dark' = config.mode === 'dark' ? 'dark' : 'light';

  if (typeof document === 'undefined') {
    return { config, effectiveMode };
  }

  const root = document.documentElement;

  if (options?.transition) {
    root.classList.add('theme-transitioning');
    window.setTimeout(() => root.classList.remove('theme-transitioning'), 300);
  }

  // colors 的 key 是 camelCase（primaryHover / primaryGradient …），消费端用 kebab
  // （--color-primary-hover）。漏转换会让渐变/hover/Tab 下划线停在静态 fallback。
  Object.entries(config.colors).forEach(([key, value]) => {
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(`--color-${cssKey}`, value);
  });

  Object.entries(config.neutralColors).forEach(([key, value]) => {
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(`--${cssKey}`, value);
  });

  Object.entries(config.glassEffect).forEach(([key, value]) => {
    const cssKey = key
      .replace(/^glass/, '')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
    root.style.setProperty(`--glass-${cssKey}`, value);
  });

  Object.entries(config.focusStyle).forEach(([key, value]) => {
    const cssKey = key
      .replace(/^focus/, '')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
    if (typeof value === 'number') {
      root.style.setProperty(`--focus-${cssKey}`, `${value}px`);
    } else {
      root.style.setProperty(`--focus-${cssKey}`, value);
    }
  });

  root.setAttribute('data-theme', effectiveMode);
  root.setAttribute('data-theme-preset', preset);
  // default 即 Pro 设计：pro-theme.css 用此标记启用环境光/渐变增强
  if (preset === 'default' || preset === 'pro') {
    root.setAttribute('data-theme-pro', 'true');
  } else {
    root.removeAttribute('data-theme-pro');
  }

  return { config, effectiveMode };
}
