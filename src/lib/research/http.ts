export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches with retry logic and exponential backoff
 * Retries on 429 (Rate Limit) and 5xx (Server Errors)
 */
export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  options: {
    timeoutMs: number;
    maxRetries?: number;
    initialDelayMs?: number;
  }
): Promise<Response> {
  const { timeoutMs, maxRetries = 3, initialDelayMs = 1000 } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(input, init, timeoutMs);

      if (response.ok) return response;

      // Only retry on rate limits or server errors
      if (response.status !== 429 && response.status < 500) {
        return response;
      }

      // If we've reached max retries, just return the failed response
      if (attempt === maxRetries) return response;

      // Exponential backoff
      const delay = initialDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on AbortError (timeout reached)
      if (lastError.name === "AbortError") throw lastError;
      
      if (attempt === maxRetries) throw lastError;
      
      const delay = initialDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Request failed after retries");
}
