'use client';

export async function api<T = any>(path: string, options: { method?: string; body?: any } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export async function upload<T = any>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api${path}`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data as T;
}
