import { Shell } from '@/components/site/shell';

/**
 * Shell for the legal placeholders (§20).
 *
 * These are drafts written to be honest about how the product actually
 * behaves — not a copied template. They still need review by a lawyer
 * before launch, which the banner says plainly rather than pretending
 * otherwise.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:py-24">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">{title}</h1>
        <p className="mt-2 text-xs text-ink-faint">Last updated {updated}</p>

        <p className="mt-6 rounded-tile bg-amber-soft px-5 py-4 text-sm font-medium leading-relaxed text-amber-deep">
          Draft. This describes how Nagilai actually works today, but it has not yet been reviewed by a
          lawyer and is not a substitute for one.
        </p>

        <div className="mt-10 space-y-8 text-[0.95rem] leading-relaxed text-ink-soft">{children}</div>
      </div>
    </Shell>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-bold text-ink">{heading}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
