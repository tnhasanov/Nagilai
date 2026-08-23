'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  deleteAccountAction,
  exportAccountDataAction,
  updateProfileAction,
} from '@/features/account/actions';
import { updatePasswordAction } from '@/features/auth/actions';
import { UI_LOCALES, type UiLocale } from '@/config/constants';
import type { Dictionary } from '@/i18n';

const LOCALE_LABELS: Record<UiLocale, string> = {
  'az-AZ': 'Azərbaycanca',
  'en-US': 'English',
  'ru-RU': 'Русский',
  'tr-TR': 'Türkçe',
};

export function ProfilePanel({
  initial,
  strings,
}: {
  initial: { displayName: string; uiLocale: UiLocale };
  strings: { settings: Dictionary['settings']; common: Dictionary['common']; auth: Dictionary['auth'] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="card space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await updateProfileAction({
            displayName: String(form.get('displayName') ?? ''),
            uiLocale: String(form.get('uiLocale') ?? 'en-US'),
            marketingOptIn: false,
          });
          if (result.ok) {
            toast.success(strings.common.save);
            router.refresh();
          } else {
            toast.error(result.error.message);
          }
        });
      }}
    >
      <h2 className="text-lg font-bold text-ink">{strings.settings.profile}</h2>

      <Field label={strings.auth.displayName} htmlFor="displayName">
        <Input id="displayName" name="displayName" defaultValue={initial.displayName} maxLength={80} />
      </Field>

      <Field
        label={strings.settings.interfaceLanguage}
        hint={strings.settings.interfaceLanguageHint}
        htmlFor="uiLocale"
      >
        <Select id="uiLocale" name="uiLocale" defaultValue={initial.uiLocale}>
          {UI_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {LOCALE_LABELS[locale]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          {strings.common.save}
        </Button>
      </div>
    </form>
  );
}

export function PasswordPanel({
  strings,
}: {
  strings: { settings: Dictionary['settings']; common: Dictionary['common']; auth: Dictionary['auth'] };
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="card space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const password = String(new FormData(form).get('password') ?? '');
        startTransition(async () => {
          const result = await updatePasswordAction({ password });
          if (result.ok) {
            toast.success(strings.settings.passwordUpdated);
            form.reset();
          } else {
            toast.error(result.error.message);
          }
        });
      }}
    >
      <h2 className="text-lg font-bold text-ink">{strings.settings.passwordTitle}</h2>

      <Field label={strings.settings.newPassword} hint={strings.auth.passwordHint} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Spinner /> : null}
          {strings.settings.updatePassword}
        </Button>
      </div>
    </form>
  );
}

/**
 * Data export and account deletion (§22).
 *
 * Both live in one panel and both are one click away, because burying
 * them is how products get compliance complaints. Deletion asks the user
 * to type a word, which is the standard guard against a mis-click that
 * cannot be undone.
 */
export function DataPanel({
  strings,
}: {
  strings: { settings: Dictionary['settings']; common: Dictionary['common'] };
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [exporting, startExport] = useTransition();
  const [deleting, startDelete] = useTransition();

  return (
    <div className="card space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">{strings.settings.dataTitle}</h2>
        <p className="mt-1.5 text-sm text-ink-soft">{strings.settings.exportHint}</p>

        <Button
          variant="secondary"
          className="mt-4"
          disabled={exporting}
          onClick={() =>
            startExport(async () => {
              const result = await exportAccountDataAction();
              if (!result.ok) {
                toast.error(result.error.message);
                return;
              }
              // Built and revoked in the browser: the export never becomes
              // a URL anyone else could fetch.
              const blob = new Blob([result.data.json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = `nagilai-export-${new Date().toISOString().slice(0, 10)}.json`;
              anchor.click();
              URL.revokeObjectURL(url);
            })
          }
        >
          {exporting ? <Spinner /> : <Download />}
          {strings.settings.exportData}
        </Button>
      </div>

      <div className="border-t border-line pt-6">
        <h3 className="text-base font-bold text-rose">{strings.settings.deleteAccount}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{strings.settings.deleteHint}</p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={strings.settings.deleteConfirmLabel}
            aria-label={strings.settings.deleteConfirmLabel}
            className="sm:max-w-xs"
          />
          <Button
            variant="danger"
            disabled={deleting || confirmation.trim().toLowerCase() !== 'delete'}
            onClick={() =>
              startDelete(async () => {
                const result = await deleteAccountAction(confirmation);
                if (result.ok) {
                  router.push('/');
                  router.refresh();
                } else {
                  toast.error(result.error.message);
                }
              })
            }
          >
            {deleting ? <Spinner /> : <Trash2 />}
            {strings.settings.deleteAccount}
          </Button>
        </div>
      </div>
    </div>
  );
}
