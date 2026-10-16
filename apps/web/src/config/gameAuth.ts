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
  const offset = estimateClockOffset(Date.now() - state.serverTime);
  return { ...state, turnStartTime: state.turnStartTime + offset, serverTime: state.serverTime + offset } as T;
}

/**
 * Each message gives "local clock − server clock + how long the message took to arrive". Using one
 * message as is (as before) was wrong whenever it arrived late, which is exactly what happens on
 * returning to the tab: messages held back in the background arrive all at once, and every timer
 * then showed seconds that had already passed. The smallest value seen recently is the message that
 * travelled fastest, i.e. the closest to the real clock difference, so that one is used.
 */
const offsetSamples: { value: number; at: number }[] = [];
const OFFSET_WINDOW_MS = 10 * 60 * 1000;

function estimateClockOffset(sample: number): number {
  const now = Date.now();
  offsetSamples.push({ value: sample, at: now });
  while (offsetSamples.length > 0 && now - offsetSamples[0].at > OFFSET_WINDOW_MS) offsetSamples.shift();
  if (offsetSamples.length > 200) offsetSamples.splice(0, offsetSamples.length - 200);
  return Math.min(...offsetSamples.map((s) => s.value));
}
