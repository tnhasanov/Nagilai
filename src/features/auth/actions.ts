'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { errors } from '@/lib/errors';
import { attempt, type ActionResult } from '@/lib/result';
import { supabaseServer } from '@/services/supabase/server';
import { enforce } from '@/services/ratelimit';
import { siteUrl } from '@/config/env';
import { isUiLocale } from '@/config/constants';

/**
 * Authentication (§22).
 *
 * Delegates to Supabase Auth: password hashing, email verification,
 * password reset, session cookies and OAuth are all handled there rather
 * than reimplemented. What lives here is validation, rate limiting and the
 * redirect plumbing.
 *
 * Errors are deliberately vague about whether an address exists -- a
 * signup or reset form that distinguishes "no such user" from "wrong
 * password" is an account-enumeration oracle.
 */

const emailSchema = z.string().trim().toLowerCase().email('Please enter a valid email address.');
const passwordSchema = z
  .string()
  .min(10, 'Please use at least 10 characters.')
  .max(128, 'That password is too long.');

const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().max(80).optional().or(z.literal('')),
  uiLocale: z.string().optional(),
  marketingOptIn: z.boolean().default(false),
});

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Please enter your password.'),
});

export async function signUpAction(input: unknown): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  return attempt(async () => {
    const parsed = signUpSchema.parse(input);
    await enforce('auth', await clientKey(parsed.email));

    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.email,
      password: parsed.password,
      options: {
        emailRedirectTo: `${siteUrl()}/auth/callback?next=/library`,
        data: {
          display_name: parsed.displayName || null,
          ui_locale: isUiLocale(parsed.uiLocale) ? parsed.uiLocale : 'en-US',
          marketing_opt_in: parsed.marketingOptIn,
        },
      },
    });

    if (error) {
      throw errors.validation(
        error.message.toLowerCase().includes('already')
          ? 'If that address can be used, we have sent a confirmation email.'
          : 'We could not create your account. Please check the details and try again.',
      );
    }

    // Supabase returns a user with no identities when the address is
    // already registered. Treat it identically to a fresh signup.
    const needsConfirmation = !data.session;
    return { needsConfirmation };
  });
}

export async function signInAction(input: unknown): Promise<ActionResult<{ signedIn: boolean }>> {
  return attempt(async () => {
    const parsed = signInSchema.parse(input);
    await enforce('auth', await clientKey(parsed.email));

    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password,
    });

    if (error) throw errors.validation('That email and password did not match. Please try again.');
    return { signedIn: true };
  });
}

export async function sendMagicLinkAction(input: unknown): Promise<ActionResult<{ sent: boolean }>> {
  return attempt(async () => {
    const email = emailSchema.parse((input as { email?: unknown })?.email);
    await enforce('auth', await clientKey(email));

    const supabase = await supabaseServer();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=/library` },
    });

    // Always report success: whether the address exists is not the
    // caller's business.
    return { sent: true };
  });
}

export async function requestPasswordResetAction(input: unknown): Promise<ActionResult<{ sent: boolean }>> {
  return attempt(async () => {
    const email = emailSchema.parse((input as { email?: unknown })?.email);
    await enforce('auth', await clientKey(email));

    const supabase = await supabaseServer();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/settings/password`,
    });

    return { sent: true };
  });
}

export async function updatePasswordAction(input: unknown): Promise<ActionResult<{ updated: boolean }>> {
  return attempt(async () => {
    const password = passwordSchema.parse((input as { password?: unknown })?.password);

    const supabase = await supabaseServer();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw errors.validation('We could not update your password. Please try again.');

    return { updated: true };
  });
}

export async function signInWithGoogleAction(): Promise<void> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteUrl()}/auth/callback?next=/library` },
  });

  if (error || !data.url) {
    redirect('/login?error=google');
  }
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/');
}

/**
 * Rate-limit subject.
 *
 * Combines the address with the client IP so neither a single address nor
 * a single host can be hammered, and one attacker cannot lock out an
 * innocent account by exhausting its budget alone.
 */
async function clientKey(email: string): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || headerList.get('x-real-ip') || 'unknown';
  return `${ip}:${email}`;
}
