'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { setLocaleAction } from '@/features/account/actions';
import { UI_LOCALES, type UiLocale } from '@/config/constants';
import { cn } from '@/lib/utils';

const LABELS: Record<UiLocale, string> = {
  'az-AZ': 'Azərbaycanca',
  'en-US': 'English',
  'ru-RU': 'Русский',
  'tr-TR': 'Türkçe',
};

/**
 * Interface language switcher (§13).
 *
 * Changes only the interface. A parent reading the app in Azerbaijani can
 * still create a Russian story, and switching here never touches an
 * existing story's language.
 */
export function LocaleSwitcher({
  current,
  label,
  className,
}: {
  current: UiLocale;
  /** Localised, because a screen reader in Azerbaijani should not
      announce this control in English. */
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <Globe className="pointer-events-none absolute left-3 size-4 text-ink-faint" aria-hidden="true" />
      <select
        aria-label={label}
        value={current}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            await setLocaleAction(next);
            router.refresh();
          });
        }}
        className="h-10 cursor-pointer appearance-none rounded-pill border border-line bg-transparent py-0 pl-9 pr-8 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink focus:border-amber focus:outline-none"
      >
        {UI_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LABELS[locale]}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3 size-3.5 text-ink-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="m6 8 4 4 4-4" />
      </svg>
    </div>
  );
}
