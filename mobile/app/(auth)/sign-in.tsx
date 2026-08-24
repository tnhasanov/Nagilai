import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/supabase';
import { useI18n } from '../../src/i18n';
import { HeroBook } from '../../src/components/hero-book';
import {
  appleConfigured,
  completeGoogleSignIn,
  googleConfigured,
  signInWithApple,
  useGoogleAuthRequest,
  type SignInOutcome,
} from '../../src/auth-providers';
import {
  Body,
  Button,
  Card,
  ErrorNotice,
  Field,
  Screen,
  Title,
  spacing,
  type,
  usePalette,
} from '../../src/components/ui';

/**
 * Sign in and sign up, in one screen.
 *
 * Authentication goes straight to Supabase rather than through our API:
 * the SDK owns token refresh and secure storage, and the JWT it returns
 * is what every API call then carries. Apple and Google end up in the
 * same place -- an `id_token` exchanged for the same session -- so a
 * parent who signed up on the website with Google finds their own library
 * here rather than a second empty account.
 *
 * The social buttons appear **only when their client ids are configured**.
 * No placeholder credentials ship in this repository, and a button that
 * cannot succeed is worse than no button.
 *
 * Errors are deliberately vague about whether an address exists - a form
 * that distinguishes "no such user" from "wrong password" is an account
 * enumeration oracle.
 */
export default function SignIn() {
  const router = useRouter();
  const palette = usePalette();
  const { t } = useI18n();

  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);

  const googleReady = googleConfigured();

  useEffect(() => {
    void appleConfigured().then(setAppleReady);
  }, []);

  const finish = useCallback(
    (outcome: SignInOutcome) => {
      if (outcome.status === 'signed-in') {
        router.replace('/(app)/library');
        return;
      }
      if (outcome.status === 'cancelled') {
        setError(null);
        return;
      }
      setError(t('auth.providerFailed'));
    },
    [router, t],
  );

  async function submit() {
    setError(null);
    setNotice(null);
    setBusy('email');

    try {
      const client = supabase();

      if (mode === 'sign-up') {
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
        });

        if (signUpError) {
          setError(t('auth.signUpFailed'));
          return;
        }
        if (!data.session) {
          setNotice(t('auth.confirmEmail'));
          return;
        }
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          setError(t('auth.signInFailed'));
          return;
        }
      }

      router.replace('/(app)/library');
    } catch {
      setError(t('common.noConnection'));
    } finally {
      setBusy(null);
    }
  }

  const showSocial = appleReady || googleReady;

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          {/* The first screen of the product used to be a 40px book
              emoji above two fields. This is the same illustration the
              website opens with, so the two front doors show the same
              picture. */}
          <View style={{ marginBottom: spacing.lg, alignItems: 'center', gap: spacing.xs }}>
            <HeroBook />
            <Title style={{ marginTop: spacing.sm }}>{t('common.appName')}</Title>
            <Body style={{ textAlign: 'center' }}>{t('auth.tagline')}</Body>
          </View>

          <Card style={{ gap: spacing.xs }}>
            {error ? <ErrorNotice message={error} /> : null}
            {notice ? (
              <View
                style={{
                  backgroundColor: palette.sageSoft,
                  borderRadius: 16,
                  padding: spacing.md,
                  marginBottom: spacing.md,
                }}
              >
                <Text style={[type.label, { color: palette.sage }]}>{notice}</Text>
              </View>
            ) : null}

            {showSocial ? (
              <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
                {appleReady ? (
                  <Button
                    label={t('auth.continueWithApple')}
                    variant="secondary"
                    icon={<Text style={{ fontSize: 17 }}></Text>}
                    loading={busy === 'apple'}
                    disabled={busy !== null}
                    onPress={async () => {
                      setBusy('apple');
                      setError(null);
                      finish(await signInWithApple());
                      setBusy(null);
                    }}
                  />
                ) : null}

                {googleReady ? (
                  <GoogleButton
                    label={t('auth.continueWithGoogle')}
                    busy={busy === 'google'}
                    disabled={busy !== null}
                    onStart={() => {
                      setError(null);
                      setBusy('google');
                    }}
                    onOutcome={(outcome) => {
                      setBusy(null);
                      finish(outcome);
                    }}
                  />
                ) : null}

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    marginVertical: spacing.sm,
                  }}
                >
                  <View style={{ flex: 1, height: 1, backgroundColor: palette.line }} />
                  <Text style={[type.caption, { color: palette.inkFaint }]}>
                    {t('auth.orUseEmail')}
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: palette.line }} />
                </View>
              </View>
            ) : null}

            <Field
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder={t('auth.emailPlaceholder')}
            />

            <Field
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
              hint={mode === 'sign-up' ? t('auth.passwordHint') : undefined}
            />

            <Button
              label={mode === 'sign-in' ? t('auth.signIn') : t('auth.createAccount')}
              loading={busy === 'email'}
              disabled={
                busy !== null || !email.trim() || password.length < (mode === 'sign-up' ? 10 : 1)
              }
              onPress={submit}
            />

            <Pressable
              onPress={() => {
                setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
                setError(null);
                setNotice(null);
              }}
              style={{ paddingVertical: spacing.md, alignItems: 'center' }}
            >
              <Text style={[type.label, { color: palette.inkSoft }]}>
                {mode === 'sign-in' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}
              </Text>
            </Pressable>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * The Google button, and the hook it needs.
 *
 * A separate component precisely so the hook is never called when Google
 * is unconfigured: `useIdTokenAuthRequest` throws on a missing client id,
 * so an unconditional call would crash this screen in the repository's
 * default state -- no credentials, which is where it deliberately sits
 * until the owner creates a Google Cloud project.
 */
function GoogleButton({
  label,
  busy,
  disabled,
  onStart,
  onOutcome,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
  onOutcome: (outcome: SignInOutcome) => void;
}) {
  const [request, response, promptAsync] = useGoogleAuthRequest();

  // The flow returns through the browser, so the result arrives as a
  // state change rather than from the button's own promise.
  useEffect(() => {
    if (!response) return;
    void completeGoogleSignIn(response).then(onOutcome);
  }, [response, onOutcome]);

  return (
    <Button
      label={label}
      variant="secondary"
      icon={<Text style={{ fontSize: 16, fontWeight: '700' }}>G</Text>}
      loading={busy}
      disabled={disabled || !request}
      onPress={() => {
        onStart();
        void promptAsync();
      }}
    />
  );
}
