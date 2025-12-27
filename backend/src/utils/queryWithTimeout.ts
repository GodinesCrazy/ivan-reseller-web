/**
 * Utility function to add timeout to database queries
 * Prevents queries from hanging indefinitely and causing 502 errors
 */

export async function queryWithTimeout<T>(
  queryPromise: Promise<T>,
  timeoutMs: number = 20000
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Database query timeout')), timeoutMs);
  });

  return Promise.race([queryPromise, timeoutPromise]);
}

