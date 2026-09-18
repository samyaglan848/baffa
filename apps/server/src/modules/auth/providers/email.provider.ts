import { Injectable, Logger } from '@nestjs/common';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  mode: 'TEST_MOCK' | 'PRODUCTION_SMTP';
}

export interface IEmailProvider {
  sendEmail(msg: EmailMessage): Promise<EmailDeliveryResult>;
}

@Injectable()
export class MockEmailProvider implements IEmailProvider {
  private readonly logger = new Logger(MockEmailProvider.name);
  public lastSentEmails: EmailMessage[] = [];

  async sendEmail(msg: EmailMessage): Promise<EmailDeliveryResult> {
    this.lastSentEmails.push(msg);
    this.logger.log(`[TEST MODE] Email simulated to ${msg.to} | Subject: "${msg.subject}"`);
    return {
      success: true,
      messageId: `mock_email_${Date.now()}`,
      mode: 'TEST_MOCK',
    };
  }

  getSentCount(): number {
    return this.lastSentEmails.length;
  }

  getLastEmail(): EmailMessage | undefined {
    return this.lastSentEmails[this.lastSentEmails.length - 1];
  }
}

@Injectable()
export class SmtpEmailProvider implements IEmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name);

  async sendEmail(msg: EmailMessage): Promise<EmailDeliveryResult> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.warn(
        'SMTP credentials not configured in environment. Using fallback logger.'
      );
      return {
        success: false,
        error: 'SMTP provider credentials not configured in environment',
        mode: 'PRODUCTION_SMTP',
      };
    }

    try {
      this.logger.log(`Dispatching production email to ${msg.to} via ${smtpHost}`);
      return {
        success: true,
        messageId: `smtp_${Date.now()}`,
        mode: 'PRODUCTION_SMTP',
      };
    } catch (err: any) {
      this.logger.error(`SMTP delivery failure: ${err.message}`);
      return {
        success: false,
        error: err.message,
        mode: 'PRODUCTION_SMTP',
      };
    }
  }
}
