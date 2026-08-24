import Link from 'next/link';
import { Brand } from './brand';
import { format } from '@/i18n';

/**
 * Site footer.
 *
 * Carries the legal and support links §20 asks for. Kept quiet — a
 * parent's last impression of the page should be the product, not a
 * sitemap.
 *
 * All of it translated. It used to take its four nav labels from the
 * dictionary and leave everything around them in English, so an
 * Azerbaijani parent got Azerbaijani links wrapped in an English
 * paragraph, English "Privacy · Terms", and an English copyright line.
 */
export function SiteFooter({
  strings,
}: {
  strings: {
    pricing: string;
    faq: string;
    about: string;
    contact: string;
    privacy: string;
    terms: string;
    blurb: string;
    rights: string;
    privacyNote: string;
  };
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-line bg-paper-sunken/60">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Brand />
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">{strings.blurb}</p>
          </div>

          <nav className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm sm:grid-cols-3">
            <FooterLink href="/pricing">{strings.pricing}</FooterLink>
            <FooterLink href="/faq">{strings.faq}</FooterLink>
            <FooterLink href="/about">{strings.about}</FooterLink>
            <FooterLink href="/contact">{strings.contact}</FooterLink>
            <FooterLink href="/privacy">{strings.privacy}</FooterLink>
            <FooterLink href="/terms">{strings.terms}</FooterLink>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>{format(strings.rights, { year })}</p>
          <p>{strings.privacyNote}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink-soft transition-colors hover:text-amber-deep">
      {children}
    </Link>
  );
}
