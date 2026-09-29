export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`API ${res.status}: ${text || res.statusText}`); }
  return res.json() as Promise<T>;
}

export async function postJSON<T = any>(url: string, body: any): Promise<T> {
  return api<T>(url, { method: 'POST', body: JSON.stringify(body) });
}