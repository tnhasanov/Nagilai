import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { Badge } from '@/components/ui/badge';
import { listModerationEvents } from '@/features/admin/queries';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';
import { isAppError } from '@/lib/errors';

/**
 * Moderation log (§7, §18).
 *
 * Shows what was flagged or blocked and why. Excerpts are truncated at
 * the database layer and are absent entirely for allowed content, so this
 * page cannot become a window into what families are writing.
 */
export const metadata: Metadata = { title: 'Moderation', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminModerationPage() {
  const locale = await resolveLocale();
  const t = getDictionary(locale);

  let events;
  try {
    events = await listModerationEvents(50);
  } catch (error) {
    if (isAppError(error) && (error.code === 'forbidden' || error.code === 'unauthenticated')) {
      redirect('/library');
    }
    throw error;
  }

  return (
    <Shell showFooter={false}>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="mb-8 font-display text-3xl font-bold text-ink">{t.admin.moderation}</h1>

        {events.length === 0 ? (
          <p className="card text-sm text-ink-faint">{t.admin.noData}</p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={event.outcome === 'blocked' ? 'rose' : 'amber'}>{event.outcome}</Badge>
                  <span className="font-mono text-xs text-ink-soft">{event.stage}</span>
                  <span className="ml-auto text-[0.7rem] text-ink-faint">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>

                {event.categories.length > 0 ? (
                  <p className="mt-2.5 flex flex-wrap gap-1.5">
                    {event.categories.map((category) => (
                      <span
                        key={category}
                        className="rounded-pill bg-paper-sunken px-2 py-0.5 font-mono text-[0.7rem] text-ink-soft"
                      >
                        {category}
                      </span>
                    ))}
                  </p>
                ) : null}

                {event.excerpt ? (
                  <p className="mt-3 rounded-tile bg-paper-sunken px-4 py-3 text-xs leading-relaxed text-ink-soft">
                    {event.excerpt}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
