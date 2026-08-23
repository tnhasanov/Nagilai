import { getCurrentUser, supabaseServer } from '@/services/supabase/server';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';
import { SiteHeader } from './site-header';
import { SiteFooter } from './site-footer';

/**
 * The application shell.
 *
 * A server component so the header can render with the right navigation,
 * locale and credit balance in the first paint — no flash of signed-out
 * chrome on a signed-in page.
 */
export async function Shell({
  children,
  showFooter = true,
}: {
  children: React.ReactNode;
  showFooter?: boolean;
}) {
  const locale = await resolveLocale();
  const dictionary = getDictionary(locale);
  const user = await getCurrentUser();

  let creditBalance: number | null = null;
  let isStaff = false;

  if (user) {
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from('profiles')
      .select('credit_balance, role')
      .eq('id', user.id)
      .maybeSingle();

    creditBalance = data?.credit_balance ?? 0;
    isStaff = data?.role === 'admin' || data?.role === 'support';
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        strings={dictionary.nav}
        locale={locale}
        isAuthenticated={Boolean(user)}
        isStaff={isStaff}
        creditBalance={creditBalance}
      />
      <main className="flex-1">{children}</main>
      {showFooter ? <SiteFooter strings={dictionary.nav} /> : null}
    </div>
  );
}
