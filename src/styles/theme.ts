/**
 * i-dblink 主题配置文件
 * 
 * 定义完整的色彩系统、字体排印、间距规范等设计令牌
 */

// ==================== 色彩系统 ====================

/** 主题色 */
export const THEME_COLORS = {
  primary: '#1890ff',
  primaryHover: '#40a9ff',
  primaryActive: '#096dd9',
  
  success: '#52c41a',
  successHover: '#73d13d',
  successActive: '#389e0d',
  
  warning: '#faad14',
  warningHover: '#ffc53d',
  warningActive: '#d48806',
  
  error: '#ff4d4f',
  errorHover: '#ff7875',
  errorActive: '#d9363e',
  
  info: '#1890ff',
  infoHover: '#40a9ff',
  infoActive: '#096dd9',
};

/** 中性色 - 浅色模式 */
export const NEUTRAL_COLORS_LIGHT = {
  // 文字色
  textPrimary: '#0f0f0f',
  textSecondary: '#595959',
  textTertiary: '#8c8c8c',
  textDisabled: '#bfbfbf',
  
  // 边框色
  border: '#d9d9d9',
  borderLight: '#e8e8e8',
  borderDark: '#bfbfbf',
  
  // 背景色
  background: '#f6f6f6',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#fafafa',
  backgroundHover: '#f5f5f5',
  backgroundActive: '#e6f7ff',
  
  // 遮罩
  mask: 'rgba(0, 0, 0, 0.45)',
};

/** 中性色 - 深色模式 */
export const NEUTRAL_COLORS_DARK = {
  // 文字色
  textPrimary: '#f6f6f6',
  textSecondary: '#bfbfbf',
  textTertiary: '#595959',
  textDisabled: '#434343',
  
  // 边框色
  border: '#434343',
  borderLight: '#303030',
  borderDark: '#595959',
  
  // 背景色
  background: '#2f2f2f',
  backgroundCard: '#1f1f1f',
  backgroundToolbar: '#141414',
  backgroundHover: '#1f1f1f',
  backgroundActive: '#111d2c',
  
  // 遮罩
  mask: 'rgba(0, 0, 0, 0.65)',
};

/** 数据库类型配色 */
export const DB_TYPE_COLORS = {
  mysql: '#1890ff',      // 蓝色
  postgresql: '#52c41a', // 绿色
  sqlite: '#faad14',     // 橙色
  sqlserver: '#eb2f96',  // 粉色
  oracle: '#fa8c16',     // 金色
  mariadb: '#13c2c2',    // 青色
  dameng: '#722ed1',     // 紫色
  default: '#1890ff',
};

// ==================== 字体排印 ====================

export const TYPOGRAPHY = {
  // 字体族
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyCode: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace",
  
  // 字号
  fontSizeHeading1: 20,
  fontSizeHeading2: 16,
  fontSizeHeading3: 14,
  fontSizeBody: 14,
  fontSizeSecondary: 12,
  fontSizeCode: 13,
  
  // 行高
  lineHeightHeading: 1.4,
  lineHeightBody: 1.57,
  lineHeightCode: 1.5,
  
  // 字重
  fontWeightNormal: 400,
  fontWeightMedium: 500,
  fontWeightSemibold: 600,
  fontWeightBold: 700,
};

// ==================== 间距规范 ====================

export const SPACING = {
  // 基础间距单位 (4px 基准)
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  
  // 组件间距
  componentPaddingSM: 8,
  componentPaddingMD: 12,
  componentPaddingLG: 16,
  componentPaddingXL: 24,
  
  // 卡片间距
  cardPadding: 16,
  cardMargin: 16,
  
  // 分组间距
  groupMargin: 24,
};

// ==================== 尺寸规范 ====================

export const SIZES = {
  // 布局尺寸
  headerHeight: 32,
  toolbarHeight: 40,
  sidebarWidth: 280,
  middlePanelWidth: 320,
  logPanelHeight: 180,
  footerHeight: 28,
  
  // 侧边栏折叠宽度
  sidebarCollapsedWidth: 80,
  
  // 按钮尺寸
  buttonHeightSM: 24,
  buttonHeightMD: 32,
  buttonHeightLG: 40,
  
  // 输入框高度
  inputHeightSM: 24,
  inputHeightMD: 32,
  inputHeightLG: 40,
  
  // 表格尺寸
  tableHeaderHeight: 40,
  tableRowHeight: 36,
  tableRowHeightSM: 28,
  tableRowHeightLG: 48,
  
  // 图标尺寸
  iconSizeSM: 14,
  iconSizeMD: 16,
  iconSizeLG: 24,
  iconSizeXL: 48,
  
  // 对话框尺寸
  modalWidthSM: 400,
  modalWidthMD: 600,
  modalWidthLG: 800,
  modalWidthXL: 1000,
  
  // 窗口尺寸
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
  
  // 组件圆角
  buttonRadius: 6,
  inputRadius: 6,
  cardRadius: 8,
  modalRadius: 8,
};

// ==================== 阴影规范 ====================

export const SHADOWS = {
  // 阴影
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  shadowMd: '0 2px 8px rgba(0, 0, 0, 0.1)',
  shadowLg: '0 4px 16px rgba(0, 0, 0, 0.15)',
  shadowXl: '0 8px 32px rgba(0, 0, 0, 0.2)',
  
  // 浅色模式阴影
  cardShadowLight: '0 2px 8px rgba(0, 0, 0, 0.08)',
  headerShadowLight: '0 2px 8px rgba(0, 0, 0, 0.1)',
  
  // 深色模式阴影
  cardShadowDark: '0 2px 8px rgba(0, 0, 0, 0.3)',
  headerShadowDark: '0 2px 8px rgba(0, 0, 0, 0.4)',
};

// ==================== 动效规范 ====================

export const ANIMATION = {
  // 过渡时间
  durationFast: '0.1s',
  durationNormal: '0.2s',
  durationSlow: '0.3s',
  
  // 缓动函数
  easingEaseInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
  easingEaseOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  easingEaseIn: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
  
  // 常用过渡
  transitionColor: 'color 0.2s ease',
  transitionBackground: 'background-color 0.2s ease',
  transitionBorder: 'border-color 0.2s ease',
  transitionAll: 'all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)',
  transitionTransform: 'transform 0.2s ease',
  transitionBoxShadow: 'box-shadow 0.2s ease',
};

// ==================== 响应式断点 ====================

export const BREAKPOINTS = {
  xs: '320px',   // 超小屏
  sm: '576px',   // 小屏
  md: '768px',   // 中等屏
  lg: '992px',   // 大屏
  xl: '1200px',  // 超大屏
  xxl: '1600px', // 超大屏
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

// ==================== 导出完整主题配置 ====================

export interface ThemeConfig {
  colors: typeof THEME_COLORS;
  neutralColors: typeof NEUTRAL_COLORS_LIGHT;
  dbTypeColors: typeof DB_TYPE_COLORS;
  typography: typeof TYPOGRAPHY;
  spacing: typeof SPACING;
  sizes: typeof SIZES;
  borderRadius: typeof BORDER_RADIUS;
  shadows: typeof SHADOWS;
  animation: typeof ANIMATION;
  breakpoints: typeof BREAKPOINTS;
  zIndex: typeof Z_INDEX;
}

export const lightTheme: ThemeConfig = {
  colors: THEME_COLORS,
  neutralColors: NEUTRAL_COLORS_LIGHT,
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

export const darkTheme: ThemeConfig = {
  ...lightTheme,
  neutralColors: NEUTRAL_COLORS_DARK,
};

/**
 * 获取 CSS 变量定义
 */
export function getCSSVariables(theme: ThemeConfig = lightTheme): string {
  const vars: Record<string, string> = {};
  
  // 主题色
  Object.entries(theme.colors).forEach(([key, value]) => {
    vars[`--color-${key}`] = String(value);
  });
  
  // 中性色
  Object.entries(theme.neutralColors).forEach(([key, value]) => {
    vars[`--${key}`] = String(value);
  });
  
  // 数据库类型色
  Object.entries(theme.dbTypeColors).forEach(([key, value]) => {
    vars[`--db-color-${key}`] = String(value);
  });
  
  // 间距
  Object.entries(theme.spacing).forEach(([key, value]) => {
    vars[`--spacing-${key}`] = `${value}px`;
  });
  
  // 尺寸
  Object.entries(theme.sizes).forEach(([key, value]) => {
    vars[`--size-${key}`] = `${value}px`;
  });
  
  // 圆角
  Object.entries(theme.borderRadius).forEach(([key, value]) => {
    vars[`--radius-${key}`] = `${value}px`;
  });
  
  // Z-Index
  Object.entries(theme.zIndex).forEach(([key, value]) => {
    vars[`--z-${key}`] = String(value);
  });
  
  return Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
}

export default {
  lightTheme,
  darkTheme,
  getCSSVariables,
};
