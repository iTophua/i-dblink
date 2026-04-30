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
  // 层级过渡色 - 用于细腻的层次区分
  level1: string; // 底层
  level2: string; // 卡片层
  level3: string; // 悬浮层
  level4: string; // 弹窗层
  // 边框层次
  borderSubtle: string; // 极淡边框 - 分隔同类元素
  borderEmphasis: string; // 强调边框 - 聚焦当前
  borderActive: string; // 激活边框 - 选中状态
}

export interface GlassEffect {
  glassBackground: string;
  glassBorder: string;
  glassBlur: string;
  glassShadow: string;
  glassInnerGlow: string;
  glassHighlight: string;
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
  glassLayers: typeof GLASS_LAYERS;
  focusStyle: FocusStyle;
  lighting: typeof LIGHTING_EFFECTS;
  dbTypeColors: Record<string, string>;
  typography: typeof TYPOGRAPHY;
  spacing: typeof SPACING;
  sizes: typeof SIZES;
  borderRadius: typeof BORDER_RADIUS;
  shadows: typeof SHADOWS;
  shadowLevels: typeof SHADOW_LEVELS;
  animation: typeof ANIMATION;
  animationEnhanced: typeof ANIMATION_ENHANCED;
  breakpoints: typeof BREAKPOINTS;
  zIndex: typeof Z_INDEX;
}

// ==================== 字体排印 ====================

export const TYPOGRAPHY = {
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
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

// ==================== 阴影规范 - 增强层次感 ====================

export const SHADOWS = {
  // 细腻阴影 - 轻微悬浮感，用于内嵌元素
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.04)',
  // 柔和阴影 - 标准卡片态
  shadowMd: '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  // 立体阴影 - 悬浮态，强调深度
  shadowLg: '0 4px 16px rgba(0, 0, 0, 0.10), 0 2px 4px rgba(0, 0, 0, 0.06)',
  // 强调阴影 - 模态框、弹窗
  shadowXl: '0 8px 32px rgba(0, 0, 0, 0.14), 0 4px 8px rgba(0, 0, 0, 0.08)',
  // 夸张阴影 - 浮出感极强
  shadow2xl: '0 16px 48px rgba(0, 0, 0, 0.20), 0 8px 16px rgba(0, 0, 0, 0.12)',
  // 底部加厚阴影 - 模拟光源在上方
  shadowBottom: '0 4px 12px rgba(0, 0, 0, 0.10), 0 8px 24px rgba(0, 0, 0, 0.06)',
  // 顶部加厚阴影 - 模拟光源在下方
  shadowTop: '0 -4px 12px rgba(0, 0, 0, 0.08), 0 -8px 24px rgba(0, 0, 0, 0.04)',
  // 侧向阴影 - 左侧光源
  shadowLeft: '4px 0 12px rgba(0, 0, 0, 0.08)',
  // 侧向阴影 - 右侧光源
  shadowRight: '-4px 0 12px rgba(0, 0, 0, 0.08)',

  // 亮色主题阴影
  cardShadowLight: '0 2px 8px rgba(0, 0, 0, 0.06), 0 0 1px rgba(0, 0, 0, 0.04)',
  headerShadowLight: '0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
  // 暗色主题阴影 - 更深更弥散
  cardShadowDark:
    '0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
  headerShadowDark:
    '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -1px 0 rgba(255, 255, 255, 0.02)',
  // 浮窗阴影 - 强对比浮出
  floatingShadow: '0 12px 40px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.12)',
  // 内凹阴影
  insetShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.04)',
  // 主题色光晕
  glowPrimary: '0 0 20px rgba(99, 102, 241, 0.2)',
  glowSuccess: '0 0 20px rgba(16, 185, 129, 0.2)',
  glowError: '0 0 20px rgba(239, 68, 68, 0.2)',
  // 高级感光晕 - 更柔和更弥散
  glowPrimarySoft: '0 0 30px rgba(99, 102, 241, 0.15), 0 0 60px rgba(99, 102, 241, 0.08)',
  glowPrimaryStrong: '0 0 40px rgba(99, 102, 241, 0.3), 0 0 80px rgba(99, 102, 241, 0.15)',
};

// ==================== 阴影层级系统 ====================

export const SHADOW_LEVELS = {
  // 微交互 - hover 状态变化
  level0: '0 1px 2px rgba(0, 0, 0, 0.04)',
  // 基础卡片
  level1: '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  // 悬浮卡片
  level2: '0 4px 16px rgba(0, 0, 0, 0.10), 0 2px 4px rgba(0, 0, 0, 0.06)',
  // 下拉菜单
  level3: '0 8px 24px rgba(0, 0, 0, 0.14), 0 4px 8px rgba(0, 0, 0, 0.08)',
  // 弹窗
  level4: '0 16px 48px rgba(0, 0, 0, 0.20), 0 8px 16px rgba(0, 0, 0, 0.12)',
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

// ==================== 增强动效规范 - 细腻层次过渡 ====================

export const ANIMATION_ENHANCED = {
  // 快速交互 - 按钮点击、hover 即时反馈
  micro: {
    duration: '0.1s',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  // 标准过渡 - 颜色、透明度变化
  standard: {
    duration: '0.2s',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  // 流畅过渡 - 位移、缩放
  smooth: {
    duration: '0.3s',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  // 慢速过渡 - 大面积元素、页面切换
  deliberate: {
    duration: '0.4s',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  // 弹性动画 - 弹跳、强调效果
  emphasis: {
    duration: '0.5s',
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  // 渐入效果 - 新元素出现
  fadeIn: {
    duration: '0.3s',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    mode: 'ease-out' as const,
  },
  // 渐出效果 - 元素消失
  fadeOut: {
    duration: '0.2s',
    easing: 'cubic-bezier(0.4, 0, 1, 1)',
    mode: 'ease-in' as const,
  },
  // 滑入效果 - 侧边栏、抽屉
  slideIn: {
    duration: '0.35s',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  // 缩放效果 - 弹窗、下拉
  scale: {
    duration: '0.25s',
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
};

// ==================== 层级光照效果 ====================

export interface LightingEffect {
  highlightTop: string; // 顶部高光
  highlightBottom: string; // 底部渐隐
  innerShadow: string; // 内阴影
  outerGlow: string; // 外发光
}

export const LIGHTING_EFFECTS = {
  light: {
    // 顶部光源 - 模拟上方光照
    topHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 30%)',
    // 底部渐隐 - 底部柔和过渡
    bottomFade: 'linear-gradient(0deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0) 50%)',
    // 内凹效果 - 模拟凹陷
    insetLight: 'inset 0 1px 2px rgba(0,0,0,0.06)',
    // 外放效果 - 模拟凸起
    raisedGlow: '0 2px 8px rgba(0,0,0,0.08)',
    // 悬浮效果 - 卡片悬浮态
    hoverLift: '0 8px 24px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.06)',
    // 按下效果 - 按钮按下态
    pressedInset: 'inset 0 2px 4px rgba(0,0,0,0.1)',
    // 高光边缘 - 顶部亮边
    topEdge: 'inset 0 1px 0 rgba(255,255,255,0.9)',
    // 暗边 - 底部暗边
    bottomEdge: 'inset 0 -1px 0 rgba(0,0,0,0.05)',
  },
  dark: {
    topHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 30%)',
    bottomFade: 'linear-gradient(0deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 50%)',
    insetLight: 'inset 0 1px 2px rgba(0,0,0,0.3)',
    raisedGlow: '0 2px 8px rgba(0,0,0,0.4)',
    hoverLift: '0 8px 24px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)',
    pressedInset: 'inset 0 2px 4px rgba(0,0,0,0.4)',
    topEdge: 'inset 0 1px 0 rgba(255,255,255,0.07)',
    bottomEdge: 'inset 0 -1px 0 rgba(0,0,0,0.2)',
  },
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
  kingbase: '#eb2f96',
  highgo: '#13c2c2',
  vastbase: '#52c41a',
  default: '#1890ff',
};

// ==================== 玻璃拟态效果（Glassmorphism）====================

export const GLASS_EFFECTS = {
  light: {
    glassBackground: 'rgba(255, 255, 255, 0.80)',
    glassBorder: 'rgba(255, 255, 255, 0.40)',
    glassBlur: 'blur(16px)',
    glassShadow: '0 8px 32px rgba(31, 38, 135, 0.12)',
    glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
    glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 30%)',
  },
  dark: {
    glassBackground: 'rgba(22, 28, 45, 0.88)',
    glassBorder: 'rgba(255, 255, 255, 0.08)',
    glassBlur: 'blur(20px)',
    glassShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
    glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 30%)',
  },
};

// ==================== 玻璃拟态效果增强版 ====================
export interface GlassEffectEnhanced {
  glassBackground: string;
  glassBorder: string;
  glassBlur: string;
  glassShadow: string;
  glassInnerGlow: string;
  glassHighlight: string;
  glassOverlay: string;
}

// 多层玻璃效果 - 用于卡片层级
export const GLASS_LAYERS = {
  light: {
    // 底层卡片 - 最不透明
    glassBase: {
      glassBackground: 'rgba(255, 255, 255, 0.85)',
      glassBorder: 'rgba(0, 0, 0, 0.06)',
      glassBlur: 'blur(8px)',
      glassShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
      glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)',
      glassOverlay: 'transparent',
    },
    // 中层卡片
    glassMid: {
      glassBackground: 'rgba(255, 255, 255, 0.90)',
      glassBorder: 'rgba(255, 255, 255, 0.5)',
      glassBlur: 'blur(16px)',
      glassShadow: '0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
      glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
      glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 50%)',
      glassOverlay: 'transparent',
    },
    // 顶层卡片/模态框
    glassTop: {
      glassBackground: 'rgba(255, 255, 255, 0.95)',
      glassBorder: 'rgba(255, 255, 255, 0.6)',
      glassBlur: 'blur(24px)',
      glassShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
      glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 1)',
      glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 30%)',
      glassOverlay: 'transparent',
    },
  },
  dark: {
    glassBase: {
      glassBackground: 'rgba(30, 35, 55, 0.85)',
      glassBorder: 'rgba(255, 255, 255, 0.05)',
      glassBlur: 'blur(8px)',
      glassShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
      glassHighlight:
        'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
      glassOverlay: 'transparent',
    },
    glassMid: {
      glassBackground: 'rgba(35, 40, 65, 0.90)',
      glassBorder: 'rgba(255, 255, 255, 0.07)',
      glassBlur: 'blur(16px)',
      glassShadow: '0 4px 16px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2)',
      glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 50%)',
      glassOverlay: 'transparent',
    },
    glassTop: {
      glassBackground: 'rgba(40, 45, 75, 0.95)',
      glassBorder: 'rgba(255, 255, 255, 0.09)',
      glassBlur: 'blur(24px)',
      glassShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
      glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07)',
      glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 30%)',
      glassOverlay: 'transparent',
    },
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
  neutralColors: NeutralColors
): ThemeConfig {
  return {
    name,
    description,
    mode,
    colors,
    neutralColors,
    glassEffect: GLASS_EFFECTS[mode],
    glassLayers: GLASS_LAYERS,
    focusStyle: FOCUS_STYLES[mode],
    lighting: LIGHTING_EFFECTS,
    dbTypeColors: DB_TYPE_COLORS,
    typography: TYPOGRAPHY,
    spacing: SPACING,
    sizes: SIZES,
    borderRadius: BORDER_RADIUS,
    shadows: SHADOWS,
    shadowLevels: SHADOW_LEVELS,
    animation: ANIMATION,
    animationEnhanced: ANIMATION_ENHANCED,
    breakpoints: BREAKPOINTS,
    zIndex: Z_INDEX,
  };
}

// 1. NeonCyber - 赛博朋克霓虹风格（深色主题为主）
const NEON_CYBER_LIGHT = createColorScheme({
  primary: '#00e5ff',
  primaryHover: '#33ebff',
  primaryActive: '#00b8cc',
  success: '#00ff55',
  successHover: '#33ff77',
  successActive: '#00cc44',
  warning: '#d946ff',
  warningHover: '#e879f9',
  warningActive: '#c026d3',
  error: '#f43f5e',
  errorHover: '#fb7185',
  errorActive: '#e11d48',
  info: '#00e5ff',
  infoHover: '#33ebff',
  infoActive: '#00b8cc',
});

const NEON_CYBER_DARK = createColorScheme({
  primary: '#00f5ff',
  primaryHover: '#33f7ff',
  primaryActive: '#00c4cc',
  success: '#39ff14',
  successHover: '#5fff3d',
  successActive: '#2ecc0f',
  warning: '#e879f9',
  warningHover: '#f0abfc',
  warningActive: '#d946ff',
  error: '#fb7185',
  errorHover: '#fda4af',
  errorActive: '#f43f5e',
  info: '#00f5ff',
  infoHover: '#33f7ff',
  infoActive: '#00c4cc',
});

const NEON_CYBER_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#1a1a2e',
  textSecondary: '#5a5a6e',
  textTertiary: '#8a8a9a',
  textDisabled: '#b0b0be',
  border: '#d8d8e4',
  borderLight: '#eaeaf0',
  borderDark: '#a0a0b0',
  background: '#ffffff',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#f5f5f8',
  backgroundHover: '#f0f0f4',
  backgroundActive: '#00e5ff15',
  mask: 'rgba(0, 0, 0, 0.45)',
  windowBackground: '#ffffff',
  rowHoverBg: 'rgba(0, 0, 0, 0.02)',
  rowSelectedBg: 'rgba(0, 229, 255, 0.06)',
  rowStripeBg: '#fafafa',
  headerBg: '#f5f5f8',
  surfaceElevated: '#ffffff',
  scrollbarThumb: 'rgba(0, 0, 0, 0.15)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.03)',
  level1: '#f8f8fc',
  level2: '#ffffff',
  level3: '#ffffff',
  level4: '#ffffff',
  borderSubtle: '#eaeaef',
  borderEmphasis: '#d0d0dc',
  borderActive: '#00e5ff',
};

const NEON_CYBER_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#e4e4ed',
  textSecondary: '#a0a0b8',
  textTertiary: '#686888',
  textDisabled: '#484860',
  border: '#2a2a40',
  borderLight: '#1a1a2e',
  borderDark: '#3a3a55',
  background: '#0d0d18',
  backgroundCard: '#13132a',
  backgroundToolbar: '#0f0f22',
  backgroundHover: '#1c1c38',
  backgroundActive: '#00f5ff15',
  mask: 'rgba(0, 0, 0, 0.75)',
  windowBackground: '#0d0d18',
  rowHoverBg: 'rgba(0, 245, 255, 0.08)',
  rowSelectedBg: 'rgba(0, 245, 255, 0.14)',
  rowStripeBg: '#10102a',
  headerBg: '#16163a',
  surfaceElevated: '#1c1c40',
  scrollbarThumb: 'rgba(255, 255, 255, 0.18)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.03)',
  level1: '#0d0d18',
  level2: '#13132a',
  level3: '#1c1c38',
  level4: '#252548',
  borderSubtle: '#222240',
  borderEmphasis: '#3a3a55',
  borderActive: '#00f5ff',
};

// 2. MidnightDeep - 深夜深蓝风格
const MIDNIGHT_DEEP_LIGHT = createColorScheme({
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
});

const MIDNIGHT_DEEP_DARK = createColorScheme({
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
});

const MIDNIGHT_DEEP_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#1e293b',
  textSecondary: '#475569',
  textTertiary: '#64748b',
  textDisabled: '#94a3b8',
  border: '#cbd5e1',
  borderLight: '#e2e8f0',
  borderDark: '#94a3b8',
  background: '#ffffff',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#f1f5f9',
  backgroundHover: '#e8eef3',
  backgroundActive: '#6366f115',
  mask: 'rgba(0, 0, 0, 0.5)',
  windowBackground: '#ffffff',
  rowHoverBg: 'rgba(0, 0, 0, 0.02)',
  rowSelectedBg: 'rgba(99, 102, 241, 0.06)',
  rowStripeBg: '#fafbfd',
  headerBg: '#f1f5f9',
  surfaceElevated: '#ffffff',
  scrollbarThumb: 'rgba(0, 0, 0, 0.15)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.03)',
  level1: '#f8fafc',
  level2: '#ffffff',
  level3: '#ffffff',
  level4: '#ffffff',
  borderSubtle: '#e2e8f0',
  borderEmphasis: '#cbd5e1',
  borderActive: '#6366f1',
};

const MIDNIGHT_DEEP_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#e2e5f0',
  textSecondary: '#8b95b0',
  textTertiary: '#5a6480',
  textDisabled: '#404560',
  border: '#252d45',
  borderLight: '#181f35',
  borderDark: '#323f5a',
  background: '#0a0f1f',
  backgroundCard: '#111827',
  backgroundToolbar: '#0d1020',
  backgroundHover: '#1a2235',
  backgroundActive: '#6366f115',
  mask: 'rgba(0, 0, 0, 0.7)',
  windowBackground: '#0a0f1f',
  rowHoverBg: 'rgba(99, 102, 241, 0.06)',
  rowSelectedBg: 'rgba(99, 102, 241, 0.12)',
  rowStripeBg: '#0f1525',
  headerBg: '#141d30',
  surfaceElevated: '#1a2438',
  scrollbarThumb: 'rgba(255, 255, 255, 0.15)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.03)',
  level1: '#0a0f1f',
  level2: '#111827',
  level3: '#1a2235',
  level4: '#252d45',
  borderSubtle: '#1a2030',
  borderEmphasis: '#323f5a',
  borderActive: '#818cf8',
};

// 3. OceanBlue - 海洋蓝色风格
const OCEAN_BLUE_LIGHT = createColorScheme({
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
});

const OCEAN_BLUE_DARK = createColorScheme({
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
});

const OCEAN_BLUE_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#0c4a6e',
  textSecondary: '#0369a1',
  textTertiary: '#0284c7',
  textDisabled: '#7dd3fc',
  border: '#bae6fd',
  borderLight: '#e0f2fe',
  borderDark: '#38bdf8',
  background: '#ffffff',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#f0f9ff',
  backgroundHover: '#ddf1fe',
  backgroundActive: '#0ea5e915',
  mask: 'rgba(0, 0, 0, 0.5)',
  windowBackground: '#ffffff',
  rowHoverBg: 'rgba(0, 0, 0, 0.02)',
  rowSelectedBg: 'rgba(14, 165, 233, 0.06)',
  rowStripeBg: '#f5fbff',
  headerBg: '#f0f9ff',
  surfaceElevated: '#ffffff',
  scrollbarThumb: 'rgba(0, 0, 0, 0.15)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.03)',
  level1: '#f0f9ff',
  level2: '#ffffff',
  level3: '#ffffff',
  level4: '#ffffff',
  borderSubtle: '#e0f2fe',
  borderEmphasis: '#bae6fd',
  borderActive: '#0ea5e9',
};

const OCEAN_BLUE_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#ddf2fc',
  textSecondary: '#94c8e8',
  textTertiary: '#5a9dc8',
  textDisabled: '#2a6a98',
  border: '#1a5080',
  borderLight: '#103050',
  borderDark: '#0a3a60',
  background: '#071520',
  backgroundCard: '#0d1e30',
  backgroundToolbar: '#091525',
  backgroundHover: '#122535',
  backgroundActive: '#0ea5e915',
  mask: 'rgba(0, 0, 0, 0.65)',
  windowBackground: '#071520',
  rowHoverBg: 'rgba(56, 189, 248, 0.08)',
  rowSelectedBg: 'rgba(56, 189, 248, 0.14)',
  rowStripeBg: '#091a2a',
  headerBg: '#0f1f35',
  surfaceElevated: '#162840',
  scrollbarThumb: 'rgba(255, 255, 255, 0.15)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.03)',
  level1: '#071520',
  level2: '#0d1e30',
  level3: '#122535',
  level4: '#1a3550',
  borderSubtle: '#0a3050',
  borderEmphasis: '#0a3a60',
  borderActive: '#38bdf8',
};

// 4. NordicFrost - 北欧冷淡风格
const NORDIC_FROST_LIGHT = createColorScheme({
  primary: '#64748b',
  primaryHover: '#94a3b8',
  primaryActive: '#475569',
  success: '#22c55e',
  successHover: '#4ade80',
  successActive: '#16a34a',
  warning: '#f59e0b',
  warningHover: '#fbbf24',
  warningActive: '#d97706',
  error: '#ef4444',
  errorHover: '#f87171',
  errorActive: '#dc2626',
  info: '#64748b',
  infoHover: '#94a3b8',
  infoActive: '#475569',
});

const NORDIC_FROST_DARK = createColorScheme({
  primary: '#94a3b8',
  primaryHover: '#cbd5e1',
  primaryActive: '#64748b',
  success: '#4ade80',
  successHover: '#86efac',
  successActive: '#22c55e',
  warning: '#fbbf24',
  warningHover: '#fcd34d',
  warningActive: '#f59e0b',
  error: '#f87171',
  errorHover: '#fca5a5',
  errorActive: '#ef4444',
  info: '#94a3b8',
  infoHover: '#cbd5e1',
  infoActive: '#64748b',
});

const NORDIC_FROST_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#334155',
  textSecondary: '#64748b',
  textTertiary: '#94a3b8',
  textDisabled: '#cbd5e1',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  borderDark: '#cbd5e1',
  background: '#ffffff',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#f8fafc',
  backgroundHover: '#eef1f4',
  backgroundActive: '#64748b15',
  mask: 'rgba(0, 0, 0, 0.5)',
  windowBackground: '#ffffff',
  rowHoverBg: 'rgba(0, 0, 0, 0.02)',
  rowSelectedBg: 'rgba(100, 116, 139, 0.06)',
  rowStripeBg: '#fafbfc',
  headerBg: '#f8fafc',
  surfaceElevated: '#ffffff',
  scrollbarThumb: 'rgba(0, 0, 0, 0.15)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.03)',
  level1: '#f8fafc',
  level2: '#ffffff',
  level3: '#ffffff',
  level4: '#ffffff',
  borderSubtle: '#f1f5f9',
  borderEmphasis: '#e2e8f0',
  borderActive: '#64748b',
};

const NORDIC_FROST_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#e2e5f0',
  textSecondary: '#a5b0c5',
  textTertiary: '#6b7590',
  textDisabled: '#4a5068',
  border: '#2a3245',
  borderLight: '#1a2030',
  borderDark: '#3a4455',
  background: '#0c1018',
  backgroundCard: '#111520',
  backgroundToolbar: '#0e1020',
  backgroundHover: '#1a2030',
  backgroundActive: '#94a3b815',
  mask: 'rgba(0, 0, 0, 0.65)',
  windowBackground: '#0c1018',
  rowHoverBg: 'rgba(148, 163, 184, 0.06)',
  rowSelectedBg: 'rgba(148, 163, 184, 0.12)',
  rowStripeBg: '#0f1520',
  headerBg: '#131825',
  surfaceElevated: '#1a2230',
  scrollbarThumb: 'rgba(255, 255, 255, 0.12)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.03)',
  level1: '#0c1018',
  level2: '#111520',
  level3: '#1a2030',
  level4: '#252d40',
  borderSubtle: '#1a2030',
  borderEmphasis: '#3a4455',
  borderActive: '#94a3b8',
};

// ==================== 导出所有主题配置 ====================

export const THEMES: Record<ThemePreset, { light: ThemeConfig; dark: ThemeConfig }> = {
  neonCyber: {
    light: createThemeConfig(
      'NeonCyber',
      '赛博朋克霓虹风格',
      'light',
      NEON_CYBER_LIGHT,
      NEON_CYBER_LIGHT_NEUTRAL
    ),
    dark: createThemeConfig(
      'NeonCyber',
      '赛博朋克霓虹风格',
      'dark',
      NEON_CYBER_DARK,
      NEON_CYBER_DARK_NEUTRAL
    ),
  },
  midnightDeep: {
    light: createThemeConfig(
      'MidnightDeep',
      '深夜深蓝风格',
      'light',
      MIDNIGHT_DEEP_LIGHT,
      MIDNIGHT_DEEP_LIGHT_NEUTRAL
    ),
    dark: createThemeConfig(
      'MidnightDeep',
      '深夜深蓝风格',
      'dark',
      MIDNIGHT_DEEP_DARK,
      MIDNIGHT_DEEP_DARK_NEUTRAL
    ),
  },
  oceanBlue: {
    light: createThemeConfig(
      'OceanBlue',
      '海洋蓝色风格',
      'light',
      OCEAN_BLUE_LIGHT,
      OCEAN_BLUE_LIGHT_NEUTRAL
    ),
    dark: createThemeConfig(
      'OceanBlue',
      '海洋蓝色风格',
      'dark',
      OCEAN_BLUE_DARK,
      OCEAN_BLUE_DARK_NEUTRAL
    ),
  },
  nordicFrost: {
    light: createThemeConfig(
      'NordicFrost',
      '北欧冷淡风格',
      'light',
      NORDIC_FROST_LIGHT,
      NORDIC_FROST_LIGHT_NEUTRAL
    ),
    dark: createThemeConfig(
      'NordicFrost',
      '北欧冷淡风格',
      'dark',
      NORDIC_FROST_DARK,
      NORDIC_FROST_DARK_NEUTRAL
    ),
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
