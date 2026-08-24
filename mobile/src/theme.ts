/**
 * The Nagilai palette, carried over from the web app.
 *
 * Same warm paper and ink so the two surfaces feel like one product: a
 * parent who signs up on the website and then installs the app should not
 * feel they have changed companies.
 *
 * Dark mode is a warm night rather than an inverted greyscale - this is
 * an app opened at bedtime with the lights low.
 */
export interface Palette {
  paper: string;
  paperRaised: string;
  paperSunken: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  line: string;
  lineStrong: string;
  amber: string;
  amberDeep: string;
  amberSoft: string;
  plum: string;
  plumSoft: string;
  sage: string;
  sageSoft: string;
  rose: string;
  roseSoft: string;
  /**
   * What a filled primary control is painted with, as distinct from the
   * amber accent. They are different jobs and only one of them has to
   * carry text: amber under white is 3.0:1, which fails AA at button
   * sizes, and every call to action in this app is a filled amber
   * button. Soft amber backgrounds, chips and selected states still use
   * `amber` and are unchanged. Mirrors `--color-action` in the web app.
   */
  action: string;
  onAccent: string;
}

export const lightPalette: Palette = {
  paper: '#FDFAF4',
  paperRaised: '#FFFDF9',
  paperSunken: '#F6EFE4',
  ink: '#2B2119',
  inkSoft: '#6B5B4C',
  inkFaint: '#9C8B7A',
  line: '#EAE0D3',
  lineStrong: '#DDCFBC',
  amber: '#D97E28',
  amberDeep: '#B0611A',
  amberSoft: '#FBEEDD',
  plum: '#4A3A6B',
  plumSoft: '#ECE8F5',
  sage: '#4F7D5E',
  sageSoft: '#E4EFE6',
  rose: '#C4576B',
  roseSoft: '#FBE7EA',
  action: '#B0611A',
  onAccent: '#FFFFFF',
};

export const darkPalette: Palette = {
  paper: '#171310',
  paperRaised: '#221C17',
  paperSunken: '#100D0B',
  ink: '#F5EEE4',
  inkSoft: '#C3B3A2',
  inkFaint: '#8D7D6D',
  line: '#362C24',
  lineStrong: '#4A3D32',
  amber: '#EDA05A',
  amberDeep: '#F2B982',
  amberSoft: '#33251A',
  plum: '#A79AD0',
  plumSoft: '#241F33',
  sage: '#8DBB9C',
  sageSoft: '#1C2A21',
  rose: '#E08FA0',
  roseSoft: '#2F1F24',
  action: '#EDA05A',
  onAccent: '#1B1410',
};

export const radius = { tile: 16, card: 20, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/**
 * Type scale. `display` is the bookish face used for titles and story
 * text; the platform default is used for interface furniture, because a
 * native app that fights the system font feels wrong on the device.
 */
export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  story: { fontSize: 19, lineHeight: 32, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;
