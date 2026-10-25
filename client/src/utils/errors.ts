export function getErrorMessage(error: unknown, fallback = '알 수 없는 오류'): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message || fallback;
  }
  return typeof error === 'string' && error ? error : fallback;
}

export function getErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code : undefined;
}
