import { webConfig } from './config';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
  token?: string | null;
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = `${webConfig.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  if (options.token) {
    headers.set('authorization', `Bearer ${options.token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = await response.text();
    }
    throw new ApiError(`API request failed: ${response.status}`, response.status, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export async function login(email: string, password: string, totpCode?: string) {
  return apiFetch<{ accessToken: string; sessionId: string }>('/auth/login', {
    method: 'POST',
    body: {
      email,
      password,
      totpCode
    }
  });
}

export async function fetchMe(token: string) {
  return apiFetch<{
    id: string;
    email: string;
    name: string;
    organisationId: string;
    memberships: Array<{
      bandId: string;
      roleName: string;
      band: {
        name: string;
      };
    }>;
    roles: string[];
    permissions: string[];
  }>('/auth/me', {
    token
  });
}
