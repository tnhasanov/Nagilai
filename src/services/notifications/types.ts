import 'server-only';

/**
 * Push delivery, behind an interface (§5).
 *
 * The same reason the AI providers are behind interfaces: the product
 * should not know which push service it uses. Today that is Expo, because
 * the native app is Expo and Expo's service brokers both APNs and FCM
 * from one token. Tomorrow it could be APNs and FCM directly, or a
 * third-party like OneSignal, and only the file next door would change.
 *
 * It also means the whole feature is testable and demonstrable with **no
 * credentials at all**: `ConsolePushProvider` implements the same
 * interface and writes to the log, so the registration flow, the
 * preference checks, the deduplication and the deep link can all be
 * exercised before an Apple or Google account exists.
 */

export interface PushMessage {
  /** Opaque device token, as registered by the app. */
  token: string;
  title: string;
  body: string;
  /**
   * Travels with the notification and is read by the app when the parent
   * taps it. This is what makes the tap open the finished book rather
   * than the home screen.
   */
  data: Record<string, string>;
  /** Notification channel on Android; ignored elsewhere. */
  channelId?: string;
  /** Badge count for iOS. */
  badge?: number;
}

export interface PushTicket {
  token: string;
  ok: boolean;
  /**
   * Set when the provider says this token is permanently dead -- the app
   * was uninstalled, or the token was revoked. The caller disables the
   * row rather than retrying forever.
   */
  unregistered?: boolean;
  error?: string;
}

export interface PushProvider {
  readonly name: string;
  /** False when the provider is a stand-in rather than a real transport. */
  readonly live: boolean;
  send(messages: readonly PushMessage[]): Promise<PushTicket[]>;
}
