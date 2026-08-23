import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { SettingEditor } from '@/components/admin/setting-editor';
import { requireAdmin } from '@/features/admin/queries';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';
import { isAppError } from '@/lib/errors';

/**
 * Business configuration (§18).
 *
 * Credits, model ids, rate limits, plan entitlements, feature flags and
 * safety categories are all editable here as JSON, and every save is
 * written to the audit log. The point of the specification's "do not
 * require code deployment for simple business configuration changes" is
 * that this page exists at all.
 */
export const metadata: Metadata = { title: 'Configuration', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const locale = await resolveLocale();
  const t = getDictionary(locale);

  try {
    await requireAdmin();
  } catch (error) {
    if (isAppError(error)) redirect('/library');
    throw error;
  }

  const { data: settings } = await supabaseAdmin()
    .from('app_settings')
    .select('key, value, description')
    .order('key');

  return (
    <Shell showFooter={false}>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="mb-2 font-display text-3xl font-bold text-ink">{t.admin.settings}</h1>
        <p className="mb-8 text-sm text-ink-soft">
          Changes take effect within a minute. Every save is recorded in the audit log.
        </p>

        <div className="space-y-5">
          {(settings ?? []).map((setting) => (
            <SettingEditor
              key={setting.key}
              settingKey={setting.key}
              description={setting.description}
              value={JSON.stringify(setting.value, null, 2)}
              saveLabel={t.common.save}
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}
