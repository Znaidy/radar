const BASE = '/api';

export type ApiError = { type: 'network' | 'server' | 'client'; status?: number; detail?: string };

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(BASE + path);
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function post<T>(path: string, body: unknown = {}): Promise<T | null> {
  try {
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  } catch { return null; }
}

async function patch<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  } catch { return null; }
}

/** POST returning full error payload — used where a specific error needs to be shown. */
async function postWithError<T>(path: string, body: unknown = {}): Promise<{ data: T | null; error: ApiError | null }> {
  try {
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { data: null, error: { type: r.status >= 500 ? 'server' : 'client', status: r.status, detail: json.detail } };
    }
    return { data: json as T, error: null };
  } catch (e) {
    return { data: null, error: { type: 'network', detail: String(e) } };
  }
}

export const api = { get, post, patch, postWithError };
