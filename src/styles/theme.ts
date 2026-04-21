/**
 * i-dblink 主题配置文件
 *
 * 定义多款科技酷炫主题，每款支持亮暗模式
 */

export type ThemeMode = 'light' | 'dark';
export type ThemePreset = 'neonCyber' | 'midnightDeep' | 'forestDusk' | 'oceanBlue' | 'sunsetAurora' | 'nordicFrost';

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

// 1. NeonCyber - 赛博朋克霓虹风格（深色主题为主）
const NEON_CYBER_LIGHT = {
  primary: '#00e5ff',
  primaryHover: '#33ebff',
  primaryActive: '#00b8cc',
  primaryGradient: 'linear-gradient(135deg, #00e5ff 0%, #33ebff 100%)',
  success: '#00ff55',
  successHover: '#33ff77',
  successActive: '#00cc44',
  successGradient: 'linear-gradient(135deg, #00ff55 0%, #33ff77 100%)',
  warning: '#ff00ff',
  warningHover: '#ff33ff',
  warningActive: '#cc00cc',
  warningGradient: 'linear-gradient(135deg, #ff00ff 0%, #ff33ff 100%)',
  error: '#ff3366',
  errorHover: '#ff6699',
  errorActive: '#cc2952',
  errorGradient: 'linear-gradient(135deg, #ff3366 0%, #ff6699 100%)',
  info: '#00e5ff',
  infoHover: '#33ebff',
  infoActive: '#00b8cc',
  infoGradient: 'linear-gradient(135deg, #00e5ff 0%, #33ebff 100%)',
};

const NEON_CYBER_DARK = {
  primary: '#00f5ff',
  primaryHover: '#33f7ff',
  primaryActive: '#00c4cc',
  primaryGradient: 'linear-gradient(135deg, #00f5ff 0%, #33f7ff 100%)',
  success: '#39ff14',
  successHover: '#5fff3d',
  successActive: '#2ecc0f',
  successGradient: 'linear-gradient(135deg, #39ff14 0%, #5fff3d 100%)',
  warning: '#ff00ff',
  warningHover: '#ff33ff',
  warningActive: '#cc00cc',
  warningGradient: 'linear-gradient(135deg, #ff00ff 0%, #ff33ff 100%)',
  error: '#ff3366',
  errorHover: '#ff6699',
  errorActive: '#cc2952',
  errorGradient: 'linear-gradient(135deg, #ff3366 0%, #ff6699 100%)',
  info: '#00f5ff',
  infoHover: '#33f7ff',
  infoActive: '#00c4cc',
  infoGradient: 'linear-gradient(135deg, #00f5ff 0%, #33f7ff 100%)',
};

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
};

const NEON_CYBER_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#e8e8ff',
  textSecondary: '#a0a0c0',
  textTertiary: '#707090',
  textDisabled: '#505070',
  border: '#2a2a4a',
  borderLight: '#1a1a3a',
  borderDark: '#3a3a5a',
  background: '#08080f',
  backgroundCard: '#0d0d18',
  backgroundToolbar: '#050508',
  backgroundHover: '#12121f',
  backgroundActive: '#00f5ff20',
  mask: 'rgba(0, 0, 0, 0.8)',
  windowBackground: '#08080f',
};

// 2. MidnightDeep - 深夜深蓝风格
const MIDNIGHT_DEEP_LIGHT = {
  primary: '#6366f1',
  primaryHover: '#818cf8',
  primaryActive: '#4f46e5',
  primaryGradient: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
  success: '#10b981',
  successHover: '#34d399',
  successActive: '#059669',
  successGradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
  warning: '#f59e0b',
  warningHover: '#fbbf24',
  warningActive: '#d97706',
  warningGradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  error: '#ef4444',
  errorHover: '#f87171',
  errorActive: '#dc2626',
  errorGradient: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
  info: '#6366f1',
  infoHover: '#818cf8',
  infoActive: '#4f46e5',
  infoGradient: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
};

const MIDNIGHT_DEEP_DARK = {
  primary: '#818cf8',
  primaryHover: '#a5b4fc',
  primaryActive: '#6366f1',
  primaryGradient: 'linear-gradient(135deg, #818cf8 0%, #a5b4fc 100%)',
  success: '#34d399',
  successHover: '#6ee7b7',
  successActive: '#10b981',
  successGradient: 'linear-gradient(135deg, #34d399 0%, #6ee7b7 100%)',
  warning: '#fbbf24',
  warningHover: '#fcd34d',
  warningActive: '#f59e0b',
  warningGradient: 'linear-gradient(135deg, #fbbf24 0%, #fcd34d 100%)',
  error: '#f87171',
  errorHover: '#fca5a5',
  errorActive: '#ef4444',
  errorGradient: 'linear-gradient(135deg, #f87171 0%, #fca5a5 100%)',
  info: '#818cf8',
  infoHover: '#a5b4fc',
  infoActive: '#6366f1',
  infoGradient: 'linear-gradient(135deg, #818cf8 0%, #a5b4fc 100%)',
};

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
};

// 3. ForestDusk - 森林暮光风格
const FOREST_DUSK_LIGHT = {
  primary: '#22c55e',
  primaryHover: '#4ade80',
  primaryActive: '#16a34a',
  primaryGradient: 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)',
  success: '#84cc16',
  successHover: '#a3e635',
  successActive: '#65a30d',
  successGradient: 'linear-gradient(135deg, #84cc16 0%, #a3e635 100%)',
  warning: '#f97316',
  warningHover: '#fb923c',
  warningActive: '#ea580c',
  warningGradient: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)',
  error: '#ef4444',
  errorHover: '#f87171',
  errorActive: '#dc2626',
  errorGradient: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
  info: '#06b6d4',
  infoHover: '#22d3ee',
  infoActive: '#0891b2',
  infoGradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)',
};

const FOREST_DUSK_DARK = {
  primary: '#4ade80',
  primaryHover: '#86efac',
  primaryActive: '#22c55e',
  primaryGradient: 'linear-gradient(135deg, #4ade80 0%, #86efac 100%)',
  success: '#a3e635',
  successHover: '#d9f99d',
  successActive: '#84cc16',
  successGradient: 'linear-gradient(135deg, #a3e635 0%, #d9f99d 100%)',
  warning: '#fb923c',
  warningHover: '#fdba74',
  warningActive: '#f97316',
  warningGradient: 'linear-gradient(135deg, #fb923c 0%, #fdba74 100%)',
  error: '#f87171',
  errorHover: '#fca5a5',
  errorActive: '#ef4444',
  errorGradient: 'linear-gradient(135deg, #f87171 0%, #fca5a5 100%)',
  info: '#22d3ee',
  infoHover: '#67e8f9',
  infoActive: '#06b6d4',
  infoGradient: 'linear-gradient(135deg, #22d3ee 0%, #67e8f9 100%)',
};

const FOREST_DUSK_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#14532d',
  textSecondary: '#166534',
  textTertiary: '#22c55e',
  textDisabled: '#86efac',
  border: '#bbf7d0',
  borderLight: '#dcfce7',
  borderDark: '#86efac',
  background: '#f0fdf4',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#dcfce7',
  backgroundHover: '#dcfce7',
  backgroundActive: '#22c55e15',
  mask: 'rgba(0, 0, 0, 0.5)',
  windowBackground: '#f0fdf4',
};

const FOREST_DUSK_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#ecfdf5',
  textSecondary: '#86efac',
  textTertiary: '#4ade80',
  textDisabled: '#22c55e',
  border: '#14532d',
  borderLight: '#0f172a',
  borderDark: '#166534',
  background: '#052e16',
  backgroundCard: '#0a1f0d',
  backgroundToolbar: '#041a0a',
  backgroundHover: '#0f2816',
  backgroundActive: '#22c55e25',
  mask: 'rgba(0, 0, 0, 0.7)',
  windowBackground: '#052e16',
};

// 4. OceanBlue - 海洋蓝色风格
const OCEAN_BLUE_LIGHT = {
  primary: '#0ea5e9',
  primaryHover: '#38bdf8',
  primaryActive: '#0284c7',
  primaryGradient: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
  success: '#14b8a6',
  successHover: '#2dd4bf',
  successActive: '#0d9488',
  successGradient: 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)',
  warning: '#f59e0b',
  warningHover: '#fbbf24',
  warningActive: '#d97706',
  warningGradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  error: '#f43f5e',
  errorHover: '#fb7185',
  errorActive: '#e11d48',
  errorGradient: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)',
  info: '#0ea5e9',
  infoHover: '#38bdf8',
  infoActive: '#0284c7',
  infoGradient: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
};

const OCEAN_BLUE_DARK = {
  primary: '#38bdf8',
  primaryHover: '#7dd3fc',
  primaryActive: '#0ea5e9',
  primaryGradient: 'linear-gradient(135deg, #38bdf8 0%, #7dd3fc 100%)',
  success: '#2dd4bf',
  successHover: '#5eead4',
  successActive: '#14b8a6',
  successGradient: 'linear-gradient(135deg, #2dd4bf 0%, #5eead4 100%)',
  warning: '#fbbf24',
  warningHover: '#fcd34d',
  warningActive: '#f59e0b',
  warningGradient: 'linear-gradient(135deg, #fbbf24 0%, #fcd34d 100%)',
  error: '#fb7185',
  errorHover: '#fda4af',
  errorActive: '#f43f5e',
  errorGradient: 'linear-gradient(135deg, #fb7185 0%, #fda4af 100%)',
  info: '#38bdf8',
  infoHover: '#7dd3fc',
  infoActive: '#0ea5e9',
  infoGradient: 'linear-gradient(135deg, #38bdf8 0%, #7dd3fc 100%)',
};

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
};

const OCEAN_BLUE_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#f0f9ff',
  textSecondary: '#8ed4f8',
  textTertiary: '#5ab8e8',
  textDisabled: '#38bdf8',
  border: '#0c4a6e',
  borderLight: '#082f49',
  borderDark: '#0369a1',
  background: '#0c4a6e',
  backgroundCard: '#0a3d5c',
  backgroundToolbar: '#063549',
  backgroundHover: '#0c4a6e',
  backgroundActive: '#0ea5e920',
  mask: 'rgba(0, 0, 0, 0.6)',
  windowBackground: '#0c4a6e',
};

// 5. SunsetAurora - 极光风格
const SUNSET_AURORA_LIGHT = {
  primary: '#a855f7',
  primaryHover: '#c084fc',
  primaryActive: '#9333ea',
  primaryGradient: 'linear-gradient(135deg, #a855f7 0%, #c084fc 100%)',
  success: '#22c55e',
  successHover: '#4ade80',
  successActive: '#16a34a',
  successGradient: 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)',
  warning: '#f97316',
  warningHover: '#fb923c',
  warningActive: '#ea580c',
  warningGradient: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)',
  error: '#ec4899',
  errorHover: '#f472b6',
  errorActive: '#db2777',
  errorGradient: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)',
  info: '#06b6d4',
  infoHover: '#22d3ee',
  infoActive: '#0891b2',
  infoGradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)',
};

const SUNSET_AURORA_DARK = {
  primary: '#c084fc',
  primaryHover: '#d8b4fe',
  primaryActive: '#a855f7',
  primaryGradient: 'linear-gradient(135deg, #c084fc 0%, #d8b4fe 100%)',
  success: '#4ade80',
  successHover: '#86efac',
  successActive: '#22c55e',
  successGradient: 'linear-gradient(135deg, #4ade80 0%, #86efac 100%)',
  warning: '#fb923c',
  warningHover: '#fdc978',
  warningActive: '#f97316',
  warningGradient: 'linear-gradient(135deg, #fb923c 0%, #fdc978 100%)',
  error: '#f472b6',
  errorHover: '#f9a8d4',
  errorActive: '#ec4899',
  errorGradient: 'linear-gradient(135deg, #f472b6 0%, #f9a8d4 100%)',
  info: '#22d3ee',
  infoHover: '#67e8f9',
  infoActive: '#06b6d4',
  infoGradient: 'linear-gradient(135deg, #22d3ee 0%, #67e8f9 100%)',
};

const SUNSET_AURORA_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#581c87',
  textSecondary: '#7e22ce',
  textTertiary: '#a855f7',
  textDisabled: '#c084fc',
  border: '#e9d5ff',
  borderLight: '#f5f3ff',
  borderDark: '#c084fc',
  background: '#faf5ff',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#f3e8ff',
  backgroundHover: '#f3e8ff',
  backgroundActive: '#a855f715',
  mask: 'rgba(0, 0, 0, 0.5)',
  windowBackground: '#faf5ff',
};

const SUNSET_AURORA_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#faf5ff',
  textSecondary: '#c084fc',
  textTertiary: '#a855f7',
  textDisabled: '#7e22ce',
  border: '#581c87',
  borderLight: '#3b0764',
  borderDark: '#7e22ce',
  background: '#3b0764',
  backgroundCard: '#4a148c',
  backgroundToolbar: '#2d0a5e',
  backgroundHover: '#4a148c',
  backgroundActive: '#a855f720',
  mask: 'rgba(0, 0, 0, 0.65)',
  windowBackground: '#3b0764',
};

// 6. NordicFrost - 北欧冷淡风格
const NORDIC_FROST_LIGHT = {
  primary: '#64748b',
  primaryHover: '#94a3b8',
  primaryActive: '#475569',
  primaryGradient: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
  success: '#22c55e',
  successHover: '#4ade80',
  successActive: '#16a34a',
  successGradient: 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)',
  warning: '#f59e0b',
  warningHover: '#fbbf24',
  warningActive: '#d97706',
  warningGradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  error: '#ef4444',
  errorHover: '#f87171',
  errorActive: '#dc2626',
  errorGradient: 'linear-gradient(135deg, #ef4444 0%,#f87171 100%)',
  info: '#64748b',
  infoHover: '#94a3b8',
  infoActive: '#475569',
  infoGradient: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
};

const NORDIC_FROST_DARK = {
  primary: '#94a3b8',
  primaryHover: '#cbd5e1',
  primaryActive: '#64748b',
  primaryGradient: 'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)',
  success: '#4ade80',
  successHover: '#86efac',
  successActive: '#22c55e',
  successGradient: 'linear-gradient(135deg, #4ade80 0%, #86efac 100%)',
  warning: '#fbbf24',
  warningHover: '#fcd34d',
  warningActive: '#f59e0b',
  warningGradient: 'linear-gradient(135deg, #fbbf24 0%, #fcd34d 100%)',
  error: '#f87171',
  errorHover: '#fca5a5',
  errorActive: '#ef4444',
  errorGradient: 'linear-gradient(135deg, #f87171 0%, #fca5a5 100%)',
  info: '#94a3b8',
  infoHover: '#cbd5e1',
  infoActive: '#64748b',
  infoGradient: 'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)',
};

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
};

const NORDIC_FROST_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textTertiary: '#94a3b8',
  textDisabled: '#64748b',
  border: '#475569',
  borderLight: '#1e293b',
  borderDark: '#64748b',
  background: '#020617',
  backgroundCard: '#0f172a',
  backgroundToolbar: '#020617',
  backgroundHover: '#1e293b',
  backgroundActive: '#94a3b820',
  mask: 'rgba(0, 0, 0, 0.6)',
  windowBackground: '#020617',
};

// ==================== 导出所有主题配置 ====================

export const THEMES: Record<ThemePreset, { light: ThemeConfig; dark: ThemeConfig }> = {
  neonCyber: {
    light: {
      name: 'NeonCyber',
      description: '赛博朋克霓虹风格',
      mode: 'light',
      colors: NEON_CYBER_LIGHT,
      neutralColors: NEON_CYBER_LIGHT_NEUTRAL,
      glassEffect: GLASS_EFFECTS.light,
      focusStyle: FOCUS_STYLES.light,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
    dark: {
      name: 'NeonCyber',
      description: '赛博朋克霓虹风格',
      mode: 'dark',
      colors: NEON_CYBER_DARK,
      neutralColors: NEON_CYBER_DARK_NEUTRAL,
      glassEffect: GLASS_EFFECTS.dark,
      focusStyle: FOCUS_STYLES.dark,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
  },
  midnightDeep: {
    light: {
      name: 'MidnightDeep',
      description: '深夜深蓝风格',
      mode: 'light',
      colors: MIDNIGHT_DEEP_LIGHT,
      neutralColors: MIDNIGHT_DEEP_LIGHT_NEUTRAL,
      glassEffect: GLASS_EFFECTS.light,
      focusStyle: FOCUS_STYLES.light,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
    dark: {
      name: 'MidnightDeep',
      description: '深夜深蓝风格',
      mode: 'dark',
      colors: MIDNIGHT_DEEP_DARK,
      neutralColors: MIDNIGHT_DEEP_DARK_NEUTRAL,
      glassEffect: GLASS_EFFECTS.dark,
      focusStyle: FOCUS_STYLES.dark,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
  },
  forestDusk: {
    light: {
      name: 'ForestDusk',
      description: '森林暮光风格',
      mode: 'light',
      colors: FOREST_DUSK_LIGHT,
      neutralColors: FOREST_DUSK_LIGHT_NEUTRAL,
      glassEffect: GLASS_EFFECTS.light,
      focusStyle: FOCUS_STYLES.light,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
    dark: {
      name: 'ForestDusk',
      description: '森林暮光风格',
      mode: 'dark',
      colors: FOREST_DUSK_DARK,
      neutralColors: FOREST_DUSK_DARK_NEUTRAL,
      glassEffect: GLASS_EFFECTS.dark,
      focusStyle: FOCUS_STYLES.dark,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
  },
  oceanBlue: {
    light: {
      name: 'OceanBlue',
      description: '海洋蓝色风格',
      mode: 'light',
      colors: OCEAN_BLUE_LIGHT,
      neutralColors: OCEAN_BLUE_LIGHT_NEUTRAL,
      glassEffect: GLASS_EFFECTS.light,
      focusStyle: FOCUS_STYLES.light,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
    dark: {
      name: 'OceanBlue',
      description: '海洋蓝色风格',
      mode: 'dark',
      colors: OCEAN_BLUE_DARK,
      neutralColors: OCEAN_BLUE_DARK_NEUTRAL,
      glassEffect: GLASS_EFFECTS.dark,
      focusStyle: FOCUS_STYLES.dark,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
  },
  sunsetAurora: {
    light: {
      name: 'SunsetAurora',
      description: '极光风格',
      mode: 'light',
      colors: SUNSET_AURORA_LIGHT,
      neutralColors: SUNSET_AURORA_LIGHT_NEUTRAL,
      glassEffect: GLASS_EFFECTS.light,
      focusStyle: FOCUS_STYLES.light,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
    dark: {
      name: 'SunsetAurora',
      description: '极光风格',
      mode: 'dark',
      colors: SUNSET_AURORA_DARK,
      neutralColors: SUNSET_AURORA_DARK_NEUTRAL,
      glassEffect: GLASS_EFFECTS.dark,
      focusStyle: FOCUS_STYLES.dark,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
  },
  nordicFrost: {
    light: {
      name: 'NordicFrost',
      description: '北欧冷淡风格',
      mode: 'light',
      colors: NORDIC_FROST_LIGHT,
      neutralColors: NORDIC_FROST_LIGHT_NEUTRAL,
      glassEffect: GLASS_EFFECTS.light,
      focusStyle: FOCUS_STYLES.light,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
    dark: {
      name: 'NordicFrost',
      description: '北欧冷淡风格',
      mode: 'dark',
      colors: NORDIC_FROST_DARK,
      neutralColors: NORDIC_FROST_DARK_NEUTRAL,
      glassEffect: GLASS_EFFECTS.dark,
      focusStyle: FOCUS_STYLES.dark,
      dbTypeColors: DB_TYPE_COLORS,
      typography: TYPOGRAPHY,
      spacing: SPACING,
      sizes: SIZES,
      borderRadius: BORDER_RADIUS,
      shadows: SHADOWS,
      animation: ANIMATION,
      breakpoints: BREAKPOINTS,
      zIndex: Z_INDEX,
    },
  },
};

export function getThemeConfig(preset: ThemePreset, mode: ThemeMode): ThemeConfig {
  return THEMES[preset][mode];
}

export function getCSSVariables(config: ThemeConfig): string {
  const vars: Record<string, string> = {};

  Object.entries(config.colors).forEach(([key, value]) => {
    vars[`--color-${key}`] = String(value);
  });

  Object.entries(config.neutralColors).forEach(([key, value]) => {
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    vars[`--${cssKey}`] = String(value);
  });

  Object.entries(config.dbTypeColors).forEach(([key, value]) => {
    vars[`--db-color-${key}`] = String(value);
  });

  Object.entries(config.glassEffect).forEach(([key, value]) => {
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    vars[`--glass-${cssKey}`] = String(value);
  });

  Object.entries(config.focusStyle).forEach(([key, value]) => {
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    if (typeof value === 'number') {
      vars[`--focus-${cssKey}`] = `${value}px`;
    } else {
      vars[`--focus-${cssKey}`] = String(value);
    }
  });

  Object.entries(config.spacing).forEach(([key, value]) => {
    if (typeof value === 'number') {
      vars[`--spacing-${key}`] = `${value}px`;
    }
  });

  Object.entries(config.sizes).forEach(([key, value]) => {
    if (typeof value === 'number') {
      vars[`--size-${key}`] = `${value}px`;
    }
  });

  Object.entries(config.borderRadius).forEach(([key, value]) => {
    if (typeof value === 'number') {
      vars[`--radius-${key}`] = `${value}px`;
    }
  });

  Object.entries(config.zIndex).forEach(([key, value]) => {
    vars[`--z-${key}`] = String(value);
  });

  return Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
}

export const THEME_PRESETS_LIST = Object.entries(THEMES).map(([key, value]) => ({
  value: key as ThemePreset,
  label: value.light.name,
  description: value.light.description,
}));
