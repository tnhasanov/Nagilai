import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../../src/session';
import { ApiError, type Catalogue } from '../../src/api';
import {
  Body,
  Button,
  Chip,
  ErrorNotice,
  Field,
  Screen,
  Title,
  spacing,
} from '../../src/components/ui';

const PALETTE = ['#4A3A6B', '#D97E28', '#4F7D5E', '#C4576B', '#3B82F6', '#8B5CF6'];

/**
 * Add a child (§3).
 *
 * The interest fields take comma-separated text rather than a tag widget:
 * a parent filling this in on a phone at 8pm should be able to type
 * "dinosaurs, digging, the moon" and move on.
 *
 * There is no photograph upload. The appearance *description* gives the
 * illustrator the page-to-page consistency it needs without Nagilai ever
 * holding a picture of a child.
 */
export default function NewChild() {
  const { api } = useSession();
  const router = useRouter();

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [age, setAge] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [interests, setInterests] = useState('');
  const [animals, setAnimals] = useState('');
  const [appearance, setAppearance] = useState('');
  const [notes, setNotes] = useState('');
  const [colour, setColour] = useState(PALETTE[0]!);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .catalogue('en-US')
      .then((next) => {
        setCatalogue(next);
        setLanguage((current) => next.languages[0]?.code ?? current);
      })
      .catch(() => undefined);
  }, [api]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setFields({});

    try {
      await api.children.create({
        name: name.trim(),
        nickname: nickname.trim(),
        ageYears: age.trim() === '' ? null : Number(age),
        preferredLanguage: language,
        interests,
        favouriteAnimals: animals,
        favouriteActivities: '',
        favouriteCharacters: '',
        personalityTraits: '',
        learningInterests: '',
        parentNotes: notes.trim(),
        appearanceDescription: appearance.trim(),
        avatarColor: colour,
      });

      router.back();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError('We could not save this profile. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }, [api, name, nickname, age, language, interests, animals, notes, appearance, colour, router]);

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        <Title style={{ marginBottom: spacing.lg }}>Tell us about your child</Title>

        {error ? <ErrorNotice message={error} /> : null}

        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Miray"
          hint="This is the name used in the story."
          error={fields['name'] ?? null}
          maxLength={60}
        />

        <Field
          label="Nickname"
          value={nickname}
          onChangeText={setNickname}
          placeholder="Optional"
          hint="Used instead of their name if you set one."
          maxLength={60}
        />

        <Field
          label="Age"
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          placeholder="6"
          error={fields['ageYears'] ?? null}
        />

        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Body>Preferred story language</Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(catalogue?.languages ?? []).map((option) => (
              <Chip
                key={option.code}
                label={`${option.flag ?? ''} ${option.nameNative}`.trim()}
                selected={option.code === language}
                onPress={() => setLanguage(option.code)}
              />
            ))}
          </View>
        </View>

        <Field
          label="Interests"
          value={interests}
          onChangeText={setInterests}
          placeholder="stars, digging, the moon"
          hint="Separate with commas."
        />

        <Field
          label="Favourite animals"
          value={animals}
          onChangeText={setAnimals}
          placeholder="cats, foxes"
          hint="Separate with commas."
        />

        <Field
          label="How they look"
          value={appearance}
          onChangeText={setAppearance}
          placeholder="Dark curly hair, brown eyes, always in a mustard raincoat"
          hint="A short description helps the illustrations look like your child, page after page. No photograph needed."
          multiline
          numberOfLines={3}
          style={{ minHeight: 84, textAlignVertical: 'top' }}
          maxLength={600}
        />

        <Field
          label="Anything else we should know"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          hint="Only used to shape the story. Never shown to anyone else."
          multiline
          numberOfLines={3}
          style={{ minHeight: 84, textAlignVertical: 'top' }}
          maxLength={1000}
        />

        <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
          <Body>Colour</Body>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {PALETTE.map((value) => (
              <Chip key={value} label=" " accent={value} selected={value === colour} onPress={() => setColour(value)} />
            ))}
          </View>
        </View>

        <Button label="Save profile" loading={saving} disabled={!name.trim()} onPress={save} />
      </ScrollView>
    </Screen>
  );
}
