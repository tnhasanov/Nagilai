import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

/**
 * Native sign-in with Apple and Google.
 *
 * **Nothing here contains a credential, and nothing here fakes one.** Both
 * providers need public client identifiers that only exist once an Apple
 * Developer account and a Google Cloud project do. They are read from the
 * environment, and when they are absent the app simply does not offer that
 * button -- email sign-in continues to work, and a parent is never shown a
 * control that cannot succeed.
 *
 * `mobile/.env.example` says exactly which identifiers to create, where,
 * and what to paste them into.
 *
 * Both flows end the same way: a provider `id_token` goes to
 * `signInWithIdToken`, and Supabase mints the same session an email
 * sign-in would. One identity system, one `profiles` row, one set of RLS
 * policies -- a parent who signed up on the website with Google finds
 * their own library here, not a second empty account.
 *
 * **Apple is not optional once Google ships.** App Store guideline 4.8
 * requires an equivalent private sign-in option alongside any third-party
 * social login. They go to review together or not at all, which is why
 * `socialSignInReady()` reports on the pair rather than each separately.
 */

// Required so the browser-based Google flow can hand control back.
WebBrowser.maybeCompleteAuthSession();

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/**
 * Public client identifiers. Not secrets -- they ship inside the app
 * binary by design, which is why `EXPO_PUBLIC_` is the correct prefix.
 * The corresponding *secrets* live only in the Supabase dashboard.
 */
export const googleClientIds = {
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? null,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? null,
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? null,
} as const;

/**
 * Whether Google sign-in can run on *this* platform.
 *
 * The web client id is needed on every platform: Supabase validates the
 * `id_token` against it, so an iOS-only configuration produces a token
 * Supabase then refuses.
 */
export function googleConfigured(): boolean {
  if (!googleClientIds.web) return false;
  if (Platform.OS === 'ios') return Boolean(googleClientIds.ios);
  if (Platform.OS === 'android') return Boolean(googleClientIds.android);
  return true;
}

let appleAvailable: boolean | null = null;

/**
 * Sign in with Apple exists on iOS 13+ only, and needs the capability
 * enabled on the provisioning profile. Asking the module rather than
 * assuming means a build without the entitlement hides the button instead
 * of throwing when it is pressed.
 */
export async function appleConfigured(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (appleAvailable !== null) return appleAvailable;

  try {
    appleAvailable = await AppleAuthentication.isAvailableAsync();
  } catch {
    appleAvailable = false;
  }
  return appleAvailable;
}

/**
 * Whether the pair is ready to ship.
 *
 * Deliberately reports on both together: shipping Google without Apple on
 * iOS is an App Store rejection under guideline 4.8, so "half configured"
 * is not a state worth releasing.
 */
export async function socialSignInReady(): Promise<{
  google: boolean;
  apple: boolean;
  /** True when this platform's combination is safe to submit. */
  submittable: boolean;
}> {
  const google = googleConfigured();
  const apple = await appleConfigured();

  return {
    google,
    apple,
    submittable: Platform.OS !== 'ios' || !google || apple,
  };
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

export type SignInOutcome =
  | { status: 'signed-in' }
  | { status: 'cancelled' }
  | { status: 'not-configured' }
  | { status: 'failed'; reason?: string };

/* ------------------------------------------------------------------ */
/* Apple                                                               */
/* ------------------------------------------------------------------ */

/**
 * Sign in with Apple.
 *
 * The nonce matters and is easy to leave out: Apple signs the *hashed*
 * nonce into the token, and Supabase checks it against the raw one. Send
 * the same value for both and the token is rejected; omit it entirely and
 * the token is replayable.
 */
export async function signInWithApple(): Promise<SignInOutcome> {
  if (!(await appleConfigured())) return { status: 'not-configured' };

  try {
    const rawNonce = randomNonce();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) return { status: 'failed', reason: 'no_identity_token' };

    const { error } = await supabase().auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });

    if (error) return { status: 'failed', reason: error.message };
    return { status: 'signed-in' };
  } catch (error) {
    // Apple reports a cancelled sheet as a thrown error with this code.
    if (isCancellation(error)) return { status: 'cancelled' };
    return { status: 'failed' };
  }
}

/**
 * Apple returns the display name **only on the very first authorisation**,
 * and never again. A parent who deletes their account and signs in again
 * gets no name at all, so the name is stored on the profile at first sight
 * rather than re-read later.
 */
export function appleDisplayName(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null,
): string | null {
  if (!fullName) return null;
  const parts = [fullName.givenName, fullName.familyName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

/* ------------------------------------------------------------------ */
/* Google                                                              */
/* ------------------------------------------------------------------ */

/**
 * The Google auth request, as a hook.
 *
 * `expo-auth-session` is hook-shaped because the browser round trip has
 * to survive a re-render. The screen owns the hook; this module owns what
 * to do with the response, so the two do not drift.
 *
 * **This throws when the platform's client id is missing** -- that is
 * `expo-auth-session`'s own invariant, not something to work around. It
 * is why the caller must render the hook inside a component that only
 * mounts when `googleConfigured()` is true, rather than calling it
 * unconditionally and hoping. With no credentials configured, which is
 * this repository's default state, an unconditional call crashes the
 * sign-in screen on mount.
 */
export function useGoogleAuthRequest() {
  return Google.useIdTokenAuthRequest({
    ...(googleClientIds.ios ? { iosClientId: googleClientIds.ios } : {}),
    ...(googleClientIds.android ? { androidClientId: googleClientIds.android } : {}),
    ...(googleClientIds.web ? { clientId: googleClientIds.web } : {}),
    // Required for the nonce check Supabase performs on the id token.
    scopes: ['openid', 'profile', 'email'],
  });
}

/** Turns a completed Google auth response into a Supabase session. */
export async function completeGoogleSignIn(
  response: AuthSession.AuthSessionResult | null,
): Promise<SignInOutcome> {
  if (!googleConfigured()) return { status: 'not-configured' };
  if (!response) return { status: 'cancelled' };
  if (response.type === 'dismiss' || response.type === 'cancel') return { status: 'cancelled' };
  if (response.type !== 'success') return { status: 'failed', reason: response.type };

  const idToken = response.params['id_token'];
  if (!idToken) return { status: 'failed', reason: 'no_id_token' };

  const { error } = await supabase().auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });

  if (error) return { status: 'failed', reason: error.message };
  return { status: 'signed-in' };
}

/* ------------------------------------------------------------------ */

function randomNonce(): string {
  const bytes = Crypto.getRandomBytes(32);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function isCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED';
}
