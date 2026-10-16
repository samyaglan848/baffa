/**
 * Token used to identify the player on game HTTP endpoints (the fallbacks used while the
 * socket reconnects). Registered players use their account token; guests use the signed
 * guest token the server hands out on connection.
 */
export function getGameAuthToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return (
      localStorage.getItem('baffa_token') ||
      sessionStorage.getItem('baffa_token') ||
      sessionStorage.getItem('baffa_guest_token') ||
      undefined
    );
  } catch {
    return undefined;
  }
}

export function gameAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getGameAuthToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

/**
 * Converts the server's turn start time to this device's clock, so the countdown is correct
 * even when the phone/computer clock is a few seconds off (otherwise the server could auto-play
 * a move while the screen still shows time left).
 */
export function normalizeServerClock<T extends { serverTime?: number; turnStartTime?: number } | null | undefined>(state: T): T {
  if (!state || typeof state.serverTime !== 'number' || typeof state.turnStartTime !== 'number') return state;
  const offset = Date.now() - state.serverTime;
  return { ...state, turnStartTime: state.turnStartTime + offset, serverTime: Date.now() } as T;
}
