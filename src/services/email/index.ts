import 'server-only';

import { createLogger } from '@/lib/logger';
import { siteUrl } from '@/config/env';

/**
 * Transactional email (§25).
 *
 * A provider-neutral interface over plain HTTP so there is no SDK to
 * replace when the provider changes. With no key configured, sending is a
 * logged no-op -- Phase 1 relies on Supabase Auth's own emails for sign-in
 * and password reset, and this is here for the order and generation
 * notifications that arrive in Phase 2.
 */
const log = createLogger('email');

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string | null; delivered: boolean }>;
}

class ResendProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      log.error('email send failed', { status: response.status, detail: detail.slice(0, 300) });
      return { id: null, delivered: false };
    }

    const body = (await response.json()) as { id?: string };
    return { id: body.id ?? null, delivered: true };
  }
}

class NoopEmailProvider implements EmailProvider {
  readonly name = 'noop';

  async send(message: EmailMessage) {
    log.info('email suppressed (no provider configured)', {
      to: message.to,
      subject: message.subject,
    });
    return { id: null, delivered: false };
  }
}

let cached: EmailProvider | null = null;

export function emailProvider(): EmailProvider {
  if (cached) return cached;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  cached = apiKey && from ? new ResendProvider(apiKey, from) : new NoopEmailProvider();
  return cached;
}

/** Wraps content in the Nagilai email shell. */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#FBF7F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2C2119">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#FFFDFA;border-radius:16px;padding:32px">
    <tr><td>
      <p style="margin:0 0 24px;font-size:20px;font-weight:700;letter-spacing:-0.01em">Nagilai</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="margin:32px 0 0;font-size:13px;color:#8A7A6A">
        <a href="${siteUrl()}" style="color:#8A7A6A">${siteUrl().replace(/^https?:\/\//, '')}</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
