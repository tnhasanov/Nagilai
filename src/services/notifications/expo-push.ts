import 'server-only';

import { createLogger, describeError } from '@/lib/logger';
import type { PushMessage, PushProvider, PushTicket } from './types';

/**
 * Expo's push service.
 *
 * Chosen because the native app is Expo: one token type covers both APNs
 * and FCM, and the credentials live in the EAS project rather than in this
 * repository. There is no SDK dependency here -- the API is one POST, and
 * a hand-written call is smaller than the package that wraps it.
 *
 * Two details that are easy to get wrong and expensive to discover in
 * production:
 *
 *  - The endpoint accepts **at most 100 messages per request**, so a
 *    household with many devices, or a future broadcast, must chunk.
 *  - A 200 response does not mean delivered. Each ticket is individually
 *    `ok` or `error`, and `DeviceNotRegistered` means the token is dead
 *    and must be retired or it will be retried forever.
 */
const log = createLogger('push:expo');

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const MAX_PER_REQUEST = 100;
const TIMEOUT_MS = 10_000;

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  readonly live = true;

  constructor(private readonly accessToken?: string) {}

  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    const results: PushTicket[] = [];

    for (let index = 0; index < messages.length; index += MAX_PER_REQUEST) {
      const chunk = messages.slice(index, index + MAX_PER_REQUEST);
      results.push(...(await this.sendChunk(chunk)));
    }
    return results;
  }

  private async sendChunk(chunk: readonly PushMessage[]): Promise<PushTicket[]> {
    const payload = chunk.map((message) => ({
      to: message.token,
      title: message.title,
      body: message.body,
      data: message.data,
      sound: 'default',
      ...(message.channelId ? { channelId: message.channelId } : {}),
      ...(message.badge !== undefined ? { badge: message.badge } : {}),
      // A story that finished an hour ago is not worth waking a phone
      // for; the library will show it anyway.
      ttl: 60 * 60 * 6,
      priority: 'default' as const,
    }));

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        log.error('expo push rejected the request', { status: response.status, detail: detail.slice(0, 300) });
        return chunk.map((message) => ({
          token: message.token,
          ok: false,
          error: `http_${response.status}`,
        }));
      }

      const body = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = body.data ?? [];

      return chunk.map((message, index) => {
        const ticket = tickets[index];
        if (!ticket) return { token: message.token, ok: false, error: 'no_ticket' };
        if (ticket.status === 'ok') return { token: message.token, ok: true };

        const reason = ticket.details?.error ?? ticket.message ?? 'unknown';
        return {
          token: message.token,
          ok: false,
          error: reason,
          // The one error that must retire the token rather than retry it.
          unregistered: reason === 'DeviceNotRegistered',
        };
      });
    } catch (error) {
      log.error('expo push request failed', describeError(error));
      return chunk.map((message) => ({ token: message.token, ok: false, error: 'request_failed' }));
    }
  }
}
