import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

const logger = new Logger('Mail');

/**
 * How SciRah sends email, in order of preference:
 * 1. Nodemailer over SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS — e.g. a Gmail account with an app password).
 *    Note: Railway blocks SMTP ports on its Free/Hobby plans; it works locally and on Railway Pro.
 * 2. Resend's HTTP API (RESEND_API_KEY) — works on every host.
 * 3. MAIL_DEV_LOG=1: print the email to the server log (local testing only).
 */
const smtpConfigured = () => !!(config.smtpHost && config.smtpUser && config.smtpPass);
const resendConfigured = () => !!(config.resendApiKey && config.mailFrom);

export const mailEnabled = () => smtpConfigured() || resendConfigured() || config.mailDevLog;

let transporter: Transporter | null = null;
function smtp(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
    // Fail fast (e.g. when the host blocks SMTP) instead of leaving the researcher waiting.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

/** Send one plain-text email. */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (smtpConfigured()) {
    try {
      await smtp().sendMail({ from: config.mailFrom || `SciRah <${config.smtpUser}>`, to, subject, text });
      return;
    } catch (e) {
      logger.warn(`SMTP send failed: ${(e as Error).message}`);
      // Fall back to Resend if it is configured too.
      if (!resendConfigured()) throw new Error('Email could not be sent (SMTP)');
    }
  }
  if (resendConfigured()) {
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
    return;
  }
  if (config.mailDevLog) {
    logger.log(`[dev] email to ${to}: ${subject}\n${text}`);
    return;
  }
  throw new Error('Email is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS or RESEND_API_KEY)');
}
