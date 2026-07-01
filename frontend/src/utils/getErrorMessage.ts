/**
 * Safely extract an error message from an unknown catch parameter.
 * Avoids the need for `catch (err: any)` while keeping message extraction concise.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
