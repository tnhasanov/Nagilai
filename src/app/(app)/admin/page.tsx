import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  BookOpen,
  Coins,
  Image as ImageIcon,
  ListChecks,
  Mic,
  ShieldAlert,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { getDashboardMetrics, listCostBreakdown } from '@/features/admin/queries';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';
import { formatMicroUsd, formatMoney } from '@/lib/utils';
import { isAppError } from '@/lib/errors';

/**
 * The admin dashboard (§18).
 *
 * Aggregates only — user counts, story counts by language and theme,
 * asset counts, AI spend and failure rates. There is deliberately no
 * screen anywhere in this area that shows an individual child's profile
 * or the text of somebody's story; the RLS policies in migration 0007
 * enforce that rather than relying on nobody building the page.
 */
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const locale = await resolveLocale();
  const t = getDictionary(locale);

  let metrics;
  let costs;
  try {
    [metrics, costs] = await Promise.all([getDashboardMetrics(30), listCostBreakdown(30)]);
  } catch (error) {
    if (isAppError(error) && (error.code === 'forbidden' || error.code === 'unauthenticated')) {
      redirect('/library');
    }
    throw error;
  }

  return (
    <Shell showFooter={false}>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-ink">{t.admin.title}</h1>
            <p className="mt-1.5 text-sm text-ink-soft">{t.admin.last30Days}</p>
          </div>
          <nav className="flex gap-2">
            <Link
              href="/admin/jobs"
              className="rounded-pill bg-paper-sunken px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              {t.admin.jobs}
            </Link>
            <Link
              href="/admin/moderation"
              className="rounded-pill bg-paper-sunken px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              {t.admin.moderation}
            </Link>
            <Link
              href="/admin/settings"
              className="rounded-pill bg-paper-sunken px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              {t.admin.settings}
            </Link>
          </nav>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={<Users />} label={t.admin.totalUsers} value={metrics.users.total} sub={`+${metrics.users.new}`} />
          <Metric icon={<Users />} label={t.admin.childProfiles} value={metrics.children.total} />
          <Metric
            icon={<BookOpen />}
            label={t.admin.storiesGenerated}
            value={metrics.stories.recent}
            sub={`${metrics.stories.total} total`}
          />
          <Metric
            icon={<AlertTriangle />}
            label={t.admin.failedGenerations}
            value={metrics.stories.failed}
            tone={metrics.stories.failed > 0 ? 'rose' : 'neutral'}
          />
          <Metric icon={<ImageIcon />} label={t.admin.imagesGenerated} value={metrics.assets.images} />
          <Metric icon={<Mic />} label={t.admin.narrationsGenerated} value={metrics.assets.narrations} />
          <Metric
            icon={<Coins />}
            label={t.admin.aiCost}
            value={formatMicroUsd(metrics.aiCost.totalMicroUsd)}
            tone="amber"
          />
          <Metric
            icon={<Coins />}
            label={t.admin.revenue}
            value={formatMoney(metrics.commerce.revenueMinor, 'USD')}
            tone="sage"
          />
          <Metric icon={<ListChecks />} label={t.admin.queued} value={metrics.jobs.queued} />
          <Metric icon={<ListChecks />} label={t.admin.running} value={metrics.jobs.running} />
          <Metric
            icon={<ShieldAlert />}
            label={t.admin.moderation}
            value={metrics.moderation.flagged}
            tone={metrics.moderation.flagged > 0 ? 'rose' : 'neutral'}
          />
          <Metric icon={<Users />} label={t.admin.subscriptions} value={metrics.commerce.activeSubscriptions} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Breakdown title={t.admin.byLanguage} data={metrics.stories.byLanguage} empty={t.admin.noData} />
          <Breakdown title={t.admin.byTheme} data={metrics.stories.byTheme} empty={t.admin.noData} />
        </div>

        <section className="card mt-6 overflow-hidden p-0">
          <h2 className="border-b border-line px-6 py-4 text-base font-bold text-ink">{t.admin.costs}</h2>
          {costs.length === 0 ? (
            <p className="px-6 py-8 text-sm text-ink-faint">{t.admin.noData}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-paper-sunken text-left text-xs uppercase tracking-wide text-ink-faint">
                  <tr>
                    <th className="px-6 py-3 font-bold">Operation</th>
                    <th className="px-6 py-3 font-bold">Model</th>
                    <th className="px-6 py-3 text-right font-bold">Calls</th>
                    <th className="px-6 py-3 text-right font-bold">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {costs.map((row) => (
                    <tr key={`${row.operation}:${row.model}`}>
                      <td className="px-6 py-3 text-ink">{row.operation}</td>
                      <td className="px-6 py-3 font-mono text-xs text-ink-soft">{row.model}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-ink-soft">{row.calls}</td>
                      <td className="px-6 py-3 text-right font-semibold tabular-nums text-ink">
                        {formatMicroUsd(row.costMicroUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}

const TONES = {
  neutral: 'bg-paper-sunken text-ink-soft',
  amber: 'bg-amber-soft text-amber-deep',
  sage: 'bg-sage-soft text-sage',
  rose: 'bg-rose-soft text-rose',
} as const;

function Metric({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="card p-5">
      <div className={`flex size-9 items-center justify-center rounded-tile ${TONES[tone]} [&_svg]:size-4`}>
        {icon}
      </div>
      <p className="mt-3.5 text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-ink-faint">{label}</p>
      {sub ? <p className="mt-1 text-[0.7rem] text-ink-faint">{sub}</p> : null}
    </div>
  );
}

function Breakdown({
  title,
  data,
  empty,
}: {
  title: string;
  data: Record<string, number>;
  empty: string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 1;

  return (
    <section className="card">
      <h2 className="mb-4 text-base font-bold text-ink">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {entries.slice(0, 10).map(([key, count]) => (
            <li key={key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs font-semibold text-ink-soft">{key}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-pill bg-paper-sunken">
                <span
                  className="block h-full rounded-pill bg-amber"
                  style={{ width: `${Math.max(4, (count / max) * 100)}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-faint">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
