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
  success: string;
  successHover: string;
  successActive: string;
  warning: string;
  warningHover: string;
  warningActive: string;
  error: string;
  errorHover: string;
  errorActive: string;
  info: string;
  infoHover: string;
  infoActive: string;
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
}

export interface ThemeConfig {
  name: string;
  description: string;
  mode: ThemeMode;
  colors: ThemeColorScheme;
  neutralColors: NeutralColors;
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
  cardShadowLight: '0 2px 8px rgba(0, 0, 0, 0.08)',
  headerShadowLight: '0 2px 8px rgba(0, 0, 0, 0.1)',
  cardShadowDark: '0 2px 8px rgba(0, 0, 0, 0.3)',
  headerShadowDark: '0 2px 8px rgba(0, 0, 0, 0.4)',
};

// ==================== 动效规范 ====================

export const ANIMATION = {
  durationFast: '0.1s',
  durationNormal: '0.2s',
  durationSlow: '0.3s',
  easingEaseInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
  easingEaseOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  easingEaseIn: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
  transitionColor: 'color 0.2s ease',
  transitionBackground: 'background-color 0.2s ease',
  transitionBorder: 'border-color 0.2s ease',
  transitionAll: 'all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)',
  transitionTransform: 'transform 0.2s ease',
  transitionBoxShadow: 'box-shadow 0.2s ease',
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

// ==================== 主题配色方案 ====================

// 1. NeonCyber - 赛博朋克霓虹风格
const NEON_CYBER_LIGHT = {
  primary: '#00f5ff',
  primaryHover: '#33f7ff',
  primaryActive: '#00c4cc',
  success: '#39ff14',
  successHover: '#5fff3d',
  successActive: '#2ecc0f',
  warning: '#ff00ff',
  warningHover: '#ff33ff',
  warningActive: '#cc00cc',
  error: '#ff3366',
  errorHover: '#ff6699',
  errorActive: '#cc2952',
  info: '#00f5ff',
  infoHover: '#33f7ff',
  infoActive: '#00c4cc',
};

const NEON_CYBER_DARK = {
  primary: '#00f5ff',
  primaryHover: '#33f7ff',
  primaryActive: '#00c4cc',
  success: '#39ff14',
  successHover: '#5fff3d',
  successActive: '#2ecc0f',
  warning: '#ff00ff',
  warningHover: '#ff33ff',
  warningActive: '#cc00cc',
  error: '#ff3366',
  errorHover: '#ff6699',
  errorActive: '#cc2952',
  info: '#00f5ff',
  infoHover: '#33f7ff',
  infoActive: '#00c4cc',
};

const NEON_CYBER_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#0a0a0f',
  textSecondary: '#4a4a5a',
  textTertiary: '#7a7a8a',
  textDisabled: '#b0b0c0',
  border: '#2a2a3a',
  borderLight: '#1a1a2a',
  borderDark: '#3a3a4a',
  background: '#0d0d14',
  backgroundCard: '#14141f',
  backgroundToolbar: '#0a0a12',
  backgroundHover: '#1a1a2a',
  backgroundActive: '#00f5ff15',
  mask: 'rgba(0, 0, 0, 0.7)',
};

const NEON_CYBER_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#e0e0ff',
  textSecondary: '#9090b0',
  textTertiary: '#606080',
  textDisabled: '#404060',
  border: '#2a2a4a',
  borderLight: '#1a1a3a',
  borderDark: '#3a3a5a',
  background: '#08080f',
  backgroundCard: '#0d0d18',
  backgroundToolbar: '#050508',
  backgroundHover: '#12121f',
  backgroundActive: '#00f5ff20',
  mask: 'rgba(0, 0, 0, 0.8)',
};

// 2. MidnightDeep - 深夜深蓝风格
const MIDNIGHT_DEEP_LIGHT = {
  primary: '#6366f1',
  primaryHover: '#818cf8',
  primaryActive: '#4f46e5',
  success: '#10b981',
  successHover: '#34d399',
  successActive: '#059669',
  warning: '#f59e0b',
  warningHover: '#fbbf24',
  warningActive: '#d97706',
  error: '#ef4444',
  errorHover: '#f87171',
  errorActive: '#dc2626',
  info: '#6366f1',
  infoHover: '#818cf8',
  infoActive: '#4f46e5',
};

const MIDNIGHT_DEEP_DARK = {
  primary: '#818cf8',
  primaryHover: '#a5b4fc',
  primaryActive: '#6366f1',
  success: '#34d399',
  successHover: '#6ee7b7',
  successActive: '#10b981',
  warning: '#fbbf24',
  warningHover: '#fcd34d',
  warningActive: '#f59e0b',
  error: '#f87171',
  errorHover: '#fca5a5',
  errorActive: '#ef4444',
  info: '#818cf8',
  infoHover: '#a5b4fc',
  infoActive: '#6366f1',
};

const MIDNIGHT_DEEP_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#1e293b',
  textSecondary: '#475569',
  textTertiary: '#64748b',
  textDisabled: '#94a3b8',
  border: '#334155',
  borderLight: '#1e293b',
  borderDark: '#475569',
  background: '#0f172a',
  backgroundCard: '#1e1e2e',
  backgroundToolbar: '#0a0a14',
  backgroundHover: '#1a1a2e',
  backgroundActive: '#6366f120',
  mask: 'rgba(0, 0, 0, 0.6)',
};

const MIDNIGHT_DEEP_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  textDisabled: '#475569',
  border: '#334155',
  borderLight: '#1e293b',
  borderDark: '#475569',
  background: '#020617',
  backgroundCard: '#0f172a',
  backgroundToolbar: '#020617',
  backgroundHover: '#1e293b',
  backgroundActive: '#6366f130',
  mask: 'rgba(0, 0, 0, 0.75)',
};

// 3. ForestDusk - 森林暮光风格
const FOREST_DUSK_LIGHT = {
  primary: '#22c55e',
  primaryHover: '#4ade80',
  primaryActive: '#16a34a',
  success: '#84cc16',
  successHover: '#a3e635',
  successActive: '#65a30d',
  warning: '#f97316',
  warningHover: '#fb923c',
  warningActive: '#ea580c',
  error: '#ef4444',
  errorHover: '#f87171',
  errorActive: '#dc2626',
  info: '#06b6d4',
  infoHover: '#22d3ee',
  infoActive: '#0891b2',
};

const FOREST_DUSK_DARK = {
  primary: '#4ade80',
  primaryHover: '#86efac',
  primaryActive: '#22c55e',
  success: '#a3e635',
  successHover: '#d9f99d',
  successActive: '#84cc16',
  warning: '#fb923c',
  warningHover: '#fdba74',
  warningActive: '#f97316',
  error: '#f87171',
  errorHover: '#fca5a5',
  errorActive: '#ef4444',
  info: '#22d3ee',
  infoHover: '#67e8f9',
  infoActive: '#06b6d4',
};

const FOREST_DUSK_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#14532d',
  textSecondary: '#166534',
  textTertiary: '#22c55e',
  textDisabled: '#86efac',
  border: '#166534',
  borderLight: '#14532d',
  borderDark: '#22c55e',
  background: '#f0fdf4',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#dcfce7',
  backgroundHover: '#dcfce7',
  backgroundActive: '#22c55e15',
  mask: 'rgba(0, 0, 0, 0.5)',
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
};

// 4. OceanBlue - 海洋蓝色风格
const OCEAN_BLUE_LIGHT = {
  primary: '#0ea5e9',
  primaryHover: '#38bdf8',
  primaryActive: '#0284c7',
  success: '#14b8a6',
  successHover: '#2dd4bf',
  successActive: '#0d9488',
  warning: '#f59e0b',
  warningHover: '#fbbf24',
  warningActive: '#d97706',
  error: '#f43f5e',
  errorHover: '#fb7185',
  errorActive: '#e11d48',
  info: '#0ea5e9',
  infoHover: '#38bdf8',
  infoActive: '#0284c7',
};

const OCEAN_BLUE_DARK = {
  primary: '#38bdf8',
  primaryHover: '#7dd3fc',
  primaryActive: '#0ea5e9',
  success: '#2dd4bf',
  successHover: '#5eead4',
  successActive: '#14b8a6',
  warning: '#fbbf24',
  warningHover: '#fcd34d',
  warningActive: '#f59e0b',
  error: '#fb7185',
  errorHover: '#fda4af',
  errorActive: '#f43f5e',
  info: '#38bdf8',
  infoHover: '#7dd3fc',
  infoActive: '#0ea5e9',
};

const OCEAN_BLUE_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#0c4a6e',
  textSecondary: '#0369a1',
  textTertiary: '#0ea5e9',
  textDisabled: '#7dd3fc',
  border: '#0369a1',
  borderLight: '#0c4a6e',
  borderDark: '#0ea5e9',
  background: '#f0f9ff',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#e0f2fe',
  backgroundHover: '#e0f2fe',
  backgroundActive: '#0ea5e915',
  mask: 'rgba(0, 0, 0, 0.5)',
};

const OCEAN_BLUE_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#f0f9ff',
  textSecondary: '#7dd3fc',
  textTertiary: '#38bdf8',
  textDisabled: '#0ea5e9',
  border: '#0c4a6e',
  borderLight: '#082f49',
  borderDark: '#0369a1',
  background: '#0c4a6e',
  backgroundCard: '#0a3d5c',
  backgroundToolbar: '#063549',
  backgroundHover: '#0c4a6e',
  backgroundActive: '#0ea5e920',
  mask: 'rgba(0, 0, 0, 0.6)',
};

// 5. SunsetAurora - 极光风格
const SUNSET_AURORA_LIGHT = {
  primary: '#a855f7',
  primaryHover: '#c084fc',
  primaryActive: '#9333ea',
  success: '#22c55e',
  successHover: '#4ade80',
  successActive: '#16a34a',
  warning: '#f97316',
  warningHover: '#fb923c',
  warningActive: '#ea580c',
  error: '#ec4899',
  errorHover: '#f472b6',
  errorActive: '#db2777',
  info: '#06b6d4',
  infoHover: '#22d3ee',
  infoActive: '#0891b2',
};

const SUNSET_AURORA_DARK = {
  primary: '#c084fc',
  primaryHover: '#d8b4fe',
  primaryActive: '#a855f7',
  success: '#4ade80',
  successHover: '#86efac',
  successActive: '#22c55e',
  warning: '#fb923c',
  warningHover: '#fdc978',
  warningActive: '#f97316',
  error: '#f472b6',
  errorHover: '#f9a8d4',
  errorActive: '#ec4899',
  info: '#22d3ee',
  infoHover: '#67e8f9',
  infoActive: '#06b6d4',
};

const SUNSET_AURORA_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#581c87',
  textSecondary: '#7e22ce',
  textTertiary: '#a855f7',
  textDisabled: '#c084fc',
  border: '#7e22ce',
  borderLight: '#581c87',
  borderDark: '#a855f7',
  background: '#faf5ff',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#f3e8ff',
  backgroundHover: '#f3e8ff',
  backgroundActive: '#a855f715',
  mask: 'rgba(0, 0, 0, 0.5)',
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
};

// 6. NordicFrost - 北欧冷淡风格
const NORDIC_FROST_LIGHT = {
  primary: '#64748b',
  primaryHover: '#94a3b8',
  primaryActive: '#475569',
  success: '#6b7280',
  successHover: '#9ca3af',
  successActive: '#4b5563',
  warning: '#9ca3af',
  warningHover: '#d1d5db',
  warningActive: '#6b7280',
  error: '#78716c',
  errorHover: '#a8a29e',
  errorActive: '#57534e',
  info: '#64748b',
  infoHover: '#94a3b8',
  infoActive: '#475569',
};

const NORDIC_FROST_DARK = {
  primary: '#94a3b8',
  primaryHover: '#cbd5e1',
  primaryActive: '#64748b',
  success: '#9ca3af',
  successHover: '#d1d5db',
  successActive: '#6b7280',
  warning: '#d1d5db',
  warningHover: '#e5e7eb',
  warningActive: '#9ca3af',
  error: '#a8a29e',
  errorHover: '#d6d3d1',
  errorActive: '#78716c',
  info: '#94a3b8',
  infoHover: '#cbd5e1',
  infoActive: '#64748b',
};

const NORDIC_FROST_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textTertiary: '#94a3b8',
  textDisabled: '#64748b',
  border: '#475569',
  borderLight: '#334155',
  borderDark: '#64748b',
  background: '#1e293b',
  backgroundCard: '#0f172a',
  backgroundToolbar: '#020617',
  backgroundHover: '#1e293b',
  backgroundActive: '#64748b20',
  mask: 'rgba(0, 0, 0, 0.5)',
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
    vars[`--${key}`] = String(value);
  });

  Object.entries(config.dbTypeColors).forEach(([key, value]) => {
    vars[`--db-color-${key}`] = String(value);
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
