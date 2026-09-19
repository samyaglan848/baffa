const PRODUCTION_BACKEND_URL = 'https://baffa-z8mz.onrender.com';

export function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return PRODUCTION_BACKEND_URL;
    }
  }
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    (process.env.NODE_ENV === 'production' ? PRODUCTION_BACKEND_URL : 'http://localhost:4000')
  );
}

export function getSocketUrl(): string {
  return getApiUrl();
}

export const API_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();
