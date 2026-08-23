import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/ui/card';
import { getSetting } from '@/services/config/settings';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';
import { cn } from '@/lib/utils';

/**
 * Pricing (§16, §20).
 *
 * Plan entitlements and credit costs are read from configuration, not
 * written into this file — §37 is explicit that prices must not be
 * hard-coded, and that includes the page that displays them.
 *
 * The paid tiers are shown as "coming soon" while `payments_enabled` is
 * off, which is honest about where the product is rather than offering a
 * checkout that does not exist.
 */
export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Start free. Pay only when Nagilai has earned a place in your evenings.',
  alternates: { canonical: '/pricing' },
};

export const revalidate = 3600;

export default async function PricingPage() {
  const locale = await resolveLocale();
  const t = getDictionary(locale);
  const [plans, credits, features] = await Promise.all([
    getSetting('plan_limits'),
    getSetting('credits'),
    getSetting('features'),
  ]);

  const tiers = [
    {
      key: 'free' as const,
      name: t.pricing.freeName,
      body: t.pricing.freeBody,
      limits: plans.free,
      available: true,
      featured: false,
    },
    {
      key: 'family' as const,
      name: t.pricing.familyName,
      body: t.pricing.familyBody,
      limits: plans.family,
      available: features.payments_enabled,
      featured: true,
    },
    {
      key: 'premium' as const,
      name: t.pricing.premiumName,
      body: t.pricing.premiumBody,
      limits: plans.premium,
      available: features.payments_enabled,
      featured: false,
    },
  ];

  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeading
          title={t.pricing.title}
          description={t.pricing.subtitle}
          align="center"
          className="mb-14"
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.key}
              className={cn(
                'card relative flex flex-col p-7',
                tier.featured && 'border-amber shadow-lift lg:-mt-4 lg:mb-4',
              )}
            >
              {tier.featured ? (
                <Badge tone="amber" className="absolute -top-3 left-7">
                  <Sparkles />
                  Popular
                </Badge>
              ) : null}

              <h2 className="font-display text-xl font-bold text-ink">{tier.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-relaxed text-ink-soft">{tier.body}</p>

              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                <Perk>
                  {tier.limits.max_stories_per_month} stories a month
                </Perk>
                <Perk>{tier.limits.max_children} child profiles</Perk>
                <Perk>Illustrations and narration</Perk>
                <Perk>Downloadable PDF</Perk>
                {tier.limits.allow_premium_styles ? <Perk>Premium art styles</Perk> : null}
              </ul>

              <div className="mt-7">
                {tier.available ? (
                  <Button asChild className="w-full" variant={tier.featured ? 'primary' : 'secondary'}>
                    <Link href="/signup">{tier.key === 'free' ? t.landing.ctaPrimary : t.pricing.choosePlan}</Link>
                  </Button>
                ) : (
                  <Button className="w-full" variant="secondary" disabled>
                    {t.pricing.comingSoon}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <section className="card mt-12 p-8">
          <h2 className="font-display text-xl font-bold text-ink">{t.pricing.creditsExplainerTitle}</h2>
          <p className="measure mt-3 text-sm leading-relaxed text-ink-soft">
            {t.pricing.creditsExplainerBody}
          </p>

          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <CostRow label="A story" value={credits.story_text} />
            <CostRow label="Each illustration" value={credits.story_illustration} />
            <CostRow label="Narration" value={credits.story_narration} />
          </dl>
        </section>
      </div>
    </Shell>
  );
}

function Perk({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-ink-soft">
      <Check className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden="true" />
      {children}
    </li>
  );
}

function CostRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-tile bg-paper-sunken px-5 py-4">
      <dt className="text-xs font-semibold text-ink-faint">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5 text-2xl font-bold text-ink">
        {value}
        <span className="text-xs font-semibold text-ink-faint">
          {value === 1 ? 'credit' : 'credits'}
        </span>
      </dd>
    </div>
  );
}
