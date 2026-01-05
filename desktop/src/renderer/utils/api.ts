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
