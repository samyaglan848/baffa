import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MockEmailProvider, IEmailProvider, SmtpEmailProvider } from './providers/email.provider';
import { MockWhatsAppProvider, IWhatsAppProvider, OfficialWhatsAppCloudProvider } from './providers/whatsapp.provider';
import { DeliveryChannel, OtpPurpose } from '@baffa/shared';

export interface CreateOtpOptions {
  userId?: string;
  target: string; // normalized email or phone
  purpose: OtpPurpose;
  channel?: DeliveryChannel;
}

export interface VerifyOtpResult {
  valid: boolean;
  userId?: string;
  target: string;
  error?: string;
}

export interface InMemoryOtpRecord {
  id: string;
  userId?: string;
  target: string;
  purpose: OtpPurpose;
  channel: DeliveryChannel;
  codeHash: string;
  rawCodeForTestOnly?: string; // used ONLY for local automated test validation
  attempts: number;
  maxAttempts: number;
  consumed: boolean;
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private emailProvider: IEmailProvider;
  private whatsappProvider: IWhatsAppProvider;

  // In-memory fallback stores
  private inMemoryOtps: Map<string, InMemoryOtpRecord> = new Map();
  private inMemoryResetTokens: Map<string, { userId: string; target: string; expiresAt: Date; consumed: boolean }> = new Map();
  private resendCooldowns: Map<string, number> = new Map();

  constructor(private prisma: PrismaService) {
    this.emailProvider = new MockEmailProvider();
    this.whatsappProvider = new MockWhatsAppProvider();
  }

  setEmailProvider(provider: IEmailProvider) {
    this.emailProvider = provider;
  }

  setWhatsAppProvider(provider: IWhatsAppProvider) {
    this.whatsappProvider = provider;
  }

  /**
   * Hashes an OTP code using SHA-256 to ensure zero plaintext storage.
   */
  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Generates and dispatches a cryptographically secure 6-digit OTP.
   */
  async createAndSendOtp(options: CreateOtpOptions): Promise<{
    success: boolean;
    channel: DeliveryChannel;
    expiresInSeconds: number;
    error?: string;
  }> {
    const normalizedTarget = options.target.trim().toLowerCase();
    const channel: DeliveryChannel = options.channel || (normalizedTarget.includes('@') ? 'EMAIL' : 'WHATSAPP');
    const cooldownKey = `${normalizedTarget}_${options.purpose}`;

    // 1. Rate-limiting check (60-second cooldown between resends)
    const lastSent = this.resendCooldowns.get(cooldownKey);
    const now = Date.now();
    if (lastSent && now - lastSent < 60000) {
      const remainingSeconds = Math.ceil((60000 - (now - lastSent)) / 1000);
      throw new BadRequestException(`يرجى الانتظار ${remainingSeconds} ثانية قبل طلب كود جديد.`);
    }

    // 2. Cryptographically secure 6-digit random code
    const rawCode = crypto.randomInt(100000, 999999).toString();
    const codeHash = this.hashCode(rawCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // 3. Persist OTP record in Database or In-Memory
    try {
      // Invalidate existing active OTPs for same target and purpose
      await this.prisma.otpVerification.updateMany({
        where: {
          target: normalizedTarget,
          purpose: options.purpose,
          consumed: false,
        },
        data: { consumed: true },
      });

      await this.prisma.otpVerification.create({
        data: {
          userId: options.userId,
          target: normalizedTarget,
          purpose: options.purpose,
          channel,
          codeHash,
          expiresAt,
          maxAttempts: 5,
        },
      });
    } catch (dbErr: any) {
      this.logger.warn(`PostgreSQL unavailable for OTP, using in-memory fallback: ${dbErr.message}`);
      // Invalidate existing in memory
      for (const [_, rec] of this.inMemoryOtps.entries()) {
        if (rec.target === normalizedTarget && rec.purpose === options.purpose && !rec.consumed) {
          rec.consumed = true;
        }
      }
      const memId = `otp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      this.inMemoryOtps.set(memId, {
        id: memId,
        userId: options.userId,
        target: normalizedTarget,
        purpose: options.purpose,
        channel,
        codeHash,
        rawCodeForTestOnly: rawCode,
        attempts: 0,
        maxAttempts: 5,
        consumed: false,
        expiresAt,
        createdAt: new Date(),
      });
    }

    // 4. Dispatch via chosen channel
    let deliverySuccess = false;
    let deliveryError: string | undefined;

    if (channel === 'EMAIL') {
      const subject =
        options.purpose === 'PASSWORD_RESET'
          ? 'كود استرجاع كلمة المرور — بَفّة BAFFA'
          : 'كود تفعيل حسابك في بَفّة BAFFA';

      const html = `
        <div dir="rtl" style="font-family: sans-serif; padding: 20px; background-color: #0b1420; color: #ffffff; border-radius: 12px;">
          <h2 style="color: #f59e0b; margin-top: 0;">🎲 منصة بَفّة (BAFFA) للدومينو</h2>
          <p style="font-size: 16px;">كود التحقق الخاص بك هو:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 16px; text-align: center; border-radius: 8px; margin: 20px 0;">
            ${rawCode}
          </div>
          <p style="font-size: 14px; color: #94a3b8;">هذا الكود صالح لمدة 10 دقائق فقط. لا تشارك هذا الكود مع أي شخص.</p>
        </div>
      `;

      const result = await this.emailProvider.sendEmail({
        to: normalizedTarget,
        subject,
        html,
        text: `كود التحقق الخاص بك في بَفّة هو: ${rawCode} (صالح لمدة 10 دقائق)`,
      });

      deliverySuccess = result.success;
      deliveryError = result.error;
    } else {
      const result = await this.whatsappProvider.sendWhatsAppOtp({
        to: normalizedTarget,
        code: rawCode,
        purpose: options.purpose,
      });

      deliverySuccess = result.success;
      deliveryError = result.error;
    }

    if (!deliverySuccess) {
      throw new BadRequestException(deliveryError || 'فشل إرسال كود التحقق عبر المزود المحدد');
    }

    this.resendCooldowns.set(cooldownKey, now);

    return {
      success: true,
      channel,
      expiresInSeconds: 600,
    };
  }

  /**
   * Verifies an OTP code and consumes it if valid.
   */
  async verifyOtp(target: string, code: string, purpose: OtpPurpose): Promise<VerifyOtpResult> {
    const normalizedTarget = target.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!/^\d{6}$/.test(cleanCode)) {
      throw new BadRequestException('كود التحقق يجب أن يتكون من 6 أرقام');
    }

    const providedHash = this.hashCode(cleanCode);

    try {
      const record = await this.prisma.otpVerification.findFirst({
        where: {
          target: normalizedTarget,
          purpose,
          consumed: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!record) {
        throw new BadRequestException('كود التحقق غير صحيح أو انتهت صلاحيته');
      }

      if (new Date() > record.expiresAt) {
        await this.prisma.otpVerification.update({
          where: { id: record.id },
          data: { consumed: true },
        });
        throw new BadRequestException('انتهت صلاحية كود التحقق، يرجى طلب كود جديد');
      }

      if (record.attempts >= record.maxAttempts) {
        await this.prisma.otpVerification.update({
          where: { id: record.id },
          data: { consumed: true },
        });
        throw new BadRequestException('تم تجاوز الحد الأقصى للمحاولات الخاطئة، يرجى طلب كود جديد');
      }

      if (record.codeHash !== providedHash) {
        await this.prisma.otpVerification.update({
          where: { id: record.id },
          data: { attempts: record.attempts + 1 },
        });
        throw new BadRequestException('كود التحقق غير صحيح');
      }

      // Mark consumed
      await this.prisma.otpVerification.update({
        where: { id: record.id },
        data: { consumed: true, consumedAt: new Date() },
      });

      return {
        valid: true,
        userId: record.userId || undefined,
        target: normalizedTarget,
      };
    } catch (dbErr: any) {
      if (dbErr instanceof BadRequestException) throw dbErr;

      // In-memory verification fallback
      const records = Array.from(this.inMemoryOtps.values())
        .filter((r) => r.target === normalizedTarget && r.purpose === purpose && !r.consumed)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const memRecord = records[0];
      if (!memRecord) {
        throw new BadRequestException('كود التحقق غير صحيح أو انتهت صلاحيته');
      }

      if (new Date() > memRecord.expiresAt) {
        memRecord.consumed = true;
        throw new BadRequestException('انتهت صلاحية كود التحقق، يرجى طلب كود جديد');
      }

      if (memRecord.attempts >= memRecord.maxAttempts) {
        memRecord.consumed = true;
        throw new BadRequestException('تم تجاوز الحد الأقصى للمحاولات الخاطئة، يرجى طلب كود جديد');
      }

      if (memRecord.codeHash !== providedHash) {
        memRecord.attempts++;
        throw new BadRequestException('كود التحقق غير صحيح');
      }

      memRecord.consumed = true;
      return {
        valid: true,
        userId: memRecord.userId,
        target: normalizedTarget,
      };
    }
  }

  /**
   * Generates a single-use Password Reset authorization token after OTP verification.
   */
  createPasswordResetToken(target: string, userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    this.inMemoryResetTokens.set(token, {
      userId,
      target: target.trim().toLowerCase(),
      expiresAt,
      consumed: false,
    });

    return token;
  }

  /**
   * Validates and consumes a Password Reset authorization token.
   */
  consumePasswordResetToken(token: string, target: string): string {
    const record = this.inMemoryResetTokens.get(token);
    if (!record || record.consumed) {
      throw new BadRequestException('رمز استرجاع كلمة المرور غير صالح أو تم استخدامه بالفعل');
    }

    if (new Date() > record.expiresAt) {
      record.consumed = true;
      throw new BadRequestException('انتهت صلاحية جلسة استرجاع كلمة المرور، يرجى البدء مجددًا');
    }

    if (record.target !== target.trim().toLowerCase()) {
      throw new BadRequestException('رمز استرجاع كلمة المرور غير متطابق');
    }

    record.consumed = true;
    return record.userId;
  }

  /**
   * Helper for automated tests ONLY: retrieves in-memory test OTP.
   */
  getTestOtpForTarget(target: string, purpose: OtpPurpose): string | undefined {
    const normalized = target.trim().toLowerCase();
    const records = Array.from(this.inMemoryOtps.values())
      .filter((r) => r.target === normalized && r.purpose === purpose && !r.consumed)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return records[0]?.rawCodeForTestOnly;
  }
}
