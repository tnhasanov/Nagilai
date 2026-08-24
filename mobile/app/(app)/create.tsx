import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '../../src/session';
import { useI18n } from '../../src/i18n';
import type { Catalogue, ChildProfile } from '../../src/api';
import { ApiError } from '../../src/api';
import { estimateStoryCost } from '../../src/credits';
import {
  Body,
  Button,
  Caption,
  Card,
  Chip,
  EmptyState,
  ErrorNotice,
  Field,
  Heading,
  Loading,
  Screen,
  Title,
  radius,
  spacing,
  type,
  usePalette,
} from '../../src/components/ui';

/**
 * The story wizard.
 *
 * Same three steps as the web app — who it is for, what kind of story, a
 * couple of optional touches — because a parent who has used one should
 * recognise the other immediately.
 *
 * Nothing technical is exposed: no model, no image size, no separate
 * narration language. The server resolves all of that from configuration
 * and from the story row.
 */
const LENGTH_KEYS = {
  short: 'create.lengthShort',
  medium: 'create.lengthMedium',
  long: 'create.lengthLong',
} as const;

export default function Create() {
  const { api, profile, refreshProfile } = useSession();
  const router = useRouter();
  const palette = usePalette();
  const { t, locale } = useI18n();

  const [children, setChildren] = useState<ChildProfile[] | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(0);

  const [childId, setChildId] = useState<string | null>(null);
  const [languageCode, setLanguageCode] = useState<string | null>(null);
  const [themeSlug, setThemeSlug] = useState<string | null>(null);
  const [objectiveSlug, setObjectiveSlug] = useState<string | null>(null);
  const [styleSlug, setStyleSlug] = useState<string | null>(null);
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [instructions, setInstructions] = useState('');

  const load = useCallback(async () => {
    try {
      // The catalogue is labelled in the *interface* language, which is
      // what the parent is reading right now. The story's own language is
      // a separate choice below.
      const [{ children: list }, cat] = await Promise.all([
        api.children.list(),
        api.catalogue(locale),
      ]);

      setChildren(list);
      setCatalogue(cat);
      setError(null);

      // Pre-fill from the first child, so the common case is three taps.
      const first = list[0];
      if (first) {
        setChildId((current) => current ?? first.id);
        setLanguageCode((current) => current ?? first.preferredLanguage);
      }
      setThemeSlug((current) => current ?? cat.themes[0]?.slug ?? null);
      setStyleSlug((current) => current ?? cat.styles[0]?.slug ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('create.loadFailed'));
      setChildren([]);
    }
  }, [api, locale, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const selectedChild = useMemo(
    () => children?.find((child) => child.id === childId) ?? null,
    [children, childId],
  );

  if (children === null || catalogue === null) return <Loading label={t('create.gettingReady')} />;

  if (children.length === 0) {
    return (
      <Screen>
        <EmptyState
          title={t('create.needsChildTitle')}
          description={t('create.needsChildDescription')}
          action={<Button label={t('children.add')} onPress={() => router.push('/child/new')} />}
        />
      </Screen>
    );
  }

  /*
   * The whole book, not its first job.
   *
   * This was `catalogue.credits.storyText`, so a parent holding three
   * credits was told a ten-page illustrated story cost 1, allowed to
   * press Create, and refused by the server — which checks one image per
   * page plus a cover. `src/credits.ts` is the same function the web app
   * uses, pinned to it by a test on both sides.
   */
  const illustrated = catalogue.features['illustrations_enabled'] !== false && styleSlug !== null;
  const pages = catalogue.lengths[length].pages;
  const estimate = estimateStoryCost({
    pages,
    illustrated,
    textCost: catalogue.credits.storyText,
    illustrationCost: catalogue.credits.storyIllustration,
  });
  const textOnly = estimateStoryCost({
    pages,
    illustrated: false,
    textCost: catalogue.credits.storyText,
    illustrationCost: catalogue.credits.storyIllustration,
  });
  const balance = profile?.creditBalance ?? 0;
  const canAfford = balance >= estimate.total;
  /* Only offered when it genuinely unblocks them. */
  const offerTextOnly = illustrated && !canAfford && balance >= textOnly.total;

  async function submit() {
    if (!childId || !languageCode || !themeSlug) return;

    setSubmitting(true);
    setError(null);

    try {
      const { storyId } = await api.stories.create({
        childId,
        languageCode,
        themeSlug,
        objectiveSlug,
        illustrationStyleSlug: styleSlug,
        length,
        customInstructions: instructions.trim(),
      });

      void refreshProfile();
      router.push(`/story/${storyId}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('create.startFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        {error ? <ErrorNotice message={error} /> : null}

        <Stepper
          step={step}
          labels={[t('create.stepWho'), t('create.stepWhat'), t('create.stepTouches')]}
          onSelect={setStep}
        />

        {step === 0 ? (
          <View style={{ gap: spacing.md }}>
            <Title>{t('create.whoTitle')}</Title>
            {children.map((child) => (
              <Pressable
                key={child.id}
                onPress={() => {
                  setChildId(child.id);
                  setLanguageCode(child.preferredLanguage);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: child.id === childId }}
              >
                <Card
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    borderColor: child.id === childId ? palette.amber : palette.line,
                    backgroundColor: child.id === childId ? palette.amberSoft : palette.paperRaised,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: radius.pill,
                      backgroundColor: child.avatarColor ?? palette.plum,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>
                      {(child.nickname ?? child.name).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Heading>{child.nickname ?? child.name}</Heading>
                    {child.ageYears !== null ? (
                      <Caption>{t('children.yearsOld', { count: child.ageYears })}</Caption>
                    ) : null}
                  </View>
                </Card>
              </Pressable>
            ))}

            <Button
              label={t('children.addAnother')}
              variant="ghost"
              onPress={() => router.push('/child/new')}
            />
          </View>
        ) : null}

        {step === 1 ? (
          <View style={{ gap: spacing.lg }}>
            <Title>{t('create.whatTitle')}</Title>

            <View style={{ gap: spacing.sm }}>
              <Text style={[type.label, { color: palette.ink }]}>{t('create.storyLanguage')}</Text>
              <Caption>{t('create.storyLanguageHint')}</Caption>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {catalogue.languages.map((language) => (
                  <Chip
                    key={language.code}
                    label={`${language.flag ?? ''} ${language.nameNative}`.trim()}
                    selected={language.code === languageCode}
                    onPress={() => setLanguageCode(language.code)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: spacing.sm }}>
              <Text style={[type.label, { color: palette.ink }]}>{t('create.storyType')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {catalogue.themes.map((theme) => (
                  <Chip
                    key={theme.slug}
                    label={theme.label}
                    accent={theme.accentColor}
                    selected={theme.slug === themeSlug}
                    onPress={() => setThemeSlug(theme.slug)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: spacing.sm }}>
              <Text style={[type.label, { color: palette.ink }]}>{t('create.somethingToLearn')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Chip
                  label={t('create.noLesson')}
                  selected={objectiveSlug === null}
                  onPress={() => setObjectiveSlug(null)}
                />
                {catalogue.objectives.map((objective) => (
                  <Chip
                    key={objective.slug}
                    label={objective.label}
                    selected={objective.slug === objectiveSlug}
                    onPress={() => setObjectiveSlug(objective.slug)}
                  />
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={{ gap: spacing.lg }}>
            <Title>{t('create.touchesTitle')}</Title>

            <View style={{ gap: spacing.sm }}>
              <Text style={[type.label, { color: palette.ink }]}>{t('create.illustrationStyle')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Chip
                  label={t('create.noPictures')}
                  selected={styleSlug === null}
                  onPress={() => setStyleSlug(null)}
                />
                {catalogue.styles.map((style) => (
                  <Chip
                    key={style.slug}
                    label={style.label}
                    selected={style.slug === styleSlug}
                    onPress={() => setStyleSlug(style.slug)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: spacing.sm }}>
              <Text style={[type.label, { color: palette.ink }]}>{t('create.length')}</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['short', 'medium', 'long'] as const).map((value) => (
                  <Chip
                    key={value}
                    label={`${t(LENGTH_KEYS[value])} · ${t('create.pagesSuffix', {
                      count: catalogue.lengths[value].pages,
                    })}`}
                    selected={length === value}
                    onPress={() => setLength(value)}
                  />
                ))}
              </View>
            </View>

            <Field
              label={t('create.instructions')}
              value={instructions}
              onChangeText={setInstructions}
              placeholder={t('create.instructionsPlaceholder', {
                child: selectedChild?.nickname ?? selectedChild?.name ?? '',
              })}
              multiline
              numberOfLines={3}
              maxLength={600}
              style={{ minHeight: 96, textAlignVertical: 'top' }}
              hint={`${instructions.length} / 600`}
            />

            {/* Itemised, so the total is never a surprise — the same
                breakdown the web wizard shows. */}
            <Card style={{ gap: spacing.xs }}>
              <Caption>{t('create.costTitle')}</Caption>
              <CostRow label={t('create.costText')} value={estimate.text} />
              {illustrated ? (
                <CostRow
                  label={t('create.costPictures', { count: estimate.imageCount })}
                  value={estimate.illustrations}
                />
              ) : null}
              <CostRow label={t('create.costTotal')} value={estimate.total} emphasis />
            </Card>

            {!canAfford ? (
              <View style={{ gap: spacing.sm }}>
                <ErrorNotice
                  message={`${t('create.notEnoughCredits', {
                    needed: estimate.total,
                    have: balance,
                  })} ${t('create.notEnoughHelp')}`}
                />
                {/* An escape hatch, not an upsell: there is nothing to buy
                    yet, so the only honest help is the cheaper book they
                    can actually afford tonight. */}
                {offerTextOnly ? (
                  <Button
                    label={t('create.withoutPictures', { count: textOnly.total })}
                    variant="ghost"
                    onPress={() => setStyleSlug(null)}
                  />
                ) : null}
              </View>
            ) : null}

            <Button
              label={
                submitting
                  ? t('create.starting')
                  : t('create.createButton', {
                      cost: t('settings.credits', { count: estimate.total }),
                    })
              }
              loading={submitting}
              disabled={!canAfford || !childId || !themeSlug}
              onPress={submit}
            />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
          {step > 0 ? (
            <View style={{ flex: 1 }}>
              <Button label={t('common.back')} variant="ghost" onPress={() => setStep(step - 1)} />
            </View>
          ) : null}
          {step < 2 ? (
            <View style={{ flex: 1 }}>
              <Button label={t('common.next')} onPress={() => setStep(step + 1)} disabled={!childId} />
            </View>
          ) : null}
        </View>

        <Body style={{ marginTop: spacing.lg, textAlign: 'center' }}>
          {profile ? t('create.creditsLeft', { count: profile.creditBalance }) : ''}
        </Body>
      </ScrollView>
    </Screen>
  );
}

function Stepper({
  step,
  labels,
  onSelect,
}: {
  step: number;
  labels: string[];
  onSelect: (index: number) => void;
}) {
  const palette = usePalette();

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
      {labels.map((label, index) => (
        <Pressable
          key={label}
          onPress={() => index < step && onSelect(index)}
          disabled={index > step}
          style={{ flex: 1, gap: 6 }}
          accessibilityRole="button"
          accessibilityState={{ selected: index === step }}
        >
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: index <= step ? palette.amber : palette.line,
            }}
          />
          <Text style={[type.caption, { color: index === step ? palette.ink : palette.inkFaint }]}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function CostRow({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <Body style={emphasis ? { fontWeight: '700' } : undefined}>{label}</Body>
      <Body style={emphasis ? { fontWeight: '700' } : undefined}>{value}</Body>
    </View>
  );
}
