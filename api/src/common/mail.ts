import { Logger } from '@nestjs/common';
import { config } from '../config.js';

const logger = new Logger('Mail');

/** Email can be sent (Resend is configured), or is printed to the log for local testing. */
export const mailEnabled = () => !!(config.resendApiKey && config.mailFrom) || config.mailDevLog;

/**
 * Send one plain-text email through Resend's HTTP API (https://resend.com). An HTTP API rather than SMTP
 * because Railway blocks SMTP ports on its Free/Hobby plans.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!config.resendApiKey || !config.mailFrom) {
    if (config.mailDevLog) {
      logger.log(`[dev] email to ${to}: ${subject}\n${text}`);
      return;
    }
    throw new Error('Email is not configured (RESEND_API_KEY / MAIL_FROM)');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to: [to], subject, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.warn(`Resend ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`Email provider error (${res.status})`);
  }
}
