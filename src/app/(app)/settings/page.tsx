import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { DataPanel, PasswordPanel, ProfilePanel } from '@/components/site/settings-panels';
import { getCurrentUser, supabaseServer } from '@/services/supabase/server';
import { getDictionary, format } from '@/i18n';
import { resolveLocale } from '@/i18n/server';
import { DEFAULT_UI_LOCALE, isUiLocale } from '@/config/constants';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/settings');

  const locale = await resolveLocale();
  const t = getDictionary(locale);

  const supabase = await supabaseServer();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, ui_locale, credit_balance')
    .eq('id', user.id)
    .maybeSingle();

  const storedLocale = profile?.ui_locale;

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="mb-8 font-display text-3xl font-bold text-ink">{t.settings.title}</h1>

        <div className="mb-8 flex items-center justify-between rounded-card border border-line bg-amber-soft px-6 py-5">
          <div>
            <p className="text-sm font-bold text-amber-deep">{t.settings.credits}</p>
            <p className="mt-0.5 text-sm text-ink-soft">
              {format(t.settings.creditsBalance, { count: profile?.credit_balance ?? 0 })}
            </p>
          </div>
          <Sparkles className="size-6 text-amber-deep" aria-hidden="true" />
        </div>

        <div className="space-y-6">
          <ProfilePanel
            initial={{
              displayName: profile?.display_name ?? '',
              uiLocale: isUiLocale(storedLocale) ? storedLocale : DEFAULT_UI_LOCALE,
            }}
            strings={{ settings: t.settings, common: t.common, auth: t.auth }}
          />
          <PasswordPanel strings={{ settings: t.settings, common: t.common, auth: t.auth }} />
          <DataPanel strings={{ settings: t.settings, common: t.common }} />
        </div>
      </div>
    </Shell>
  );
}
