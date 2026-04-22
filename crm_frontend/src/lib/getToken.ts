/**
 * getToken — reads JWT access token from cookies (js-cookie format).
 * The project stores access_token in cookies via session.save().
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;

  // Read from cookies — same key used by session.ts: 'access_token'
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split('=');
    if (key === 'access_token' && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

export function authHeader(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
