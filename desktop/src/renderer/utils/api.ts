/**
 * Get the backend API base URL
 * In development: use VITE_MODEL_PORT or default to 5005
 * In production (packaged): always use 5005
 */
export const getBackendUrl = () => {
  const port = import.meta.env.VITE_MODEL_PORT || '5005';
  return `http://127.0.0.1:${port}`;
};

/**
 * Build a full API endpoint URL
 */
export const getApiUrl = (path: string) => {
  const baseUrl = getBackendUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};

/**
 * Fetch with retry logic for backend API calls
 * Retries on network errors (ECONNREFUSED, Failed to fetch, etc.)
 */
export const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  retryDelay = 1000
): Promise<Response> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error as Error;
      const isLastAttempt = attempt === maxRetries - 1;
      
      // Check if it's a network error (backend not ready)
      const isNetworkError = 
        error instanceof TypeError ||
        (error as Error).message?.includes('fetch') ||
        (error as Error).message?.includes('ECONNREFUSED');

      if (isNetworkError && !isLastAttempt) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        continue;
      }
      
      throw error;
    }
  }

  throw lastError || new Error('Failed to fetch after retries');
};

