import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Pencil, UserPlus, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getCurrentUser } from '@/services/supabase/server';
import { listChildren } from '@/features/children/queries';
import { getDictionary, format } from '@/i18n';
import { resolveLocale } from '@/i18n/server';

export const metadata: Metadata = {
  title: 'Children',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ChildrenPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/children');

  const locale = await resolveLocale();
  const t = getDictionary(locale);
  const children = await listChildren(user.id);

  return (
    <Shell>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">{t.children.title}</h1>
            <p className="mt-1.5 text-sm text-ink-soft">{t.children.subtitle}</p>
          </div>
          <Button asChild>
            <Link href="/children/new">
              <UserPlus />
              {t.children.addChild}
            </Link>
          </Button>
        </div>

        {children.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={t.children.noneTitle}
            description={t.children.noneBody}
            action={
              <Button asChild size="lg">
                <Link href="/children/new">
                  <UserPlus />
                  {t.children.addChild}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/children/${child.id}`}
                  className="group flex items-center gap-4 rounded-card border border-line bg-paper-raised p-5 shadow-page transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span
                    className="flex size-14 shrink-0 items-center justify-center rounded-pill font-display text-xl font-bold text-white"
                    style={{ background: child.avatar_color ?? 'var(--color-plum)' }}
                    aria-hidden="true"
                  >
                    {(child.nickname ?? child.name).charAt(0).toLocaleUpperCase()}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-bold text-ink">
                      {child.nickname ?? child.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-soft">
                      {child.age_years !== null
                        ? format(t.children.yearsOld, { age: child.age_years })
                        : child.preferred_language}
                    </span>
                    {child.interests.length > 0 ? (
                      <span className="mt-2 block truncate text-xs text-ink-faint">
                        {child.interests.slice(0, 4).join(' · ')}
                      </span>
                    ) : null}
                  </span>

                  <Pencil
                    className="size-4 shrink-0 text-ink-faint transition-colors group-hover:text-amber-deep"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
