import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms on which Nagilai is provided.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="23 August 2026">
      <LegalSection heading="Who may use Nagilai">
        <p>
          You must be an adult, and you must be the parent or guardian of any child whose details you enter, or
          have their guardian&apos;s permission. One account is for one household.
        </p>
      </LegalSection>

      <LegalSection heading="What you may make">
        <p>
          Stories for the children in your household. You may not use Nagilai to generate content about a real
          person who is not in your care, to produce material that is sexual, violent, hateful or otherwise
          unsuitable for children, or to attempt to bypass the safety checks.
        </p>
        <p>
          Requests are checked automatically. If a request is refused, no credit is spent.
        </p>
      </LegalSection>

      <LegalSection heading="Who owns the stories">
        <p>
          You do. The stories, illustrations and audio made from your prompts are yours to read, print, share
          and give away, including as a physical book. We keep a licence to store and process them only so we
          can show them to you and produce the files you ask for.
        </p>
      </LegalSection>

      <LegalSection heading="Credits and payment">
        <p>
          Generation costs credits. New accounts receive a starting balance. Credits are consumed when work is
          produced, and are returned automatically when something fails on our side.
        </p>
        <p>
          Prices, plan entitlements and credit costs are shown on the pricing page and may change; a change
          never applies retroactively to something you have already made.
        </p>
      </LegalSection>

      <LegalSection heading="What we cannot promise">
        <p>
          Stories and illustrations are generated, so they vary. We check for age-appropriateness, but we
          cannot guarantee that every sentence will suit every family. Read a story before reading it aloud if
          that matters to you, and tell us when something comes out wrong.
        </p>
        <p>
          The service is provided as it is. We aim to keep it available and to keep your library intact, but we
          do not guarantee uninterrupted availability.
        </p>
      </LegalSection>

      <LegalSection heading="Ending your account">
        <p>
          You can delete your account at any time from Settings, which removes everything. We may suspend an
          account that repeatedly attempts to generate prohibited content.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
