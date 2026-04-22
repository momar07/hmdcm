/**
 * getToken — reads JWT access token from wherever the project stores it.
 * Tries multiple keys to be compatible with the existing auth system.
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    localStorage.getItem('access_token') ??
    localStorage.getItem('accessToken')  ??
    localStorage.getItem('token')        ??
    sessionStorage.getItem('access_token') ??
    null
  );
}

export function authHeader(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
