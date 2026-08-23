import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Headphones,
  Lock,
  Palette,
  Printer,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Shell } from '@/components/site/shell';
import { HeroBook } from '@/components/marketing/hero-book';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/ui/card';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';
import { getPublicThemes } from '@/features/stories/catalogue';
import { getSetting } from '@/services/config/settings';
import { localise } from '@/types/domain';
import type { Metadata } from 'next';

/**
 * Landing page (§20).
 *
 * Shows the product rather than explaining the technology. The word
 * "AI" appears exactly once on this page, in the safety section, where a
 * parent actually wants to know about it. Everything else is about a
 * child, a book and an evening.
 */
export const metadata: Metadata = {
  title: 'Nagilai — personalised storybooks for your child',
  alternates: { canonical: '/' },
};

export const revalidate = 3600;

export default async function LandingPage() {
  const locale = await resolveLocale();
  const t = getDictionary(locale);
  const [themes, branding] = await Promise.all([getPublicThemes(locale, 8), getSetting('branding')]);

  const tagline = localise(branding.tagline, locale) || t.landing.tagline;

  return (
    <Shell>
      {/* ---- Hero ---------------------------------------------------- */}
      <section className="aurora relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-28 lg:pt-20">
          <div className="animate-rise">
            <p className="mb-6 inline-flex items-center gap-2.5 rounded-pill border border-line bg-paper-raised/80 py-1.5 pl-2.5 pr-4 text-[0.78rem] font-bold text-ink-soft backdrop-blur">
              <span className="flex items-center gap-0.5 text-sm" aria-hidden="true">
                <span>🇦🇿</span>
                <span>🇬🇧</span>
                <span>🇷🇺</span>
                <span>🇹🇷</span>
              </span>
              {t.landing.languagesTitle}
            </p>

            <h1 className="text-balance font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              {tagline}
            </h1>

            <p className="measure mt-6 text-lg leading-relaxed text-ink-soft">{t.landing.subtitle}</p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  {t.landing.ctaPrimary}
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="#how">{t.landing.ctaSecondary}</Link>
              </Button>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-line/70 pt-6 text-[0.85rem] font-semibold text-ink-soft">
              <span className="inline-flex items-center gap-2">
                <Lock className="size-4 text-plum" aria-hidden="true" />
                {t.landing.trustPrivate}
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="size-4 text-sage" aria-hidden="true" />
                {t.landing.trustSafe}
              </span>
            </div>
          </div>

          <div className="animate-fade [animation-delay:150ms] lg:-mr-8 lg:scale-110 xl:-mr-16 xl:scale-115">
            <HeroBook />
          </div>
        </div>
      </section>

      {/* ---- How it works -------------------------------------------- */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading
          eyebrow="Three steps"
          title={t.landing.featuresTitle}
          align="center"
          className="mb-14"
        />

        <ol className="grid gap-6 md:grid-cols-3">
          <Step
            number="1"
            icon={<Users />}
            title={t.landing.step1Title}
            body={t.landing.step1Body}
            tone="plum"
          />
          <Step
            number="2"
            icon={<Sparkles />}
            title={t.landing.step2Title}
            body={t.landing.step2Body}
            tone="amber"
          />
          <Step
            number="3"
            icon={<BookOpen />}
            title={t.landing.step3Title}
            body={t.landing.step3Body}
            tone="sage"
          />
        </ol>
      </section>

      {/* ---- Feature grid -------------------------------------------- */}
      <section className="border-y border-line bg-paper-sunken/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid gap-5 sm:grid-cols-2">
            <Feature
              icon={<Palette />}
              title={t.landing.featureIllustrations}
              body={t.landing.featureIllustrationsBody}
            />
            <Feature
              icon={<Headphones />}
              title={t.landing.featureNarration}
              body={t.landing.featureNarrationBody}
            />
            <Feature icon={<Printer />} title={t.landing.featurePdf} body={t.landing.featurePdfBody} />
            <Feature icon={<BookOpen />} title={t.landing.featureLibrary} body={t.landing.featureLibraryBody} />
          </div>
        </div>
      </section>

      {/* ---- Languages ----------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <SectionHeading
            eyebrow="Four languages"
            title={t.landing.languagesTitle}
            description={t.landing.languagesBody}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <LanguageCard flag="🇦🇿" name="Azərbaycan dili" sample="Miray ulduzlara baxdı və bir işıq gördü." />
            <LanguageCard flag="🇬🇧" name="English" sample="Miray looked up, and one star looked back." />
            <LanguageCard flag="🇷🇺" name="Русский" sample="Мирай подняла глаза — и одна звезда мигнула ей." />
            <LanguageCard flag="🇹🇷" name="Türkçe" sample="Miray yukarı baktı ve bir yıldız ona göz kırptı." />
          </div>
        </div>
      </section>

      {/* ---- Themes -------------------------------------------------- */}
      {themes.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28">
          <SectionHeading title={t.landing.themesTitle} align="center" className="mb-10" />
          <ul className="flex flex-wrap justify-center gap-3">
            {themes.map((theme) => (
              <li key={theme.slug}>
                <span
                  className="inline-flex items-center gap-2 rounded-pill border border-line bg-paper-raised px-4 py-2.5 text-sm font-semibold text-ink shadow-page"
                  style={theme.accentColor ? { borderColor: `${theme.accentColor}44` } : undefined}
                >
                  <span
                    className="size-2 rounded-pill"
                    style={{ background: theme.accentColor ?? 'var(--color-amber)' }}
                    aria-hidden="true"
                  />
                  {theme.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- Trust --------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="card bg-plum-soft/60 p-8">
            <Lock className="size-6 text-plum" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-bold text-ink">{t.landing.trustPrivate}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t.landing.trustPrivateBody}</p>
          </div>
          <div className="card bg-sage-soft/60 p-8">
            <ShieldCheck className="size-6 text-sage" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-bold text-ink">{t.landing.trustSafe}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t.landing.trustSafeBody}</p>
          </div>
        </div>
      </section>

      {/* ---- Final call ---------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="aurora relative overflow-hidden rounded-card border border-line px-6 py-16 text-center sm:px-16">
          <h2 className="text-balance font-display text-3xl font-bold leading-tight text-ink sm:text-5xl">
            {t.landing.finalCta}
          </h2>
          <p className="measure mx-auto mt-4 text-base leading-relaxed text-ink-soft">{t.landing.subtitle}</p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/signup">
              {t.landing.ctaPrimary}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

const TONE_CLASSES = {
  amber: 'bg-amber-soft text-amber-deep',
  plum: 'bg-plum-soft text-plum',
  sage: 'bg-sage-soft text-sage',
} as const;

function Step({
  number,
  icon,
  title,
  body,
  tone,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: keyof typeof TONE_CLASSES;
}) {
  return (
    <li className="card relative p-8">
      <span
        className="absolute right-6 top-6 font-display text-5xl font-bold leading-none text-line-strong"
        aria-hidden="true"
      >
        {number}
      </span>
      <div className={`flex size-12 items-center justify-center rounded-tile ${TONE_CLASSES[tone]} [&_svg]:size-5`}>
        {icon}
      </div>
      <h3 className="mt-5 text-lg font-bold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
    </li>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card flex gap-5 p-7">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-paper-sunken text-amber-deep [&_svg]:size-5">
        {icon}
      </div>
      <div>
        <h3 className="text-base font-bold text-ink">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
      </div>
    </div>
  );
}

/**
 * A sample opening line in each launch language.
 *
 * Deliberately not the same sentence translated four ways: each is
 * written the way that language would actually open the moment, which is
 * the point the section is making.
 */
function LanguageCard({ flag, name, sample }: { flag: string; name: string; sample: string }) {
  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        <span aria-hidden="true">{flag}</span>
        {name}
      </p>
      <p className="mt-3 font-display text-[0.95rem] leading-relaxed text-ink-soft">{sample}</p>
    </div>
  );
}
