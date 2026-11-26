import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockWriteAppLog } from '../setupTests';
import {
  consoleErrorReported,
  describeDiagnostic,
  flushDiagnostics,
  flushDiagnosticsBeforeExit,
  formatConsoleArgs,
  installDiagnostics,
  reportDiag,
  resetDiagnosticsForTests,
  setSinkLoaderForTests,
  stringifyDiagnosticValue,
} from '../../utils/diagnostics';

type SentEntry = {
  level: string;
  source: string;
  message: string;
  stack?: string;
  page?: string;
  count: number;
  time: number;
};

const sentEntries = (call = 0): SentEntry[] => mockWriteAppLog.mock.calls[call][0] as SentEntry[];

let uninstall: () => void = () => {};

beforeEach(() => {
  resetDiagnosticsForTests();
  mockWriteAppLog.mockReset();
  mockWriteAppLog.mockResolvedValue(undefined);
  uninstall = installDiagnostics({ force: true });
});

afterEach(() => {
  uninstall();
  resetDiagnosticsForTests();
  vi.restoreAllMocks();
});

describe('describeDiagnostic', () => {
  it('keeps name, message and stack for Error values', () => {
    const err = new TypeError('boom');
    const d = describeDiagnostic(err);
    expect(d.message).toBe('TypeError: boom');
    expect(d.stack).toBe(err.stack ?? undefined);
  });

  it('unwraps Wails binding envelopes and strips framework prefixes', () => {
    const d = describeDiagnostic({
      message: 'BindingCallFailed: Bound method returned an error: dial tcp: i/o timeout',
    });
    expect(d.message).toBe('dial tcp: i/o timeout');
  });

  it('appends the cause when present', () => {
    expect(describeDiagnostic({ message: 'x', cause: new Error('root') }).message).toBe(
      'x Caused by: root'
    );
    expect(describeDiagnostic({ message: 'x', cause: 'plain' }).message).toBe('x Caused by: plain');
  });

  it('falls back to JSON for objects without a message and survives circular refs', () => {
    expect(describeDiagnostic({ code: 42 }).message).toBe('{"code":42}');
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(describeDiagnostic(loop).message).toBe('[object Object]');
  });

  it('stringifies primitives', () => {
    expect(describeDiagnostic('plain').message).toBe('plain');
    expect(describeDiagnostic(5).message).toBe('5');
    expect(describeDiagnostic(null).message).toBe('null');
    expect(describeDiagnostic(undefined).message).toBe('undefined');
  });
});

describe('stringifyDiagnosticValue / formatConsoleArgs', () => {
  it('expands Error values with their stack', () => {
    const err = new RangeError('off');
    expect(stringifyDiagnosticValue(err)).toBe(`RangeError: off\n${err.stack}`);
  });

  it('serializes nested Errors inside objects instead of dropping them', () => {
    expect(stringifyDiagnosticValue({ err: new Error('inner') })).toBe('{"err":"Error: inner"}');
  });

  it('fills console format placeholders and appends the rest', () => {
    expect(formatConsoleArgs(['bad %s id=%d', 'x', 7, { a: 1 }])).toBe('bad x id=7 {"a":1}');
    expect(formatConsoleArgs(['a', 'b'])).toBe('a b');
    expect(formatConsoleArgs([])).toBe('');
    expect(formatConsoleArgs(['orphan %s'])).toBe('orphan %s');
  });
});

describe('reportDiag + flushDiagnostics', () => {
  it('merges duplicates into one entry carrying a count', async () => {
    expect(reportDiag('error', 'console', 'same')).toBe(true);
    expect(reportDiag('error', 'console', 'same')).toBe(true);
    expect(reportDiag('warn', 'console', 'same')).toBe(true);

    await flushDiagnostics();

    expect(mockWriteAppLog).toHaveBeenCalledTimes(1);
    const entries = sentEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      level: 'error',
      source: 'console',
      message: 'same',
      count: 2,
    });
    expect(entries[1]).toMatchObject({ level: 'warn', message: 'same', count: 1 });
    expect(typeof entries[0].time).toBe('number');
  });

  it('caps the buffer at 100 distinct entries, dropping the oldest', async () => {
    for (let i = 0; i < 101; i++) {
      reportDiag('info', 'console', `m${i}`);
    }
    await flushDiagnostics();

    const entries = sentEntries();
    expect(entries).toHaveLength(100);
    expect(entries[0].message).toBe('m1');
    expect(entries[99].message).toBe('m100');
  });

  it('truncates long messages and stacks', async () => {
    reportDiag('error', 'window', 'x'.repeat(5000), 'y'.repeat(9000));
    await flushDiagnostics();

    const [entry] = sentEntries();
    expect(entry.message).toBe('x'.repeat(4000) + '…(truncated)');
    expect(entry.stack).toBe('y'.repeat(8000) + '…(truncated)');
  });

  it('turns itself off when the binding module cannot be loaded', async () => {
    setSinkLoaderForTests(async () => {
      throw new Error('module not found');
    });
    reportDiag('error', 'window', 'first');
    await flushDiagnostics();

    expect(reportDiag('error', 'window', 'later')).toBe(false);
    await flushDiagnostics();
    expect(mockWriteAppLog).not.toHaveBeenCalled();
  });

  it('keeps working after a transient failure on the very first flush', async () => {
    mockWriteAppLog.mockRejectedValueOnce(new Error('ipc hiccup'));
    reportDiag('error', 'window', 'a');
    await flushDiagnostics();

    // 绑定在、只是这次调用失败：不能因此关掉这一整次运行的诊断
    expect(reportDiag('error', 'window', 'b')).toBe(true);
    await flushDiagnostics();
    expect(mockWriteAppLog).toHaveBeenCalledTimes(2);
    expect(sentEntries(1)[0].message).toBe('b');
  });

  it('stops reporting console errors after the per-run cap, leaving one notice', async () => {
    // 安静地装一遍：这里要打 500 多条 console.error
    uninstall();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    uninstall = installDiagnostics({ force: true });

    for (let i = 0; i < 500; i++) console.error(`unique ${i}`);
    await flushDiagnostics();
    expect(sentEntries()).toHaveLength(100); // 单次上报的缓冲上限
    expect(sentEntries()[0].message).toBe('unique 400');

    console.error('over the cap');
    console.error('still over');
    await flushDiagnostics();
    const notice = sentEntries(1);
    expect(notice).toHaveLength(1);
    expect(notice[0]).toMatchObject({ level: 'warn', source: 'console' });
    expect(notice[0].message).toContain('500');

    // 之后不再有条目，也不重复提示
    console.error('much later');
    await flushDiagnostics();
    expect(mockWriteAppLog).toHaveBeenCalledTimes(2);
  });

  it('exits the before-exit flush once the timeout passes', async () => {
    vi.useFakeTimers();
    mockWriteAppLog.mockImplementation(() => new Promise<void>(() => {}));
    const done = vi.fn();
    void flushDiagnosticsBeforeExit().then(done);
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps working after a transient failure once enabled', async () => {
    reportDiag('error', 'window', 'a');
    await flushDiagnostics();

    mockWriteAppLog.mockRejectedValueOnce(new Error('ipc hiccup'));
    reportDiag('error', 'window', 'b');
    await flushDiagnostics();

    reportDiag('error', 'window', 'c');
    await flushDiagnostics();

    expect(mockWriteAppLog).toHaveBeenCalledTimes(3);
    expect(sentEntries(2)[0].message).toBe('c');
  });

  it('reports nothing outside the Wails runtime', async () => {
    uninstall();
    uninstall = () => {};
    resetDiagnosticsForTests();

    expect(reportDiag('error', 'window', 'x')).toBe(false);
    await flushDiagnostics();

    expect(mockWriteAppLog).not.toHaveBeenCalled();
  });
});

describe('installDiagnostics', () => {
  it('captures window error events with their stack', async () => {
    const err = new TypeError('boom');
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: 'boom' }));

    await flushDiagnostics();

    expect(sentEntries()[0]).toMatchObject({
      level: 'error',
      source: 'window',
      message: 'TypeError: boom',
      stack: err.stack,
    });
  });

  it('ignores bare error events (resource load failures)', async () => {
    window.dispatchEvent(new Event('error'));
    await flushDiagnostics();

    expect(mockWriteAppLog).not.toHaveBeenCalled();
  });

  it('captures unhandled rejections', async () => {
    const event = new Event('unhandledrejection', { cancelable: true }) as Event & {
      reason: unknown;
    };
    event.reason = { message: 'BindingCallFailed: Bound method returned an error: nope' };
    window.dispatchEvent(event);

    await flushDiagnostics();

    expect(sentEntries()[0]).toMatchObject({ source: 'promise', message: 'nope' });
  });

  it('wraps console.error: the original still prints and the content is reported', async () => {
    uninstall();
    resetDiagnosticsForTests();
    const base = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(base);
    uninstall = installDiagnostics({ force: true });

    const err = new Error('inner');
    console.error('failed %s', err, { code: 1 });

    expect(base).toHaveBeenCalledTimes(1);
    const printed = base.mock.calls[0] as unknown[];
    expect(printed[0]).toBe('failed %s');
    expect(printed[1]).toBe(err);

    await flushDiagnostics();
    expect(sentEntries()[0]).toMatchObject({
      source: 'console',
      message: 'failed Error: inner {"code":1}',
      stack: err.stack ?? undefined,
    });
  });

  it('does not re-report errors printed via consoleErrorReported', async () => {
    // 先装 spy 再安装捕获：consoleErrorReported 走的是安装前的 console.error
    uninstall();
    resetDiagnosticsForTests();
    const spy = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(spy);
    uninstall = installDiagnostics({ force: true });

    consoleErrorReported('[UI ErrorBoundary]', new Error('x'));
    expect(spy).toHaveBeenCalledTimes(1);

    await flushDiagnostics();
    expect(mockWriteAppLog).not.toHaveBeenCalled();
  });

  it('stops capturing after uninstall', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    uninstall();
    uninstall = () => {};
    const removed = removeSpy.mock.calls.map((call) => call[0]);
    expect(removed).toEqual(expect.arrayContaining(['error', 'unhandledrejection', 'pagehide']));

    vi.spyOn(console, 'error').mockImplementation(() => {});
    console.error('after uninstall');
    await flushDiagnostics();

    expect(mockWriteAppLog).not.toHaveBeenCalled();
  });
});
