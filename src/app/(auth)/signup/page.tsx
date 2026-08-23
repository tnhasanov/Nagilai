import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/site/auth-form';
import { SkeletonBlock } from '@/components/ui/spinner';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';

export const metadata: Metadata = {
  title: 'Create your account',
  robots: { index: false, follow: false },
};

export default async function Page() {
  const locale = await resolveLocale();
  const t = getDictionary(locale);

  return (
    <Suspense fallback={<SkeletonBlock className="h-96 w-full" />}>
      <AuthForm mode="sign-up" strings={t.auth} />
    </Suspense>
  );
}
