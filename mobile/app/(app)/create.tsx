import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '../../src/session';
import type { Catalogue, ChildProfile } from '../../src/api';
import { ApiError } from '../../src/api';
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
export default function Create() {
  const { api, profile, refreshProfile } = useSession();
  const router = useRouter();
  const palette = usePalette();

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
      const [{ children: list }, cat] = await Promise.all([
        api.children.list(),
        api.catalogue(profile?.uiLocale ?? 'en-US'),
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
      setError(caught instanceof Error ? caught.message : 'We could not load the story options.');
      setChildren([]);
    }
  }, [api, profile?.uiLocale]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const selectedChild = useMemo(
    () => children?.find((child) => child.id === childId) ?? null,
    [children, childId],
  );

  if (children === null || catalogue === null) return <Loading label="Getting ready" />;

  if (children.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Add a child profile first"
          description="Every Nagilai story is built around a real child. It only takes a moment."
          action={<Button label="Add a child" onPress={() => router.push('/child/new')} />}
        />
      </Screen>
    );
  }

  const cost = catalogue.credits.storyText;
  const canAfford = (profile?.creditBalance ?? 0) >= cost;

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
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'We could not start this story. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        {error ? <ErrorNotice message={error} /> : null}

        <Stepper step={step} labels={['Who', 'What', 'Touches']} onSelect={setStep} />

        {step === 0 ? (
          <View style={{ gap: spacing.md }}>
            <Title>Who is it for?</Title>
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
                    {child.ageYears !== null ? <Caption>{child.ageYears} years old</Caption> : null}
                  </View>
                </Card>
              </Pressable>
            ))}

            <Button
              label="Add another child"
              variant="ghost"
              onPress={() => router.push('/child/new')}
            />
          </View>
        ) : null}

        {step === 1 ? (
          <View style={{ gap: spacing.lg }}>
            <Title>What kind of story?</Title>

            <View style={{ gap: spacing.sm }}>
              <Text style={[type.label, { color: palette.ink }]}>Story language</Text>
              <Caption>The whole book — text, narration and PDF — will be in this language.</Caption>
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
              <Text style={[type.label, { color: palette.ink }]}>Story type</Text>
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
              <Text style={[type.label, { color: palette.ink }]}>Something to learn</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Chip
                  label="No particular lesson"
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
            <Title>A few last touches</Title>

            <View style={{ gap: spacing.sm }}>
              <Text style={[type.label, { color: palette.ink }]}>Illustration style</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Chip label="No pictures" selected={styleSlug === null} onPress={() => setStyleSlug(null)} />
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
              <Text style={[type.label, { color: palette.ink }]}>Length</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['short', 'medium', 'long'] as const).map((value) => (
                  <Chip
                    key={value}
                    label={`${value[0]!.toUpperCase()}${value.slice(1)} · ${catalogue.lengths[value].pages}p`}
                    selected={length === value}
                    onPress={() => setLength(value)}
                  />
                ))}
              </View>
            </View>

            <Field
              label="Anything you would like to happen?"
              value={instructions}
              onChangeText={setInstructions}
              placeholder={`${selectedChild?.nickname ?? selectedChild?.name ?? 'Your child'} travels to space and learns why planets orbit the sun.`}
              multiline
              numberOfLines={3}
              maxLength={600}
              style={{ minHeight: 96, textAlignVertical: 'top' }}
              hint={`${instructions.length} / 600`}
            />

            {!canAfford ? (
              <ErrorNotice
                message={`This uses ${cost} credit(s) and you have ${profile?.creditBalance ?? 0}.`}
              />
            ) : null}

            <Button
              label={submitting ? 'Starting…' : `Create the story · ${cost} credit${cost === 1 ? '' : 's'}`}
              loading={submitting}
              disabled={!canAfford || !childId || !themeSlug}
              onPress={submit}
            />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
          {step > 0 ? (
            <View style={{ flex: 1 }}>
              <Button label="Back" variant="ghost" onPress={() => setStep(step - 1)} />
            </View>
          ) : null}
          {step < 2 ? (
            <View style={{ flex: 1 }}>
              <Button label="Next" onPress={() => setStep(step + 1)} disabled={!childId} />
            </View>
          ) : null}
        </View>

        <Body style={{ marginTop: spacing.lg, textAlign: 'center' }}>
          {profile ? `${profile.creditBalance} credits left` : ''}
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
