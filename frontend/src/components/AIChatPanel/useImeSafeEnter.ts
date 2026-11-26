import { useCallback, useRef } from 'react';
import type { KeyboardEvent } from 'react';

// WebKit（macOS 的 WKWebView）用回车确认候选词时，先触发 compositionend、再触发 keydown，
// 此时 isComposing 已经是 false，只能按「组合刚结束」识别这次回车。Chromium 系顺序相反，
// 不做这层兜底，否则紧接着的正常回车会被吞掉。
const isWebKit =
  typeof navigator !== 'undefined' &&
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg|OPR/.test(navigator.userAgent);

/**
 * 输入法安全的回车判定：把返回的 onCompositionStart / onCompositionEnd 挂到输入框上，
 * 在 onKeyDown 里用 isRealEnter(e) 区分「真的回车」和「输入法选词上屏的回车」。
 * AI 输入区与历史对话的重命名框共用。
 */
export function useImeSafeEnter() {
  const composingRef = useRef(false);
  const endedAtRef = useRef(Number.NEGATIVE_INFINITY);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback(() => {
    composingRef.current = false;
    endedAtRef.current = performance.now();
  }, []);

  const isRealEnter = useCallback((e: KeyboardEvent<HTMLElement>): boolean => {
    // 组字中途输入框被卸载（比如重命名时按 Esc）收不到 compositionend，状态会卡在「组字中」：
    // 这次事件自己说没在组字，就按没在组字处理，否则这个输入框之后的回车全被吞掉
    if (composingRef.current && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      composingRef.current = false;
    }
    // 输入法组字中的回车是「上屏」，不是提交
    if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return false;
    if (isWebKit && Math.abs(e.timeStamp - endedAtRef.current) < 500) {
      // 只吞确认候选词的这一下，随后的回车照常提交
      endedAtRef.current = Number.NEGATIVE_INFINITY;
      return false;
    }
    return true;
  }, []);

  return { onCompositionStart, onCompositionEnd, isRealEnter };
}
