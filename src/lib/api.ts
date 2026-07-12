// Shared fetch helpers for building request headers and parsing JSON API responses.
// Pure extraction of repeated patterns from AdminPanel.tsx / ClientPortal.tsx - no behavior change.

export const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
};

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function jsonAuthHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// Parses a fetch Response as JSON and throws on non-ok status.
// If fallbackMessage is provided, mirrors call sites that used `data.error || 'fallback text'`.
// If omitted, mirrors call sites that used `data.error` directly with no fallback.
export async function parseJsonOrThrow(res: Response, fallbackMessage?: string): Promise<any> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(fallbackMessage ? (data.error || fallbackMessage) : data.error);
  }
  return data;
}
