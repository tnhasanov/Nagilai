import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { RequeueButton } from '@/components/admin/requeue-button';
import { listFailedJobs } from '@/features/admin/queries';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';
import { isAppError } from '@/lib/errors';

/**
 * Failed and dead-lettered jobs (§18, §32).
 *
 * The technical error is shown here and nowhere a customer can reach it.
 * Requeue resets the attempt counter and nudges the worker.
 */
export const metadata: Metadata = { title: 'Jobs', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminJobsPage() {
  const locale = await resolveLocale();
  const t = getDictionary(locale);

  let jobs;
  try {
    jobs = await listFailedJobs(50);
  } catch (error) {
    if (isAppError(error) && (error.code === 'forbidden' || error.code === 'unauthenticated')) {
      redirect('/library');
    }
    throw error;
  }

  return (
    <Shell showFooter={false}>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="mb-8 font-display text-3xl font-bold text-ink">{t.admin.jobs}</h1>

        {jobs.length === 0 ? (
          <p className="card text-sm text-ink-faint">{t.admin.noData}</p>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id} className="card flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
                    <span className="font-mono text-xs">{job.type}</span>
                    <span
                      className={`rounded-pill px-2 py-0.5 text-[0.65rem] uppercase tracking-wide ${
                        job.status === 'dead_letter' ? 'bg-rose-soft text-rose' : 'bg-amber-soft text-amber-deep'
                      }`}
                    >
                      {job.status}
                    </span>
                    <span className="text-xs font-normal text-ink-faint">attempt {job.attempts}</span>
                  </p>
                  {job.errorMessage ? (
                    <p className="mt-2 break-words font-mono text-xs leading-relaxed text-ink-soft">
                      {job.errorMessage}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[0.7rem] text-ink-faint">
                    {new Date(job.createdAt).toLocaleString()}
                    {job.storyId ? ` · story ${job.storyId.slice(0, 8)}` : ''}
                  </p>
                </div>

                <RequeueButton jobId={job.id} label={t.admin.requeue} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
