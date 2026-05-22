/**
 * Glide Data Grid 主题配置
 * 与现有 AG Grid 紧凑模式视觉风格对齐
 *
 * @see docs/migration/glide-data-grid-migration.md
 */
import type { Theme } from '@glideapps/glide-data-grid';

const baseTheme: Partial<Theme> = {
  // === 字体 ===
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  baseFontStyle: '12px',
  headerFontStyle: '600 12px',
  editorFontSize: '12px',
  // === 间距 ===
  cellHorizontalPadding: 8,
  cellVerticalPadding: 2,
  // === 边框 ===
  borderColor: '#d9d9d9',
  drilldownBorder: '#d9d9d9',
};

/** 亮色主题 */
export const lightGlideTheme: Partial<Theme> = {
  ...baseTheme,
  // 主色
  accentColor: '#1890ff',
  accentLight: 'rgba(24, 144, 255, 0.08)',
  accentFg: '#ffffff',
  // 文字
  textDark: '#0f0f0f',
  textMedium: '#595959',
  textLight: '#8c8c8c',
  textBubble: '#ffffff',
  textHeader: '#0f0f0f',
  textHeaderSelected: '#1890ff',
  // 表头
  bgIconHeader: '#fafafa',
  fgIconHeader: '#595959',
  bgHeader: '#fafafa',
  bgHeaderHasFocus: '#e6f7ff',
  bgHeaderHovered: '#f0f0f0',
  bgBubble: '#f0f0f0',
  bgBubbleSelected: '#e6f7ff',
  bgSearchResult: '#fff7e6',
  // 单元格
  bgCell: '#ffffff',
  bgCellMedium: '#f5f5f5',
  // 链接
  linkColor: '#1890ff',
  // 样式
  headerIconSize: 16,
  markerFontStyle: '11px',
  lineHeight: 20,
};

/** 暗色主题 */
export const darkGlideTheme: Partial<Theme> = {
  ...baseTheme,
  // 主色
  accentColor: '#177ddc',
  accentLight: 'rgba(24, 144, 255, 0.15)',
  accentFg: '#ffffff',
  // 文字
  textDark: '#e0e0e0',
  textMedium: '#a0a0a0',
  textLight: '#666666',
  textBubble: '#1f1f1f',
  textHeader: '#e0e0e0',
  textHeaderSelected: '#177ddc',
  // 表头
  bgIconHeader: '#141414',
  fgIconHeader: '#a0a0a0',
  bgHeader: '#141414',
  bgHeaderHasFocus: '#111a2c',
  bgHeaderHovered: '#1a1a1a',
  bgBubble: '#2a2a2a',
  bgBubbleSelected: '#111a2c',
  bgSearchResult: '#2a2010',
  // 单元格
  bgCell: '#1f1f1f',
  bgCellMedium: '#2a2a2a',
  // 边框
  borderColor: '#303030',
  drilldownBorder: '#303030',
  // 链接
  linkColor: '#177ddc',
  // 样式
  headerIconSize: 16,
  markerFontStyle: '11px',
  lineHeight: 20,
};