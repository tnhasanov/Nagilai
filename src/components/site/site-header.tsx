'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, LogOut, Menu, Settings, Sparkles, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Brand } from './brand';
import { LocaleSwitcher } from './locale-switcher';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/features/auth/actions';
import { cn } from '@/lib/utils';
import type { UiLocale } from '@/config/constants';

export interface HeaderStrings {
  /** From `common`, not `nav`: shared chrome labels. */
  menu: string;
  interfaceLanguage: string;
  library: string;
  create: string;
  children: string;
  settings: string;
  admin: string;
  signIn: string;
  signOut: string;
  signUp: string;
  pricing: string;
  faq: string;
  about: string;
}

/**
 * The site header.
 *
 * One component for both the signed-out marketing pages and the signed-in
 * app, because the transition between them should not feel like walking
 * into a different building. Signing in swaps the navigation and adds the
 * credit balance; the shell stays put.
 */
export function SiteHeader({
  strings,
  locale,
  isAuthenticated,
  isStaff,
  creditBalance,
}: {
  strings: HeaderStrings;
  locale: UiLocale;
  isAuthenticated: boolean;
  isStaff: boolean;
  creditBalance: number | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  interface NavLink {
    href: string;
    label: string;
    icon?: LucideIcon;
  }

  const appLinks: NavLink[] = [
    { href: '/library', label: strings.library, icon: BookOpen },
    { href: '/create', label: strings.create, icon: Sparkles },
    { href: '/children', label: strings.children, icon: Users },
  ];

  const marketingLinks: NavLink[] = [
    { href: '/pricing', label: strings.pricing },
    { href: '/faq', label: strings.faq },
    { href: '/about', label: strings.about },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Brand href={isAuthenticated ? '/library' : '/'} />

        <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex">
          {(isAuthenticated ? appLinks : marketingLinks).map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-pill px-3.5 py-2 text-sm font-semibold transition-colors',
                  active ? 'bg-amber-soft text-amber-deep' : 'text-ink-soft hover:bg-paper-sunken hover:text-ink',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAuthenticated && creditBalance !== null ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-pill bg-amber-soft px-3 py-1.5 text-sm font-bold text-amber-deep"
              title={`${creditBalance} credits`}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              {creditBalance}
            </span>
          ) : null}

          <LocaleSwitcher current={locale} label={strings.interfaceLanguage} className="hidden sm:inline-flex" />

          {isAuthenticated ? (
            <div className="hidden items-center gap-1 md:flex">
              {isStaff ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin">{strings.admin}</Link>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="icon" aria-label={strings.settings}>
                <Link href="/settings">
                  <Settings />
                </Link>
              </Button>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="icon" aria-label={strings.signOut}>
                  <LogOut />
                </Button>
              </form>
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{strings.signIn}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">{strings.signUp}</Link>
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="rounded-pill p-2 text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink md:hidden"
            aria-expanded={mobileOpen}
            aria-label={strings.menu}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-line bg-paper-raised md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4">
            {(isAuthenticated ? appLinks : marketingLinks).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-tile px-3 py-3 text-[0.95rem] font-semibold text-ink transition-colors hover:bg-paper-sunken"
              >
                {link.icon ? <link.icon className="size-4 text-ink-faint" aria-hidden="true" /> : null}
                {link.label}
              </Link>
            ))}

            <div className="my-2 h-px bg-line" />

            {isAuthenticated ? (
              <>
                {isStaff ? (
                  <Link
                    href="/admin"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-tile px-3 py-3 text-[0.95rem] font-semibold text-ink"
                  >
                    {strings.admin}
                  </Link>
                ) : null}
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-tile px-3 py-3 text-[0.95rem] font-semibold text-ink"
                >
                  {strings.settings}
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-tile px-3 py-3 text-left text-[0.95rem] font-semibold text-ink-soft"
                  >
                    {strings.signOut}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-col gap-2 pt-1">
                <Button asChild variant="secondary">
                  <Link href="/login" onClick={() => setMobileOpen(false)}>
                    {strings.signIn}
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/signup" onClick={() => setMobileOpen(false)}>
                    {strings.signUp}
                  </Link>
                </Button>
              </div>
            )}

            <div className="pt-3">
              <LocaleSwitcher current={locale} label={strings.interfaceLanguage} />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
