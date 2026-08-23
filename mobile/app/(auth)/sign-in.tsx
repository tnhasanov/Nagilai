import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/supabase';
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
 * is what every API call then carries.
 *
 * Errors are deliberately vague about whether an address exists - a form
 * that distinguishes "no such user" from "wrong password" is an account
 * enumeration oracle.
 */
export default function SignIn() {
  const router = useRouter();
  const palette = usePalette();

  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      const client = supabase();

      if (mode === 'sign-up') {
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
        });

        if (signUpError) {
          setError('We could not create your account. Please check the details and try again.');
          return;
        }
        if (!data.session) {
          setNotice('Almost there — confirm your email address to finish signing up.');
          return;
        }
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          setError('That email and password did not match. Please try again.');
          return;
        }
      }

      router.replace('/(app)/library');
    } catch {
      setError('We could not reach Nagilai. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: spacing.md }}
      >
        <View style={{ marginBottom: spacing.lg, alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ fontSize: 40 }}>📖</Text>
          <Title>Nagilai</Title>
          <Body style={{ textAlign: 'center' }}>
            Your child. Their imagination. Their own story.
          </Body>
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

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />

          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
            hint={mode === 'sign-up' ? 'At least 10 characters.' : undefined}
          />

          <Button
            label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            loading={busy}
            disabled={!email.trim() || password.length < (mode === 'sign-up' ? 10 : 1)}
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
              {mode === 'sign-in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}
