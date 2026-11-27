import type * as Monaco from 'monaco-editor';
import type { ThemeColors } from '../hooks/useThemeColors';
import { toMonacoColor, toMonacoTokenColor } from './monacoColors';

type MonacoModule = Pick<typeof Monaco, 'editor'>;

/** 全应用共用的编辑器主题名。Monaco 的主题是全局的：SQL 编辑器、表设计器的 DDL 预览、
 *  视图定义都挂同一对，否则谁最后挂载谁的配色，打开一个标签页会改掉其它编辑器的主题 */
export const APP_MONACO_THEME_DARK = 'custom-dark';
export const APP_MONACO_THEME_LIGHT = 'custom-light';

export function appMonacoThemeName(isDark: boolean): string {
  return isDark ? APP_MONACO_THEME_DARK : APP_MONACO_THEME_LIGHT;
}

function buildTokenRules(tc: ThemeColors): Monaco.editor.ITokenThemeRule[] {
  // token 色从主题色派生：关键字=主色（靛蓝/青碧/墨随主题）、字符串=success、
  // 数字=warning（浅色用深一档的 warningActive 保证白底对比度）、注释=三级文本
  const isPro = tc.preset === 'default' || tc.preset === 'pro';
  const rules: Array<[token: string, color: string]> = [
    ['keyword', tc.primary],
    ['type', '267F99'],
    ['string', tc.success],
    ['comment', tc.textTertiary],
    ['number', tc.isDark ? tc.warning : tc.warningActive],
    ['operator', tc.textSecondary],
    ['delimiter', tc.textSecondary],
    ['variable', tc.textPrimary],
    // pro 预设：函数用 info 蓝（#2563EB / #60A5FA），与 violet 关键字拉开层次
    ['function', isPro ? tc.info : '#795E26'],
    ['predefined', '267F99'],
  ];
  return rules.flatMap(([token, color]) => {
    const foreground = toMonacoTokenColor(color);
    return foreground ? [{ token, foreground }] : [];
  });
}

function buildColors(tc: ThemeColors, isDark: boolean): Record<string, string> {
  const isPro = tc.preset === 'default' || tc.preset === 'pro';
  const raw: Record<string, string> = {
    // pro 预设编辑器用面板白/近黑（backgroundCard），与结果窗格同为「数据表面」
    'editor.background': isPro ? tc.backgroundCard : tc.background,
    'editor.foreground': tc.textPrimary,
    'editorCursor.foreground': isDark ? '#FFFFFF' : tc.textPrimary,
    'editor.lineHighlightBackground': tc.backgroundToolbar,
    'editor.selectionBackground': tc.backgroundActive,
    'editor.inactiveSelectionBackground': tc.backgroundHover,
    'editorLineNumber.foreground': tc.textTertiary,
    'editorLineNumber.activeForeground': tc.primary,
    'editor.findMatchBackground': tc.backgroundActive,
    'editor.findMatchHighlightBackground': tc.backgroundHover,
    'editorHoverWidget.background': tc.backgroundCard,
    'editorHoverWidget.border': tc.border,
    'editorSuggestWidget.background': tc.backgroundCard,
    'editorSuggestWidget.border': tc.border,
    'editorSuggestWidget.selectedBackground': isDark ? tc.backgroundActive : tc.backgroundHover,
    'editorSuggestWidget.foreground': tc.textPrimary,
    'editorSuggestWidget.selectedForeground': tc.textPrimary,
    'editorWidget.background': tc.backgroundCard,
    'editorWidget.border': tc.border,
    'editorWidget.resizeBorder': tc.border,
    'editorWidget.shadow': isDark ? '#000000' : '#A8A8A8',
    'editorGroupHeader.tabsBackground': tc.backgroundToolbar,
    'editorGroupHeader.noTabsBackground': isDark ? tc.background : tc.backgroundCard,
    'editorGroup.border': tc.border,
    'editorGroup.dropBackground': isDark ? tc.backgroundActive : tc.backgroundHover,
    'editorGroupHeader.tabsBorder': tc.border,
    'editorGroupHeader.noTabsBorder': tc.border,
    'editorMarkerNavigation.background': tc.backgroundToolbar,
    'editorMarkerNavigation.border': tc.border,
    'editorOverviewRuler.background': isDark ? tc.background : tc.backgroundCard,
    'editorOverviewRuler.border': tc.border,
    'editorIndentGuide.background': tc.border,
    'editorIndentGuide.activeBackground': tc.textTertiary,
    'editorWhitespace.foreground': tc.border,
  };
  const colors: Record<string, string> = {};
  for (const [id, color] of Object.entries(raw)) colors[id] = toMonacoColor(color);
  return colors;
}

/** 定义（或按当前主题色重定义）应用的两个编辑器主题，不切换当前主题 */
export function defineAppMonacoThemes(monaco: MonacoModule, tc: ThemeColors): void {
  const baseRules = buildTokenRules(tc);
  const isPro = tc.preset === 'default' || tc.preset === 'pro';
  const byToken = new Map(baseRules.map((rule) => [rule.token, rule.foreground]));

  monaco.editor.defineTheme(APP_MONACO_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: baseRules.map((rule) => {
      const overrides: Record<string, string> = {
        type: '4EC9B0',
        predefined: '4EC9B0',
        // 深色下函数色与浅色不同：pro 用 info 蓝，其余沿用 VS 深色的 DCDCAA
        function: isPro ? (byToken.get('function') ?? 'DCDCAA') : 'DCDCAA',
        operator: 'D4D4D4',
        delimiter: 'D4D4D4',
      };
      return overrides[rule.token] ? { ...rule, foreground: overrides[rule.token] } : rule;
    }),
    colors: buildColors(tc, true),
  });

  monaco.editor.defineTheme(APP_MONACO_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: baseRules,
    colors: buildColors(tc, false),
  });
}

/** 定义并切换到与应用明暗模式对应的编辑器主题 */
export function applyAppMonacoTheme(monaco: MonacoModule, tc: ThemeColors): void {
  defineAppMonacoThemes(monaco, tc);
  monaco.editor.setTheme(appMonacoThemeName(tc.isDark));
}
