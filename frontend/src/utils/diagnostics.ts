/**
 * 前端诊断上报：把未捕获错误、未处理的 Promise 拒绝、console.error 与 React 错误边界
 * 转发给后端，落进数据目录下的滚动日志（backend/applog.go）。
 *
 * - 只在 Wails 运行时里工作；浏览器预览 / 非 Wails 环境下静默跳过。
 * - 上报窗口内相同内容合并成一条（带重复次数），避免渲染死循环把日志刷爆。
 * - 上报代码自身绝不抛错、绝不递归（console.error 的包装里不再触发上报）。
 */
import { getErrorMessage } from './getErrorMessage';

export type DiagLevel = 'error' | 'warn' | 'info';

/** 与后端 backend.AppLogEntry 对应 */
export interface AppLogEntry {
  level: DiagLevel;
  source: string;
  message: string;
  stack?: string;
  page?: string;
  count: number;
  time: number;
}

interface Description {
  message: string;
  stack?: string;
}

const MAX_BUFFER = 100;
const MAX_MESSAGE = 4000;
const MAX_STACK = 8000;
const FLUSH_DELAY_MS = 2000;
/** 页面即将卸载时最多等上报多久 */
const EXIT_FLUSH_TIMEOUT_MS = 800;
/**
 * console 来源每次运行最多上报这么多条。内容各不相同的 console.error 靠「合并重复」挡不住：
 * 循环里刷出来，几分钟就能把保留期内的日志全部挤掉
 */
const MAX_CONSOLE_ENTRIES = 500;

type Sink = 'unknown' | 'on' | 'off';

const queue = new Map<string, AppLogEntry>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> | null = null;
let sink: Sink = 'unknown';
let forced = false;
/** 安装前的 console.error：给「已单独上报、只想打到控制台」的调用方使用 */
let rawConsoleError: typeof console.error | null = null;
let consoleEntries = 0;
let consoleCapNoted = false;

/** 加载上报用的绑定。单独抽出来是为了能在测试里模拟「绑定模块不存在」 */
type SinkLoader = () => Promise<(entries: AppLogEntry[]) => Promise<void>>;
const loadBinding: SinkLoader = async () =>
  (await import('../../bindings/idblink/backend/app')).WriteAppLog;
let loader: SinkLoader = loadBinding;

/**
 * 打印一条已经通过 reportDiag 单独上报过的错误：只进控制台，不再经 console 包装重复入库。
 */
export function consoleErrorReported(...args: unknown[]): void {
  (rawConsoleError ?? console.error)(...args);
}

function runtimeAvailable(): boolean {
  if (forced) return true;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w._wails) || Boolean(w.runtime);
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…(truncated)` : text;
}

/** 任意值转可读文本：Error 带堆栈，循环引用 / 奇怪对象兜底为类型名 */
export function stringifyDiagnosticValue(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`;
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    return (
      JSON.stringify(value, (_key, inner) => {
        if (inner instanceof Error) return `${inner.name}: ${inner.message}`;
        if (typeof inner === 'bigint') return `${inner}n`;
        return inner;
      }) ?? String(value)
    );
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/** console 占位符里的 Error 只写「类型: 消息」——堆栈另走 stack 字段，不混进正文 */
function brief(arg: unknown): string {
  return arg instanceof Error ? `${arg.name}: ${arg.message}` : stringifyDiagnosticValue(arg);
}

/** 把 console 的格式串占位符（%s/%d/%i/%j/%o）用后续参数填上，其余参数空格拼接 */
export function formatConsoleArgs(args: unknown[]): string {
  if (args.length === 0) return '';
  const [first, ...rest] = args;
  if (typeof first !== 'string' || !/%[sdijo]/.test(first) || rest.length === 0) {
    return args.map(stringifyDiagnosticValue).join(' ');
  }
  let i = 0;
  const text = first.replace(/%[sdijo]/g, () => (i < rest.length ? brief(rest[i++]) : ''));
  const tail = rest.slice(i).map(stringifyDiagnosticValue);
  return [text, ...tail].join(' ');
}

/** 把任意被抛出的值（含 Wails 绑定拒绝的信封对象）归纳成消息 + 堆栈 */
export function describeDiagnostic(reason: unknown): Description {
  if (reason instanceof Error) {
    return {
      message: `${reason.name}: ${getErrorMessage(reason)}`,
      stack: reason.stack || undefined,
    };
  }
  if (reason && typeof reason === 'object') {
    const r = reason as Record<string, unknown>;
    const message = typeof r.message === 'string' ? getErrorMessage(r.message) : '';
    const cause =
      r.cause instanceof Error
        ? ` Caused by: ${getErrorMessage(r.cause)}`
        : typeof r.cause === 'string' && r.cause
          ? ` Caused by: ${r.cause}`
          : '';
    const typeName = reason.constructor?.name;
    const head = typeName && typeName !== 'Object' ? `${typeName}: ` : '';
    return {
      message: message ? `${head}${message}${cause}` : stringifyDiagnosticValue(reason),
      stack: typeof r.stack === 'string' ? r.stack : undefined,
    };
  }
  return { message: String(reason) };
}

/**
 * 记一条诊断日志。返回是否真的进了上报队列（运行时不可用 / 已关闭时为 false）。
 */
export function reportDiag(
  level: DiagLevel,
  source: string,
  message: string,
  stack?: string
): boolean {
  if (sink === 'off' || !runtimeAvailable()) return false;
  try {
    const key = `${level}|${source}|${message}`;
    const existing = queue.get(key);
    if (existing) {
      existing.count += 1;
      return true;
    }
    if (queue.size >= MAX_BUFFER) {
      const oldest = queue.keys().next().value;
      if (oldest !== undefined) queue.delete(oldest);
    }
    queue.set(key, {
      level,
      source,
      message: clip(message, MAX_MESSAGE),
      stack: stack ? clip(stack, MAX_STACK) : undefined,
      page: window.location.hash || undefined,
      count: 1,
      time: Date.now(),
    });
    if (flushTimer === undefined) {
      flushTimer = setTimeout(() => {
        void flushDiagnostics();
      }, FLUSH_DELAY_MS);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 把队列里的内容立刻发往后端。Promise 在发送尝试结束后 resolve（成功、失败或跳过都算）。
 */
export function flushDiagnostics(): Promise<void> {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  if (queue.size === 0 || sink === 'off' || !runtimeAvailable()) {
    queue.clear();
    return Promise.resolve();
  }
  // 上一批还在路上：等它落地后再发本批
  if (inflight) return inflight.then(() => flushDiagnostics());

  const entries = [...queue.values()];
  queue.clear();
  inflight = (async () => {
    try {
      let write: (entries: AppLogEntry[]) => Promise<void>;
      try {
        write = await loader();
      } catch {
        // 绑定模块本身不存在（非 Wails 环境、生成物缺失）→ 永久关闭，不再反复尝试加载。
        // 必须和「调用失败」分开：否则第一次上报碰上偶发的 IPC 失败，这一整次运行就没有诊断了
        sink = 'off';
        return;
      }
      sink = 'on';
      try {
        await write(entries);
      } catch {
        // 绑定在、只是这次调用失败：丢这一批，下一次照常
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 页面即将重载/卸载时调用：尽力争取一次上报，超时也照常继续 */
export async function flushDiagnosticsBeforeExit(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      flushDiagnostics(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, EXIT_FLUSH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 安装全局捕获：window error / unhandledrejection / console.error。
 * 返回卸载函数（仅测试用；正常运行常驻）。
 */
export function installDiagnostics(options: { force?: boolean } = {}): () => void {
  forced = options.force === true;

  const onError = (event: ErrorEvent) => {
    // 资源加载失败（<img>/<script> 的 error 事件冒到 window）没有 message，不算脚本错误
    if (!event.message && !(event.error instanceof Error)) return;
    const d = describeDiagnostic(event.error ?? event.message);
    reportDiag('error', 'window', d.message, d.stack);
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const d = describeDiagnostic(event.reason);
    reportDiag('error', 'promise', d.message, d.stack);
  };

  const originalError = console.error;
  rawConsoleError = originalError;
  console.error = (...args: unknown[]) => {
    originalError.apply(console, args);
    if (args.length === 0) return;
    if (consoleEntries >= MAX_CONSOLE_ENTRIES) {
      if (!consoleCapNoted) {
        consoleCapNoted = true;
        reportDiag(
          'warn',
          'console',
          `console.error 条数已超过 ${MAX_CONSOLE_ENTRIES}，本次运行不再上报 console 来源的报错`
        );
      }
      return;
    }
    const err = args.find((a): a is Error => a instanceof Error);
    if (reportDiag('error', 'console', formatConsoleArgs(args), err?.stack || undefined)) {
      consoleEntries += 1;
    }
  };

  const onPageHide = () => {
    void flushDiagnostics();
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('pagehide', onPageHide);
    console.error = originalError;
    rawConsoleError = null;
  };
}

/** 仅测试用：清空队列与状态 */
export function resetDiagnosticsForTests(): void {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  queue.clear();
  sink = 'unknown';
  forced = false;
  inflight = null;
  consoleEntries = 0;
  consoleCapNoted = false;
  loader = loadBinding;
}

/** 仅测试用：替换「加载上报绑定」这一步 */
export function setSinkLoaderForTests(next: SinkLoader): void {
  loader = next;
}
