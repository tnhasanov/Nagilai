'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  requestPasswordResetAction,
  sendMagicLinkAction,
  signInAction,
  signInWithGoogleAction,
  signUpAction,
} from '@/features/auth/actions';
import type { Dictionary } from '@/i18n';

type Mode = 'sign-in' | 'sign-up' | 'reset';

/**
 * Sign-in, sign-up and password reset in one component.
 *
 * The three forms share a shell so switching between them does not feel
 * like navigating: the card stays, the fields change. Errors come back
 * from the server action as a friendly message and are shown inline
 * rather than as a toast, because they need to be read, not glanced at.
 */
export function AuthForm({ mode, strings }: { mode: Mode; strings: Dictionary['auth'] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const next = searchParams.get('next') ?? '/library';

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const displayName = String(form.get('displayName') ?? '');

    startTransition(async () => {
      if (mode === 'reset') {
        const result = await requestPasswordResetAction({ email });
        if (result.ok) setNotice(strings.resetSent);
        else setError(result.error.message);
        return;
      }

      if (mode === 'sign-up') {
        const result = await signUpAction({ email, password, displayName, marketingOptIn: false });
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        if (result.data.needsConfirmation) {
          setNotice(strings.confirmEmail);
          return;
        }
        router.push(next);
        router.refresh();
        return;
      }

      const result = await signInAction({ email, password });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  function handleMagicLink(email: string) {
    if (!email) {
      setError(strings.email);
      return;
    }
    startTransition(async () => {
      const result = await sendMagicLinkAction({ email });
      if (result.ok) {
        setNotice(strings.magicLinkSent);
        toast.success(strings.magicLinkSent);
      } else {
        setError(result.error.message);
      }
    });
  }

  const title = mode === 'sign-in' ? strings.signInTitle : mode === 'sign-up' ? strings.signUpTitle : strings.resetTitle;
  const subtitle =
    mode === 'sign-in' ? strings.signInSubtitle : mode === 'sign-up' ? strings.signUpSubtitle : strings.resetSubtitle;

  return (
    <div className="card p-7 sm:p-9">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>

      {mode !== 'reset' ? (
        <>
          <form action={signInWithGoogleAction} className="mt-7">
            <Button type="submit" variant="secondary" size="lg" className="w-full">
              <GoogleMark />
              {strings.withGoogle}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {strings.orDivider}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'sign-up' ? (
          <Field label={strings.displayName} htmlFor="displayName">
            <Input id="displayName" name="displayName" autoComplete="name" maxLength={80} />
          </Field>
        ) : null}

        <Field label={strings.email} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            autoFocus={mode !== 'sign-up'}
          />
        </Field>

        {mode !== 'reset' ? (
          <Field
            label={strings.password}
            htmlFor="password"
            hint={mode === 'sign-up' ? strings.passwordHint : undefined}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'sign-up' ? 10 : undefined}
            />
          </Field>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-tile bg-rose-soft px-4 py-3 text-sm font-medium text-rose">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-tile bg-sage-soft px-4 py-3 text-sm font-medium text-sage">{notice}</p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Spinner /> : null}
          {mode === 'sign-in'
            ? strings.signInAction
            : mode === 'sign-up'
              ? strings.signUpAction
              : strings.resetAction}
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        {mode === 'sign-in' ? (
          <>
            <p>
              <MagicLinkButton onClick={handleMagicLink} label={strings.magicLink} disabled={pending} />
            </p>
            <p>
              <Link href="/forgot-password" className="font-medium text-ink-soft hover:text-amber-deep">
                {strings.forgotPassword}
              </Link>
            </p>
            <p className="text-ink-faint">
              {strings.noAccount}{' '}
              <Link href="/signup" className="font-semibold text-amber-deep hover:underline">
                {strings.signUpAction}
              </Link>
            </p>
          </>
        ) : (
          <p className="text-ink-faint">
            {strings.haveAccount}{' '}
            <Link href="/login" className="font-semibold text-amber-deep hover:underline">
              {strings.signInAction}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

/** Reads the email out of the sibling form so the link can be sent without a second field. */
function MagicLinkButton({
  onClick,
  label,
  disabled,
}: {
  onClick: (email: string) => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        const form = event.currentTarget.closest('.card')?.querySelector('form:last-of-type');
        const input = form?.querySelector<HTMLInputElement>('input[name="email"]');
        onClick(input?.value.trim() ?? '');
      }}
      className="font-medium text-ink-soft underline-offset-4 hover:text-amber-deep hover:underline disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.05rem]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}
