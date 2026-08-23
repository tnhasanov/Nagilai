import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { darkPalette, lightPalette, radius, spacing, type, type Palette } from '../theme';

/**
 * The shared visual vocabulary.
 *
 * Deliberately small and hand-written rather than a component library:
 * the app has one look, it has to match the website, and a dependency
 * that owns the styling would fight both.
 */
export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? darkPalette : lightPalette;
}

export { radius, spacing, type };

/* ------------------------------------------------------------------ */

export function Screen({
  children,
  edges = ['top'],
  scroll = false,
  ...props
}: ViewProps & { edges?: Edge[]; scroll?: boolean }) {
  const palette = usePalette();

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: palette.paper }, props.style]}>
      {content}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  variant = 'primary',
  loading = false,
  icon,
  ...props
}: PressableProps & {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  const palette = usePalette();
  const disabled = props.disabled || loading;

  const background =
    variant === 'primary'
      ? palette.amber
      : variant === 'danger'
        ? palette.roseSoft
        : variant === 'secondary'
          ? palette.paperRaised
          : 'transparent';

  const colour =
    variant === 'primary' ? palette.onAccent : variant === 'danger' ? palette.rose : palette.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), busy: loading }}
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: variant === 'secondary' ? palette.lineStrong : 'transparent',
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth * 2 : 0,
          opacity: disabled ? 0.5 : 1,
          // A small downward nudge rather than a scale: it reads as
          // pressing a physical thing, which is the register the whole
          // product aims for.
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
      ]}
    >
      {loading ? <ActivityIndicator color={colour} size="small" /> : icon}
      <Text style={[type.label, { color: colour, fontSize: 16 }]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */

export function Card({ children, style, ...props }: ViewProps) {
  const palette = usePalette();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: palette.paperRaised,
          borderColor: palette.line,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          padding: spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Title({ style, ...props }: TextProps) {
  const palette = usePalette();
  return <Text {...props} style={[type.display, { color: palette.ink }, style]} />;
}

export function Heading({ style, ...props }: TextProps) {
  const palette = usePalette();
  return <Text {...props} style={[type.title, { color: palette.ink }, style]} />;
}

export function Body({ style, ...props }: TextProps) {
  const palette = usePalette();
  return <Text {...props} style={[type.body, { color: palette.inkSoft }, style]} />;
}

export function Caption({ style, ...props }: TextProps) {
  const palette = usePalette();
  return <Text {...props} style={[type.caption, { color: palette.inkFaint }, style]} />;
}

/* ------------------------------------------------------------------ */

export const Field = forwardRef<TextInput, TextInputProps & { label: string; hint?: string; error?: string | null }>(
  function Field({ label, hint, error, style, ...props }, ref) {
    const palette = usePalette();

    return (
      <View style={{ gap: spacing.xs, marginBottom: spacing.md }}>
        <Text style={[type.label, { color: palette.ink }]}>{label}</Text>
        <TextInput
          ref={ref}
          placeholderTextColor={palette.inkFaint}
          {...props}
          style={[
            {
              backgroundColor: palette.paperSunken,
              borderColor: error ? palette.rose : palette.line,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderRadius: radius.tile,
              paddingHorizontal: spacing.md,
              paddingVertical: 14,
              color: palette.ink,
              fontSize: 16,
            },
            style,
          ]}
        />
        {error ? (
          <Text style={[type.caption, { color: palette.rose }]}>{error}</Text>
        ) : hint ? (
          <Text style={[type.caption, { color: palette.inkFaint }]}>{hint}</Text>
        ) : null}
      </View>
    );
  },
);

/* ------------------------------------------------------------------ */

export function Chip({
  label,
  selected,
  onPress,
  accent,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accent?: string | null;
}) {
  const palette = usePalette();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        backgroundColor: selected ? palette.amberSoft : palette.paperRaised,
        borderColor: selected ? palette.amber : palette.line,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      {accent ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
      ) : null}
      <Text style={[type.label, { color: selected ? palette.amberDeep : palette.ink }]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const palette = usePalette();

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.sm }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.pill,
          backgroundColor: palette.amberSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.sm,
        }}
      >
        <Text style={{ fontSize: 26 }}>📖</Text>
      </View>
      <Heading style={{ textAlign: 'center' }}>{title}</Heading>
      <Body style={{ textAlign: 'center' }}>{description}</Body>
      {action ? <View style={{ marginTop: spacing.md }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const palette = usePalette();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
      <ActivityIndicator color={palette.amber} />
      {label ? <Caption>{label}</Caption> : null}
    </View>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  const palette = usePalette();
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: palette.roseSoft,
        borderRadius: radius.tile,
        padding: spacing.md,
        marginBottom: spacing.md,
      }}
    >
      <Text style={[type.label, { color: palette.rose }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
  },
});
