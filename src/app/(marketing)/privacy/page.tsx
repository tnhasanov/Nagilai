import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Nagilai stores about you and your child, and what it never does.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="23 August 2026">
      <LegalSection heading="Who this is about">
        <p>
          Nagilai is used by adults to make books for children. The account belongs to the parent or guardian.
          Children do not sign in, and we do not knowingly collect information directly from a child.
        </p>
      </LegalSection>

      <LegalSection heading="What we store">
        <p>
          About you: your email address, your display name if you give one, your interface language, and your
          credit balance and payment records if you buy something.
        </p>
        <p>
          About your child: only what you type into a child profile — a name or nickname, an age, a language,
          interests, personality notes, and anything you write in the free-text fields. You choose all of it,
          and you can change or remove it at any time.
        </p>
        <p>
          About the stories: the text, illustrations, audio and PDFs that are generated, plus a record of which
          model produced them and what it cost us.
        </p>
      </LegalSection>

      <LegalSection heading="What we do not do">
        <p>We do not use your child&apos;s information, or anything you generate, to train any AI model.</p>
        <p>We do not sell personal information, and we do not share it with advertisers.</p>
        <p>
          We do not publish anything by default. A story is visible only to your account until you deliberately
          create a share link, and even then a visitor is shown only the child&apos;s display name — never their
          age, interests, notes or profile.
        </p>
        <p>Photograph upload is currently switched off, so we do not hold pictures of children.</p>
      </LegalSection>

      <LegalSection heading="Who processes it">
        <p>
          Our hosting and database provider stores the data. OpenAI processes the story prompt, the generated
          text and the narration text in order to produce them. Only what is needed for generation is sent: a
          child&apos;s name or nickname, age, and the interests you chose — never your email address, your
          account identifiers, or anything that identifies your family.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          For as long as your account exists. Deleting a story removes its text, images, audio and PDFs.
          Deleting your account removes your profile, your children&apos;s profiles, every story and every
          generated file, and revokes every share link you have created. That cannot be undone.
        </p>
      </LegalSection>

      <LegalSection heading="Your controls">
        <p>
          Settings has a one-click export of everything in your account as a JSON file, and a one-click account
          deletion. You can revoke any share link at any time, and revoked links stop working immediately for
          everyone who has them.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Every table in our database enforces per-account access rules, so one account cannot read
          another&apos;s children or stories even if a query is wrong. Generated files are stored privately and
          served through short-lived signed links rather than public URLs. Provider keys are held server-side
          only and are never present in the browser.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Write to us from the address on your account and we will reply within two working days.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
