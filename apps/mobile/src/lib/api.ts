const runtimeEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const API_BASE_URL = runtimeEnv.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
  } = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function mobileLogin(email: string, password: string, totpCode?: string) {
  return apiRequest<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: {
      email,
      password,
      totpCode,
      deviceName: 'mobile'
    }
  });
}
