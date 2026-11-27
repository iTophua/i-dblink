/**
 * 把主题色换成 Monaco 认的写法。
 *
 * Monaco 的 Color.fromHex 只解析 #RGB / #RGBA / #RRGGBB / #RRGGBBAA，其余一律回退成纯红色。
 * 应用主题的深色取值是 rgba(...)：边框、选区、补全弹窗、缩进线曾因此在深色模式下整片变红。
 */

interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

const HEX_RE = /^#?([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB_FUNC_RE = /^rgba?\(\s*([^)]*)\)$/i;

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, n));
}

/** 单个通道：`255` 或 `12%`（percentBase 为 100% 对应的值） */
function parseChannel(part: string | undefined, percentBase: number): number | null {
  if (part === undefined) return null;
  const value = part.trim();
  if (!value) return null;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return value.endsWith('%') ? (n / 100) * percentBase : n;
}

function parseHexChannels(hex: string): Rgba | null {
  const full =
    hex.length === 3 || hex.length === 4
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const a = full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a };
}

/** 解析 hex / rgb() / rgba() / transparent；其余格式返回 null */
export function parseCssColor(color: string): Rgba | null {
  const value = color.trim();
  const hex = HEX_RE.exec(value);
  if (hex) return parseHexChannels(hex[1]);

  if (/^transparent$/i.test(value)) return { r: 0, g: 0, b: 0, a: 0 };

  const fn = RGB_FUNC_RE.exec(value);
  if (!fn) return null;

  // 两种写法：rgba(1, 2, 3, 0.5) 与 rgb(1 2 3 / 50%)
  const slashParts = fn[1].split('/');
  const channels = slashParts[0].split(/[,\s]+/).filter(Boolean);
  let alphaSource: string | undefined;
  if (channels.length === 4 && slashParts.length === 1) {
    // 逗号写法的第 4 个参数
    alphaSource = channels[3];
    channels.length = 3;
  } else if (channels.length === 3 && slashParts.length === 2) {
    alphaSource = slashParts[1];
  }
  if (channels.length !== 3) return null;

  const [r, g, b] = channels.map((c) => parseChannel(c, 255));
  const alpha = alphaSource === undefined ? 1 : parseChannel(alphaSource, 1);
  if (r === null || g === null || b === null || alpha === null) return null;
  return {
    r: clampByte(r),
    g: clampByte(g),
    b: clampByte(b),
    a: Math.min(1, Math.max(0, alpha)),
  };
}

const hex2 = (n: number) => clampByte(Math.round(n)).toString(16).padStart(2, '0').toUpperCase();

/**
 * 主题 colors 表用的值：#RRGGBB，带透明度时为 #RRGGBBAA。
 * 认不出的格式原样返回（交给 Monaco 自己处理）
 */
export function toMonacoColor(color: string): string {
  const rgba = parseCssColor(color);
  if (!rgba) return color;
  return rgba.a >= 1
    ? `#${hex2(rgba.r)}${hex2(rgba.g)}${hex2(rgba.b)}`
    : `#${hex2(rgba.r)}${hex2(rgba.g)}${hex2(rgba.b)}${hex2(rgba.a * 255)}`;
}

/**
 * token 规则的 foreground 只收 6 位十六进制（不带透明度）。
 * 解析不了、或完全透明时返回 undefined，调用方跳过这条规则
 */
export function toMonacoTokenColor(color: string): string | undefined {
  const rgba = parseCssColor(color);
  if (!rgba || rgba.a === 0) return undefined;
  return `${hex2(rgba.r)}${hex2(rgba.g)}${hex2(rgba.b)}`;
}
