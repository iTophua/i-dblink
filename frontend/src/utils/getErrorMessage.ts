/**
 * Safely extract an error message from an unknown catch parameter.
 * Avoids the need for `catch (err: any)` while keeping message extraction concise.
 */
export function getErrorMessage(err: unknown): string {
  let msg: string;
  if (err instanceof Error) msg = err.message;
  else if (typeof err === 'string') msg = err;
  else msg = String(err);
  // Wails v3 绑定错误信封带框架前缀链（BindingCallFailed: Bound method
  // returned an error: ...），展示给用户前剥离，还原业务错误原文
  return msg
    .replace(/^Error: /, '')
    .replace(/^BindingCallFailed: /, '')
    .replace(/^(Bound method returned an error|failed to call binding): /, '')
    .trim();
}
