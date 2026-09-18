import * as fs from 'fs';
import * as path from 'path';
import { IProfileImageStorage, StoredProfileImage } from './profile-storage.interface';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LocalProfileStorage implements IProfileImageStorage {
  private readonly logger = new Logger(LocalProfileStorage.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), 'uploads', 'avatars');
    this.baseUrl = process.env.API_BASE_URL || 'http://localhost:4000';
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created uploads directory: ${this.uploadDir}`);
    }
  }

  async saveImage(
    userId: string,
    buffer: Buffer,
    mimeType: string,
    extension: string
  ): Promise<StoredProfileImage> {
    this.ensureDirectoryExists();

    // Sanitize user ID and generate clean un-guessable storage key
    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const storageKey = `${sanitizedUserId}_${Date.now()}_${randomSuffix}.${extension}`;

    const filePath = path.join(this.uploadDir, storageKey);

    // Prevent directory traversal
    if (!filePath.startsWith(this.uploadDir)) {
      throw new Error('مسار تخزين غير صالح');
    }

    await fs.promises.writeFile(filePath, buffer);

    const url = this.getImageUrl(storageKey);
    return {
      url,
      storageKey,
      mimeType,
      sizeBytes: buffer.length,
    };
  }

  async deleteImage(storageKey: string): Promise<boolean> {
    if (!storageKey || typeof storageKey !== 'string') return false;

    // Sanitize key
    const cleanKey = path.basename(storageKey);
    const filePath = path.join(this.uploadDir, cleanKey);

    if (!filePath.startsWith(this.uploadDir)) {
      return false;
    }

    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
    } catch (err: any) {
      this.logger.warn(`Failed to delete profile image ${storageKey}: ${err.message}`);
    }
    return false;
  }

  getImageUrl(storageKey: string): string {
    const cleanKey = path.basename(storageKey);
    return `${this.baseUrl}/uploads/avatars/${cleanKey}`;
  }
}
