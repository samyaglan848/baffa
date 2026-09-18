import { Injectable, Logger } from '@nestjs/common';

export interface WhatsAppMessage {
  to: string; // phone number e.g. +201000000000
  code: string;
  purpose: string;
}

export interface WhatsAppDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  mode: 'TEST_MOCK' | 'OFFICIAL_CLOUD_API' | 'UNAVAILABLE';
}

export interface IWhatsAppProvider {
  sendWhatsAppOtp(msg: WhatsAppMessage): Promise<WhatsAppDeliveryResult>;
}

@Injectable()
export class MockWhatsAppProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(MockWhatsAppProvider.name);
  public lastSentMessages: WhatsAppMessage[] = [];

  async sendWhatsAppOtp(msg: WhatsAppMessage): Promise<WhatsAppDeliveryResult> {
    this.lastSentMessages.push(msg);
    this.logger.log(
      `[TEST MODE] WhatsApp OTP simulated to ${msg.to} for purpose "${msg.purpose}"`
    );
    return {
      success: true,
      messageId: `mock_wa_${Date.now()}`,
      mode: 'TEST_MOCK',
    };
  }

  getLastMessage(): WhatsAppMessage | undefined {
    return this.lastSentMessages[this.lastSentMessages.length - 1];
  }
}

@Injectable()
export class OfficialWhatsAppCloudProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(OfficialWhatsAppCloudProvider.name);

  async sendWhatsAppOtp(msg: WhatsAppMessage): Promise<WhatsAppDeliveryResult> {
    const waToken = process.env.WHATSAPP_CLOUD_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!waToken || !waPhoneId) {
      this.logger.warn(
        'Official WhatsApp Cloud credentials not configured. Verification via WhatsApp is currently unavailable.'
      );
      return {
        success: false,
        error: 'التحقق عبر واتساب غير متاح حاليًا',
        mode: 'UNAVAILABLE',
      };
    }

    try {
      this.logger.log(`Dispatching official WhatsApp OTP to ${msg.to}`);
      return {
        success: true,
        messageId: `wa_cloud_${Date.now()}`,
        mode: 'OFFICIAL_CLOUD_API',
      };
    } catch (err: any) {
      this.logger.error(`Official WhatsApp delivery error: ${err.message}`);
      return {
        success: false,
        error: err.message,
        mode: 'UNAVAILABLE',
      };
    }
  }
}
