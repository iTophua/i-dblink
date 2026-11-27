import { describe, it, expect, vi } from 'vitest';
import { parseCssColor, toMonacoColor, toMonacoTokenColor } from '../../utils/monacoColors';
import {
  APP_MONACO_THEME_DARK,
  APP_MONACO_THEME_LIGHT,
  appMonacoThemeName,
  applyAppMonacoTheme,
  defineAppMonacoThemes,
} from '../../utils/appMonacoTheme';
import { getThemeConfig, type ThemeMode, type ThemePreset } from '../../styles/theme';
import type { ThemeColors } from '../../hooks/useThemeColors';

const PRESETS: ThemePreset[] = ['default', 'modern', 'ink', 'pro'];
const MODES: ThemeMode[] = ['light', 'dark'];

// 与 useThemeColors 相同的取值路径：直接用真实的主题配置，保证测的是用户实际看到的颜色
function themeColorsFor(mode: ThemeMode, preset: ThemePreset): ThemeColors {
  const config = getThemeConfig(mode, preset);
  const n = config.neutralColors;
  const c = config.colors;
  return {
    isDark: mode === 'dark',
    preset,
    primary: c.primary,
    success: c.success,
    warning: c.warning,
    warningActive: c.warningActive,
    info: c.info,
    textPrimary: n.textPrimary,
    textSecondary: n.textSecondary,
    textTertiary: n.textTertiary,
    background: n.background,
    backgroundCard: n.backgroundCard,
    backgroundToolbar: n.backgroundToolbar,
    backgroundHover: n.backgroundHover,
    backgroundActive: n.backgroundActive,
    border: n.border,
  } as ThemeColors;
}

describe('monacoColors', () => {
  it.each([
    ['6 位十六进制原样通过', '#e3e5ee', '#E3E5EE'],
    ['不带 # 也认', 'e3e5ee', '#E3E5EE'],
    ['8 位带透明度', '#6366f129', '#6366F129'],
    ['3 位缩写展开', '#abc', '#AABBCC'],
    ['rgba 逗号写法转成带透明度的十六进制', 'rgba(255, 255, 255, 0.09)', '#FFFFFF17'],
    ['rgba 透明度四舍五入', 'rgba(99, 102, 241, 0.16)', '#6366F129'],
    ['rgb 不带透明度', 'rgb(18, 20, 27)', '#12141B'],
    ['rgba 透明度为 1 时省略', 'rgba(1, 2, 3, 1)', '#010203'],
    ['空格 + 斜杠写法', 'rgb(255 255 255 / 50%)', '#FFFFFF80'],
    ['百分比通道', 'rgb(100% 0% 0%)', '#FF0000'],
    ['transparent', 'transparent', '#00000000'],
    ['认不出的格式原样返回', 'oklch(0.5 0.1 200)', 'oklch(0.5 0.1 200)'],
    ['首尾空白', '  #abc  ', '#AABBCC'],
  ])('%s：%s → %s', (_name, input, expected) => {
    expect(toMonacoColor(input)).toBe(expected);
  });

  it('超出范围的通道值被夹到 0–255', () => {
    expect(toMonacoColor('rgb(300, -5, 12)')).toBe('#FF000C');
  });

  it('残缺的 rgb() 不乱猜，原样返回', () => {
    expect(toMonacoColor('rgb(1, 2)')).toBe('rgb(1, 2)');
    expect(toMonacoColor('rgb(a, b, c)')).toBe('rgb(a, b, c)');
  });

  it('parseCssColor 解析出各通道与透明度', () => {
    expect(parseCssColor('rgba(99, 102, 241, 0.16)')).toEqual({ r: 99, g: 102, b: 241, a: 0.16 });
    expect(parseCssColor('not-a-color')).toBeNull();
  });

  // token 规则的 foreground 只收 6 位：带透明度的取色值，完全透明 / 认不出的不产出规则
  it('toMonacoTokenColor 只返回 6 位十六进制', () => {
    expect(toMonacoTokenColor('#7186F5')).toBe('7186F5');
    expect(toMonacoTokenColor('rgba(251, 191, 36, 0.5)')).toBe('FBBF24');
    expect(toMonacoTokenColor('transparent')).toBeUndefined();
    expect(toMonacoTokenColor('var(--primary)')).toBeUndefined();
  });
});

describe('appMonacoTheme', () => {
  function createFakeMonaco() {
    type ThemeData = {
      base: string;
      rules: Array<{ token?: string; foreground?: string }>;
      colors: Record<string, string>;
    };
    const defined = new Map<string, ThemeData>();
    const setTheme = vi.fn();
    const defineTheme = vi.fn((name: string, data: ThemeData) => {
      defined.set(name, data);
    });
    const monaco = { editor: { defineTheme, setTheme } };
    return {
      monaco: monaco as unknown as Parameters<typeof defineAppMonacoThemes>[0],
      defined,
      setTheme,
    };
  }

  const MONACO_COLOR_RE = /^#[0-9A-F]{6}([0-9A-F]{2})?$/;
  const TOKEN_COLOR_RE = /^[0-9A-F]{6}$/;

  // Monaco 解析不了的颜色一律变成纯红：任何预设、任何明暗模式都不能出现
  it.each(PRESETS.flatMap((preset) => MODES.map((mode) => [mode, preset] as const)))(
    '%s / %s：主题色全是 Monaco 认的十六进制',
    (mode, preset) => {
      const { monaco, defined } = createFakeMonaco();
      defineAppMonacoThemes(monaco, themeColorsFor(mode, preset));

      for (const name of [APP_MONACO_THEME_DARK, APP_MONACO_THEME_LIGHT]) {
        const theme = defined.get(name);
        expect(theme, name).toBeDefined();
        for (const [id, color] of Object.entries(theme!.colors)) {
          expect(color, `${name}.${id}`).toMatch(MONACO_COLOR_RE);
          expect(color.toUpperCase(), `${name}.${id}`).not.toBe('#FF0000');
        }
        for (const rule of theme!.rules) {
          expect(rule.foreground, `${name} token ${rule.token}`).toMatch(TOKEN_COLOR_RE);
        }
      }
    }
  );

  it('默认预设深色模式：rgba 写法的边框和选区色转成带透明度的十六进制', () => {
    const { monaco, defined } = createFakeMonaco();
    defineAppMonacoThemes(monaco, themeColorsFor('dark', 'default'));
    const dark = defined.get(APP_MONACO_THEME_DARK)!;
    expect(dark.base).toBe('vs-dark');
    // rgba(255, 255, 255, 0.09) / rgba(99, 102, 241, 0.16)
    expect(dark.colors['editorSuggestWidget.border']).toBe('#FFFFFF17');
    expect(dark.colors['editorIndentGuide.background']).toBe('#FFFFFF17');
    expect(dark.colors['editor.selectionBackground']).toBe('#6366F129');
  });

  it('默认预设浅色模式：原本就是十六进制的值不被改动', () => {
    const { monaco, defined } = createFakeMonaco();
    defineAppMonacoThemes(monaco, themeColorsFor('light', 'default'));
    const light = defined.get(APP_MONACO_THEME_LIGHT)!;
    const { neutralColors } = getThemeConfig('light', 'default');
    expect(light.base).toBe('vs');
    expect(light.colors['editorSuggestWidget.border']).toBe(neutralColors.border.toUpperCase());
    expect(light.colors['editor.selectionBackground']).toBe(
      neutralColors.backgroundActive.toUpperCase()
    );
    expect(light.colors['editorSuggestWidget.border']).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('token 规则沿用原有配色：深色下 type 用青碧、操作符用 D4D4D4', () => {
    const { monaco, defined } = createFakeMonaco();
    defineAppMonacoThemes(monaco, themeColorsFor('dark', 'ink'));
    const foregroundOf = (themeName: string, token: string) =>
      defined.get(themeName)!.rules.find((rule) => rule.token === token)?.foreground;
    expect(foregroundOf(APP_MONACO_THEME_DARK, 'type')).toBe('4EC9B0');
    expect(foregroundOf(APP_MONACO_THEME_DARK, 'predefined')).toBe('4EC9B0');
    expect(foregroundOf(APP_MONACO_THEME_DARK, 'operator')).toBe('D4D4D4');
    expect(foregroundOf(APP_MONACO_THEME_DARK, 'delimiter')).toBe('D4D4D4');
    expect(foregroundOf(APP_MONACO_THEME_DARK, 'function')).toBe('DCDCAA');
    expect(foregroundOf(APP_MONACO_THEME_LIGHT, 'type')).toBe('267F99');
    expect(foregroundOf(APP_MONACO_THEME_LIGHT, 'function')).toBe('795E26');
  });

  it('default / pro 预设深色下函数用 info 蓝', () => {
    const ink = createFakeMonaco();
    defineAppMonacoThemes(ink.monaco, themeColorsFor('dark', 'default'));
    const foregroundOf = (name: string, token: string) =>
      ink.defined.get(name)!.rules.find((rule) => rule.token === token)?.foreground;
    expect(foregroundOf(APP_MONACO_THEME_DARK, 'function')).toBe(
      getThemeConfig('dark', 'default').colors.info.replace('#', '').toUpperCase()
    );
  });

  it('applyAppMonacoTheme 在定义之后切到应用主题', () => {
    const { monaco, setTheme } = createFakeMonaco();
    applyAppMonacoTheme(monaco, themeColorsFor('dark', 'ink'));
    expect(setTheme).toHaveBeenLastCalledWith(APP_MONACO_THEME_DARK);
    applyAppMonacoTheme(monaco, themeColorsFor('light', 'ink'));
    expect(setTheme).toHaveBeenLastCalledWith(APP_MONACO_THEME_LIGHT);
  });

  it('appMonacoThemeName', () => {
    expect(appMonacoThemeName(true)).toBe(APP_MONACO_THEME_DARK);
    expect(appMonacoThemeName(false)).toBe(APP_MONACO_THEME_LIGHT);
  });
});
