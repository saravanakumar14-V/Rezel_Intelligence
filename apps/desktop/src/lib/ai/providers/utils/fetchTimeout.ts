export async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string | URL,
  options: RequestInit,
  timeoutMs = 60000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('TIMEOUT')), timeoutMs);

  const signal = options.signal;
  const onExternalAbort = () => {
    controller.abort(signal?.reason);
  };

  if (signal) {
    if (signal.aborted) {
      onExternalAbort();
    } else {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const res = await fetchFn(url, { ...options, signal: controller.signal });
    return res;
  } catch (err: any) {
    if (err.name === 'AbortError' && !signal?.aborted) {
      // It was aborted by our timeout controller
      throw new Error('TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}
