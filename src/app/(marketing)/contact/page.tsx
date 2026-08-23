import { Mail } from 'lucide-react';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { SectionHeading } from '@/components/ui/card';
import { getSetting } from '@/services/config/settings';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Nagilai team.',
  alternates: { canonical: '/contact' },
};

export const revalidate = 3600;

export default async function ContactPage() {
  const branding = await getSetting('branding');

  return (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeading
          title="Talk to us"
          description="Questions about your account, a story that did not come out right, or an idea for what Nagilai should do next — we read everything."
          align="center"
          className="mb-10"
        />

        <a
          href={`mailto:${branding.support_email}`}
          className="card flex items-center gap-4 p-6 transition-all hover:-translate-y-0.5 hover:shadow-lift"
        >
          <span className="flex size-12 items-center justify-center rounded-tile bg-amber-soft text-amber-deep">
            <Mail className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-bold text-ink">Email us</span>
            <span className="block text-sm text-ink-soft">{branding.support_email}</span>
          </span>
        </a>

        <p className="mt-6 text-center text-xs text-ink-faint">
          For anything about a child&apos;s data, write from the address on the account and we will reply within
          two working days.
        </p>
      </div>
    </Shell>
  );
}
