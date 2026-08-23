import Link from 'next/link';
import { Brand } from './brand';

/**
 * Site footer.
 *
 * Carries the legal and support links §20 asks for. Kept quiet — a
 * parent's last impression of the page should be the product, not a
 * sitemap.
 */
export function SiteFooter({
  strings,
}: {
  strings: { pricing: string; faq: string; about: string; contact: string };
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-line bg-paper-sunken/60">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Brand />
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              Personalised storybooks in Azerbaijani, English, Russian and Turkish — written, illustrated and
              narrated for one child in particular.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm sm:grid-cols-3">
            <FooterLink href="/pricing">{strings.pricing}</FooterLink>
            <FooterLink href="/faq">{strings.faq}</FooterLink>
            <FooterLink href="/about">{strings.about}</FooterLink>
            <FooterLink href="/contact">{strings.contact}</FooterLink>
            <FooterLink href="/privacy">Privacy</FooterLink>
            <FooterLink href="/terms">Terms</FooterLink>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Nagilai. Made for families.</p>
          <p>Stories are private by default and never used to train models.</p>
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
