/** Нормалізує помилки SDK (часто не instanceof Error) для рядка у відповіді API. */
export function uploadErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') {
      return m;
    }
  }
  if (typeof err === 'string') {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
