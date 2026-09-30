import * as fs from 'fs';
import * as path from 'path';
import { IProfileImageStorage, StoredProfileImage } from './profile-storage.interface';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LocalProfileStorage implements IProfileImageStorage {
  private readonly logger = new Logger(LocalProfileStorage.name);
  private readonly uploadDirs: string[];
  private readonly baseUrl: string;

  constructor() {
    this.uploadDirs = [
      path.resolve(process.cwd(), 'uploads', 'avatars'),
      path.resolve(process.cwd(), 'apps', 'server', 'uploads', 'avatars'),
      path.resolve(__dirname, '..', '..', '..', '..', 'uploads', 'avatars'),
      path.resolve(__dirname, '..', '..', '..', '..', '..', 'uploads', 'avatars'),
    ];
    this.baseUrl = (process.env.API_BASE_URL || '').replace(/\/$/, '');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    for (const dir of this.uploadDirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch {}
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

    // Write to all target upload directories safely
    for (const dir of this.uploadDirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const filePath = path.join(dir, storageKey);
        await fs.promises.writeFile(filePath, buffer);
      } catch (err: any) {
        this.logger.warn(`Failed writing to ${dir}: ${err.message}`);
      }
    }

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
    let deleted = false;

    for (const dir of this.uploadDirs) {
      try {
        const filePath = path.join(dir, cleanKey);
        if (filePath.startsWith(dir) && fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
          deleted = true;
        }
      } catch {}
    }

    return deleted;
  }

  getImageUrl(storageKey: string): string {
    const cleanKey = path.basename(storageKey);
    if (this.baseUrl) {
      return `${this.baseUrl}/uploads/avatars/${cleanKey}`;
    }
    return `/uploads/avatars/${cleanKey}`;
  }
}
