export interface StoredProfileImage {
  url: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

export interface IProfileImageStorage {
  /**
   * Securely saves processed profile image buffer and returns public accessible URL
   */
  saveImage(
    userId: string,
    buffer: Buffer,
    mimeType: string,
    extension: string
  ): Promise<StoredProfileImage>;

  /**
   * Deletes a previously stored profile image by its storage key
   */
  deleteImage(storageKey: string): Promise<boolean>;

  /**
   * Returns public URL for a given storage key
   */
  getImageUrl(storageKey: string): string;
}
