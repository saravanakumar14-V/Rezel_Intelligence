export class StreamTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamTimeoutError';
  }
}

/**
 * Wraps an AsyncGenerator with an idle timeout.
 * If the generator does not yield a value within idleTimeoutMs, it throws a StreamTimeoutError.
 */
export async function* withIdleTimeout<T>(
  generator: AsyncGenerator<T, any, unknown>,
  idleTimeoutMs: number
): AsyncGenerator<T, any, unknown> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const getNextPromise = () => {
    return new Promise<IteratorResult<T, any>>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new StreamTimeoutError(`Stream idled for more than ${idleTimeoutMs}ms`));
      }, idleTimeoutMs);

      generator.next().then(
        (val) => {
          clearTimeout(timeoutId);
          resolve(val);
        },
        (err) => {
          clearTimeout(timeoutId);
          reject(err);
        }
      );
    });
  };

  try {
    while (true) {
      const result = await getNextPromise();
      if (result.done) {
        return result.value;
      }
      yield result.value;
    }
  } finally {
    clearTimeout(timeoutId);
    if (generator.return) {
      await generator.return(undefined as any);
    }
  }
}
