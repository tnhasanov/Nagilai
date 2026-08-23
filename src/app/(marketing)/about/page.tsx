import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { SectionHeading } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'About',
  description: 'Why Nagilai exists.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeading eyebrow="About" title="Every child deserves to be the hero of a book" className="mb-10" />

        <div className="prose-story space-y-6 text-ink-soft">
          <p>
            Children see themselves in stories long before they can read them. A child who hears their own name
            in a book — their own curiosity, their own stubbornness, their own favourite animal wandering
            through the plot — listens differently.
          </p>
          <p>
            Nagilai exists so a parent can make that book on a Tuesday evening, in the language spoken at home,
            in the ten minutes before bed. Not a template with a name dropped in, but a story written for that
            child, illustrated so they look like themselves on every page, and read aloud in a voice that is
            not in a hurry.
          </p>
          <p>
            The name comes from <em>nağıl</em> — the Azerbaijani word for a tale. Azerbaijani was the first
            language we built for, because children who grow up between languages are usually the last to be
            offered books of their own.
          </p>
          <p>
            We are careful with what families tell us. A child&apos;s details stay in one account, are never
            published, and are never used to train a model. Books are private until a parent decides otherwise,
            and every story is checked for age-appropriateness before anyone sees it.
          </p>
        </div>
      </div>
    </Shell>
  );
}
