export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  options: { wait?: (ms: number) => Promise<void>; random?: () => number } = {},
): Promise<T> {
  const wait =
    options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        attempt >= 2 ||
        !(error instanceof Error) ||
        !("retryable" in error) ||
        error.retryable !== true
      )
        throw error;
      await wait(
        350 * 2 ** attempt +
          Math.floor((options.random ?? Math.random)() * 200),
      );
    }
  }
}
