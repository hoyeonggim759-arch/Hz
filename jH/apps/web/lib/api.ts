const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(data.message) ? data.message.join("；") : data.message;
    throw new Error(message || `请求失败 (${response.status})`);
  }
  return data as T;
}
