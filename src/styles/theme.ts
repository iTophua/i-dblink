/**
 * i-dblink 主题配置文件
 *
 * 定义多款科技酷炫主题，每款支持亮暗模式
 */

export type ThemeMode = 'light' | 'dark';
export type ThemePreset = 'neonCyber' | 'midnightDeep' | 'oceanBlue' | 'nordicFrost';

export interface ThemeColorScheme {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryGradient: string;
  success: string;
  successHover: string;
  successActive: string;
  successGradient: string;
  warning: string;
  warningHover: string;
  warningActive: string;
  warningGradient: string;
  error: string;
  errorHover: string;
  errorActive: string;
  errorGradient: string;
  info: string;
  infoHover: string;
  infoActive: string;
  infoGradient: string;
}

export interface NeutralColors {
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  border: string;
  borderLight: string;
  borderDark: string;
  background: string;
  backgroundCard: string;
  backgroundToolbar: string;
  backgroundHover: string;
  backgroundActive: string;
  mask: string;
  windowBackground: string;
  // 语义扩展 — 数据密集场景专用
  rowHoverBg: string;
  rowSelectedBg: string;
  rowStripeBg: string;
  headerBg: string;
  surfaceElevated: string;
  scrollbarThumb: string;
  scrollbarTrack: string;
}

export interface GlassEffect {
  glassBackground: string;
  glassBorder: string;
  glassBlur: string;
  glassShadow: string;
}

export interface FocusStyle {
  focusRingColor: string;
  focusRingWidth: number;
  focusRingOffset: number;
  focusRingShadow: string;
}

export interface ThemeConfig {
  name: string;
  description: string;
  mode: ThemeMode;
  colors: ThemeColorScheme;
  neutralColors: NeutralColors;
  glassEffect: GlassEffect;
  focusStyle: FocusStyle;
  dbTypeColors: Record<string, string>;
  typography: typeof TYPOGRAPHY;
  spacing: typeof SPACING;
  sizes: typeof SIZES;
  borderRadius: typeof BORDER_RADIUS;
  shadows: typeof SHADOWS;
  animation: typeof ANIMATION;
  breakpoints: typeof BREAKPOINTS;
  zIndex: typeof Z_INDEX;
}

// ==================== 字体排印 ====================

export const TYPOGRAPHY = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyCode: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace",
  fontSizeHeading1: 20,
  fontSizeHeading2: 16,
  fontSizeHeading3: 14,
  fontSizeBody: 14,
  fontSizeSecondary: 12,
  fontSizeCode: 13,
  lineHeightHeading: 1.4,
  lineHeightBody: 1.57,
  lineHeightCode: 1.5,
  fontWeightNormal: 400,
  fontWeightMedium: 500,
  fontWeightSemibold: 600,
  fontWeightBold: 700,
};

// ==================== 间距规范 ====================

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  componentPaddingSM: 8,
  componentPaddingMD: 12,
  componentPaddingLG: 16,
  componentPaddingXL: 24,
  cardPadding: 16,
  cardMargin: 16,
  groupMargin: 24,
};

// ==================== 尺寸规范 ====================

export const SIZES = {
  headerHeight: 32,
  toolbarHeight: 40,
  sidebarWidth: 280,
  middlePanelWidth: 320,
  logPanelHeight: 180,
  footerHeight: 28,
  sidebarCollapsedWidth: 80,
  buttonHeightSM: 24,
  buttonHeightMD: 32,
  buttonHeightLG: 40,
  inputHeightSM: 24,
  inputHeightMD: 32,
  inputHeightLG: 40,
  tableHeaderHeight: 40,
  tableRowHeight: 36,
  tableRowHeightSM: 28,
  tableRowHeightLG: 48,
  iconSizeSM: 14,
  iconSizeMD: 16,
  iconSizeLG: 24,
  iconSizeXL: 48,
  modalWidthSM: 400,
  modalWidthMD: 600,
  modalWidthLG: 800,
  modalWidthXL: 1000,
  windowMinWidth: 1024,
  windowMinHeight: 768,
  windowRecommendedWidth: 1920,
  windowRecommendedHeight: 1080,
};

// ==================== 圆角规范 ====================

export const BORDER_RADIUS = {
  radiusXS: 2,
  radiusSM: 4,
  radiusMD: 6,
  radiusLG: 8,
  radiusXL: 12,
  radiusXXL: 16,
  buttonRadius: 6,
  inputRadius: 6,
  cardRadius: 8,
  modalRadius: 8,
};

// ==================== 阴影规范 ====================

export const SHADOWS = {
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  shadowMd: '0 2px 8px rgba(0, 0, 0, 0.1)',
  shadowLg: '0 4px 16px rgba(0, 0, 0, 0.15)',
  shadowXl: '0 8px 32px rgba(0, 0, 0, 0.2)',
  shadow2xl: '0 16px 48px rgba(0, 0, 0, 0.25)',
  cardShadowLight: '0 2px 8px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.06)',
  headerShadowLight: '0 2px 8px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
  cardShadowDark: '0 4px 16px rgba(0, 0, 0, 0.35), 0 0 1px rgba(255, 255, 255, 0.05)',
  headerShadowDark: '0 4px 16px rgba(0, 0, 0, 0.45), 0 1px 2px rgba(0, 0, 0, 0.3)',
  floatingShadow: '0 12px 40px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)',
  insetShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)',
  glowPrimary: '0 0 20px var(--color-primary, #1890ff33)',
  glowSuccess: '0 0 20px var(--color-success, #52c41a33)',
  glowError: '0 0 20px var(--color-error, #ff4d4f33)',
};

// ==================== 动效规范 ====================

export const ANIMATION = {
  durationFast: '0.1s',
  durationNormal: '0.2s',
  durationSlow: '0.3s',
  durationSlower: '0.4s',
  easingEaseInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
  easingEaseOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  easingEaseIn: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
  easingSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  easingBounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  transitionColor: 'color 0.2s ease',
  transitionBackground: 'background-color 0.2s ease',
  transitionBorder: 'border-color 0.2s ease',
  transitionAll: 'all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)',
  transitionTransform: 'transform 0.2s ease',
  transitionBoxShadow: 'box-shadow 0.2s ease',
  transitionSpring: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
};

// ==================== 响应式断点 ====================

export const BREAKPOINTS = {
  xs: '320px',
  sm: '576px',
  md: '768px',
  lg: '992px',
  xl: '1200px',
  xxl: '1600px',
};

// ==================== Z-Index 层级 ====================

export const Z_INDEX = {
  base: 1,
  dropdown: 1050,
  sticky: 1060,
  fixed: 1070,
  modalBackdrop: 1080,
  modal: 1090,
  popover: 1100,
  tooltip: 1110,
  message: 1120,
  notification: 1130,
};

// ==================== 组件级样式常量 ====================

export const COMPONENT_STYLES = {
  sidebar: {
    headerPadding: '12px 16px',
    itemPadding: '8px 12px',
    itemHeight: 36,
    groupIndent: 16,
    iconSize: 16,
    borderRadius: 6,
  },
  table: {
    headerBgOpacity: 0.03,
    rowHoverBgOpacity: 0.04,
    rowSelectedBgOpacity: 0.08,
    stripeRowBgOpacity: 0.02,
    cellPadding: '8px 12px',
    borderColor: 'var(--border)',
  },
  toolbar: {
    height: 40,
    padding: '0 12px',
    gap: 8,
    buttonSize: 28,
    borderRadius: 6,
  },
  editor: {
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.5,
    tabSize: 2,
    padding: '12px',
    minHeight: 200,
  },
  modal: {
    maxWidth: '90vw',
    maxHeight: '85vh',
    padding: 24,
    borderRadius: 8,
    headerPadding: '16px 24px',
    bodyPadding: '24px',
    footerPadding: '12px 24px',
  },
  card: {
    padding: 16,
    borderRadius: 8,
    border: '1px solid var(--border)',
    shadow: 'var(--shadow-md)',
  },
};

// ==================== 数据库类型配色 ====================

export const DB_TYPE_COLORS = {
  mysql: '#1890ff',
  postgresql: '#52c41a',
  sqlite: '#faad14',
  sqlserver: '#eb2f96',
  oracle: '#fa8c16',
  mariadb: '#13c2c2',
  dameng: '#722ed1',
  default: '#1890ff',
};

// ==================== 玻璃拟态效果（Glassmorphism）====================

export const GLASS_EFFECTS = {
  light: {
    glassBackground: 'rgba(255, 255, 255, 0.7)',
    glassBorder: 'rgba(255, 255, 255, 0.3)',
    glassBlur: 'blur(12px)',
    glassShadow: '0 8px 32px rgba(31, 38, 135, 0.15)',
  },
  dark: {
    glassBackground: 'rgba(17, 25, 40, 0.75)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',
    glassBlur: 'blur(16px)',
    glassShadow: '0 8px 32px rgba(0, 0, 0, 0.37)',
  },
};

// ==================== Focus 焦点样式 ====================

export const FOCUS_STYLES = {
  light: {
    focusRingColor: 'rgba(99, 102, 241, 0.5)',
    focusRingWidth: 2,
    focusRingOffset: 2,
    focusRingShadow: '0 0 0 2px rgba(99, 102, 241, 0.2)',
  },
  dark: {
    focusRingColor: 'rgba(129, 140, 248, 0.6)',
    focusRingWidth: 2,
    focusRingOffset: 2,
    focusRingShadow: '0 0 0 2px rgba(129, 140, 248, 0.3)',
  },
};

// ==================== 主题配色方案 ====================

// 工厂函数：自动生成渐变
function createGradient(from: string, to: string): string {
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

// 工厂函数：根据基础色值构建完整配色方案（自动生成渐变）
function createColorScheme(base: {
  primary: string; primaryHover: string; primaryActive: string;
  success: string; successHover: string; successActive: string;
  warning: string; warningHover: string; warningActive: string;
  error: string; errorHover: string; errorActive: string;
  info: string; infoHover: string; infoActive: string;
}): ThemeColorScheme {
  return {
    ...base,
    primaryGradient: createGradient(base.primary, base.primaryHover),
    successGradient: createGradient(base.success, base.successHover),
    warningGradient: createGradient(base.warning, base.warningHover),
    errorGradient: createGradient(base.error, base.errorHover),
    infoGradient: createGradient(base.info, base.infoHover),
  };
}

// 工厂函数：根据主题名和色值构建完整主题配置（自动填充不变的共享配置）
function createThemeConfig(
  name: string,
  description: string,
  mode: ThemeMode,
  colors: ThemeColorScheme,
  neutralColors: NeutralColors,
): ThemeConfig {
  return {
    name,
    description,
    mode,
    colors,
    neutralColors,
    glassEffect: GLASS_EFFECTS[mode],
    focusStyle: FOCUS_STYLES[mode],
    dbTypeColors: DB_TYPE_COLORS,
    typography: TYPOGRAPHY,
    spacing: SPACING,
    sizes: SIZES,
    borderRadius: BORDER_RADIUS,
    shadows: SHADOWS,
    animation: ANIMATION,
    breakpoints: BREAKPOINTS,
    zIndex: Z_INDEX,
  };
}

// 1. NeonCyber - 赛博朋克霓虹风格（深色主题为主）
const NEON_CYBER_LIGHT = createColorScheme({
  primary: '#00e5ff', primaryHover: '#33ebff', primaryActive: '#00b8cc',
  success: '#00ff55', successHover: '#33ff77', successActive: '#00cc44',
  warning: '#d946ff', warningHover: '#e879f9', warningActive: '#c026d3',
  error: '#f43f5e', errorHover: '#fb7185', errorActive: '#e11d48',
  info: '#00e5ff', infoHover: '#33ebff', infoActive: '#00b8cc',
});

const NEON_CYBER_DARK = createColorScheme({
  primary: '#00f5ff', primaryHover: '#33f7ff', primaryActive: '#00c4cc',
  success: '#39ff14', successHover: '#5fff3d', successActive: '#2ecc0f',
  warning: '#e879f9', warningHover: '#f0abfc', warningActive: '#d946ff',
  error: '#fb7185', errorHover: '#fda4af', errorActive: '#f43f5e',
  info: '#00f5ff', infoHover: '#33f7ff', infoActive: '#00c4cc',
});

const NEON_CYBER_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#0a0a0f',
  textSecondary: '#4a4a5a',
  textTertiary: '#7a7a8a',
  textDisabled: '#b0b0c0',
  border: '#2a2a3a',
  borderLight: '#e8e8f0',
  borderDark: '#1a1a2a',
  background: '#f0f0f8',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#e8e8f0',
  backgroundHover: '#e0e0f0',
  backgroundActive: '#00e5ff15',
  mask: 'rgba(0, 0, 0, 0.45)',
  windowBackground: '#f0f0f8',
  rowHoverBg: 'rgba(0, 229, 255, 0.05)',
  rowSelectedBg: 'rgba(0, 229, 255, 0.10)',
  rowStripeBg: '#f8f8ff',
  headerBg: '#e8e8f0',
  surfaceElevated: '#ffffff',
  scrollbarThumb: 'rgba(0, 0, 0, 0.25)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.04)',
};

const NEON_CYBER_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#f0f0ff',
  textSecondary: '#b8b8e0',
  textTertiary: '#8080b0',
  textDisabled: '#585878',
  border: '#404070',
  borderLight: '#1a1a3a',
  borderDark: '#505090',
  background: '#08080f',
  backgroundCard: '#14142a',
  backgroundToolbar: '#101020',
  backgroundHover: '#1c1c35',
  backgroundActive: '#00f5ff20',
  mask: 'rgba(0, 0, 0, 0.8)',
  windowBackground: '#08080f',
  rowHoverBg: 'rgba(0, 245, 255, 0.15)',
  rowSelectedBg: 'rgba(0, 245, 255, 0.24)',
  rowStripeBg: '#1a1a32',
  headerBg: '#1c1c35',
  surfaceElevated: '#1f1f3d',
  scrollbarThumb: 'rgba(255, 255, 255, 0.25)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.04)',
};

// 2. MidnightDeep - 深夜深蓝风格
const MIDNIGHT_DEEP_LIGHT = createColorScheme({
  primary: '#6366f1', primaryHover: '#818cf8', primaryActive: '#4f46e5',
  success: '#10b981', successHover: '#34d399', successActive: '#059669',
  warning: '#f59e0b', warningHover: '#fbbf24', warningActive: '#d97706',
  error: '#ef4444', errorHover: '#f87171', errorActive: '#dc2626',
  info: '#6366f1', infoHover: '#818cf8', infoActive: '#4f46e5',
});

const MIDNIGHT_DEEP_DARK = createColorScheme({
  primary: '#818cf8', primaryHover: '#a5b4fc', primaryActive: '#6366f1',
  success: '#34d399', successHover: '#6ee7b7', successActive: '#10b981',
  warning: '#fbbf24', warningHover: '#fcd34d', warningActive: '#f59e0b',
  error: '#f87171', errorHover: '#fca5a5', errorActive: '#ef4444',
  info: '#818cf8', infoHover: '#a5b4fc', infoActive: '#6366f1',
});

const MIDNIGHT_DEEP_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#1e293b',
  textSecondary: '#475569',
  textTertiary: '#64748b',
  textDisabled: '#94a3b8',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  borderDark: '#cbd5e1',
  background: '#f8fafc',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#f1f5f9',
  backgroundHover: '#e2e8f0',
  backgroundActive: '#6366f115',
  mask: 'rgba(0, 0, 0, 0.5)',
  windowBackground: '#f8fafc',
  rowHoverBg: 'rgba(99, 102, 241, 0.05)',
  rowSelectedBg: 'rgba(99, 102, 241, 0.10)',
  rowStripeBg: '#fafbff',
  headerBg: '#f1f5f9',
  surfaceElevated: '#ffffff',
  scrollbarThumb: 'rgba(0, 0, 0, 0.25)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.04)',
};

const MIDNIGHT_DEEP_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#f8fafc',
  textSecondary: '#a5b4cc',
  textTertiary: '#7b8aa8',
  textDisabled: '#566078',
  border: '#334155',
  borderLight: '#1e293b',
  borderDark: '#475569',
  background: '#020617',
  backgroundCard: '#0f172a',
  backgroundToolbar: '#020617',
  backgroundHover: '#1e293b',
  backgroundActive: '#6366f130',
  mask: 'rgba(0, 0, 0, 0.75)',
  windowBackground: '#020617',
  rowHoverBg: 'rgba(129, 140, 248, 0.15)',
  rowSelectedBg: 'rgba(129, 140, 248, 0.24)',
  rowStripeBg: '#131c2e',
  headerBg: '#131c2e',
  surfaceElevated: '#1a2438',
  scrollbarThumb: 'rgba(255, 255, 255, 0.25)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.04)',
};

// 3. OceanBlue - 海洋蓝色风格
const OCEAN_BLUE_LIGHT = createColorScheme({
  primary: '#0ea5e9', primaryHover: '#38bdf8', primaryActive: '#0284c7',
  success: '#14b8a6', successHover: '#2dd4bf', successActive: '#0d9488',
  warning: '#f59e0b', warningHover: '#fbbf24', warningActive: '#d97706',
  error: '#f43f5e', errorHover: '#fb7185', errorActive: '#e11d48',
  info: '#0ea5e9', infoHover: '#38bdf8', infoActive: '#0284c7',
});

const OCEAN_BLUE_DARK = createColorScheme({
  primary: '#38bdf8', primaryHover: '#7dd3fc', primaryActive: '#0ea5e9',
  success: '#2dd4bf', successHover: '#5eead4', successActive: '#14b8a6',
  warning: '#fbbf24', warningHover: '#fcd34d', warningActive: '#f59e0b',
  error: '#fb7185', errorHover: '#fda4af', errorActive: '#f43f5e',
  info: '#38bdf8', infoHover: '#7dd3fc', infoActive: '#0ea5e9',
});

const OCEAN_BLUE_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#0c4a6e',
  textSecondary: '#0369a1',
  textTertiary: '#0ea5e9',
  textDisabled: '#7dd3fc',
  border: '#bae6fd',
  borderLight: '#e0f2fe',
  borderDark: '#38bdf8',
  background: '#f0f9ff',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#e0f2fe',
  backgroundHover: '#e0f2fe',
  backgroundActive: '#0ea5e915',
  mask: 'rgba(0, 0, 0, 0.5)',
  windowBackground: '#f0f9ff',
  rowHoverBg: 'rgba(14, 165, 233, 0.05)',
  rowSelectedBg: 'rgba(14, 165, 233, 0.10)',
  rowStripeBg: '#f5fbff',
  headerBg: '#e0f2fe',
  surfaceElevated: '#ffffff',
  scrollbarThumb: 'rgba(0, 0, 0, 0.25)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.04)',
};

const OCEAN_BLUE_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#f5fbff',
  textSecondary: '#b0e3fc',
  textTertiary: '#7ecaf5',
  textDisabled: '#3aa8e0',
  border: '#1a7ab0',
  borderLight: '#0e507a',
  borderDark: '#0c7bc8',
  background: '#0c4a6e',
  backgroundCard: '#11557d',
  backgroundToolbar: '#0a3d5c',
  backgroundHover: '#1470a0',
  backgroundActive: '#0ea5e920',
  mask: 'rgba(0, 0, 0, 0.6)',
  windowBackground: '#0c4a6e',
  rowHoverBg: 'rgba(56, 189, 248, 0.15)',
  rowSelectedBg: 'rgba(56, 189, 248, 0.24)',
  rowStripeBg: '#0e507a',
  headerBg: '#0e507a',
  surfaceElevated: '#1470a0',
  scrollbarThumb: 'rgba(255, 255, 255, 0.25)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.04)',
};

// 4. NordicFrost - 北欧冷淡风格
const NORDIC_FROST_LIGHT = createColorScheme({
  primary: '#64748b', primaryHover: '#94a3b8', primaryActive: '#475569',
  success: '#22c55e', successHover: '#4ade80', successActive: '#16a34a',
  warning: '#f59e0b', warningHover: '#fbbf24', warningActive: '#d97706',
  error: '#ef4444', errorHover: '#f87171', errorActive: '#dc2626',
  info: '#64748b', infoHover: '#94a3b8', infoActive: '#475569',
});

const NORDIC_FROST_DARK = createColorScheme({
  primary: '#94a3b8', primaryHover: '#cbd5e1', primaryActive: '#64748b',
  success: '#4ade80', successHover: '#86efac', successActive: '#22c55e',
  warning: '#fbbf24', warningHover: '#fcd34d', warningActive: '#f59e0b',
  error: '#f87171', errorHover: '#fca5a5', errorActive: '#ef4444',
  info: '#94a3b8', infoHover: '#cbd5e1', infoActive: '#64748b',
});

const NORDIC_FROST_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#334155',
  textSecondary: '#64748b',
  textTertiary: '#94a3b8',
  textDisabled: '#cbd5e1',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  borderDark: '#cbd5e1',
  background: '#f8fafc',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#f1f5f9',
  backgroundHover: '#e2e8f0',
  backgroundActive: '#64748b15',
  mask: 'rgba(0, 0, 0, 0.5)',
  windowBackground: '#f8fafc',
  rowHoverBg: 'rgba(100, 116, 139, 0.05)',
  rowSelectedBg: 'rgba(100, 116, 139, 0.10)',
  rowStripeBg: '#fafbfc',
  headerBg: '#f1f5f9',
  surfaceElevated: '#ffffff',
  scrollbarThumb: 'rgba(0, 0, 0, 0.25)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.04)',
};

const NORDIC_FROST_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textTertiary: '#a5b4cc',
  textDisabled: '#6b7a8f',
  border: '#475569',
  borderLight: '#1e293b',
  borderDark: '#64748b',
  background: '#020617',
  backgroundCard: '#0f172a',
  backgroundToolbar: '#0f172a',
  backgroundHover: '#26354d',
  backgroundActive: '#94a3b820',
  mask: 'rgba(0, 0, 0, 0.6)',
  windowBackground: '#020617',
  rowHoverBg: 'rgba(148, 163, 184, 0.15)',
  rowSelectedBg: 'rgba(148, 163, 184, 0.24)',
  rowStripeBg: '#131c2e',
  headerBg: '#131c2e',
  surfaceElevated: '#1a2438',
  scrollbarThumb: 'rgba(255, 255, 255, 0.25)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.04)',
};

// ==================== 导出所有主题配置 ====================

export const THEMES: Record<ThemePreset, { light: ThemeConfig; dark: ThemeConfig }> = {
  neonCyber: {
    light: createThemeConfig('NeonCyber', '赛博朋克霓虹风格', 'light', NEON_CYBER_LIGHT, NEON_CYBER_LIGHT_NEUTRAL),
    dark: createThemeConfig('NeonCyber', '赛博朋克霓虹风格', 'dark', NEON_CYBER_DARK, NEON_CYBER_DARK_NEUTRAL),
  },
  midnightDeep: {
    light: createThemeConfig('MidnightDeep', '深夜深蓝风格', 'light', MIDNIGHT_DEEP_LIGHT, MIDNIGHT_DEEP_LIGHT_NEUTRAL),
    dark: createThemeConfig('MidnightDeep', '深夜深蓝风格', 'dark', MIDNIGHT_DEEP_DARK, MIDNIGHT_DEEP_DARK_NEUTRAL),
  },
  oceanBlue: {
    light: createThemeConfig('OceanBlue', '海洋蓝色风格', 'light', OCEAN_BLUE_LIGHT, OCEAN_BLUE_LIGHT_NEUTRAL),
    dark: createThemeConfig('OceanBlue', '海洋蓝色风格', 'dark', OCEAN_BLUE_DARK, OCEAN_BLUE_DARK_NEUTRAL),
  },
  nordicFrost: {
    light: createThemeConfig('NordicFrost', '北欧冷淡风格', 'light', NORDIC_FROST_LIGHT, NORDIC_FROST_LIGHT_NEUTRAL),
    dark: createThemeConfig('NordicFrost', '北欧冷淡风格', 'dark', NORDIC_FROST_DARK, NORDIC_FROST_DARK_NEUTRAL),
  },
};

export function getThemeConfig(preset: ThemePreset, mode: ThemeMode): ThemeConfig {
  return THEMES[preset][mode];
}



export const THEME_PRESETS_LIST = Object.entries(THEMES).map(([key, value]) => ({
  value: key as ThemePreset,
  label: value.light.name,
  description: value.light.description,
}));
