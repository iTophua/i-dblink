/**
 * i-dblink 主题配置文件
 *
 * 定义多款科技酷炫主题，每款支持亮暗模式
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePreset = 'default';

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
  postgresql: '#336791',
  sqlite: '#003b57',
  sqlserver: '#cc2927',
  oracle: '#f80000',
  mariadb: '#c0765a',
  dameng: '#b30000',
  kingbase: '#0066cc',
  highgo: '#1e90ff',
  vastbase: '#008000',
  default: '#1890ff',
};

// ==================== 玻璃拟态效果（Glassmorphism）====================

export const GLASS_EFFECTS = {
  light: {
    glassBackground: 'rgba(255, 255, 255, 0.6)',
    glassBorder: 'rgba(226, 232, 240, 0.5)',
    glassBlur: 'blur(12px)',
    glassShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
    glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
    glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 30%)',
  },
  dark: {
    glassBackground: 'rgba(15, 31, 51, 0.5)',
    glassBorder: 'rgba(30, 58, 95, 0.3)',
    glassBlur: 'blur(16px)',
    glassShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
    glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 30%)',
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
      glassBackground: 'rgba(15, 31, 51, 0.85)',
      glassBorder: 'rgba(30, 58, 95, 0.2)',
      glassBlur: 'blur(8px)',
      glassShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
      glassHighlight:
        'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
      glassOverlay: 'transparent',
    },
    glassMid: {
      glassBackground: 'rgba(18, 40, 64, 0.90)',
      glassBorder: 'rgba(30, 58, 95, 0.3)',
      glassBlur: 'blur(16px)',
      glassShadow: '0 4px 16px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2)',
      glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
      glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 50%)',
      glassOverlay: 'transparent',
    },
    glassTop: {
      glassBackground: 'rgba(26, 48, 80, 0.95)',
      glassBorder: 'rgba(30, 58, 95, 0.4)',
      glassBlur: 'blur(24px)',
      glassShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
      glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 30%)',
      glassOverlay: 'transparent',
    },
  },
};

// ==================== Focus 焦点样式 ====================

export const FOCUS_STYLES = {
  light: {
    focusRingColor: 'rgba(59, 130, 246, 0.5)',
    focusRingWidth: 2,
    focusRingOffset: 2,
    focusRingShadow: '0 0 0 2px rgba(59, 130, 246, 0.15)',
  },
  dark: {
    focusRingColor: 'rgba(96, 165, 250, 0.6)',
    focusRingWidth: 2,
    focusRingOffset: 2,
    focusRingShadow: '0 0 0 2px rgba(96, 165, 250, 0.2)',
  },
};

// ==================== 主题配色方案 ====================

// 工厂函数：根据主题名和色值构建完整主题配置（自动填充不变的共享配置）
function getSystemMode(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function createThemeConfig(
  name: string,
  description: string,
  mode: ThemeMode,
  colors: ThemeColorScheme,
  neutralColors: NeutralColors
): ThemeConfig {
  const effectiveMode = mode === 'system' ? getSystemMode() : mode;
  return {
    name,
    description,
    mode: effectiveMode,
    colors,
    neutralColors,
    glassEffect: GLASS_EFFECTS[effectiveMode],
    glassLayers: GLASS_LAYERS,
    focusStyle: FOCUS_STYLES[effectiveMode],
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

const DEFAULT_LIGHT: ThemeColorScheme = {
  primary: '#3b82f6',
  primaryHover: '#60a5fa',
  primaryActive: '#2563eb',
  primaryGradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
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
  info: '#3b82f6',
  infoHover: '#60a5fa',
  infoActive: '#2563eb',
  infoGradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
};

const DEFAULT_DARK: ThemeColorScheme = {
  primary: '#60a5fa',
  primaryHover: '#93c5fd',
  primaryActive: '#3b82f6',
  primaryGradient: 'linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%)',
  success: '#34d399',
  successHover: '#6ee7b7',
  successActive: '#10b981',
  successGradient: 'linear-gradient(135deg, #34d399 0%, #6ee7b7 100%)',
  warning: '#fbbf24',
  warningHover: '#fde68a',
  warningActive: '#f59e0b',
  warningGradient: 'linear-gradient(135deg, #fbbf24 0%, #fde68a 100%)',
  error: '#f87171',
  errorHover: '#fca5a5',
  errorActive: '#ef4444',
  errorGradient: 'linear-gradient(135deg, #f87171 0%, #fca5a5 100%)',
  info: '#60a5fa',
  infoHover: '#93c5fd',
  infoActive: '#3b82f6',
  infoGradient: 'linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%)',
};

const DEFAULT_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textTertiary: '#94a3b8',
  textDisabled: '#cbd5e1',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  borderDark: '#cbd5e1',
  background: '#ffffff',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#ffffff',
  backgroundHover: '#f8fafc',
  backgroundActive: '#eff6ff',
  mask: 'rgba(15,23,42,0.4)',
  windowBackground: '#ffffff',
  rowHoverBg: '#f8fafc',
  rowSelectedBg: '#eff6ff',
  rowStripeBg: 'transparent',
  headerBg: '#f8fafc',
  surfaceElevated: '#ffffff',
  scrollbarThumb: 'rgba(0,0,0,0.15)',
  scrollbarTrack: 'transparent',
  level1: '#f8fafc',
  level2: '#ffffff',
  level3: '#ffffff',
  level4: '#ffffff',
  borderSubtle: '#f1f5f9',
  borderEmphasis: '#cbd5e1',
  borderActive: '#3b82f6',
};

const DEFAULT_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textTertiary: 'rgba(148,163,184,0.5)',
  textDisabled: 'rgba(148,163,184,0.25)',
  border: '#1e3a5f',
  borderLight: 'rgba(30,58,95,0.3)',
  borderDark: '#2a4a75',
  background: '#0c1929',
  backgroundCard: '#0f1f33',
  backgroundToolbar: '#0d1e30',
  backgroundHover: 'rgba(96,165,250,0.06)',
  backgroundActive: 'rgba(96,165,250,0.10)',
  mask: 'rgba(0,0,0,0.6)',
  windowBackground: '#0c1929',
  rowHoverBg: '#112840',
  rowSelectedBg: '#1a3a5c',
  rowStripeBg: 'transparent',
  headerBg: '#0d1e30',
  surfaceElevated: '#0f1f33',
  scrollbarThumb: 'rgba(148,163,184,0.2)',
  scrollbarTrack: 'transparent',
  level1: '#0a1628',
  level2: '#0f1f33',
  level3: '#122840',
  level4: '#1a3050',
  borderSubtle: 'rgba(30,58,95,0.2)',
  borderEmphasis: '#2a4a75',
  borderActive: '#60a5fa',
};

// ==================== 导出所有主题配置 ====================

export const THEMES = {
  default: {
    light: createThemeConfig('Default', '默认主题', 'light', DEFAULT_LIGHT, DEFAULT_LIGHT_NEUTRAL),
    dark: createThemeConfig('Default', '默认主题', 'dark', DEFAULT_DARK, DEFAULT_DARK_NEUTRAL),
  },
} as const;

export function getThemeConfig(mode: ThemeMode): ThemeConfig {
  const effectiveMode = mode === 'system' ? getSystemMode() : mode;
  return THEMES.default[effectiveMode];
}

export const THEME_PRESETS_LIST = [
  { value: 'default' as ThemePreset, label: '默认主题', description: '天蓝清新风格' },
];
