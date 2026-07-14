/**
 * i-dblink 主题配置文件
 *
 * 定义多款科技酷炫主题，每款支持亮暗模式
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePreset = 'default' | 'modern' | 'ink';

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
  // 主字体 — 优先载入 Inter，并补充 macOS / Windows 中文回退
  fontFamily:
    "'Inter', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  // 等宽字体
  fontFamilyCode: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace",
  // 数字字体 — 用于表格、统计等数字密集型场景，搭配比例数字和表格数字特性
  fontFamilyNumeric:
    "'Inter', 'JetBrains Mono', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace",
  // OpenType 特性 — 开启比例数字、表格数字、替代样式、连字等
  fontFeatureSettings: {
    default: "'cv01', 'cv05', 'ss01', 'ss03', 'kern'",
    numeric: "'tnum', 'cv01', 'cv05', 'ss01'",
    code: "'calt', 'liga', 'cv01', 'cv05', 'ss01', 'ss03', 'zero'",
  },
  // 字体渲染
  fontDisplay: 'swap',
  fontSmoothing:
    "antialiased" as const,
  textRendering: 'optimizeLegibility' as const,
  // 字号
  fontSizeMini: 11,
  fontSizeSecondary: 12,
  fontSizeCode: 13,
  fontSizeBody: 14,
  fontSizeHeading3: 14,
  fontSizeHeading2: 16,
  fontSizeHeading1: 20,
  fontSizeDisplay: 24,
  // 行高
  lineHeightBody: 1.57,
  lineHeightHeading: 1.4,
  lineHeightCode: 1.5,
  lineHeightCompact: 1.3,
  // 字距 — 大标题适当收紧，小字号适当放开增强可读性
  letterSpacingHeading: '-0.02em',
  letterSpacingBody: 'normal',
  letterSpacingSecondary: '0.01em',
  letterSpacingCode: 'normal',
  letterSpacingDisplay: '-0.03em',
  // 字重
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
  buttonRadius: 8,
  inputRadius: 8,
  cardRadius: 10,
  modalRadius: 12,
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
    focusRingColor: 'rgba(30, 58, 138, 0.5)',
    focusRingWidth: 2,
    focusRingOffset: 2,
    focusRingShadow: '0 0 0 2px rgba(30, 58, 138, 0.15)',
  },
  dark: {
    focusRingColor: 'rgba(37, 99, 235, 0.6)',
    focusRingWidth: 2,
    focusRingOffset: 2,
    focusRingShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)',
  },
};

// ==================== 主题配色方案 ====================

// 工厂函数：根据主题名和色值构建完整主题配置（自动填充不变的共享配置）
function getSystemMode(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeOverrides {
  glassEffect?: GlassEffect;
  focusStyle?: FocusStyle;
  lighting?: typeof LIGHTING_EFFECTS;
  shadows?: typeof SHADOWS;
  shadowLevels?: typeof SHADOW_LEVELS;
  glassLayers?: typeof GLASS_LAYERS;
  animation?: typeof ANIMATION;
  animationEnhanced?: typeof ANIMATION_ENHANCED;
}

function createThemeConfig(
  name: string,
  description: string,
  mode: ThemeMode,
  colors: ThemeColorScheme,
  neutralColors: NeutralColors,
  overrides?: ThemeOverrides
): ThemeConfig {
  const effectiveMode = mode === 'system' ? getSystemMode() : mode;
  return {
    name,
    description,
    mode: effectiveMode,
    colors,
    neutralColors,
    glassEffect: overrides?.glassEffect ?? GLASS_EFFECTS[effectiveMode],
    glassLayers: overrides?.glassLayers ?? GLASS_LAYERS,
    focusStyle: overrides?.focusStyle ?? FOCUS_STYLES[effectiveMode],
    lighting: overrides?.lighting ?? LIGHTING_EFFECTS,
    dbTypeColors: DB_TYPE_COLORS,
    typography: TYPOGRAPHY,
    spacing: SPACING,
    sizes: SIZES,
    borderRadius: BORDER_RADIUS,
    shadows: overrides?.shadows ?? SHADOWS,
    shadowLevels: overrides?.shadowLevels ?? SHADOW_LEVELS,
    animation: overrides?.animation ?? ANIMATION,
    animationEnhanced: overrides?.animationEnhanced ?? ANIMATION_ENHANCED,
    breakpoints: BREAKPOINTS,
    zIndex: Z_INDEX,
  };
}

const DEFAULT_LIGHT: ThemeColorScheme = {
  primary: '#1D4ED8',
  primaryHover: '#4F6EF7',
  primaryActive: '#1E40AF',
  primaryGradient: 'linear-gradient(135deg, #1E3A8A 0%, #4F6EF7 100%)',
  success: '#10B981',
  successHover: '#34D399',
  successActive: '#059669',
  successGradient: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
  warning: '#F97316',
  warningHover: '#FB923C',
  warningActive: '#EA580C',
  warningGradient: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)',
  error: '#EF4444',
  errorHover: '#F87171',
  errorActive: '#DC2626',
  errorGradient: 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)',
  info: '#6366F1',
  infoHover: '#818CF8',
  infoActive: '#4F46E5',
  infoGradient: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
};

const DEFAULT_DARK: ThemeColorScheme = {
  primary: '#3B82F6',
  primaryHover: '#60A5FA',
  primaryActive: '#2563EB',
  primaryGradient: 'linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)',
  success: '#10B981',
  successHover: '#34D399',
  successActive: '#059669',
  successGradient: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
  warning: '#F97316',
  warningHover: '#FB923C',
  warningActive: '#EA580C',
  warningGradient: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)',
  error: '#EF4444',
  errorHover: '#F87171',
  errorActive: '#DC2626',
  errorGradient: 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)',
  info: '#818CF8',
  infoHover: '#A5B4FC',
  infoActive: '#6366F1',
  infoGradient: 'linear-gradient(135deg, #818CF8 0%, #A5B4FC 100%)',
};

const DEFAULT_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#111111',
  textSecondary: '#3F3F46',
  textTertiary: '#6B7280',
  textDisabled: '#C7C7CC',
  border: '#E5E5EA',
  borderLight: '#F0F0F3',
  borderDark: '#D1D1D6',
  background: '#F5F6F8',
  backgroundCard: '#FFFFFF',
  backgroundToolbar: '#F0F1F4',
  backgroundHover: '#EDEDF0',
  backgroundActive: '#E8F0FE',
  mask: 'rgba(0, 0, 0, 0.3)',
  windowBackground: '#F5F5F7',
  rowHoverBg: '#EDEDF0',
  rowSelectedBg: '#DBEAFE',
  rowStripeBg: 'rgba(0, 0, 0, 0.015)',
  headerBg: '#F6F7F9',
  surfaceElevated: '#FFFFFF',
  scrollbarThumb: 'rgba(0, 0, 0, 0.12)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.02)',
  level1: '#F0F1F4',
  level2: '#FFFFFF',
  level3: '#FFFFFF',
  level4: '#FFFFFF',
  borderSubtle: '#F0F0F3',
  borderEmphasis: '#D1D1D6',
  borderActive: '#1D4ED8',
};

const DEFAULT_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#E4E4E7',
  textSecondary: '#A1A1AA',
  textTertiary: '#6B6B76',
  textDisabled: '#3F3F46',
  border: '#2A2A30',
  borderLight: '#1E1E24',
  borderDark: '#3A3A42',
  background: '#0A0D14',
  backgroundCard: '#12151E',
  backgroundToolbar: '#111420',
  backgroundHover: '#24272F',
  backgroundActive: '#172554',
  mask: 'rgba(0, 0, 0, 0.7)',
  windowBackground: '#0A0D14',
  rowHoverBg: '#1C1F28',
  rowSelectedBg: '#1E3A5F',
  rowStripeBg: 'rgba(255, 255, 255, 0.01)',
  headerBg: '#0E1119',
  surfaceElevated: '#161921',
  scrollbarThumb: 'rgba(255, 255, 255, 0.10)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.02)',
  level1: '#0A0D14',
  level2: '#12151E',
  level3: '#1A1D26',
  level4: '#22252E',
  borderSubtle: '#1F222A',
  borderEmphasis: '#3A3A42',
  borderActive: '#3B82F6',
};

// ---------- Default 专属增强效果 ----------

const DEFAULT_GLASS_LIGHT: GlassEffect = {
  glassBackground: 'rgba(255, 255, 255, 0.78)',
  glassBorder: 'rgba(0, 0, 0, 0.04)',
  glassBlur: 'blur(16px)',
  glassShadow: '0 4px 20px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.03)',
  glassInnerGlow: 'inset 0 1px 0 rgba(255,255,255,0.82)',
  glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 35%)',
};

const DEFAULT_GLASS_DARK: GlassEffect = {
  glassBackground: 'rgba(20, 20, 22, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.05)',
  glassBlur: 'blur(20px)',
  glassShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.03)',
  glassInnerGlow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 35%)',
};

const DEFAULT_FOCUS_LIGHT: FocusStyle = {
  focusRingColor: 'rgba(29, 78, 216, 0.4)',
  focusRingWidth: 2,
  focusRingOffset: 2,
  focusRingShadow: '0 0 0 2px rgba(29,78,216,0.12)',
};

const DEFAULT_FOCUS_DARK: FocusStyle = {
  focusRingColor: 'rgba(59, 130, 246, 0.5)',
  focusRingWidth: 2,
  focusRingOffset: 2,
  focusRingShadow: '0 0 0 2px rgba(59,130,246,0.15), 0 0 12px rgba(59,130,246,0.06)',
};

const DEFAULT_SHADOWS = {
  ...SHADOWS,
  shadowSm: '0 1px 2px rgba(0,0,0,0.03)',
  shadowMd: '0 1px 2px rgba(0,0,0,0.03), 0 3px 10px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
  shadowLg: '0 1px 2px rgba(0,0,0,0.04), 0 5px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
  shadowXl: '0 1px 2px rgba(0,0,0,0.05), 0 10px 36px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
  shadow2xl: '0 2px 4px rgba(0,0,0,0.06), 0 18px 56px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.9)',
  cardShadowLight: '0 1px 2px rgba(0,0,0,0.03), 0 3px 10px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
  headerShadowLight: '0 1px 2px rgba(0,0,0,0.03), 0 2px 6px rgba(0,0,0,0.05)',
  cardShadowDark: '0 1px 2px rgba(0,0,0,0.3), 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
  headerShadowDark: '0 1px 2px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.45), inset 0 -1px 0 rgba(255,255,255,0.02)',
  glowPrimary: '0 0 24px rgba(29,78,216,0.14)',
  glowPrimarySoft: '0 0 36px rgba(29,78,216,0.10), 0 0 72px rgba(29,78,216,0.04)',
  glowPrimaryStrong: '0 0 48px rgba(59,130,246,0.22), 0 0 96px rgba(59,130,246,0.08)',
};

// ==================== Modern 主题配色（Sequel Ace / TablePlus 风格）====================

// ---------- Modern 专属增强效果 ----------

const MODERN_GLASS_LIGHT: GlassEffect = {
  glassBackground: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(0, 0, 0, 0.04)',
  glassBlur: 'blur(20px)',
  glassShadow: '0 4px 24px rgba(0,0,0,0.05), 0 0 0 0.5px rgba(0,0,0,0.03)',
  glassInnerGlow: 'inset 0 1px 0 rgba(255,255,255,0.86)',
  glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 35%)',
};

const MODERN_GLASS_DARK: GlassEffect = {
  glassBackground: 'rgba(28, 30, 32, 0.62)',
  glassBorder: 'rgba(255, 255, 255, 0.06)',
  glassBlur: 'blur(24px)',
  glassShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(255,255,255,0.04)',
  glassInnerGlow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  glassHighlight: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 35%)',
};

const MODERN_FOCUS_LIGHT: FocusStyle = {
  focusRingColor: 'rgba(8, 145, 132, 0.4)',
  focusRingWidth: 2,
  focusRingOffset: 2,
  focusRingShadow: '0 0 0 2px rgba(8,145,132,0.12)',
};

const MODERN_FOCUS_DARK: FocusStyle = {
  focusRingColor: 'rgba(45, 212, 191, 0.5)',
  focusRingWidth: 2,
  focusRingOffset: 2,
  focusRingShadow: '0 0 0 2px rgba(45,212,191,0.15), 0 0 16px rgba(45,212,191,0.06)',
};

const MODERN_SHADOWS = {
  ...SHADOWS,
  // 方向性阴影 — 模拟光源从上方略靠前，上方深贴近、下方弥散远
  shadowSm: '0 1px 2px rgba(0,0,0,0.03)',
  shadowMd: '0 1px 2px rgba(0,0,0,0.03), 0 3px 10px rgba(0,0,0,0.05)',
  shadowLg: '0 1px 2px rgba(0,0,0,0.04), 0 5px 20px rgba(0,0,0,0.08)',
  shadowXl: '0 1px 2px rgba(0,0,0,0.05), 0 10px 36px rgba(0,0,0,0.12)',
  shadow2xl: '0 2px 4px rgba(0,0,0,0.06), 0 18px 56px rgba(0,0,0,0.16)',
  cardShadowLight: '0 1px 2px rgba(0,0,0,0.03), 0 3px 10px rgba(0,0,0,0.05)',
  headerShadowLight: '0 1px 2px rgba(0,0,0,0.03), 0 2px 6px rgba(0,0,0,0.05)',
  cardShadowDark: '0 1px 2px rgba(0,0,0,0.25), 0 6px 16px rgba(0,0,0,0.35)',
  headerShadowDark: '0 1px 2px rgba(0,0,0,0.30), 0 4px 12px rgba(0,0,0,0.40)',
  glowPrimary: '0 0 24px rgba(8,145,132,0.12)',
  glowPrimarySoft: '0 0 36px rgba(8,145,132,0.08), 0 0 72px rgba(8,145,132,0.03)',
  glowPrimaryStrong: '0 0 48px rgba(45,212,191,0.20), 0 0 96px rgba(45,212,191,0.08)',
};

// ---------- Modern 配色常量 ----------

const MODERN_LIGHT: ThemeColorScheme = {
  // 主色：温润青碧 — 加大渐变色差，让按钮和重点元素更有层次
  primary: '#089184',
  primaryHover: '#0CA599',
  primaryActive: '#067A6E',
  primaryGradient: 'linear-gradient(135deg, #078075 0%, #0CA599 100%)',
  success: '#059669',
  successHover: '#10B981',
  successActive: '#047857',
  successGradient: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
  warning: '#D97706',
  warningHover: '#F59E0B',
  warningActive: '#B45309',
  warningGradient: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
  error: '#DC2626',
  errorHover: '#EF4444',
  errorActive: '#B91C1C',
  errorGradient: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
  info: '#2563EB',
  infoHover: '#3B82F6',
  infoActive: '#1D4ED8',
  infoGradient: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
};

const MODERN_DARK: ThemeColorScheme = {
  // 主色：辉光青碧 — 暗色背景上更大色差，按钮悬浮感更强
  primary: '#2DD4BF',
  primaryHover: '#5EEAD4',
  primaryActive: '#14B8A6',
  primaryGradient: 'linear-gradient(135deg, #14B8A6 0%, #3DDBC9 100%)',
  success: '#10B981',
  successHover: '#34D399',
  successActive: '#059669',
  successGradient: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
  warning: '#F59E0B',
  warningHover: '#FBBF24',
  warningActive: '#D97706',
  warningGradient: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
  error: '#F87171',
  errorHover: '#FCA5A5',
  errorActive: '#EF4444',
  errorGradient: 'linear-gradient(135deg, #F87171 0%, #FCA5A5 100%)',
  info: '#38BDF8',
  infoHover: '#7DD3FC',
  infoActive: '#0EA5E9',
  infoGradient: 'linear-gradient(135deg, #38BDF8 0%, #7DD3FC 100%)',
};

const MODERN_LIGHT_NEUTRAL: NeutralColors = {
  // 文本 — Apple-style 层次：近黑 → 中灰 → 浅灰 → 禁用灰
  textPrimary: '#1D1D1F',
  textSecondary: '#6E6E73',
  textTertiary: '#AEAEB2',
  textDisabled: '#D1D1D6',
  // 边框 — 极淡，擦着存在感的边
  border: '#ECECF0',
  borderLight: '#F3F3F6',
  borderDark: '#DEDEE3',
  // 背景层级 — 暖白基调，侧栏深、内容亮，形成清晰的左右分区
  background: '#F6F6F8',
  backgroundCard: '#FFFFFF',
  backgroundToolbar: '#FAFAFC',
  backgroundHover: '#EEEEF3',
  backgroundActive: '#DEF2ED',
  mask: 'rgba(0, 0, 0, 0.25)',
  windowBackground: '#F6F6F8',
  rowHoverBg: '#EEEEF3',
  rowSelectedBg: '#DEF2ED',
  rowStripeBg: 'rgba(0, 0, 0, 0.01)',
  headerBg: '#FAFAFC',
  surfaceElevated: '#FFFFFF',
  scrollbarThumb: 'rgba(0, 0, 0, 0.07)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.012)',
  // 层级过渡 — 侧边栏明显深于内容区，模拟物理阴影落在边缘
  level1: '#E8E8EE',
  level2: '#FFFFFF',
  level3: '#FFFFFF',
  level4: '#FFFFFF',
  borderSubtle: '#F3F3F6',
  borderEmphasis: '#DEDEE3',
  borderActive: '#089184',
};

const MODERN_DARK_NEUTRAL: NeutralColors = {
  // 文本 — 暖白 + 渐进灰，避免刺眼的纯白
  textPrimary: '#F2F2F4',
  textSecondary: '#98989E',
  textTertiary: '#636368',
  textDisabled: '#3E3E42',
  // 边框 — 半透明融入背景，不抢视线
  border: '#303034',
  borderLight: '#26262A',
  borderDark: '#3C3C40',
  // 背景层级 — 底层近纯黑（≈3% 青蓝底调），卡片跃升 6 点，形成「卡片悬浮」纵深
  background: '#0E1013',
  backgroundCard: '#181A1C',
  backgroundToolbar: '#121416',
  backgroundHover: '#26282C',
  backgroundActive: '#0D332E',
  mask: 'rgba(0, 0, 0, 0.75)',
  windowBackground: '#0E1013',
  rowHoverBg: '#26282C',
  rowSelectedBg: '#0D332E',
  rowStripeBg: 'rgba(255, 255, 255, 0.008)',
  headerBg: '#121416',
  surfaceElevated: '#181A1C',
  scrollbarThumb: 'rgba(255, 255, 255, 0.08)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.012)',
  // 层级过渡 — 底层到卡片的跳跃最大（6点），之后逐级收敛
  level1: '#0E1013',
  level2: '#181A1C',
  level3: '#1F2124',
  level4: '#26282C',
  borderSubtle: '#242428',
  borderEmphasis: '#3A3A3E',
  borderActive: '#2DD4BF',
};

// ==================== Ink 墨色主题配色 ====================
// 设计理念：浓墨淡彩，黑白灰基底 + 朱砂红点缀
// 灵感：中国水墨画「焦浓重淡清」五墨色阶

const INK_LIGHT: ThemeColorScheme = {
  primary: '#000000',
  primaryHover: '#333333',
  primaryActive: '#000000',
  primaryGradient: 'linear-gradient(135deg, #000000 0%, #333333 100%)',
  success: '#333333',
  successHover: '#555555',
  successActive: '#000000',
  successGradient: 'linear-gradient(135deg, #333333 0%, #555555 100%)',
  warning: '#666666',
  warningHover: '#888888',
  warningActive: '#555555',
  warningGradient: 'linear-gradient(135deg, #666666 0%, #888888 100%)',
  error: '#333333',
  errorHover: '#555555',
  errorActive: '#000000',
  errorGradient: 'linear-gradient(135deg, #333333 0%, #555555 100%)',
  info: '#666666',
  infoHover: '#888888',
  infoActive: '#555555',
  infoGradient: 'linear-gradient(135deg, #666666 0%, #888888 100%)',
};

const INK_DARK: ThemeColorScheme = {
  primary: '#FFFFFF',
  primaryHover: '#CCCCCC',
  primaryActive: '#FFFFFF',
  primaryGradient: 'linear-gradient(135deg, #FFFFFF 0%, #CCCCCC 100%)',
  success: '#CCCCCC',
  successHover: '#EEEEEE',
  successActive: '#FFFFFF',
  successGradient: 'linear-gradient(135deg, #CCCCCC 0%, #EEEEEE 100%)',
  warning: '#999999',
  warningHover: '#BBBBBB',
  warningActive: '#888888',
  warningGradient: 'linear-gradient(135deg, #999999 0%, #BBBBBB 100%)',
  error: '#CCCCCC',
  errorHover: '#EEEEEE',
  errorActive: '#FFFFFF',
  errorGradient: 'linear-gradient(135deg, #CCCCCC 0%, #EEEEEE 100%)',
  info: '#999999',
  infoHover: '#BBBBBB',
  infoActive: '#888888',
  infoGradient: 'linear-gradient(135deg, #999999 0%, #BBBBBB 100%)',
};

const INK_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#000000',
  textSecondary: '#333333',
  textTertiary: '#666666',
  textDisabled: '#999999',
  border: '#CCCCCC',
  borderLight: '#E0E0E0',
  borderDark: '#999999',
  background: '#FFFFFF',
  backgroundCard: '#FFFFFF',
  backgroundToolbar: '#FFFFFF',
  backgroundHover: '#F0F0F0',
  backgroundActive: '#E5E5E5',
  mask: 'rgba(0, 0, 0, 0.35)',
  windowBackground: '#FFFFFF',
  rowHoverBg: '#F0F0F0',
  rowSelectedBg: '#E5E5E5',
  rowStripeBg: 'rgba(0, 0, 0, 0.015)',
  headerBg: '#F5F5F5',
  surfaceElevated: '#FFFFFF',
  scrollbarThumb: 'rgba(0, 0, 0, 0.12)',
  scrollbarTrack: 'rgba(0, 0, 0, 0.03)',
  level1: '#F5F5F5',
  level2: '#FFFFFF',
  level3: '#FFFFFF',
  level4: '#FFFFFF',
  borderSubtle: '#E0E0E0',
  borderEmphasis: '#999999',
  borderActive: '#000000',
};

const INK_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#FFFFFF',
  textSecondary: '#CCCCCC',
  textTertiary: '#888888',
  textDisabled: '#555555',
  border: '#333333',
  borderLight: '#222222',
  borderDark: '#444444',
  background: '#000000',
  backgroundCard: '#000000',
  backgroundToolbar: '#000000',
  backgroundHover: '#1A1A1A',
  backgroundActive: '#222222',
  mask: 'rgba(0, 0, 0, 0.75)',
  windowBackground: '#000000',
  rowHoverBg: '#1A1A1A',
  rowSelectedBg: '#222222',
  rowStripeBg: 'rgba(255, 255, 255, 0.01)',
  headerBg: '#0A0A0A',
  surfaceElevated: '#111111',
  scrollbarThumb: 'rgba(255, 255, 255, 0.1)',
  scrollbarTrack: 'rgba(255, 255, 255, 0.015)',
  level1: '#000000',
  level2: '#0A0A0A',
  level3: '#111111',
  level4: '#181818',
  borderSubtle: '#1A1A1A',
  borderEmphasis: '#444444',
  borderActive: '#FFFFFF',
};

const INK_GLASS_LIGHT: GlassEffect = {
  glassBackground: 'rgba(255, 255, 255, 0.9)',
  glassBorder: 'rgba(0, 0, 0, 0.08)',
  glassBlur: 'blur(16px)',
  glassShadow: '0 4px 20px rgba(0, 0, 0, 0.06), 0 0 0 0.5px rgba(0, 0, 0, 0.05)',
  glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
  glassHighlight: 'linear-gradient(180deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0) 30%)',
};

const INK_GLASS_DARK: GlassEffect = {
  glassBackground: 'rgba(0, 0, 0, 0.85)',
  glassBorder: 'rgba(255, 255, 255, 0.06)',
  glassBlur: 'blur(20px)',
  glassShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(255, 255, 255, 0.03)',
  glassInnerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
  glassHighlight: 'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0) 30%)',
};

const INK_FOCUS_LIGHT: FocusStyle = {
  focusRingColor: 'rgba(0, 0, 0, 0.35)',
  focusRingWidth: 2,
  focusRingOffset: 2,
  focusRingShadow: '0 0 0 2px rgba(0, 0, 0, 0.08)',
};

const INK_FOCUS_DARK: FocusStyle = {
  focusRingColor: 'rgba(255, 255, 255, 0.45)',
  focusRingWidth: 2,
  focusRingOffset: 2,
  focusRingShadow: '0 0 0 2px rgba(255, 255, 255, 0.1), 0 0 12px rgba(255, 255, 255, 0.03)',
};

const INK_SHADOWS = {
  ...SHADOWS,
  shadowSm: '0 1px 2px rgba(0,0,0,0.04)',
  shadowMd: '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.04)',
  shadowLg: '0 2px 4px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.06)',
  shadowXl: '0 4px 8px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.10)',
  shadow2xl: '0 8px 16px rgba(0,0,0,0.10), 0 20px 60px rgba(0,0,0,0.14)',
  cardShadowLight: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)',
  headerShadowLight: '0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.03)',
  cardShadowDark: '0 2px 8px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.02)',
  headerShadowDark: '0 2px 6px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.35), inset 0 -1px 0 rgba(255,255,255,0.01)',
  glowPrimary: '0 0 20px rgba(192,57,43,0.10)',
  glowPrimarySoft: '0 0 32px rgba(192,57,43,0.06), 0 0 64px rgba(192,57,43,0.03)',
  glowPrimaryStrong: '0 0 40px rgba(224,90,78,0.16), 0 0 80px rgba(224,90,78,0.06)',
};

// ==================== 导出所有主题配置 ====================

export const THEMES = {
  default: {
    light: createThemeConfig('Default', '默认主题', 'light', DEFAULT_LIGHT, DEFAULT_LIGHT_NEUTRAL, {
      glassEffect: DEFAULT_GLASS_LIGHT,
      focusStyle: DEFAULT_FOCUS_LIGHT,
      shadows: DEFAULT_SHADOWS,
    }),
    dark: createThemeConfig('Default', '默认主题', 'dark', DEFAULT_DARK, DEFAULT_DARK_NEUTRAL, {
      glassEffect: DEFAULT_GLASS_DARK,
      focusStyle: DEFAULT_FOCUS_DARK,
      shadows: DEFAULT_SHADOWS,
    }),
  },
  modern: {
    light: createThemeConfig('Modern', '现代主题', 'light', MODERN_LIGHT, MODERN_LIGHT_NEUTRAL, {
      glassEffect: MODERN_GLASS_LIGHT,
      focusStyle: MODERN_FOCUS_LIGHT,
      shadows: MODERN_SHADOWS,
    }),
    dark: createThemeConfig('Modern', '现代主题', 'dark', MODERN_DARK, MODERN_DARK_NEUTRAL, {
      glassEffect: MODERN_GLASS_DARK,
      focusStyle: MODERN_FOCUS_DARK,
      shadows: MODERN_SHADOWS,
    }),
  },
  ink: {
    light: createThemeConfig('Ink', '墨色主题', 'light', INK_LIGHT, INK_LIGHT_NEUTRAL, {
      glassEffect: INK_GLASS_LIGHT,
      focusStyle: INK_FOCUS_LIGHT,
      shadows: INK_SHADOWS,
    }),
    dark: createThemeConfig('Ink', '墨色主题', 'dark', INK_DARK, INK_DARK_NEUTRAL, {
      glassEffect: INK_GLASS_DARK,
      focusStyle: INK_FOCUS_DARK,
      shadows: INK_SHADOWS,
    }),
  },
} as const;

export function getThemeConfig(mode: ThemeMode, preset?: ThemePreset): ThemeConfig {
  const effectiveMode = mode === 'system' ? getSystemMode() : mode;
  const themeName = preset ?? 'default';

  if (themeName === 'modern') {
    return THEMES.modern[effectiveMode];
  }
  if (themeName === 'ink') {
    return THEMES.ink[effectiveMode];
  }
  return THEMES.default[effectiveMode];
}

export const THEME_PRESETS_LIST = [
  { value: 'default' as ThemePreset, label: '默认主题', description: '高端质感，中性灰蓝专业风格' },
  { value: 'modern' as ThemePreset, label: '现代主题', description: '清新简约，Teal 青碧风格' },
  { value: 'ink' as ThemePreset, label: '墨色主题', description: '浓墨淡彩，朱砂红点缀的东方美学' },
];
