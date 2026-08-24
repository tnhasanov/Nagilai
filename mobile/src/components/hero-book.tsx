import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { usePalette } from './ui';

/**
 * The hero illustration: an open storybook.
 *
 * A port of `src/components/marketing/hero-book.tsx` from the website, so
 * the two front doors of the product show the same picture. Drawn rather
 * than shipped as an image: it stays crisp at any density, costs no
 * decode, and the sky can answer the theme instead of sitting in a bright
 * rectangle at night.
 *
 * The scene shows the *product*, not the technology — a child, a book,
 * and a sky full of stars. The child is faceless on purpose: every child
 * who is read this should be able to be them.
 *
 * **Motion**: three separate, slow things. The book breathes on a
 * fourteen-second cycle, the stars twinkle on staggered offsets, and the
 * whole thing rises once on mount. Nothing moves fast enough to pull the
 * eye — this is the last screen before bedtime, not a splash animation.
 * All of it stops when the parent has asked the system for less motion.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * Reads the shared clock at this element's own offset.
 *
 * One `Animated.Value` drives everything; each twinkle starts at a
 * different point in the same fourteen seconds, so nothing pulses in
 * time with anything else and the sky costs one driver rather than ten.
 */
function cycle(clock: Animated.Value, offset: number, range: [number, number, number]) {
  return clock
    .interpolate({ inputRange: [0, 1], outputRange: [offset, offset + 1] })
    .interpolate({
      inputRange: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      outputRange: [range[0], range[1], range[0], range[1], range[0], range[1], range[0], range[1], range[0]],
    });
}

/** cx, cy, r, and where in the cycle this one starts. */
const STARS: Array<[number, number, number, number]> = [
  [108, 150, 2.4, 0],
  [152, 132, 1.7, 0.28],
  [196, 158, 2.1, 0.58],
  [232, 136, 1.5, 0.18],
  [128, 188, 1.4, 0.48],
  [214, 196, 1.9, 0.78],
  [172, 172, 1.2, 0.66],
];

export function HeroBook() {
  const palette = usePalette();
  const [stillness, setStillness] = useState(false);

  /* One shared 0→1 clock. Every loop reads from it at its own offset, so
     seven stars cost one driver rather than seven. */
  const clock = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      setStillness(reduced);

      Animated.timing(entrance, {
        toValue: 1,
        duration: reduced ? 0 : 900,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }).start();

      if (reduced) return;

      Animated.loop(
        Animated.timing(clock, {
          toValue: 1,
          duration: 14000,
          easing: Easing.linear,
          /* Drives an SVG `opacity` prop, which is not a layout-thread
             property — the native driver cannot carry it. Seven small
             circles at fourteen seconds is not a budget problem. */
          useNativeDriver: false,
        }),
      ).start();
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (reduced) => setStillness(reduced),
    );

    return () => {
      cancelled = true;
      subscription.remove();
      clock.stopAnimation();
    };
  }, [clock, entrance]);

  /* A slow rise and settle, rather than a bob. */
  const float = clock.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -10, 0],
  });

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={LABEL}
      style={{
        width: '100%',
        opacity: entrance,
        transform: [
          { translateY: Animated.add(float, entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] })) },
        ],
      }}
    >
      <View style={{ width: '100%', aspectRatio: 640 / 430 }}>
        <Svg viewBox="0 0 640 430" width="100%" height="100%">
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#3B2E63" />
              <Stop offset="55%" stopColor="#6B4E7D" />
              <Stop offset="100%" stopColor="#C97F63" />
            </LinearGradient>
            <LinearGradient id="pageLeft" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#FFFDF8" />
              <Stop offset="88%" stopColor="#FBF4E8" />
              <Stop offset="100%" stopColor="#EFE3D0" />
            </LinearGradient>
            <LinearGradient id="pageRight" x1="1" y1="0" x2="0" y2="0">
              <Stop offset="0%" stopColor="#FFFDF8" />
              <Stop offset="88%" stopColor="#FBF4E8" />
              <Stop offset="100%" stopColor="#EFE3D0" />
            </LinearGradient>
            <LinearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#3E6B52" />
              <Stop offset="100%" stopColor="#2C5240" />
            </LinearGradient>
            {/* Stands in for the web's drop-shadow filter, which
                react-native-svg does not implement. */}
            <RadialGradient id="groundShadow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#4A3220" stopOpacity="0.30" />
              <Stop offset="100%" stopColor="#4A3220" stopOpacity="0" />
            </RadialGradient>
            {/* The fold. One shape darkening towards the centre, so it
                reads as paper creasing into the gutter — two separate
                paths meeting in the middle rendered as a rolled tube
                sitting between the pages. */}
            <LinearGradient id="spineFold" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#F3E9D9" />
              <Stop offset="28%" stopColor="#DCCDB2" />
              <Stop offset="50%" stopColor="#B49A78" />
              <Stop offset="72%" stopColor="#DCCDB2" />
              <Stop offset="100%" stopColor="#F3E9D9" />
            </LinearGradient>
            <RadialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#FFE9B8" stopOpacity="0.34" />
              <Stop offset="55%" stopColor="#FFE9B8" stopOpacity="0.12" />
              <Stop offset="100%" stopColor="#FFE9B8" stopOpacity="0" />
            </RadialGradient>
            <ClipPath id="leftPageClip">
              <Path d="M56 76c74-26 148-26 214 10v268c-66-36-140-36-214-10V76Z" />
            </ClipPath>
          </Defs>

          <Ellipse cx="320" cy="382" rx="250" ry="34" fill="url(#groundShadow)" />

          {/* Tilted very slightly, so it sits on a table rather than
              floating flat against the screen. */}
          <G rotation="-1.5" origin="320, 220">
            <Path d="M44 68c78-28 156-28 226 12v276c-70-40-148-40-226-12V68Z" fill="#B4562C" />
            <Path d="M596 68c-78-28-156-28-226 12v276c70-40 148-40 226-12V68Z" fill="#9E4823" />

            <Path d="M56 76c74-26 148-26 214 10v268c-66-36-140-36-214-10V76Z" fill="url(#pageLeft)" />
            <Path d="M584 76c-74-26-148-26-214 10v268c66-36 140-36 214-10V76Z" fill="url(#pageRight)" />

            {/* Left page: the illustration. */}
            <G clipPath="url(#leftPageClip)">
              <Path d="M76 98c62-20 124-20 178 8v250H76V98Z" fill="url(#sky)" />

              {STARS.map(([cx, cy, r, offset]) => (
                <AnimatedCircle
                  key={`${cx}-${cy}`}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="#FFF6DC"
                  opacity={stillness ? 0.85 : cycle(clock, offset, [0.3, 1, 0.3])}
                />
              ))}

              {/* Moonglow, so the sky has a light source the hill can
                  answer. A gradient, not stacked discs — those left a
                  hard ring in the sky where the larger one ended. */}
              <Circle cx="222" cy="114" r="46" fill="url(#moonGlow)" />

              {/* A crescent, made by subtracting one disc from another. */}
              <Path d="M222 108a22 22 0 1 0 0 40 26 26 0 0 1 0-40Z" fill="#FFE9B8" />

              <Path d="M76 268c40-22 84-24 122-6 32 15 58 12 80-4v90H76v-80Z" fill="url(#hill)" />

              {/* The child, back to us, one arm raised towards the moon. */}
              <G x={146} y={234}>
                <Ellipse cx="2" cy="76" rx="24" ry="5" fill="#16301F" opacity={0.5} />

                <Path d="M-8 74V56h7v18h-7Z" fill="#33507A" />
                <Path d="M4 74V56h7v18H4Z" fill="#33507A" />
                <Path d="M-11 74h11v4h-11a2 2 0 0 1 0-4Z" fill="#26313F" />
                <Path d="M4 74h11a2 2 0 0 1 0 4H4v-4Z" fill="#26313F" />

                <Path d="M-14 58V38c0-8 6-14 15-14s15 6 15 14v20a68 68 0 0 1-30 0Z" fill="#E8A33D" />
                <Path d="M0 24c5 0 9 2 12 5l-12 8-12-8c3-3 7-5 12-5Z" fill="#F2BC66" />

                <Path
                  d="M13 42c8-4 14-12 16-22"
                  stroke="#E8A33D"
                  strokeWidth={7}
                  strokeLinecap="round"
                  fill="none"
                />
                <Circle cx="30" cy="19" r="4" fill="#C68642" />

                <Path
                  d="M-13 42c-4 5-6 11-6 17"
                  stroke="#E8A33D"
                  strokeWidth={7}
                  strokeLinecap="round"
                  fill="none"
                />
                <Circle cx="-19" cy="60" r="4" fill="#C68642" />

                <Circle cx="1" cy="14" r="13" fill="#C68642" />
                <Path d="M-12 12c0-9 6-15 13-15s13 6 13 15c0 0-3-6-13-6s-13 6-13 6Z" fill="#3A2A20" />
                <Path d="M12 10c3 1 5 4 4 7-1 3-4 4-6 2" fill="#3A2A20" />
              </G>
            </G>

            {/* Right page: ruled lines standing in for the story. The
                first is longer, as an opening line usually is. */}
            <G stroke="#C9B79D" strokeWidth={4.5} strokeLinecap="round" opacity={0.75}>
              <Path d="M398 130h158" />
              <Path d="M398 156h172" />
              <Path d="M398 182h146" />
              <Path d="M398 208h166" />
              <Path d="M398 234h124" />
              <Path d="M398 276h168" />
              <Path d="M398 302h140" />
              <Path d="M398 328h158" />
            </G>
            <Path d="M398 98h84" stroke={palette.amber} strokeWidth={7} strokeLinecap="round" />

            {/* The spine: two soft gradients meeting at the fold. */}
            <Path
              d="M270 86c16 6 34 6 50 0 16-6 34-6 50 0v268c-16 6-34 6-50 0-16-6-34-6-50 0V86Z"
              fill="url(#spineFold)"
            />
          </G>

          {/* Loose sparkles above the book, drifting on the same clock.
              Four-pointed rather than round, so they read as magic
              rather than as more stars. */}
          {SPARKLES.map(([x, y, scale, offset]) => (
            <AnimatedG
              key={`${x}-${y}`}
              x={x}
              y={y}
              scale={scale}
              opacity={stillness ? 0.5 : cycle(clock, offset, [0.15, 0.85, 0.15])}
            >
              <Path
                d="M0-11c1.6 8 3.6 10 11.6 11.6C3.6 2.2 1.6 4.2 0 12.2c-1.6-8-3.6-10-11.6-11.6C-3.6-1-1.6-3-0-11Z"
                fill={palette.amber}
              />
            </AnimatedG>
          ))}
        </Svg>
      </View>
    </Animated.View>
  );
}

/** x, y, scale, and where in the cycle this one starts. */
const SPARKLES: Array<[number, number, number, number]> = [
  /* Kept clear of the book itself — one on the cover edge reads as a
     smudge on the cloth rather than as something in the air. */
  [508, 30, 1, 0],
  [92, 42, 0.7, 0.34],
  [612, 300, 0.55, 0.68],
];

const LABEL = 'An open storybook showing a child looking up at a starry sky';
