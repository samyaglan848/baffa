import { BadRequestException } from '@nestjs/common';

export interface ValidatedImage {
  buffer: Buffer;
  mimeType: string;
  extension: 'jpg' | 'png' | 'webp';
  sizeBytes: number;
}

export class ImageProcessor {
  public static readonly MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

  /**
   * Strictly validates image buffer format, size, magic bytes signature, and safety
   */
  public static validateAndProcess(buffer: Buffer, declaredMimeType?: string): ValidatedImage {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new BadRequestException('ملف الصورة مفقود أو غير صالح');
    }

    if (buffer.length === 0) {
      throw new BadRequestException('ملف الصورة فارغ');
    }

    if (buffer.length > this.MAX_FILE_SIZE) {
      throw new BadRequestException('حجم الصورة يتجاوز الحد الأقصى المسموح به (25 ميجابايت)');
    }

    // Magic Bytes Verification (File Signature)
    const detected = this.detectMagicBytes(buffer);
    if (!detected) {
      throw new BadRequestException('نوع الملف غير مدعوم. الأنواع المسموح بها هي: JPEG, PNG, WEBP فقط');
    }

    // Safety checks against executable payload / script tags
    this.scanForMaliciousPayload(buffer);

    return {
      buffer,
      mimeType: detected.mimeType,
      extension: detected.extension,
      sizeBytes: buffer.length,
    };
  }

  /**
   * Detects true image type using header byte signatures
   */
  private static detectMagicBytes(buffer: Buffer): { mimeType: string; extension: 'jpg' | 'png' | 'webp' } | null {
    // 1. JPEG: FF D8 FF
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mimeType: 'image/jpeg', extension: 'jpg' };
    }

    // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { mimeType: 'image/png', extension: 'png' };
    }

    // 3. WebP: 'RIFF' at 0..3 and 'WEBP' at 8..11
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50 // P
    ) {
      return { mimeType: 'image/webp', extension: 'webp' };
    }

    return null;
  }

  /**
   * Scans buffer for disguised script or executable tags
   */
  private static scanForMaliciousPayload(buffer: Buffer): void {
    // Check for common malicious strings in the first 4KB and last 4KB
    const sampleSize = Math.min(buffer.length, 4096);
    const startSample = buffer.subarray(0, sampleSize).toString('utf-8').toLowerCase();
    const endSample = buffer.subarray(Math.max(0, buffer.length - sampleSize)).toString('utf-8').toLowerCase();

    const forbiddenPatterns = [
      '<script',
      'javascript:',
      'onload=',
      'onerror=',
      '<?php',
      'eval(',
      '<!doctype html',
      '<html',
      '<svg',
    ];

    for (const pattern of forbiddenPatterns) {
      if (startSample.includes(pattern) || endSample.includes(pattern)) {
        throw new BadRequestException('تم رفض الملف: تم اكتشاف محتوى غير آمن داخل الصورة');
      }
    }
  }
}
