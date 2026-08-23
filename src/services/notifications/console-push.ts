import 'server-only';

import { createLogger } from '@/lib/logger';
import type { PushMessage, PushProvider, PushTicket } from './types';

/**
 * The provider used when no push credentials exist.
 *
 * This is not a stub that throws. It is a working implementation of the
 * same interface that writes each message to the log and reports success,
 * which means every part of the feature *except the last hop* runs and can
 * be tested today: token registration, preference checks, quiet hours,
 * deduplication across twelve illustration jobs, the deep-link payload,
 * and the delivery record.
 *
 * What it deliberately does not do is pretend. `live` is false, the API
 * reports which provider is in use, and `docs/OPERATIONS.md` says plainly
 * that nothing reaches a phone until an EAS project and store credentials
 * exist. A mock that claimed otherwise would be worse than no mock.
 */
const log = createLogger('push:console');

export class ConsolePushProvider implements PushProvider {
  readonly name = 'console';
  readonly live = false;

  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    for (const message of messages) {
      log.info('push (not sent: no provider configured)', {
        // Tokens are credentials of a sort -- enough of one to notify
        // somebody else's device. Only the tail is logged.
        token: `...${message.token.slice(-8)}`,
        title: message.title,
        body: message.body,
        data: message.data,
      });
    }
    return messages.map((message) => ({ token: message.token, ok: true }));
  }
}
