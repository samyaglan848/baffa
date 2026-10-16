/**
 * Converts a stored avatar value into something small enough for real-time payloads.
 * Base64 photos (data: URLs) are replaced by the existing public avatar endpoint,
 * which serves the same image with HTTP caching.
 */
export function toPublicAvatar(
  userId: string | null | undefined,
  avatar: string | null | undefined,
  updatedAt?: string | Date | null
): string {
  if (!avatar) return 'avatar-1';
  if (avatar.startsWith('data:') && userId) {
    const version = updatedAt ? new Date(updatedAt).getTime() || 0 : 0;
    return `/api/profile/avatar/${encodeURIComponent(userId)}?v=${version}`;
  }
  return avatar;
}
